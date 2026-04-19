import { appConfig } from "../config/index.js";
import type { ExecuteTransactionInput, ExecutionResult } from "../types/index.js";
import { buildSolanaExplorerUrl, createMockId } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";
import { retryWithBackoff } from "../utils/retry.js";

/**
 * Execution pipeline for unsigned transactions.
 *
 * Architecture role:
 * - Orchestrates simulation, signing, send retries, and confirmation checks.
 * - Central place for reliability and observability in swap execution lifecycle.
 *
 * NOTE:
 * - This module contains non-network placeholders only.
 * - TODO sections mark where Gill node signing and Solana RPC calls belong.
 */

export class TransactionExecutor {
  public async executeTransaction(input: ExecuteTransactionInput): Promise<ExecutionResult> {
    logger.info("Starting placeholder execution pipeline", {
      unsignedTransactionId: input.unsignedTransaction.unsignedTransactionId,
      idempotencyKey: input.idempotencyKey
    });

    const simulated = await this.simulateTransaction(input);
    const signedPayload = await this.signTransaction(input);

    const { result: signature, attempts } = await retryWithBackoff(
      async () => this.sendTransaction(signedPayload),
      {
        retries: appConfig.MAX_RETRIES,
        baseDelayMs: appConfig.RETRY_BASE_DELAY_MS,
        onRetry: (error, attempt, nextDelayMs) => {
          logger.warn("Retrying placeholder send", {
            attempt,
            nextDelayMs,
            reason: String(error)
          });
        }
      }
    );

    const confirmation = await this.confirmTransaction(signature);

    return {
      unsignedTransactionId: input.unsignedTransaction.unsignedTransactionId,
      signature,
      simulated,
      confirmed: confirmation.confirmed,
      attempts,
      slot: confirmation.slot,
      explorerUrl: buildSolanaExplorerUrl(signature, "mainnet-beta"),
      status: confirmation.confirmed ? "mock-confirmed" : "mock-submitted",
      diagnostics: {
        placeholder: true,
        signedPayload,
        idempotencyKey: input.idempotencyKey
      }
    };
  }

  private async simulateTransaction(input: ExecuteTransactionInput): Promise<boolean> {
    logger.debug("Running placeholder simulation", {
      unsignedTransactionId: input.unsignedTransaction.unsignedTransactionId
    });

    // TODO: Replace with RPC simulation using the assembled transaction.
    return true;
  }

  private async signTransaction(input: ExecuteTransactionInput): Promise<string> {
    logger.debug("Running placeholder signing", {
      walletPath: appConfig.HOT_WALLET_PATH
    });

    // TODO: Replace with gill/node signer integration and detached signature flow.
    return `signed_payload_${input.unsignedTransaction.unsignedTransactionId}`;
  }

  private async sendTransaction(signedPayload: string): Promise<string> {
    logger.debug("Running placeholder send", {
      signedPayloadLength: signedPayload.length
    });

    // TODO: Replace with sendRawTransaction RPC flow and enhanced error mapping.
    return createMockId("sig");
  }

  private async confirmTransaction(signature: string): Promise<{ confirmed: boolean; slot: number }> {
    logger.debug("Running placeholder confirmation check", {
      signature
    });

    // TODO: Replace with blockhash strategy and commitment-based confirmation handling.
    return {
      confirmed: true,
      slot: 0
    };
  }
}