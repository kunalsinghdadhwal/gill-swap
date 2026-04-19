import type { RuntimeMode } from "../types/index.js";

/**
 * General helper functions reused by multiple layers.
 *
 * Architecture role:
 * - Keeps small parsing and utility concerns out of business logic modules.
 * - Encourages focused core modules that operate on validated inputs.
 */

export function toPositiveInteger(value: string, fieldName: string): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${fieldName} must be a positive integer.`);
    }
    return parsed;
}

export function normalizeOptionalNumber(value: string | undefined, fallback: number): number {
    if (value === undefined || value.trim().length === 0) {
        return fallback;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Expected a valid numeric value but received: ${value}`);
    }

    return parsed;
}

export interface TokenReference {
    symbol: string;
    mint: string;
    decimals: number;
}

const KNOWN_TOKEN_MAP: Record<string, TokenReference> = {
    SOL: {
        symbol: "SOL",
        mint: "So11111111111111111111111111111111111111112",
        decimals: 9
    },
    WSOL: {
        symbol: "WSOL",
        mint: "So11111111111111111111111111111111111111112",
        decimals: 9
    },
    USDC: {
        symbol: "USDC",
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        decimals: 6
    },
    USDT: {
        symbol: "USDT",
        mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        decimals: 6
    }
};

const BASE58_PUBKEY_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function resolveTokenReference(input: string): TokenReference | { mint: string } {
    const normalized = input.trim();
    const symbolCandidate = normalized.toUpperCase();

    if (KNOWN_TOKEN_MAP[symbolCandidate] !== undefined) {
        return KNOWN_TOKEN_MAP[symbolCandidate];
    }

    if (!BASE58_PUBKEY_PATTERN.test(normalized)) {
        throw new Error(
            `Token value "${input}" is neither a supported symbol nor a valid Solana mint address.`
        );
    }

    return { mint: normalized };
}

export function convertUiAmountToAtomic(amount: string, decimals: number): string {
    const normalized = amount.trim();
    if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(normalized)) {
        throw new Error(`Invalid amount format: ${amount}`);
    }

    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
        throw new Error(`Invalid decimals value: ${decimals}`);
    }

    const splitAmount = normalized.split(".");
    const wholePart = splitAmount[0] ?? "0";
    const fractionalPart = splitAmount[1] ?? "";
    if (fractionalPart.length > decimals) {
        throw new Error(
            `Amount ${amount} has more decimal places than token supports (${decimals}).`
        );
    }

    const paddedFraction = fractionalPart.padEnd(decimals, "0");
    const base = 10n ** BigInt(decimals);
    const whole = BigInt(wholePart);
    const fraction = paddedFraction.length > 0 ? BigInt(paddedFraction) : 0n;

    return (whole * base + fraction).toString();
}

export function buildSolanaExplorerUrl(signature: string, cluster: string): string {
    return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=${encodeURIComponent(cluster)}`;
}

export function detectRuntimeMode(args: string[]): RuntimeMode {
    const modeArg = args.find((arg) => arg.startsWith("--mode="));
    if (modeArg) {
        const [, value] = modeArg.split("=");
        if (value === "server") {
            return "server";
        }
        return "cli";
    }

    if (args[0] === "server") {
        return "server";
    }

    return "cli";
}

export function createRequestId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createMockId(prefix: string): string {
    return createRequestId(prefix);
}