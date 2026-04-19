import type { Command } from "commander";
import cron from "node-cron";

import { appConfig } from "../../config/index.js";
import type { SwapRequestPayload } from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { executeSwapPipeline, type SwapPipelineDependencies } from "./swap.js";

/**
 * DCA CLI command registration and scheduling logic.
 *
 * Architecture role:
 * - Provides a simple cron-driven recurring swap entry point for terminal usage.
 * - Uses the same core execution pipeline as one-off swaps for consistent behavior.
 */

export function registerDcaCommand(program: Command, dependencies: SwapPipelineDependencies): void {
  program
    .command("dca")
    .description("Run recurring DCA schedule (placeholder).")
    .requiredOption("--inputMint <mint>", "Input token mint address")
    .requiredOption("--outputMint <mint>", "Output token mint address")
    .requiredOption("--amountAtomic <value>", "Swap amount in atomic units")
    .requiredOption("--userPublicKey <pubkey>", "User public key for instruction context")
    .option("--every <cron>", "Cron expression for schedule", appConfig.PRICE_MONITOR_CRON)
    .option("--maxRuns <number>", "Stop after this many runs")
    .option("--runOnce", "Execute once immediately without scheduling", false)
    .action(async (options: {
      inputMint: string;
      outputMint: string;
      amountAtomic: string;
      userPublicKey: string;
      every: string;
      maxRuns?: string;
      runOnce: boolean;
    }) => {
      const payload: SwapRequestPayload = {
        inputMint: options.inputMint,
        outputMint: options.outputMint,
        amountAtomic: options.amountAtomic,
        userPublicKey: options.userPublicKey,
        slippageBps: appConfig.DEFAULT_SLIPPAGE_BPS
      };

      if (options.runOnce) {
        const result = await executeSwapPipeline(payload, dependencies, "cli-dca-once");
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }

            void task.stop();
      const maxRuns = options.maxRuns ? Number.parseInt(options.maxRuns, 10) : undefined;

      logger.info("Starting DCA placeholder schedule", {
        cron: options.every,
        maxRuns: maxRuns ?? "unbounded"
      });

      const task = cron.schedule(options.every, () => {
        void (async () => {
      void task.start();
          logger.info("Executing DCA placeholder tick", { runCount });

          const result = await executeSwapPipeline(payload, dependencies, "cli-dca");
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

          if (maxRuns !== undefined && runCount >= maxRuns) {
            logger.info("Reached maxRuns for DCA placeholder schedule", { maxRuns });
            task.stop();
          }
        })().catch((error: unknown) => {
          logger.error("DCA placeholder tick failed", {
            error: String(error),
            runCount
          });
        });
      });

      task.start();
      logger.info("DCA placeholder scheduler is running. Press Ctrl+C to stop.");
    });
}