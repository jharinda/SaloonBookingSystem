import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CloudinaryProvider } from './cloudinary.config';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { JwtStrategy, JwtAuthGuard, RolesGuard } from '@org/shared-auth';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [ConfigModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [UploadController],
  providers: [CloudinaryProvider, UploadService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [UploadService],
})
export class UploadModule {}
