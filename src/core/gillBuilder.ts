import { AccountRole, address, createSolanaClient, createTransaction, type Instruction } from "gill";
import {
    getAddMemoInstruction,
    getAssociatedTokenAccountAddress,
    getTransferTokensInstructions
} from "gill/programs";

import { appConfig } from "../config/index.js";
import type {
    BuildSwapTransactionOptions,
    JupiterRawInstruction,
    QuoteResponse,
    SwapInstructionResponse,
    UnsignedSwapTransaction
} from "../types/index.js";
import { createRequestId } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";

/**
 * Gill transaction builder abstraction.
 *
 * Architecture role:
 * - Converts real Jupiter raw instructions into Gill SDK `Instruction` values.
 * - Composes a fresh transaction with Router instructions and optional post-swap actions.
 * - Encapsulates transaction shaping decisions (compute budget, priority fee, memo).
 */

type LookupAccountIndex = {
    lookupTableAddress: string;
    addressIndex: number;
};

function getRoleFromFlags(isSigner: boolean, isWritable: boolean): AccountRole {
    if (isSigner && isWritable) {
        return AccountRole.WRITABLE_SIGNER;
    }
    if (isSigner) {
        return AccountRole.READONLY_SIGNER;
    }
    if (isWritable) {
        return AccountRole.WRITABLE;
    }
    return AccountRole.READONLY;
}

function decodeInstructionData(data: string): Uint8Array {
    let bytes: Uint8Array;
    try {
        bytes = Buffer.from(data, "base64");
    } catch (error) {
        throw new Error(`Invalid base64 instruction data: ${String(error)}`);
    }

    if (bytes.length === 0) {
        throw new Error("Jupiter instruction data decoded to empty bytes.");
    }

    return bytes;
}

function buildLookupIndex(addressesByLookupTableAddress: Record<string, string[]>): Map<string, LookupAccountIndex> {
    const lookupIndex = new Map<string, LookupAccountIndex>();

    for (const [lookupTableAddress, addresses] of Object.entries(addressesByLookupTableAddress)) {
        addresses.forEach((itemAddress, addressIndex) => {
            if (!lookupIndex.has(itemAddress)) {
                lookupIndex.set(itemAddress, {
                    lookupTableAddress,
                    addressIndex
                });
            }
        });
    }

    return lookupIndex;
}

function toGillInstruction(
    rawInstruction: JupiterRawInstruction,
    lookupIndex: Map<string, LookupAccountIndex>
): Instruction {
    const accounts = rawInstruction.accounts.map((accountMeta) => {
        const role = getRoleFromFlags(accountMeta.isSigner, accountMeta.isWritable);
        const lookup = lookupIndex.get(accountMeta.pubkey);

        if (!accountMeta.isSigner && lookup !== undefined) {
            return {
                address: address(accountMeta.pubkey),
                addressIndex: lookup.addressIndex,
                lookupTableAddress: address(lookup.lookupTableAddress),
                role: accountMeta.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY
            };
        }

        return {
            address: address(accountMeta.pubkey),
            role
        };
    });

    return {
        programAddress: address(rawInstruction.programId),
        accounts,
        data: decodeInstructionData(rawInstruction.data)
    };
}

export class GillTransactionBuilder {
    private readonly solanaClient = createSolanaClient({
        urlOrMoniker: appConfig.SOLANA_RPC_URL
    });

