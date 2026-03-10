import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';

import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserProfile, UserProfileSchema } from './schemas/user-profile.schema';
import { UserEventsProcessor, USER_EVENTS_QUEUE } from './processors/user-events.processor';
import { SharedAuthModule } from '@org/shared-auth';

@Module({
  imports: [
    SharedAuthModule.forRoot(),
    MongooseModule.forFeature([
      { name: UserProfile.name, schema: UserProfileSchema },
    ]),
    BullModule.registerQueue({ name: USER_EVENTS_QUEUE }),
  ],
  controllers: [UserController],
  providers: [UserService, UserEventsProcessor],
  exports: [UserService],
})
export class UserModule {}
