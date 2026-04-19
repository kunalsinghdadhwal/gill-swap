/**
 * Retry utility with exponential backoff.
 *
 * Architecture role:
 * - Shared resilience primitive for network-bound operations in core/executor.
 * - Keeps retry behavior deterministic and configurable via config layer.
 */

export interface RetryOptions {
    retries: number;
    baseDelayMs: number;
    factor?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (error: unknown, attempt: number, nextDelayMs: number) => void;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    options: RetryOptions
): Promise<{ result: T; attempts: number }> {
    const factor = options.factor ?? 2;
    let attempt = 0;

    for (; ;) {
        attempt += 1;

        try {
            const result = await operation();
            return { result, attempts: attempt };
        } catch (error) {
            const canRetryByCount = attempt <= options.retries;
            const canRetryByPredicate = options.shouldRetry?.(error, attempt) ?? true;

            if (!canRetryByCount || !canRetryByPredicate) {
                throw error;
            }

            const nextDelayMs = options.baseDelayMs * factor ** (attempt - 1);
            options.onRetry?.(error, attempt, nextDelayMs);
            await delay(nextDelayMs);
        }
    }
}