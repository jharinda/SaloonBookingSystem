import { DynamicModule, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionCheckService } from './subscription-check.service';
import { SubscriptionGuard } from './guards/subscription.guard';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SubscriptionCheckModuleOptions {
  // Future options can go here
}

@Module({})
export class SubscriptionCheckModule {
  static forRoot(_options?: SubscriptionCheckModuleOptions): DynamicModule {
    return {
      module: SubscriptionCheckModule,
      imports: [HttpModule, ConfigModule],
      providers: [SubscriptionCheckService, SubscriptionGuard],
      exports: [SubscriptionCheckService, SubscriptionGuard],
    };
  }
}
