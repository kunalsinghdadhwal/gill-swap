import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { ExecuteTransactionInput } from "../src/types/index.js";

const mockSimulateTransaction = jest.fn();
const mockSendAndConfirmTransaction = jest.fn();
const mockCreateSolanaClient = jest.fn(() => ({
  simulateTransaction: mockSimulateTransaction,
  sendAndConfirmTransaction: mockSendAndConfirmTransaction
}));

const mockAddSignersToTransactionMessage = jest.fn((_signers: unknown[], message: unknown) => ({
  ...(message as Record<string, unknown>),
  withSigner: true
}));
const mockSignTransactionMessageWithSigners = jest.fn(async (message: unknown) => ({
  ...(message as Record<string, unknown>),
  signed: true
}));
const mockGetSignatureFromTransaction = jest.fn(() => "pre-send-signature");

const mockLoadKeypairSignerFromFile = jest.fn();

jest.mock("../src/config/index.js", () => ({
  appConfig: {
    SOLANA_RPC_URL: "https://rpc.test.example",
    HOT_WALLET_PATH: "/tmp/hot-wallet.json",
    MAX_RETRIES: 2,
    RETRY_BASE_DELAY_MS: 0
  }
}));

jest.mock("../src/utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock("gill", () => ({
  createSolanaClient: mockCreateSolanaClient,
  addSignersToTransactionMessage: mockAddSignersToTransactionMessage,
  signTransactionMessageWithSigners: mockSignTransactionMessageWithSigners,
  getSignatureFromTransaction: mockGetSignatureFromTransaction
}));

jest.mock("gill/node", () => ({
  loadKeypairSignerFromFile: mockLoadKeypairSignerFromFile
}));

import { TransactionExecutor } from "../src/core/executor.js";

function createExecuteInput(requiredSignerAddress = "Wallet111111111111111111111111111111111111"): ExecuteTransactionInput {
  return {
    idempotencyKey: "test-idempotency",
    unsignedTransaction: {
      unsignedTransactionId: "utx_123",
      transactionMessage: {
        version: "legacy",
        feePayer: requiredSignerAddress,
        instructions: []
      } as ExecuteTransactionInput["unsignedTransaction"]["transactionMessage"],
      instructionCount: 3,
      requiredSignerAddress,
      latestBlockhash: {
        blockhash: "Blockhash1111111111111111111111111111111111",
        lastValidBlockHeight: 123,
        fetchedAt: Date.now()
      },
      metadata: {}
    }
  };
}

describe("TransactionExecutor", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockLoadKeypairSignerFromFile.mockResolvedValue({
      address: "Wallet111111111111111111111111111111111111"
    });

    mockSimulateTransaction.mockResolvedValue({
      context: { slot: 777n },
      value: { err: null, logs: ["ok"] }
    });

    mockSendAndConfirmTransaction.mockResolvedValue("final-chain-signature");
  });

  it("simulates, signs, sends, and confirms on the happy path", async () => {
    const executor = new TransactionExecutor();
    const input = createExecuteInput();

    const result = await executor.executeTransaction(input);

    expect(mockLoadKeypairSignerFromFile).toHaveBeenCalledWith("/tmp/hot-wallet.json");
    expect(mockAddSignersToTransactionMessage).toHaveBeenCalledTimes(1);
    expect(mockSignTransactionMessageWithSigners).toHaveBeenCalledTimes(1);
    expect(mockSendAndConfirmTransaction).toHaveBeenCalledWith(expect.anything(), {
      commitment: "confirmed",
      maxRetries: 2n,
      skipPreflight: false
    });

    expect(result.signature).toBe("final-chain-signature");
    expect(result.status).toBe("confirmed");
    expect(result.simulated).toBe(true);
    expect(result.confirmed).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.slot).toBe(777);
    expect(result.explorerUrl).toContain("final-chain-signature");
  });

  it("throws when simulation returns an error", async () => {
    mockSimulateTransaction.mockResolvedValueOnce({
      context: { slot: 7n },
      value: {
        err: { InstructionError: [0, "Custom"] },
        logs: ["error"]
      }
    });

    const executor = new TransactionExecutor();

    await expect(executor.executeTransaction(createExecuteInput())).rejects.toThrow(
      "Transaction simulation failed"
    );

    expect(mockSignTransactionMessageWithSigners).not.toHaveBeenCalled();
    expect(mockSendAndConfirmTransaction).not.toHaveBeenCalled();
  });

  it("throws when wallet signer does not match required signer", async () => {
    mockLoadKeypairSignerFromFile.mockResolvedValueOnce({
      address: "DifferentSigner11111111111111111111111111111111"
    });

    const executor = new TransactionExecutor();

    await expect(executor.executeTransaction(createExecuteInput())).rejects.toThrow(
      "does not match required swap signer"
    );

    expect(mockSimulateTransaction).not.toHaveBeenCalled();
  });

  it("propagates wallet loading errors", async () => {
    mockLoadKeypairSignerFromFile.mockRejectedValueOnce(new Error("wallet not found"));

    const executor = new TransactionExecutor();

    await expect(executor.executeTransaction(createExecuteInput())).rejects.toThrow("wallet not found");
  });

  it("retries sendAndConfirmTransaction and eventually succeeds", async () => {
    mockSendAndConfirmTransaction
      .mockRejectedValueOnce(new Error("temporary failure #1"))
      .mockRejectedValueOnce(new Error("temporary failure #2"))
      .mockResolvedValueOnce("signature-after-retries");

    const executor = new TransactionExecutor();

    const result = await executor.executeTransaction(createExecuteInput());

    expect(mockSendAndConfirmTransaction).toHaveBeenCalledTimes(3);
    expect(result.signature).toBe("signature-after-retries");
    expect(result.attempts).toBe(3);
  });

  it("fails after retry budget is exhausted", async () => {
    mockSendAndConfirmTransaction.mockRejectedValue(new Error("permanent send failure"));

    const executor = new TransactionExecutor();

    await expect(executor.executeTransaction(createExecuteInput())).rejects.toThrow(
      "permanent send failure"
    );

    expect(mockSendAndConfirmTransaction).toHaveBeenCalledTimes(3);
  });

  it("caches the hot wallet signer between executions", async () => {
    const executor = new TransactionExecutor();

    await executor.executeTransaction(createExecuteInput());
    await executor.executeTransaction(createExecuteInput());

    expect(mockLoadKeypairSignerFromFile).toHaveBeenCalledTimes(1);
  });
});
