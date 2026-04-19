import cron from "node-cron";

import { appConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";

/**
 * Placeholder monitor module for future price watch and arbitrage logic.
 *
 * Architecture role:
 * - Dedicated home for recurring market observation and trigger policies.
 * - Keeps monitoring concerns decoupled from swap execution entry points.
 */

export interface PriceMonitorOptions {
  cronExpression?: string;
  onTick?: () => Promise<void>;
}

export class PriceMonitor {
  private task: cron.ScheduledTask | undefined;

  public start(options: PriceMonitorOptions = {}): void {
    const cronExpression = options.cronExpression ?? appConfig.PRICE_MONITOR_CRON;

    if (this.task) {
      logger.warn("Price monitor is already running.");
      return;
    }

    this.task = cron.schedule(cronExpression, () => {
      void (async () => {
        logger.info("Price monitor tick (placeholder)");

        // TODO: Add quote aggregation, threshold detection, and arbitrage hooks.
        await options.onTick?.();
      })().catch((error: unknown) => {
        logger.error("Price monitor tick failed", { error: String(error) });
      });
    });

    void this.task.start();
    logger.info("Price monitor started", { cronExpression });
  }

  public stop(): void {
    void this.task?.stop();
    this.task = undefined;
    logger.info("Price monitor stopped");
  }
}