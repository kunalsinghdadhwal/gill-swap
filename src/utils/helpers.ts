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

export function createMockId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}