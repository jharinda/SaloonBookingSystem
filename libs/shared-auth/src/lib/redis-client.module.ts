import { Global, Module } from '@nestjs/common';

import { createRedisProvider } from './utils/redis.provider';

const redisProvider = createRedisProvider();

/**
 * Single shared Redis (ioredis) client for health checks and feature modules.
 * Import once in AppModule for services that use {@link REDIS_CLIENT}.
 */
@Global()
@Module({
  providers: [redisProvider],
  exports: [redisProvider],
})
export class RedisClientModule {}
