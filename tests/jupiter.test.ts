import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fetchMock from "jest-fetch-mock";

import { appConfig } from "../src/config/index.js";
import { JupiterClient } from "../src/core/jupiter.js";
import type { JupiterBuildResponse, SwapRequestPayload } from "../src/types/index.js";

jest.mock("../src/config/index.js", () => ({
  appConfig: {
    JUPITER_API_BASE_URL: "https://quote-api.jup.ag/v6",
    JUPITER_API_KEY: "test-jupiter-key",
    DEFAULT_SLIPPAGE_BPS: 75,
    REQUEST_TIMEOUT_MS: 1000
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

const baseBuildResponse: JupiterBuildResponse = {
  inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  outputMint: "So11111111111111111111111111111111111111112",
  inAmount: "1000000",
  outAmount: "12000000",
  otherAmountThreshold: "11900000",
  swapMode: "ExactIn",
  slippageBps: 75,
  priceImpactPct: "0.0003",
  routePlan: [{ percent: 100 }],
  computeBudgetInstructions: [
    {
      programId: "ComputeBudget111111111111111111111111111111",
      accounts: [],
      data: "A9gXAAAAAAAA"
    }
  ],
  setupInstructions: [
    {
      programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      accounts: [
        {
          pubkey: "11111111111111111111111111111111",
          isSigner: true,
          isWritable: true
        }
      ],
      data: "AQ=="
    }
  ],
  swapInstruction: {
    programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    accounts: [
      {
        pubkey: "11111111111111111111111111111111",
        isSigner: true,
        isWritable: false
      }
    ],
    data: "Ag=="
  },
  otherInstructions: [],
  cleanupInstruction: {
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    accounts: [
      {
        pubkey: "11111111111111111111111111111111",
        isSigner: false,
        isWritable: true
      }
    ],
    data: "CQ=="
  },
  tipInstruction: null,
  addressesByLookupTableAddress: {
    LookupTable1111111111111111111111111111111: ["LookupAddr11111111111111111111111111111111"]
  },
  blockhashWithMetadata: {
    blockhash: "DummyBlockhash11111111111111111111111111111111",
    lastValidBlockHeight: 123456,
    fetchedAt: Date.now()
  }
};

const basePayload: SwapRequestPayload = {
  inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  outputMint: "So11111111111111111111111111111111111111112",
  amountAtomic: "1000000",
  userPublicKey: "11111111111111111111111111111111"
};

describe("JupiterClient", () => {
  beforeAll(() => {
    fetchMock.enableMocks();
  });

  beforeEach(() => {
    fetchMock.resetMocks();
    appConfig.JUPITER_API_KEY = "test-jupiter-key";
    appConfig.JUPITER_API_BASE_URL = "https://quote-api.jup.ag/v6";
    appConfig.DEFAULT_SLIPPAGE_BPS = 75;
  });

  afterAll(() => {
    fetchMock.disableMocks();
  });

  it("fetches real quote + router instructions successfully", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(baseBuildResponse), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const client = new JupiterClient();
    const quote = await client.getQuote(basePayload);
    const instructions = await client.getSwapInstructions({
      quote,
      userPublicKey: basePayload.userPublicKey
    });

    expect(quote.inputMint).toBe(baseBuildResponse.inputMint);
    expect(quote.outAmountAtomic).toBe(baseBuildResponse.outAmount);
    expect(quote.estimatedPriceImpactPct).toBeCloseTo(0.0003);
    expect(instructions.swapInstruction.programId).toBe(baseBuildResponse.swapInstruction.programId);
    expect(instructions.blockhashWithMetadata.blockhash).toBe(
      baseBuildResponse.blockhashWithMetadata.blockhash
    );

    const fetchCalls = (global.fetch as unknown as jest.Mock).mock.calls;
    const [requestUrl, requestInit] = fetchCalls[0] as [string, RequestInit];
    const parsedUrl = new URL(String(requestUrl));

    expect(`${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`).toBe(
      "https://api.jup.ag/swap/v2/build"
    );
    expect(parsedUrl.searchParams.get("inputMint")).toBe(basePayload.inputMint);
    expect(parsedUrl.searchParams.get("outputMint")).toBe(basePayload.outputMint);
    expect(parsedUrl.searchParams.get("amount")).toBe(basePayload.amountAtomic);
    expect(parsedUrl.searchParams.get("taker")).toBe(basePayload.userPublicKey);
    expect(parsedUrl.searchParams.get("slippageBps")).toBe("75");

    const headers = (requestInit as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-jupiter-key");
  });

  it("uses payload slippage when explicitly provided", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(baseBuildResponse), { status: 200 });

    const client = new JupiterClient();
    await client.getQuote({
      ...basePayload,
      slippageBps: 25
    });

    const fetchCalls = (global.fetch as unknown as jest.Mock).mock.calls;
    const [requestUrl] = fetchCalls[0] as [string];
    const parsedUrl = new URL(String(requestUrl));
    expect(parsedUrl.searchParams.get("slippageBps")).toBe("25");
  });

  it("throws when taker is missing from swap payload", async () => {
    const client = new JupiterClient();

    await expect(
      client.getQuote({
        ...basePayload,
        userPublicKey: ""
      })
    ).rejects.toThrow("Swap request must include userPublicKey for Jupiter Router taker.");
  });

  it("throws a detailed error for invalid token API responses", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        message: "invalid input mint"
      }),
      { status: 400 }
    );

    const client = new JupiterClient();

    await expect(client.getQuote(basePayload)).rejects.toThrow(
      "Jupiter Router request failed (400): invalid input mint"
    );
  });

  it("throws a detailed error for insufficient amount API responses", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        error: {
          issues: [{ message: "Amount too low" }]
        }
      }),
      { status: 422 }
    );

    const client = new JupiterClient();

    await expect(client.getQuote(basePayload)).rejects.toThrow("Jupiter Router request failed (422):");
  });

  it("throws for network failures while reaching Jupiter", async () => {
    fetchMock.mockRejectOnce(new Error("network unavailable"));

    const client = new JupiterClient();

    await expect(client.getQuote(basePayload)).rejects.toThrow(
      "Failed to reach Jupiter Router endpoint: Error: network unavailable"
    );
  });

  it("throws when Jupiter response schema is invalid", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        inputMint: baseBuildResponse.inputMint,
        outputMint: baseBuildResponse.outputMint
      }),
      { status: 200 }
    );

    const client = new JupiterClient();

    await expect(client.getQuote(basePayload)).rejects.toThrow("Invalid Jupiter Router response:");
  });

  it("throws when API key is not configured", () => {
    appConfig.JUPITER_API_KEY = "";

    expect(() => new JupiterClient()).toThrow(
      "JUPITER_API_KEY is required for Router /swap/v2/build requests."
    );
  });

  it("throws when swap instruction request taker does not match quote taker", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(baseBuildResponse), { status: 200 });

    const client = new JupiterClient();
    const quote = await client.getQuote(basePayload);

    await expect(
      client.getSwapInstructions({
        quote,
        userPublicKey: "DifferentTaker1111111111111111111111111111111"
      })
    ).rejects.toThrow("Swap instruction request taker mismatch with quote payload.");
  });

  const itLive = process.env.RUN_LIVE_JUPITER_TESTS === "1" ? it : it.skip;

  itLive("can hit live Jupiter Router endpoint when explicitly enabled", async () => {
    const liveClient = new JupiterClient();

    const quote = await liveClient.getQuote(basePayload);
    expect(quote.inAmountAtomic).toBeTruthy();
    expect(quote.rawProviderPayload.swapInstruction.programId).toBeTruthy();
  });
});
