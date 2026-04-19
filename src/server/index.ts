import ScalarApiReference from "@scalar/fastify-api-reference";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import { appConfig } from "../config/index.js";
import { TransactionExecutor } from "../core/executor.js";
import { GillTransactionBuilder } from "../core/gillBuilder.js";
import { JupiterClient } from "../core/jupiter.js";
import type { ApiErrorResponse, ApiResponse, ExecutionResult, SwapRequestPayload } from "../types/index.js";
import { createMockId } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";

/**
 * Fastify server bootstrap.
 *
 * Architecture role:
 * - Exposes lightweight HTTP endpoints for swap execution and health checks.
 * - Keeps transport concerns separate from core transaction pipeline logic.
 */

const swapRequestSchema = z.object({
    inputMint: z.string().min(1),
    outputMint: z.string().min(1),
    amountAtomic: z.string().min(1),
    userPublicKey: z.string().min(1),
    slippageBps: z.number().int().positive().optional()
});

const OPENAPI_ROUTE = "/openapi.json";
const SCALAR_DOCS_ROUTE = "/docs";

function buildOpenApiDocument() {
    const healthRoute = appConfig.defaults.server.healthRoute;
    const swapRoute = `${appConfig.defaults.server.apiPrefix}/swap`;
    const dcaRoute = `${appConfig.defaults.server.apiPrefix}/dca`;

    return {
        openapi: "3.1.0",
        info: {
            title: "gill-swap API",
            version: "0.1.0",
            description:
                "Backend API for Solana swap execution using Jupiter Router and Gill transaction pipeline."
        },
        servers: [{ url: "/" }],
        paths: {
            [healthRoute]: {
                get: {
                    summary: "Health check",
                    responses: {
                        "200": {
                            description: "Service health",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            ok: { type: "boolean" },
                                            service: { type: "string" },
                                            mode: { type: "string" },
                                            timestamp: { type: "string", format: "date-time" }
                                        },
                                        required: ["ok", "service", "mode", "timestamp"]
                                    }
                                }
                            }
                        }
                    }
                }
            },
            [swapRoute]: {
                post: {
                    summary: "Execute a swap",
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        inputMint: { type: "string" },
                                        outputMint: { type: "string" },
                                        amountAtomic: { type: "string" },
                                        userPublicKey: { type: "string" },
                                        slippageBps: { type: "integer", minimum: 1 }
                                    },
                                    required: ["inputMint", "outputMint", "amountAtomic", "userPublicKey"]
                                }
                            }
                        }
                    },
                    responses: {
                        "200": {
                            description: "Swap execution result",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean", const: true },
                                            data: {
                                                type: "object",
                                                properties: {
                                                    unsignedTransactionId: { type: "string" },
                                                    signature: { type: "string" },
                                                    simulated: { type: "boolean" },
                                                    confirmed: { type: "boolean" },
                                                    attempts: { type: "integer" },
                                                    slot: { type: ["integer", "null"] },
                                                    explorerUrl: { type: "string" },
                                                    status: { type: "string" },
                                                    diagnostics: {
                                                        type: "object",
                                                        additionalProperties: true
                                                    }
                                                },
                                                required: [
                                                    "unsignedTransactionId",
                                                    "signature",
                                                    "simulated",
                                                    "confirmed",
                                                    "attempts",
                                                    "slot",
                                                    "explorerUrl",
                                                    "status",
                                                    "diagnostics"
                                                ]
                                            }
                                        },
                                        required: ["success", "data"]
                                    }
                                }
                            }
                        },
                        "400": {
                            description: "Invalid request payload"
                        },
                        "500": {
                            description: "Swap execution failed"
                        }
                    }
                }
            },
            [dcaRoute]: {
                post: {
                    summary: "DCA endpoint placeholder",
                    responses: {
                        "501": {
                            description: "Not implemented"
                        }
                    }
                }
            },
            [OPENAPI_ROUTE]: {
                get: {
                    summary: "OpenAPI specification",
                    responses: {
                        "200": {
                            description: "OpenAPI document"
                        }
                    }
                }
            }
        }
    };
}

function toErrorResponse(code: string, message: string, details?: Record<string, unknown>): ApiErrorResponse {
    const error =
        details === undefined
            ? { code, message }
            : {
                code,
                message,
                details
            };

    return {
        success: false,
        error
    };
}

async function runSwapFlow(payload: SwapRequestPayload): Promise<ExecutionResult> {
    const jupiterClient = new JupiterClient();
    const gillBuilder = new GillTransactionBuilder();
    const executor = new TransactionExecutor();

    const quote = await jupiterClient.getQuote(payload);
    const instructions = await jupiterClient.getSwapInstructions({
        quote,
        userPublicKey: payload.userPublicKey
    });
    const unsigned = await gillBuilder.buildSwapTransaction({ quote, instructions });

    return executor.executeTransaction({
        unsignedTransaction: unsigned,
        idempotencyKey: `http-swap-${createMockId("idempotency")}`
    });
}

export function buildServer(): FastifyInstance {
    const server = Fastify({
        logger: false
    });

    server.get(appConfig.defaults.server.healthRoute, async () => {
        return {
            ok: true,
            service: "gill-swap",
            mode: "server",
            timestamp: new Date().toISOString()
        };
    });

    server.get(OPENAPI_ROUTE, async (_request, reply) => {
        return reply.type("application/json").send(buildOpenApiDocument());
    });

    server.register(ScalarApiReference, {
        routePrefix: SCALAR_DOCS_ROUTE,
        configuration: {
            title: "gill-swap API Reference",
            url: OPENAPI_ROUTE
        }
    });

    server.post(`${appConfig.defaults.server.apiPrefix}/swap`, async (request, reply) => {
        const parsed = swapRequestSchema.safeParse(request.body);

        if (!parsed.success) {
            const errorResponse = toErrorResponse("INVALID_REQUEST", "Invalid swap payload.", {
                issues: parsed.error.issues
            });
            return reply.code(400).send(errorResponse satisfies ApiResponse<never>);
        }

        try {
            const payload: SwapRequestPayload = {
                inputMint: parsed.data.inputMint,
                outputMint: parsed.data.outputMint,
                amountAtomic: parsed.data.amountAtomic,
                userPublicKey: parsed.data.userPublicKey,
                ...(parsed.data.slippageBps !== undefined ? { slippageBps: parsed.data.slippageBps } : {})
            };

            const result = await runSwapFlow(payload);
            return reply.send({
                success: true,
                data: result
            } satisfies ApiResponse<ExecutionResult>);
        } catch (error) {
            logger.error("HTTP swap placeholder flow failed", { error: String(error) });
            const response = toErrorResponse("SWAP_EXECUTION_FAILED", "Swap execution failed.", {
                reason: String(error)
            });
            return reply.code(500).send(response satisfies ApiResponse<never>);
        }
    });

    server.post(`${appConfig.defaults.server.apiPrefix}/dca`, async (_request, reply) => {
        return reply.code(501).send(
            toErrorResponse(
                "NOT_IMPLEMENTED",
                "DCA HTTP endpoint is a placeholder. Use CLI dca command for now."
            ) satisfies ApiResponse<never>
        );
    });

    return server;
}

export async function startServer(): Promise<void> {
    const server = buildServer();

    await server.listen({
        host: appConfig.HOST,
        port: appConfig.PORT
    });

    logger.info("Server started", {
        host: appConfig.HOST,
        port: appConfig.PORT,
        apiPrefix: appConfig.defaults.server.apiPrefix,
        docsPath: SCALAR_DOCS_ROUTE,
        openapiPath: OPENAPI_ROUTE
    });
}