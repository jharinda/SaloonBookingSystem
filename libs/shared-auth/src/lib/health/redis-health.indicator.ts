import { Inject, Injectable, Optional } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../utils/redis.provider';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (!this.redis) {
      return this.getStatus(key, true, { message: 'Redis not configured' });
    }
    try {
      const pong = await this.redis.ping();
      if (pong === 'PONG') {
        return this.getStatus(key, true);
      }
      throw new HealthCheckError('Redis ping failed', this.getStatus(key, false));
    } catch (err) {
      throw new HealthCheckError(
        'Redis unreachable',
        this.getStatus(key, false, { error: (err as Error).message }),
      );
    }
  }
}
