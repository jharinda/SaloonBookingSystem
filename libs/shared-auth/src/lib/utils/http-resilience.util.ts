import { Logger } from '@nestjs/common';
import { timer, retry, RetryConfig, Observable } from 'rxjs';
import { AxiosResponse } from 'axios';

/**
 * Pre-configured retry operator for critical inter-service HTTP calls.
 * Uses exponential backoff: 500ms, 1000ms on retries.
 *
 * Usage:
 * ```typescript
 * await firstValueFrom(
 *   this.httpService.get(url).pipe(httpRetryWithBackoff(this.logger))
 * );
 * ```
 */
export function httpRetryWithBackoff(logger?: Logger) {
  const retryConfig: RetryConfig = {
    count: 2,
    delay: (error, retryCount) => {
      const delayMs = retryCount * 500;
      if (logger) {
        logger.warn(
          `HTTP request retry ${retryCount}/2 (delay: ${delayMs}ms): ${error.message}`,
        );
      }
      return timer(delayMs);
    },
  };
  return retry(retryConfig);
}

/**
 * Fire-and-forget wrapper for non-critical HTTP calls.
 * Never throws, returns undefined on error.
 *
 * Usage:
 * ```typescript
 * const userName = await fireAndForget(
 *   this.httpService.get(`${url}/users/${id}`),
 *   this.logger,
 * ) ?? 'Unknown';
 * ```
 */
export async function fireAndForget<T>(
  observable: Observable<AxiosResponse<T>>,
  logger?: Logger,
): Promise<T | undefined> {
  try {
    const { firstValueFrom } = await import('rxjs');
    const result = await firstValueFrom(observable);
    return result.data;
  } catch (error) {
    if (logger) {
      logger.debug(
        `Fire-and-forget call failed (ignored): ${(error as Error).message}`,
      );
    }
    return undefined;
  }
}
