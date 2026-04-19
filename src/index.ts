import { pathToFileURL } from "node:url";

import { appConfig } from "./config/index.js";
import { runCli } from "./cli/index.js";
import { startServer } from "./server/index.js";
import type { RuntimeMode } from "./types/index.js";
import { detectRuntimeMode } from "./utils/helpers.js";
import { logger } from "./utils/logger.js";

/**
 * Main runtime entry point.
 *
 * Architecture role:
 * - Decides whether to run CLI mode or HTTP server mode.
 * - Acts as composition root where all top-level wiring begins.
 */

export async function bootstrap(argv: string[] = process.argv): Promise<void> {
    const modeFromArgs = detectRuntimeMode(argv.slice(2));
    const mode: RuntimeMode = modeFromArgs ?? appConfig.APP_MODE;

    if (mode === "server") {
        await startServer();
        return;
    }

    await runCli(argv);
}

const isDirectExecution =
    process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
    void bootstrap().catch((error: unknown) => {
        logger.error("Fatal startup error", { error: String(error) });
        process.exitCode = 1;
    });
}