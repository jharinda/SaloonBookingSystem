import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';

import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserProfile, UserProfileSchema } from './schemas/user-profile.schema';
import { UserEventsProcessor, USER_EVENTS_QUEUE } from './processors/user-events.processor';
import { SharedAuthModule } from '@org/shared-auth';
import { CloudinaryProvider } from './cloudinary.config';
import { CloudinaryUploadService } from './avatar-upload.service';
import { FILE_UPLOAD_SERVICE } from './interfaces/file-upload.interface';

@Module({
  imports: [
    SharedAuthModule.forRoot(),
    HttpModule,
    MongooseModule.forFeature([
      { name: UserProfile.name, schema: UserProfileSchema },
    ]),
    BullModule.registerQueue({ name: USER_EVENTS_QUEUE }),
  ],
  controllers: [UserController],
  providers: [
    CloudinaryProvider,
    { provide: FILE_UPLOAD_SERVICE, useClass: CloudinaryUploadService },
    UserService,
    UserEventsProcessor,
  ],
  exports: [UserService],
})
export class UserModule {}
