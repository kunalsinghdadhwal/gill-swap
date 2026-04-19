import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { QuoteResponse, SwapInstructionResponse } from "../src/types/index.js";

const mockGetLatestBlockhashSend = jest.fn();
const mockCreateTransaction = jest.fn();
const mockCreateSolanaClient = jest.fn(() => ({
  rpc: {
    getLatestBlockhash: () => ({
      send: mockGetLatestBlockhashSend
    })
  }
}));
const mockAddress = jest.fn((value: string) => `addr:${value}`);

const mockGetAssociatedTokenAccountAddress = jest.fn(async (_mint: string, owner: string) => `ata:${owner}`);
const mockGetTransferTokensInstructions = jest.fn(() => [
  {
    programAddress: "transfer-program",
    accounts: [],
    data: new Uint8Array([10, 20])
  }
]);
const mockGetAddMemoInstruction = jest.fn(() => ({
  programAddress: "memo-program",
  accounts: [],
  data: new Uint8Array([99])
}));

jest.mock("../src/config/index.js", () => ({
  appConfig: {
    SOLANA_RPC_URL: "https://rpc.test.example",
    PRIORITY_FEE_MICROLAMPORTS: 1234
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
  AccountRole: {
    READONLY: 0,
    WRITABLE: 1,
    READONLY_SIGNER: 2,
    WRITABLE_SIGNER: 3
  },
  address: mockAddress,
  createSolanaClient: mockCreateSolanaClient,
  createTransaction: mockCreateTransaction
}));

jest.mock("gill/programs", () => ({
  getAssociatedTokenAccountAddress: mockGetAssociatedTokenAccountAddress,
  getTransferTokensInstructions: mockGetTransferTokensInstructions,
  getAddMemoInstruction: mockGetAddMemoInstruction
}));

import { GillTransactionBuilder } from "../src/core/gillBuilder.js";

const quoteFixture: QuoteResponse = {
  inputMint: "InputMint1111111111111111111111111111111111",
  outputMint: "OutputMint111111111111111111111111111111111",
  inAmountAtomic: "1000000",
  outAmountAtomic: "250000",
  otherAmountThresholdAtomic: "245000",
  taker: "Taker1111111111111111111111111111111111111",
  slippageBps: 50,
  swapMode: "ExactIn",
  estimatedPriceImpactPct: 0.01,
  routePlan: [{ percent: 100 }],
  rawProviderPayload: {
    inputMint: "InputMint1111111111111111111111111111111111",
    outputMint: "OutputMint111111111111111111111111111111111",
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
      programId: "SwapProgram111111111111111111111111111111111",
      accounts: [],
      data: "AQ=="
    },
    otherInstructions: [],
    cleanupInstruction: null,
    tipInstruction: null,
    addressesByLookupTableAddress: {},
    blockhashWithMetadata: {
      blockhash: "RouterBlockhash11111111111111111111111111111",
      fetchedAt: Date.now(),
      lastValidBlockHeight: 111
    }
  }
};

const instructionsFixture: SwapInstructionResponse = {
  computeBudgetInstructions: [
    {
      programId: "ComputeBudget111111111111111111111111111111",
      accounts: [],
      data: "AQ=="
    }
  ],
  setupInstructions: [
    {
      programId: "SetupProgram111111111111111111111111111111111",
      accounts: [
        {
          pubkey: "LookupTarget11111111111111111111111111111111",
          isSigner: false,
          isWritable: true
        }
      ],
      data: "AQ=="
    }
  ],
  swapInstruction: {
    programId: "SwapProgram111111111111111111111111111111111",
    accounts: [
      {
        pubkey: "Signer111111111111111111111111111111111111",
        isSigner: true,
        isWritable: false
      }
    ],
    data: "Ag=="
  },
  otherInstructions: [
    {
      programId: "OtherProgram11111111111111111111111111111111",
      accounts: [],
      data: "Aw=="
    }
  ],
  cleanupInstruction: {
    programId: "CleanupProgram111111111111111111111111111111",
    accounts: [],
    data: "BA=="
  },
  tipInstruction: {
    programId: "TipProgram111111111111111111111111111111111",
    accounts: [],
    data: "BQ=="
  },
  addressesByLookupTableAddress: {
    LookupTable1111111111111111111111111111111: ["LookupTarget11111111111111111111111111111111"]
  },
  blockhashWithMetadata: {
    blockhash: "RouterBlockhash11111111111111111111111111111",
    fetchedAt: Date.now(),
    lastValidBlockHeight: 111
  },
  rawProviderPayload: quoteFixture.rawProviderPayload
};

