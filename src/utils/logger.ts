import { createLogger, format, transports } from "winston";

import { appConfig } from "../config/index.js";

/**
 * Centralized logger used across all layers.
 *
 * Architecture role:
 * - Prevents ad-hoc console logging by exposing one structured logger.
 * - Keeps logging format and level policy consistent across CLI/server flows.
 */

const devFormat = format.combine(
    format.colorize(),
    format.timestamp(),
    format.printf(({ level, message, timestamp, ...meta }) => {
        const metaSuffix = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
        return `${String(timestamp)} ${String(level)}: ${String(message)}${metaSuffix}`;
    })
);

const prodFormat = format.combine(format.timestamp(), format.errors({ stack: true }), format.json());

export const logger = createLogger({
    level: appConfig.LOG_LEVEL,
    format: appConfig.isProduction ? prodFormat : devFormat,
    transports: [new transports.Console()],
    defaultMeta: {
        service: "gill-swap",
        mode: appConfig.APP_MODE
    }
});