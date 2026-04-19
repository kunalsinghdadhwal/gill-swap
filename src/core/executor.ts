import {
    addSignersToTransactionMessage,
    createSolanaClient,
    getSignatureFromTransaction,
    signTransactionMessageWithSigners
} from "gill";
import { loadKeypairSignerFromFile } from "gill/node";

import { appConfig } from "../config/index.js";
import type { ExecuteTransactionInput, ExecutionResult } from "../types/index.js";
import { buildSolanaExplorerUrl } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";
import { retryWithBackoff } from "../utils/retry.js";

/**
 * Execution pipeline for unsigned transactions.
 *
 * Architecture role:
 * - Orchestrates simulation, signing, send retries, and confirmation checks.
 * - Central place for reliability and observability in swap execution lifecycle.
 * - Uses `gill/node` signer loading and real RPC-backed execution.
 */

export class TransactionExecutor {
    private readonly solanaClient = createSolanaClient({
        urlOrMoniker: appConfig.SOLANA_RPC_URL
    });

    private hotWalletSignerPromise: ReturnType<typeof loadKeypairSignerFromFile> | undefined;

    public async executeTransaction(input: ExecuteTransactionInput): Promise<ExecutionResult> {
        logger.info("Starting real execution pipeline", {
            unsignedTransactionId: input.unsignedTransaction.unsignedTransactionId,
            idempotencyKey: input.idempotencyKey
        });

        const signer = await this.getHotWalletSigner();
        if (signer.address !== input.unsignedTransaction.requiredSignerAddress) {
            throw new Error(
                `Hot wallet signer (${signer.address}) does not match required swap signer (${input.unsignedTransaction.requiredSignerAddress}).`
            );
        }

        const transactionWithSigner = addSignersToTransactionMessage(
            [signer],
            input.unsignedTransaction.transactionMessage
        );

        const simulationResponse = await this.simulateTransaction(transactionWithSigner);
        const simulationValue = simulationResponse.value;

        if (simulationValue.err !== null) {
            throw new Error(`Transaction simulation failed: ${JSON.stringify(simulationValue.err)}`);
        }

        const signedTransaction = await signTransactionMessageWithSigners(transactionWithSigner);

        const { result: signature, attempts } = await retryWithBackoff(
            async () => this.sendAndConfirmTransaction(signedTransaction),
            {
                retries: appConfig.MAX_RETRIES,
                baseDelayMs: appConfig.RETRY_BASE_DELAY_MS,
                onRetry: (error, attempt, nextDelayMs) => {
                    logger.warn("Retrying sendAndConfirmTransaction", {
                        attempt,
                        nextDelayMs,
                        reason: String(error)
                    });
                }
            }
        );

        return {
            unsignedTransactionId: input.unsignedTransaction.unsignedTransactionId,
            signature,
            simulated: true,
            confirmed: true,
            attempts,
            slot: Number(simulationResponse.context.slot),
            explorerUrl: buildSolanaExplorerUrl(signature, "mainnet-beta"),
            status: "confirmed",
            diagnostics: {
                idempotencyKey: input.idempotencyKey,
                simulation: simulationValue,
                latestBlockhash: input.unsignedTransaction.latestBlockhash,
                requiredSignerAddress: input.unsignedTransaction.requiredSignerAddress
            }
        };
    }

    private async getHotWalletSigner() {
        if (!this.hotWalletSignerPromise) {
            this.hotWalletSignerPromise = loadKeypairSignerFromFile(appConfig.HOT_WALLET_PATH);
        }

        return this.hotWalletSignerPromise;
    }

    private async simulateTransaction(
        transactionMessage: ExecuteTransactionInput["unsignedTransaction"]["transactionMessage"]
    ) {
        logger.debug("Simulating transaction before signing");

        return this.solanaClient.simulateTransaction(transactionMessage);
    }

    private async sendAndConfirmTransaction(
        signedTransaction: Awaited<ReturnType<typeof signTransactionMessageWithSigners>>
    ): Promise<string> {
        logger.debug("Sending signed transaction", {
            signature: getSignatureFromTransaction(signedTransaction)
        });

        const signature = await this.solanaClient.sendAndConfirmTransaction(signedTransaction, {
            commitment: "confirmed",
            maxRetries: BigInt(appConfig.MAX_RETRIES),
            skipPreflight: false
        });

        return String(signature);
    }
}