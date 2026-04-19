import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateSolanaClient = jest.fn();
const mockAddSignersToTransactionMessage = jest.fn();
const mockSignTransactionMessageWithSigners = jest.fn();
const mockGetSignatureFromTransaction = jest.fn();

const mockLoadKeypairSignerFromFile = jest.fn();

jest.unstable_mockModule("gill", () => ({
    createSolanaClient: mockCreateSolanaClient,
    addSignersToTransactionMessage: mockAddSignersToTransactionMessage,
    signTransactionMessageWithSigners: mockSignTransactionMessageWithSigners,
    getSignatureFromTransaction: mockGetSignatureFromTransaction
}));

jest.unstable_mockModule("gill/node", () => ({
    loadKeypairSignerFromFile: mockLoadKeypairSignerFromFile
}));

const { TransactionExecutor } = await import("../src/core/executor.js");
const { appConfig } = await import("../src/config/index.js");

const REQUIRED_SIGNER = "11111111111111111111111111111111";

function createExecuteInput(requiredSignerAddress = REQUIRED_SIGNER) {
    return {
        idempotencyKey: "test-idempotency",
        unsignedTransaction: {
            unsignedTransactionId: "utx_123",
            transactionMessage: {
                version: "legacy",
                feePayer: { address: requiredSignerAddress },
                instructions: []
            },
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
    const mockSimulateTransaction = jest.fn();
    const mockSendAndConfirmTransaction = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();

        mockCreateSolanaClient.mockReturnValue({
            simulateTransaction: mockSimulateTransaction,
            sendAndConfirmTransaction: mockSendAndConfirmTransaction
        });

        mockLoadKeypairSignerFromFile.mockResolvedValue({
            address: REQUIRED_SIGNER
        });

        mockAddSignersToTransactionMessage.mockImplementation((_, txMessage: unknown) => txMessage);

        mockSignTransactionMessageWithSigners.mockResolvedValue({
            fakeSigned: true
        });

        mockGetSignatureFromTransaction.mockReturnValue("pre-send-signature");

        mockSimulateTransaction.mockResolvedValue({
            context: { slot: 777n },
            value: { err: null, logs: ["ok"] }
        });

        mockSendAndConfirmTransaction.mockResolvedValue("final-chain-signature");
    });

    it("simulates, signs, sends, and confirms on the happy path", async () => {
        const executor = new TransactionExecutor();

        const result = await executor.executeTransaction(createExecuteInput());

        expect(mockLoadKeypairSignerFromFile).toHaveBeenCalled();
        expect(mockAddSignersToTransactionMessage).toHaveBeenCalledTimes(1);
        expect(mockSignTransactionMessageWithSigners).toHaveBeenCalledTimes(1);
        expect(mockSendAndConfirmTransaction).toHaveBeenCalledWith(expect.anything(), {
            commitment: "confirmed",
            maxRetries: BigInt(appConfig.MAX_RETRIES),
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
            address: "SysvarRent111111111111111111111111111111111"
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

        expect(mockSendAndConfirmTransaction).toHaveBeenCalledTimes(appConfig.MAX_RETRIES + 1);
    });

    it("caches the hot wallet signer between executions", async () => {
        const executor = new TransactionExecutor();

        await executor.executeTransaction(createExecuteInput());
        await executor.executeTransaction(createExecuteInput());

        expect(mockLoadKeypairSignerFromFile).toHaveBeenCalledTimes(1);
    });
});
