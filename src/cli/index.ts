import { Command } from "commander";

import { appConfig } from "../config/index.js";
import { TransactionExecutor } from "../core/executor.js";
import { GillTransactionBuilder } from "../core/gillBuilder.js";
import { JupiterClient } from "../core/jupiter.js";
import { logger } from "../utils/logger.js";
import { registerDcaCommand } from "./commands/dca.js";
import { registerSwapCommand } from "./commands/swap.js";

/**
 * Commander-based CLI bootstrap.
 *
 * Architecture role:
 * - Owns CLI command registration and argument parsing.
 * - Instantiates core services once and injects dependencies into commands.
 */

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  const dependencies = {
    jupiterClient: new JupiterClient(),
    gillBuilder: new GillTransactionBuilder(),
    executor: new TransactionExecutor()
  };

  program
    .name("gill-swap")
    .description("Backend-only swap automation scaffold using Gill + Jupiter architecture.")
    .version("0.1.0")
    .showHelpAfterError();

  registerSwapCommand(program, dependencies);
  registerDcaCommand(program, dependencies);

  logger.debug("Running CLI mode", {
    appMode: appConfig.APP_MODE,
    argv: argv.slice(2)
  });

  await program.parseAsync(argv);
}