import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

/** NestJS injection token for the shared Redis client. */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Builds ioredis options from ConfigService (`redis.host`, `redis.port`,
 * optional `redis.password`, `redis.tlsEnabled` for TLS e.g. Upstash).
 */
export function getRedisConnectionOptions(
  config: ConfigService,
  options?: { lazyConnect?: boolean },
): RedisOptions {
  const host = config.get<string>('redis.host', 'localhost');
  const port = config.get<number>('redis.port', 6379);
  const password = config.get<string | undefined>('redis.password');
  const tlsEnabled = config.get<boolean>('redis.tlsEnabled') === true;

  const opts: RedisOptions = { host, port };
  if (password) opts.password = password;
  if (tlsEnabled) opts.tls = {};
  if (options?.lazyConnect) opts.lazyConnect = true;
  return opts;
}

/** Connection options for @nestjs/bull `forRoot` (no lazyConnect). */
export function getBullRedisConnection(config: ConfigService): RedisOptions {
  return getRedisConnectionOptions(config);
}

/**
 * Creates a reusable NestJS provider for a Redis client.
 *
 * Each microservice calls this in its module's `providers` array.
 * The factory reads host/port from ConfigService, so every service
 * shares the same configuration pattern — eliminating duplication.
 *
 * @example
 * ```ts
 * import { createRedisProvider } from '@org/shared-auth';
 *
 * @Module({
 *   providers: [createRedisProvider()],
 * })
 * export class MyModule {}
 * ```
 */
export function createRedisProvider(): Provider {
  return {
    provide: REDIS_CLIENT,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
      new Redis(getRedisConnectionOptions(config, { lazyConnect: true })),
  };
}
