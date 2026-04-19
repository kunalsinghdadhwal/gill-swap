import { appConfig } from "../config/index.js";
import type { QuoteResponse, SwapInstructionResponse, SwapRequestPayload } from "../types/index.js";
import { createMockId } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";

/**
 * Jupiter API client abstraction.
 *
 * Architecture role:
 * - Responsible for quote lookup and instruction retrieval from Jupiter.
 * - Returns typed responses that downstream layers consume without HTTP details.
 *
 * NOTE:
 * - This file intentionally contains placeholder implementations only.
 * - TODO sections mark where real Jupiter API calls should be added.
 */

export class JupiterClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  public constructor() {
    this.baseUrl = appConfig.JUPITER_API_BASE_URL;
    this.apiKey = appConfig.JUPITER_API_KEY;
  }

  public async getQuote(payload: SwapRequestPayload): Promise<QuoteResponse> {
    logger.info("Preparing placeholder quote request", {
      inputMint: payload.inputMint,
      outputMint: payload.outputMint,
      amountAtomic: payload.amountAtomic,
      baseUrl: this.baseUrl,
      hasApiKey: Boolean(this.apiKey)
    });

    // TODO: Replace with real Jupiter quote API call and route parsing.
    return {
      quoteId: createMockId("quote"),
      inputMint: payload.inputMint,
      outputMint: payload.outputMint,
      inAmountAtomic: payload.amountAtomic,
      outAmountAtomic: payload.amountAtomic,
      estimatedPriceImpactPct: 0,
      routePlan: ["mock-route-hop-1", "mock-route-hop-2"],
      rawProviderPayload: {
        placeholder: true,
        source: "jupiter",
        slippageBps: payload.slippageBps ?? appConfig.DEFAULT_SLIPPAGE_BPS
      }
    };
  }

  public async getSwapInstructions(params: {
    quote: QuoteResponse;
    userPublicKey: string;
  }): Promise<SwapInstructionResponse> {
    logger.info("Preparing placeholder swap instruction request", {
      quoteId: params.quote.quoteId,
      userPublicKey: params.userPublicKey
    });

    // TODO: Replace with real Jupiter swap instruction API call.
    return {
      instructionSetId: createMockId("ix"),
      computeBudgetInstructions: ["setComputeUnitLimit(placeholder)", "setComputeUnitPrice(placeholder)"],
      swapInstructions: ["invokeJupiterRoute(placeholder)"],
      cleanupInstructions: ["closeTempAccounts(placeholder)"],
      rawProviderPayload: {
        placeholder: true,
        quoteId: params.quote.quoteId
      }
    };
  }
}