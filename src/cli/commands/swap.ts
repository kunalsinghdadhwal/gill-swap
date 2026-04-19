import type { Command } from "commander";

import { appConfig } from "../../config/index.js";
import type { GillTransactionBuilder } from "../../core/gillBuilder.js";
import type { JupiterClient } from "../../core/jupiter.js";
import type { TransactionExecutor } from "../../core/executor.js";
import type { ExecutionResult, SwapRequestPayload } from "../../types/index.js";
import { createMockId, normalizeOptionalNumber } from "../../utils/helpers.js";
import { logger } from "../../utils/logger.js";

/**
 * Swap CLI command registration and orchestration helper.
 *
 * Architecture role:
 * - Exposes the swap flow for terminal users.
 * - Delegates all business actions to core services to keep command files thin.
 */

export interface SwapPipelineDependencies {
  jupiterClient: JupiterClient;
  gillBuilder: GillTransactionBuilder;
  executor: TransactionExecutor;
}

export async function executeSwapPipeline(
  payload: SwapRequestPayload,
  dependencies: SwapPipelineDependencies,
  source: string
): Promise<ExecutionResult> {
  const quote = await dependencies.jupiterClient.getQuote(payload);
  const instructions = await dependencies.jupiterClient.getSwapInstructions({
    quote,
    userPublicKey: payload.userPublicKey
  });
  const unsigned = await dependencies.gillBuilder.buildSwapTransaction({
    quote,
    instructions,
    options: {
      priorityFeeMicrolamports: appConfig.PRIORITY_FEE_MICROLAMPORTS
    }
  });

  return dependencies.executor.executeTransaction({
    unsignedTransaction: unsigned,
    idempotencyKey: `${source}-${createMockId("idempotency")}`
  });
}

export function registerSwapCommand(program: Command, dependencies: SwapPipelineDependencies): void {
  program
    .command("swap")
    .description("Run a single swap execution flow (placeholder).")
    .requiredOption("--inputMint <mint>", "Input token mint address")
    .requiredOption("--outputMint <mint>", "Output token mint address")
    .requiredOption("--amountAtomic <value>", "Swap amount in atomic units")
    .requiredOption("--userPublicKey <pubkey>", "User public key for instruction context")
    .option("--slippageBps <value>", "Optional slippage bps override")
    .action(async (options: {
      inputMint: string;
      outputMint: string;
      amountAtomic: string;
      userPublicKey: string;
      slippageBps?: string;
    }) => {
      const payload: SwapRequestPayload = {
        inputMint: options.inputMint,
        outputMint: options.outputMint,
        amountAtomic: options.amountAtomic,
        userPublicKey: options.userPublicKey,
        slippageBps: Math.round(
          normalizeOptionalNumber(options.slippageBps, appConfig.DEFAULT_SLIPPAGE_BPS)
        )
      };

      const result = await executeSwapPipeline(payload, dependencies, "cli-swap");
      logger.info("Swap placeholder pipeline completed", {
        signature: result.signature,
        status: result.status
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });
}