    public async buildSwapTransaction(input: {
        quote: QuoteResponse;
        instructions: SwapInstructionResponse;
        options?: Partial<BuildSwapTransactionOptions>;
    }): Promise<UnsignedSwapTransaction> {
        if (!input.quote.taker || input.quote.taker.trim().length === 0) {
            throw new Error("Quote is missing a taker address required for transaction construction.");
        }

        const resolvedOptions: BuildSwapTransactionOptions = {
            computeUnitLimit: input.options?.computeUnitLimit ?? 250_000,
            priorityFeeMicrolamports:
                input.options?.priorityFeeMicrolamports ?? appConfig.PRIORITY_FEE_MICROLAMPORTS
        };

        if (input.options?.memo !== undefined) {
            resolvedOptions.memo = input.options.memo;
        }

        if (input.options?.postSwapTransfer !== undefined) {
            resolvedOptions.postSwapTransfer = input.options.postSwapTransfer;
        }

        logger.info("Building Gill transaction from Jupiter raw instructions", {
            inputMint: input.quote.inputMint,
            outputMint: input.quote.outputMint,
            taker: input.quote.taker,
            computeUnitLimit: resolvedOptions.computeUnitLimit,
            priorityFeeMicrolamports: resolvedOptions.priorityFeeMicrolamports,
            memoIncluded: Boolean(resolvedOptions.memo)
        });

        const lookupIndex = buildLookupIndex(input.instructions.addressesByLookupTableAddress);

        const routerInstructions: Instruction[] = [
            ...input.instructions.setupInstructions.map((item) => toGillInstruction(item, lookupIndex)),
            ...input.instructions.otherInstructions.map((item) => toGillInstruction(item, lookupIndex)),
            toGillInstruction(input.instructions.swapInstruction, lookupIndex),
            ...(input.instructions.cleanupInstruction
                ? [toGillInstruction(input.instructions.cleanupInstruction, lookupIndex)]
                : []),
            ...(input.instructions.tipInstruction
                ? [toGillInstruction(input.instructions.tipInstruction, lookupIndex)]
                : [])
        ];

        const postSwapInstructions: Instruction[] = [];
        const takerAddress = address(input.quote.taker);

        if (resolvedOptions.postSwapTransfer !== undefined) {
            const outputMint = address(input.quote.outputMint);
            const destinationOwner = address(resolvedOptions.postSwapTransfer.destinationOwnerAddress);
            const sourceAta = await getAssociatedTokenAccountAddress(outputMint, takerAddress);
            const destinationAta = await getAssociatedTokenAccountAddress(outputMint, destinationOwner);

            const transferInstructions = getTransferTokensInstructions({
                feePayer: takerAddress,
                mint: outputMint,
                amount: BigInt(resolvedOptions.postSwapTransfer.amountAtomic),
                authority: takerAddress,
                sourceAta,
                destination: destinationOwner,
                destinationAta
            });

            postSwapInstructions.push(...transferInstructions);
        }

        if (resolvedOptions.memo !== undefined && resolvedOptions.memo.trim().length > 0) {
            postSwapInstructions.push(
                getAddMemoInstruction({
                    memo: resolvedOptions.memo
                })
            );
        }

        const allInstructions = [...routerInstructions, ...postSwapInstructions];
        if (allInstructions.length === 0) {
            throw new Error("No instructions available to build swap transaction.");
        }

        const { value: latestBlockhash } = await this.solanaClient.rpc.getLatestBlockhash().send();

        const transactionMessage = createTransaction({
            version: "auto",
            feePayer: takerAddress,
            latestBlockhash,
            computeUnitLimit: resolvedOptions.computeUnitLimit,
            computeUnitPrice: resolvedOptions.priorityFeeMicrolamports,
            instructions: allInstructions
        });

        return {
            unsignedTransactionId: createRequestId("utx"),
            transactionMessage,
            instructionCount: allInstructions.length,
            requiredSignerAddress: input.quote.taker,
            latestBlockhash: {
                blockhash: latestBlockhash.blockhash,
                fetchedAt: Date.now(),
                lastValidBlockHeight: Number(latestBlockhash.lastValidBlockHeight)
            },
            metadata: {
                routePlan: input.quote.routePlan,
                options: resolvedOptions,
                jupiterInstructionCounts: {
                    compute: input.instructions.computeBudgetInstructions.length,
                    setup: input.instructions.setupInstructions.length,
                    other: input.instructions.otherInstructions.length,
                    hasCleanup: input.instructions.cleanupInstruction !== null,
                    hasTip: input.instructions.tipInstruction !== null
                }
            }
        };
    }
}