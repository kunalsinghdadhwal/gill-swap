import { appConfig } from "../config/index.js";
import type {
    JupiterBuildResponse,
    QuoteResponse,
    SwapInstructionResponse,
    SwapRequestPayload
} from "../types/index.js";
import { logger } from "../utils/logger.js";
import { z } from "zod";

/**
 * Jupiter Router client abstraction.
 *
 * Architecture role:
 * - Fetches real quote data and raw swap instruction payloads from Jupiter Router.
 * - Returns typed responses that downstream layers consume without HTTP concerns.
 *
 * Real flow:
 * - Sends a request to `/swap/v2/build` with input mint, output mint, amount, taker, and slippage.
 * - Parses Router output into `QuoteResponse` plus raw instructions for Gill composition.
 * - Preserves raw provider payload for downstream conversion and diagnostics.
 */

const jupiterAccountSchema = z.object({
    pubkey: z.string().min(1),
    isSigner: z.boolean(),
    isWritable: z.boolean()
});

const jupiterInstructionSchema = z.object({
    programId: z.string().min(1),
    accounts: z.array(jupiterAccountSchema),
    data: z.string().min(1)
});

const jupiterBuildResponseSchema = z.object({
    inputMint: z.string().min(1),
    outputMint: z.string().min(1),
    inAmount: z.string().min(1),
    outAmount: z.string().min(1),
    otherAmountThreshold: z.string().min(1),
    swapMode: z.string().min(1),
    slippageBps: z.number().int().positive(),
    priceImpactPct: z.string().min(1),
    routePlan: z.array(z.record(z.string(), z.unknown())),
    computeBudgetInstructions: z.array(jupiterInstructionSchema).default([]),
    setupInstructions: z.array(jupiterInstructionSchema).default([]),
    swapInstruction: jupiterInstructionSchema,
    otherInstructions: z.array(jupiterInstructionSchema).default([]),
    cleanupInstruction: jupiterInstructionSchema.nullable().default(null),
    tipInstruction: jupiterInstructionSchema.nullable().default(null),
    addressesByLookupTableAddress: z.record(z.string(), z.array(z.string())).default({}),
    blockhashWithMetadata: z.object({
        blockhash: z.string().min(1),
        lastValidBlockHeight: z.number().int().nonnegative(),
        fetchedAt: z.number()
    })
});

function resolveRouterBuildEndpoint(baseUrl: string): string {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname.startsWith("quote-api.") ? "api.jup.ag" : parsed.host;

    if (parsed.pathname.endsWith("/swap/v2/build")) {
        const normalized = new URL(parsed.toString());
        normalized.host = host;
        return normalized.toString();
    }

    return new URL("/swap/v2/build", `${parsed.protocol}//${host}`).toString();
}

function parseJupiterErrorResponse(payload: unknown): string {
    if (typeof payload !== "object" || payload === null) {
        return "Unknown Jupiter API error.";
    }

    const candidate = payload as {
        error?: {
            message?: string;
            issues?: unknown;
        };
        message?: string;
    };

    if (candidate.error?.message) {
        return candidate.error.message;
    }
    if (candidate.message) {
        return candidate.message;
    }
    if (candidate.error?.issues !== undefined) {
        return JSON.stringify(candidate.error.issues);
    }

    return "Unknown Jupiter API error.";
}

export class JupiterClient {
    private readonly buildEndpoint: string;
    private readonly apiKey: string;

    public constructor() {
        this.buildEndpoint = resolveRouterBuildEndpoint(appConfig.JUPITER_API_BASE_URL);

        if (!appConfig.JUPITER_API_KEY || appConfig.JUPITER_API_KEY.trim().length === 0) {
            throw new Error("JUPITER_API_KEY is required for Router /swap/v2/build requests.");
        }

        this.apiKey = appConfig.JUPITER_API_KEY;
    }

    public async getQuote(payload: SwapRequestPayload): Promise<QuoteResponse> {
        if (!payload.userPublicKey || payload.userPublicKey.trim().length === 0) {
            throw new Error("Swap request must include userPublicKey for Jupiter Router taker.");
        }

        const slippageBps = payload.slippageBps ?? appConfig.DEFAULT_SLIPPAGE_BPS;

        const searchParams = new URLSearchParams({
            inputMint: payload.inputMint,
            outputMint: payload.outputMint,
            amount: payload.amountAtomic,
            taker: payload.userPublicKey,
            slippageBps: slippageBps.toString()
        });

        const requestUrl = `${this.buildEndpoint}?${searchParams.toString()}`;

        logger.info("Requesting Jupiter Router build", {
            inputMint: payload.inputMint,
            outputMint: payload.outputMint,
            amountAtomic: payload.amountAtomic,
            taker: payload.userPublicKey,
            endpoint: this.buildEndpoint
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), appConfig.REQUEST_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(requestUrl, {
                method: "GET",
                headers: {
                    "x-api-key": this.apiKey,
                    accept: "application/json"
                },
                signal: controller.signal
            });
        } catch (error) {
            throw new Error(`Failed to reach Jupiter Router endpoint: ${String(error)}`);
        } finally {
            clearTimeout(timeout);
        }

        const responseBody = await response.json().catch(() => null);
        if (!response.ok) {
            const message = parseJupiterErrorResponse(responseBody);
            throw new Error(`Jupiter Router request failed (${response.status}): ${message}`);
        }

        const parsed = jupiterBuildResponseSchema.safeParse(responseBody);
        if (!parsed.success) {
            throw new Error(
                `Invalid Jupiter Router response: ${parsed.error.issues
                    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                    .join("; ")}`
            );
        }

        const buildPayload: JupiterBuildResponse = parsed.data;

        return {
            inputMint: buildPayload.inputMint,
            outputMint: buildPayload.outputMint,
            inAmountAtomic: buildPayload.inAmount,
            outAmountAtomic: buildPayload.outAmount,
            otherAmountThresholdAtomic: buildPayload.otherAmountThreshold,
            taker: payload.userPublicKey,
            slippageBps: buildPayload.slippageBps,
            swapMode: buildPayload.swapMode,
            estimatedPriceImpactPct: Number.parseFloat(buildPayload.priceImpactPct),
            routePlan: buildPayload.routePlan,
            rawProviderPayload: buildPayload
        };
    }

    public async getSwapInstructions(params: {
        quote: QuoteResponse;
        userPublicKey: string;
    }): Promise<SwapInstructionResponse> {
        if (params.userPublicKey !== params.quote.taker) {
            throw new Error("Swap instruction request taker mismatch with quote payload.");
        }

        const buildPayload = params.quote.rawProviderPayload;

        return {
            computeBudgetInstructions: buildPayload.computeBudgetInstructions,
            setupInstructions: buildPayload.setupInstructions,
            swapInstruction: buildPayload.swapInstruction,
            otherInstructions: buildPayload.otherInstructions,
            cleanupInstruction: buildPayload.cleanupInstruction,
            tipInstruction: buildPayload.tipInstruction,
            addressesByLookupTableAddress: buildPayload.addressesByLookupTableAddress,
            blockhashWithMetadata: buildPayload.blockhashWithMetadata,
            rawProviderPayload: buildPayload
        };
    }
}