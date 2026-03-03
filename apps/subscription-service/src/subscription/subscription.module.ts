import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';

import { JwtStrategy, JwtAuthGuard } from '@org/shared-auth';
import { Subscription, SubscriptionSchema } from './schemas/subscription.schema';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, JwtStrategy, JwtAuthGuard],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
