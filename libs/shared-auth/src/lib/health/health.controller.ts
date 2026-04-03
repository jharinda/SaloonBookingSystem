import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorFunction,
  MongooseHealthIndicator,
} from '@nestjs/terminus';

import { MONGOOSE_HEALTH_CONNECTION_NAMES } from './health.constants';
import { RedisHealthIndicator } from './redis-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly redisHealth?: RedisHealthIndicator,
    @Optional()
    @Inject(MONGOOSE_HEALTH_CONNECTION_NAMES)
    private readonly mongooseConnectionNames?: string[],
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    const checks: HealthIndicatorFunction[] = [];

    if (!this.mongooseConnectionNames?.length) {
      checks.push(() => this.mongoose.pingCheck('mongodb'));
    } else {
      for (const name of this.mongooseConnectionNames) {
        checks.push(() => {
          const token = getConnectionToken(name);
          const connection = this.moduleRef.get(token, { strict: false });
          return this.mongoose.pingCheck(`mongodb-${name}`, { connection });
        });
      }
    }

    const redisHealth = this.redisHealth;
    if (redisHealth) {
      checks.push(() => redisHealth.isHealthy('redis'));
    }

    return this.health.check(checks);
  }
}
