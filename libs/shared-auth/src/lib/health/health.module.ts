import { DynamicModule, Module, Provider } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TerminusModule } from '@nestjs/terminus';

import { RedisClientModule } from '../redis-client.module';
import { MONGOOSE_HEALTH_CONNECTION_NAMES } from './health.constants';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis-health.indicator';

@Module({})
export class HealthModule {
  static forRoot(options?: {
    redis?: boolean;
    mongooseConnectionNames?: string[];
  }): DynamicModule {
    const imports: DynamicModule['imports'] = [TerminusModule, MongooseModule];
    const providers: Provider[] = [];

    if (options?.redis) {
      imports.push(RedisClientModule);
      providers.push(RedisHealthIndicator);
    }

    if (options?.mongooseConnectionNames?.length) {
      providers.push({
        provide: MONGOOSE_HEALTH_CONNECTION_NAMES,
        useValue: options.mongooseConnectionNames,
      });
    }

    return {
      module: HealthModule,
      imports,
      controllers: [HealthController],
      providers,
    };
  }
}
