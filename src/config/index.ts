import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

import { envSchema, type AppEnv } from "./schema.js";

/**
 * Config loader for environment variables and static defaults.
 *
 * Architecture role:
 * - Handles all environment bootstrapping and schema validation in one place.
 * - Exposes a typed config object consumed by core, CLI, and server layers.
 */

dotenv.config();

const fileDefaultsSchema = z.object({
    appName: z.string().min(1),
    cluster: z.string().min(1),
    server: z.object({
        healthRoute: z.string().min(1),
        apiPrefix: z.string().min(1)
    }),
    monitor: z.object({
        enabled: z.boolean()
    })
});

export type FileDefaults = z.infer<typeof fileDefaultsSchema>;

export interface AppConfig extends AppEnv {
    defaults: FileDefaults;
    isProduction: boolean;
}

function loadFileDefaults(): FileDefaults {
    const filePath = path.resolve(process.cwd(), "config", "default.json");
    const contents = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(contents) as unknown;
    return fileDefaultsSchema.parse(parsed);
}

function loadEnv(): AppEnv {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const issueText = result.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");
        throw new Error(`Invalid environment configuration: ${issueText}`);
    }

    return result.data;
}

/**
 * Singleton app config used by all modules.
 *
 * TODO: Introduce dependency-injected config contexts if multiple runtime
 * profiles are needed in tests or worker processes.
 */
export const appConfig: AppConfig = (() => {
    const env = loadEnv();
    const defaults = loadFileDefaults();

    return {
        ...env,
        defaults,
        isProduction: env.NODE_ENV === "production"
    };
})();