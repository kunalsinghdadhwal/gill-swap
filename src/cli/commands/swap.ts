import type { Command } from "commander";
import { loadKeypairSignerFromFile } from "gill/node";

import { appConfig } from "../../config/index.js";
import type { GillTransactionBuilder } from "../../core/gillBuilder.js";
import type { JupiterClient } from "../../core/jupiter.js";
import type { TransactionExecutor } from "../../core/executor.js";
import type { ExecutionResult, SwapRequestPayload } from "../../types/index.js";
import {
    convertUiAmountToAtomic,
    createRequestId,
    normalizeOptionalNumber,
    resolveTokenReference,
    toPositiveInteger
} from "../../utils/helpers.js";
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
    if (!payload.userPublicKey || payload.userPublicKey.trim().length === 0) {
        throw new Error("Swap payload must include userPublicKey.");
    }

    const quote = await dependencies.jupiterClient.getQuote(payload);
    const instructions = await dependencies.jupiterClient.getSwapInstructions({
        quote,
        userPublicKey: payload.userPublicKey
    });

    const unsigned = await dependencies.gillBuilder.buildSwapTransaction({
        quote,
        instructions,
        options: {
            priorityFeeMicrolamports: appConfig.PRIORITY_FEE_MICROLAMPORTS,
            computeUnitLimit: 350_000
        }
    });

    return dependencies.executor.executeTransaction({
        unsignedTransaction: unsigned,
        idempotencyKey: `${source}-${createRequestId("idempotency")}`
    });
}

export function registerSwapCommand(program: Command, dependencies: SwapPipelineDependencies): void {
    program
        .command("swap")
        .description("Run a single live swap flow using Jupiter Router + Gill execution.")
        .requiredOption("--input <token>", "Input token symbol or mint (e.g. USDC or mint address)")
        .requiredOption("--output <token>", "Output token symbol or mint (e.g. SOL or mint address)")
        .requiredOption("--amount <value>", "Input amount in UI units (e.g. 10 or 0.5)")
        .option("--amountAtomic <value>", "Override amount in atomic units")
        .option("--inputDecimals <value>", "Decimals for input mint if a raw mint address is used")
        .option("--userPublicKey <pubkey>", "Taker public key; defaults to HOT_WALLET_PATH address")
        .option("--slippageBps <value>", "Optional slippage bps override")
        .action(async (options: {
            input: string;
            output: string;
            amount: string;
            amountAtomic?: string;
            inputDecimals?: string;
            userPublicKey?: string;
            slippageBps?: string;
        }) => {
            const inputToken = resolveTokenReference(options.input);
            const outputToken = resolveTokenReference(options.output);

            const inputMint = "symbol" in inputToken ? inputToken.mint : inputToken.mint;
            const outputMint = "symbol" in outputToken ? outputToken.mint : outputToken.mint;

            const decimalsFromToken = "decimals" in inputToken ? inputToken.decimals : undefined;
            const decimalsFromFlag =
                options.inputDecimals !== undefined
                    ? toPositiveInteger(options.inputDecimals, "inputDecimals")
                    : undefined;
            const decimals = decimalsFromToken ?? decimalsFromFlag;

            const amountAtomic =
                options.amountAtomic && options.amountAtomic.trim().length > 0
                    ? options.amountAtomic
                    : (() => {
                        if (decimals === undefined) {
                            throw new Error(
                                "Input token decimals are required when using a raw mint with --amount. Use --inputDecimals or --amountAtomic."
                            );
                        }

                        return convertUiAmountToAtomic(options.amount, decimals);
                    })();

            const walletSigner = await loadKeypairSignerFromFile(appConfig.HOT_WALLET_PATH);
            const takerPublicKey =
                options.userPublicKey && options.userPublicKey.trim().length > 0
                    ? options.userPublicKey
                    : String(walletSigner.address);

            const payload: SwapRequestPayload = {
                inputMint,
                outputMint,
                amountAtomic,
                userPublicKey: takerPublicKey,
                slippageBps: Math.round(
                    normalizeOptionalNumber(options.slippageBps, appConfig.DEFAULT_SLIPPAGE_BPS)
                )
            };

            const result = await executeSwapPipeline(payload, dependencies, "cli-swap");
            logger.info("Swap pipeline completed", {
                signature: result.signature,
                status: result.status
            });
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        });
}