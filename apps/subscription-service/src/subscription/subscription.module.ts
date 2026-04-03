import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SharedAuthModule } from '@org/shared-auth';
import { Subscription, SubscriptionSchema } from './schemas/subscription.schema';
import { PlanEntry, PlanEntrySchema } from './schemas/plan-config.schema';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

@Module({
  imports: [
    SharedAuthModule.forRoot(),
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: PlanEntry.name,    schema: PlanEntrySchema },
    ]),
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
