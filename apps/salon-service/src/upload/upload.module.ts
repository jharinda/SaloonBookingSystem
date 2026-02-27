import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryProvider } from './cloudinary.config';
import { UploadService } from './upload.service';

/**
 * Provides and exports UploadService + the Cloudinary client.
 *
 * The UploadController is intentionally registered in SalonModule (not here)
 * because it needs to inject SalonService.  SalonModule imports UploadModule
 * to get UploadService, then declares UploadController in its own controllers
 * array — this avoids a circular module dependency.
 */
@Module({
  imports: [ConfigModule],
  providers: [CloudinaryProvider, UploadService],
  exports: [UploadService],
})
export class UploadModule {}
