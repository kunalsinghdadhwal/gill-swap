/**
 * Shared type contracts used across all layers.
 *
 * Architecture role:
 * - Keeps module boundaries explicit between config, core, CLI, and server.
 * - Defines stable contracts for real Jupiter Router and Gill transaction flow.
 */

import type { BaseTransactionMessage, TransactionMessageWithFeePayer } from "gill";

export type RuntimeMode = "cli" | "server";

export interface SwapRequestPayload {
    inputMint: string;
    outputMint: string;
    amountAtomic: string;
    userPublicKey: string;
    slippageBps?: number;
}

export interface JupiterRawAccountMeta {
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
}

export interface JupiterRawInstruction {
    programId: string;
    accounts: JupiterRawAccountMeta[];
    data: string;
}

export interface JupiterBlockhashMetadata {
    blockhash: string;
    lastValidBlockHeight: number;
    fetchedAt: number;
}

export interface JupiterBuildResponse {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    priceImpactPct: string;
    routePlan: Array<Record<string, unknown>>;
    computeBudgetInstructions: JupiterRawInstruction[];
    setupInstructions: JupiterRawInstruction[];
    swapInstruction: JupiterRawInstruction;
    otherInstructions: JupiterRawInstruction[];
    cleanupInstruction: JupiterRawInstruction | null;
    tipInstruction: JupiterRawInstruction | null;
    addressesByLookupTableAddress: Record<string, string[]>;
    blockhashWithMetadata: JupiterBlockhashMetadata;
}

export interface QuoteResponse {
    inputMint: string;
    outputMint: string;
    inAmountAtomic: string;
    outAmountAtomic: string;
    otherAmountThresholdAtomic: string;
    taker: string;
    slippageBps: number;
    swapMode: string;
    estimatedPriceImpactPct: number;
    routePlan: Array<Record<string, unknown>>;
    rawProviderPayload: JupiterBuildResponse;
}

export interface SwapInstructionResponse {
    computeBudgetInstructions: JupiterRawInstruction[];
    setupInstructions: JupiterRawInstruction[];
    swapInstruction: JupiterRawInstruction;
    otherInstructions: JupiterRawInstruction[];
    cleanupInstruction: JupiterRawInstruction | null;
    tipInstruction: JupiterRawInstruction | null;
    addressesByLookupTableAddress: Record<string, string[]>;
    blockhashWithMetadata: JupiterBlockhashMetadata;
    rawProviderPayload: JupiterBuildResponse;
}

export interface PostSwapTransferAction {
    destinationOwnerAddress: string;
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
    transactionMessage: BaseTransactionMessage & TransactionMessageWithFeePayer;
    instructionCount: number;
    requiredSignerAddress: string;
    latestBlockhash: JupiterBlockhashMetadata;
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
    status: "submitted" | "confirmed" | "failed";
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