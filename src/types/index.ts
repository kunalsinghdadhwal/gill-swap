/**
 * Shared type contracts used across all layers.
 *
 * Architecture role:
 * - Keeps module boundaries explicit between config, core, CLI, and server.
 * - Makes it easy to replace placeholder logic with real SDK/API integrations later.
 */

export type RuntimeMode = "cli" | "server";

export interface SwapRequestPayload {
    inputMint: string;
    outputMint: string;
    amountAtomic: string;
    userPublicKey: string;
    slippageBps?: number;
}

export interface QuoteResponse {
    quoteId: string;
    inputMint: string;
    outputMint: string;
    inAmountAtomic: string;
    outAmountAtomic: string;
    estimatedPriceImpactPct: number;
    routePlan: string[];
    rawProviderPayload: Record<string, unknown>;
}

export interface SwapInstructionResponse {
    instructionSetId: string;
    computeBudgetInstructions: string[];
    swapInstructions: string[];
    cleanupInstructions: string[];
    rawProviderPayload: Record<string, unknown>;
}

export interface PostSwapTransferAction {
    destinationTokenAccount: string;
    amountAtomic: string;
}

export interface BuildSwapTransactionOptions {
    computeUnitLimit: number;
    priorityFeeMicrolamports: number;
    memo?: string;
    postSwapTransfer?: PostSwapTransferAction;
}

export interface UnsignedSwapTransaction {
    unsignedTransactionId: string;
    serializedMessageBase64: string;
    instructionCount: number;
    metadata: Record<string, unknown>;
}

export interface ExecuteTransactionInput {
    unsignedTransaction: UnsignedSwapTransaction;
    idempotencyKey: string;
}

export interface ExecutionResult {
    unsignedTransactionId: string;
    signature: string;
    simulated: boolean;
    confirmed: boolean;
    attempts: number;
    slot: number | null;
    explorerUrl: string;
    status: "mock-submitted" | "mock-confirmed" | "mock-failed";
    diagnostics: Record<string, unknown>;
}

export interface DcaRequestPayload {
    label: string;
    cronExpression: string;
    swapRequest: SwapRequestPayload;
    maxRuns?: number;
}

export interface ApiSuccessResponse<T> {
    success: true;
    data: T;
}

export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
    };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;