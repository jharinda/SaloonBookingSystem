import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SubscriptionCheckModule } from '@org/subscription-check';

import { SalonController } from './salon.controller';
import { SalonService } from './salon.service';
import { Salon, SalonSchema } from './schemas/salon.schema';
import { Specialty, SpecialtySchema } from './schemas/specialty.schema';
import { SharedAuthModule } from '@org/shared-auth';
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
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('redis.host', 'localhost'),
          port: config.get<number>('redis.port', 6379),
          lazyConnect: true,
        }),
    },
  ],
  exports: [SalonService],
})
export class SalonModule {}