describe("GillTransactionBuilder", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetLatestBlockhashSend.mockResolvedValue({
      value: {
        blockhash: "LatestBlockhash11111111111111111111111111111",
        lastValidBlockHeight: 222n
      }
    });

    mockCreateTransaction.mockImplementation((input: Record<string, unknown>) => ({
      createdByMock: true,
      ...input
    }));
  });

  it("builds a transaction from Jupiter instructions with transfer + memo post-actions", async () => {
    const builder = new GillTransactionBuilder();

    const result = await builder.buildSwapTransaction({
      quote: quoteFixture,
      instructions: instructionsFixture,
      options: {
        computeUnitLimit: 500000,
        priorityFeeMicrolamports: 9999,
        memo: "post swap memo",
        postSwapTransfer: {
          destinationOwnerAddress: "Destination11111111111111111111111111111111",
          amountAtomic: "123"
        }
      }
    });

    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);

    const createTransactionArg = mockCreateTransaction.mock.calls[0][0] as {
      instructions: unknown[];
      computeUnitLimit: number;
      computeUnitPrice: number;
      feePayer: string;
    };

    expect(createTransactionArg.computeUnitLimit).toBe(500000);
    expect(createTransactionArg.computeUnitPrice).toBe(9999);
    expect(createTransactionArg.feePayer).toBe(`addr:${quoteFixture.taker}`);
    expect(createTransactionArg.instructions).toHaveLength(7);

    expect(mockGetTransferTokensInstructions).toHaveBeenCalledTimes(1);
    expect(mockGetAddMemoInstruction).toHaveBeenCalledWith({ memo: "post swap memo" });
    expect(result.requiredSignerAddress).toBe(quoteFixture.taker);
    expect(result.latestBlockhash.blockhash).toBe("LatestBlockhash11111111111111111111111111111");
  });

  it("uses default compute + priority values when options are omitted", async () => {
    const builder = new GillTransactionBuilder();

    await builder.buildSwapTransaction({
      quote: quoteFixture,
      instructions: instructionsFixture
    });

    const createTransactionArg = mockCreateTransaction.mock.calls[0][0] as {
      computeUnitLimit: number;
      computeUnitPrice: number;
    };

    expect(createTransactionArg.computeUnitLimit).toBe(250000);
    expect(createTransactionArg.computeUnitPrice).toBe(1234);
  });

  it("converts lookup accounts into Gill lookup metas when available", async () => {
    const builder = new GillTransactionBuilder();

    await builder.buildSwapTransaction({
      quote: quoteFixture,
      instructions: instructionsFixture
    });

    const createTransactionArg = mockCreateTransaction.mock.calls[0][0] as {
      instructions: Array<{ accounts?: Array<Record<string, unknown>> }>;
    };

    const firstInstructionAccounts = createTransactionArg.instructions[0]?.accounts ?? [];
    expect(firstInstructionAccounts[0]).toMatchObject({
      address: "addr:LookupTarget11111111111111111111111111111111",
      lookupTableAddress: "addr:LookupTable1111111111111111111111111111111",
      addressIndex: 0
    });
  });

  it("throws when quote taker is missing", async () => {
    const builder = new GillTransactionBuilder();

    await expect(
      builder.buildSwapTransaction({
        quote: {
          ...quoteFixture,
          taker: ""
        },
        instructions: instructionsFixture
      })
    ).rejects.toThrow("Quote is missing a taker address required for transaction construction.");
  });

  it("throws when a raw Jupiter instruction has invalid/empty data", async () => {
    const builder = new GillTransactionBuilder();

    await expect(
      builder.buildSwapTransaction({
        quote: quoteFixture,
        instructions: {
          ...instructionsFixture,
          swapInstruction: {
            ...instructionsFixture.swapInstruction,
            data: "***not_base64***"
          }
        }
      })
    ).rejects.toThrow("Jupiter instruction data decoded to empty bytes.");
  });

  it("propagates RPC blockhash fetch failures", async () => {
    mockGetLatestBlockhashSend.mockRejectedValueOnce(new Error("rpc down"));

    const builder = new GillTransactionBuilder();

    await expect(
      builder.buildSwapTransaction({
        quote: quoteFixture,
        instructions: instructionsFixture
      })
    ).rejects.toThrow("rpc down");
  });
});
