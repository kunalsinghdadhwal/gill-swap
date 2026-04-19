import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateSolanaClient = jest.fn();
const mockCreateTransaction = jest.fn();

const mockGetAssociatedTokenAccountAddress = jest.fn();
const mockGetTransferTokensInstructions = jest.fn();
const mockGetAddMemoInstruction = jest.fn();

jest.unstable_mockModule("gill", () => ({
    AccountRole: {
        WRITABLE_SIGNER: "WRITABLE_SIGNER",
        READONLY_SIGNER: "READONLY_SIGNER",
        WRITABLE: "WRITABLE",
        READONLY: "READONLY"
    },
    address: (value: string) => value,
    createSolanaClient: mockCreateSolanaClient,
    createTransaction: mockCreateTransaction
}));

jest.unstable_mockModule("gill/programs", () => ({
    getAssociatedTokenAccountAddress: mockGetAssociatedTokenAccountAddress,
    getTransferTokensInstructions: mockGetTransferTokensInstructions,
    getAddMemoInstruction: mockGetAddMemoInstruction
}));

const { GillTransactionBuilder } = await import("../src/core/gillBuilder.js");

const TAKER = "11111111111111111111111111111111";
const INPUT_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OUTPUT_MINT = "So11111111111111111111111111111111111111112";
const ROUTER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const LOOKUP_TABLE = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const LOOKUP_TARGET = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

function createQuoteFixture() {
    return {
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        inAmountAtomic: "1000000",
        outAmountAtomic: "250000",
        otherAmountThresholdAtomic: "245000",
        taker: TAKER,
        slippageBps: 50,
        swapMode: "ExactIn",
        estimatedPriceImpactPct: 0.01,
        routePlan: [{ percent: 100 }],
        rawProviderPayload: {
            inputMint: INPUT_MINT,
            outputMint: OUTPUT_MINT,
            inAmount: "1000000",
            outAmount: "250000",
            otherAmountThreshold: "245000",
            swapMode: "ExactIn",
            slippageBps: 50,
            priceImpactPct: "0.01",
            routePlan: [{ percent: 100 }],
            computeBudgetInstructions: [],
            setupInstructions: [],
            swapInstruction: {
                programId: ROUTER_PROGRAM,
                accounts: [],
                data: "AQ=="
            },
            otherInstructions: [],
            cleanupInstruction: null,
            tipInstruction: null,
            addressesByLookupTableAddress: {},
            blockhashWithMetadata: {
                blockhash: "RouterBlockhash111111111111111111111111111111111",
                fetchedAt: Date.now(),
                lastValidBlockHeight: 111
            }
        }
    };
}

function createInstructionsFixture() {
    return {
        computeBudgetInstructions: [
            {
                programId: "ComputeBudget111111111111111111111111111111",
                accounts: [],
                data: "AQ=="
            }
        ],
        setupInstructions: [
            {
                programId: ROUTER_PROGRAM,
                accounts: [
                    {
                        pubkey: LOOKUP_TARGET,
                        isSigner: false,
                        isWritable: true
                    }
                ],
                data: "AQ=="
            }
        ],
        swapInstruction: {
            programId: ROUTER_PROGRAM,
            accounts: [
                {
                    pubkey: TAKER,
                    isSigner: true,
                    isWritable: false
                }
            ],
            data: "Ag=="
        },
        otherInstructions: [
            {
                programId: ROUTER_PROGRAM,
                accounts: [],
                data: "Aw=="
            }
        ],
        cleanupInstruction: {
            programId: LOOKUP_TARGET,
            accounts: [
                {
                    pubkey: TAKER,
                    isSigner: false,
                    isWritable: true
                }
            ],
            data: "BA=="
        },
        tipInstruction: {
            programId: LOOKUP_TARGET,
            accounts: [
                {
                    pubkey: TAKER,
                    isSigner: false,
                    isWritable: true
                }
            ],
            data: "BQ=="
        },
        addressesByLookupTableAddress: {
            [LOOKUP_TABLE]: [LOOKUP_TARGET]
        },
        blockhashWithMetadata: {
            blockhash: "RouterBlockhash111111111111111111111111111111111",
            fetchedAt: Date.now(),
            lastValidBlockHeight: 111
        },
        rawProviderPayload: createQuoteFixture().rawProviderPayload
    };
}

