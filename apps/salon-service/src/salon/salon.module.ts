import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';

import { SalonController } from './salon.controller';
import { SalonService } from './salon.service';
import { Salon, SalonSchema } from './schemas/salon.schema';
import { JwtStrategy, JwtAuthGuard, RolesGuard } from '@org/shared-auth';
import { UploadModule } from '../upload/upload.module';
import { UploadController } from '../upload/upload.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([{ name: Salon.name, schema: SalonSchema }]),
    UploadModule,
  ],
  controllers: [SalonController, UploadController],
  providers: [SalonService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [SalonService],
})
export class SalonModule {}
