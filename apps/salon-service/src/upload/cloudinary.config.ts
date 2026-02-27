import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export const CLOUDINARY = 'CLOUDINARY';

/**
 * Initialises the Cloudinary SDK from environment variables and makes the
 * configured `v2` instance available for injection via the CLOUDINARY token.
 *
 * Required env vars:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */
export const CloudinaryProvider: Provider = {
  provide: CLOUDINARY,
  inject:  [ConfigService],
  useFactory: (config: ConfigService): typeof cloudinary => {
    cloudinary.config({
      cloud_name: config.getOrThrow<string>('cloudinary.cloudName'),
      api_key:    config.getOrThrow<string>('cloudinary.apiKey'),
      api_secret: config.getOrThrow<string>('cloudinary.apiSecret'),
    });
    return cloudinary;
  },
};