describe("GillTransactionBuilder", () => {
    const mockGetLatestBlockhashSend = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();

        mockGetLatestBlockhashSend.mockResolvedValue({
            value: {
                blockhash: "LatestBlockhash11111111111111111111111111111111",
                lastValidBlockHeight: 222n
            }
        });

        mockCreateSolanaClient.mockReturnValue({
            rpc: {
                getLatestBlockhash: () => ({
                    send: mockGetLatestBlockhashSend
                })
            }
        });

        mockCreateTransaction.mockImplementation((input: unknown) => ({
            builtByTest: true,
            ...(input as object)
        }));

        mockGetAssociatedTokenAccountAddress.mockResolvedValue("3DrM4JiBD3Voq5xNJ5CqsxvE3kwNQ3kqBaRDfbSwXYKD");

        mockGetTransferTokensInstructions.mockReturnValue([
            {
                programAddress: LOOKUP_TARGET,
                accounts: [],
                data: new Uint8Array([10, 20])
            }
        ]);

        mockGetAddMemoInstruction.mockReturnValue({
            programAddress: LOOKUP_TARGET,
            accounts: [],
            data: new Uint8Array([99])
        });
    });

    it("builds transaction from Jupiter instructions with transfer + memo post-actions", async () => {
        const builder = new GillTransactionBuilder();
        const quote = createQuoteFixture();
        const instructions = createInstructionsFixture();

        const result = await builder.buildSwapTransaction({
            quote,
            instructions,
            options: {
                computeUnitLimit: 500000,
                priorityFeeMicrolamports: 9999,
                memo: "post swap memo",
                postSwapTransfer: {
                    destinationOwnerAddress: "SysvarRent111111111111111111111111111111111",
                    amountAtomic: "123"
                }
            }
        });

        expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
        expect(mockGetTransferTokensInstructions).toHaveBeenCalledTimes(1);
        expect(mockGetAddMemoInstruction).toHaveBeenCalledWith({ memo: "post swap memo" });

        const callArg = mockCreateTransaction.mock.calls[0]?.[0] as {
            computeUnitLimit: number;
            computeUnitPrice: number;
            feePayer: string;
        };

        expect(callArg.computeUnitLimit).toBe(500000);
        expect(callArg.computeUnitPrice).toBe(9999);
        expect(callArg.feePayer).toBe(TAKER);

        expect(result.requiredSignerAddress).toBe(TAKER);
        expect(result.latestBlockhash.blockhash).toBe("LatestBlockhash11111111111111111111111111111111");
        expect(result.instructionCount).toBeGreaterThan(0);
    });

    it("uses default compute unit limit and priority fee when options are omitted", async () => {
        const builder = new GillTransactionBuilder();

        await builder.buildSwapTransaction({
            quote: createQuoteFixture(),
            instructions: createInstructionsFixture()
        });

        const callArg = mockCreateTransaction.mock.calls[0]?.[0] as {
            computeUnitLimit: number;
            computeUnitPrice: number;
        };

        expect(callArg.computeUnitLimit).toBe(250000);
        expect(typeof callArg.computeUnitPrice).toBe("number");
    });

    it("throws when quote taker is missing", async () => {
        const builder = new GillTransactionBuilder();

        await expect(
            builder.buildSwapTransaction({
                quote: {
                    ...createQuoteFixture(),
                    taker: ""
                },
                instructions: createInstructionsFixture()
            })
        ).rejects.toThrow("Quote is missing a taker address required for transaction construction.");
    });

    it("throws when raw Jupiter instruction data decodes to empty bytes", async () => {
        const builder = new GillTransactionBuilder();
        const instructions = createInstructionsFixture();

        instructions.swapInstruction.data = "";

        await expect(
            builder.buildSwapTransaction({
                quote: createQuoteFixture(),
                instructions
            })
        ).rejects.toThrow("Jupiter instruction data decoded to empty bytes.");
    });

    it("propagates latest blockhash RPC failures", async () => {
        mockGetLatestBlockhashSend.mockRejectedValueOnce(new Error("rpc down"));
        const builder = new GillTransactionBuilder();

        await expect(
            builder.buildSwapTransaction({
                quote: createQuoteFixture(),
                instructions: createInstructionsFixture()
            })
        ).rejects.toThrow("rpc down");
    });
});
