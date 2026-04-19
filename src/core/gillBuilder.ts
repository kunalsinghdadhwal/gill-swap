import { appConfig } from "../config/index.js";
import type {
    BuildSwapTransactionOptions,
    QuoteResponse,
    SwapInstructionResponse,
    UnsignedSwapTransaction
} from "../types/index.js";
import { createMockId } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";

/**
 * Gill transaction builder abstraction.
 *
 * Architecture role:
 * - Converts quote + swap instruction payloads into an unsigned transaction.
 * - Encapsulates transaction shaping decisions (compute budget, priority fee, memo).
 * - Planned import surface: `gill` + `gill/programs` for instruction composition.
 *
 * NOTE:
 * - This module intentionally avoids real on-chain transaction assembly for now.
 * - TODO sections indicate where Gill SDK instruction composition should be added.
 */

export class GillTransactionBuilder {
    public async buildSwapTransaction(input: {
        quote: QuoteResponse;
        instructions: SwapInstructionResponse;
        options?: Partial<BuildSwapTransactionOptions>;
    }): Promise<UnsignedSwapTransaction> {
        const resolvedOptions: BuildSwapTransactionOptions = {
            computeUnitLimit: input.options?.computeUnitLimit ?? 250_000,
            priorityFeeMicrolamports:
                input.options?.priorityFeeMicrolamports ?? appConfig.PRIORITY_FEE_MICROLAMPORTS
        };

        if (input.options?.memo !== undefined) {
            resolvedOptions.memo = input.options.memo;
        }

        if (input.options?.postSwapTransfer !== undefined) {
            resolvedOptions.postSwapTransfer = input.options.postSwapTransfer;
        }

        logger.info("Building placeholder Gill transaction", {
            quoteId: input.quote.quoteId,
            instructionSetId: input.instructions.instructionSetId,
            computeUnitLimit: resolvedOptions.computeUnitLimit,
            priorityFeeMicrolamports: resolvedOptions.priorityFeeMicrolamports,
            memoIncluded: Boolean(resolvedOptions.memo)
        });

        // TODO: Replace with real Gill SDK transaction composition and instruction packing.
        const serializedMessageBase64 = Buffer.from(
            JSON.stringify({
                placeholder: true,
                quoteId: input.quote.quoteId,
                instructionSetId: input.instructions.instructionSetId,
                options: resolvedOptions
            })
        ).toString("base64");

        return {
            unsignedTransactionId: createMockId("utx"),
            serializedMessageBase64,
            instructionCount:
                input.instructions.computeBudgetInstructions.length +
                input.instructions.swapInstructions.length +
                input.instructions.cleanupInstructions.length,
            metadata: {
                routePlan: input.quote.routePlan,
                options: resolvedOptions
            }
        };
    }
}