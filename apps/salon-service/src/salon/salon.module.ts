import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { SubscriptionCheckModule } from '@org/subscription-check';

import { SalonController } from './salon.controller';
import { SalonService } from './salon.service';
import { Salon, SalonSchema } from './schemas/salon.schema';
import { Specialty, SpecialtySchema } from './schemas/specialty.schema';
import { SharedAuthModule, createRedisProvider } from '@org/shared-auth';
import { UploadModule } from '../upload/upload.module';
import { UploadController } from '../upload/upload.controller';
import { AdminController } from '../admin/admin.controller';
import { SpecialtiesController } from './specialties.controller';

@Module({
  imports: [
    SharedAuthModule.forRoot(),
    SubscriptionCheckModule.forRoot(),
    MongooseModule.forFeature([
      { name: Salon.name, schema: SalonSchema },
      { name: Specialty.name, schema: SpecialtySchema },
    ]),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
    UploadModule,
  ],
  controllers: [SpecialtiesController, SalonController, UploadController, AdminController],
  providers: [
    SalonService,
    createRedisProvider(),
  ],
  exports: [SalonService],
})
export class SalonModule {}
