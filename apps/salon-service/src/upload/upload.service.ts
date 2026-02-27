import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { Readable } from 'stream';
import { CLOUDINARY } from './cloudinary.config';

export type ImageFolder = 'salons/profiles' | 'salons/gallery' | 'stylists';

export interface UploadResult {
  cloudinaryId: string;
  url: string;
}

@Injectable()
export class UploadService {
  constructor(
    @Inject(CLOUDINARY) private readonly cloudinaryClient: typeof cloudinary,
  ) {}

  /**
   * Upload a file buffer to Cloudinary.
   *
   * @param file   - Multer file object (memoryStorage — has `buffer`)
   * @param folder - Destination folder in Cloudinary
   */
  uploadImage(
    file: Express.Multer.File,
    folder: ImageFolder,
  ): Promise<UploadResult> {
    return new Promise<UploadResult>((resolve, reject) => {
      const uploadStream = this.cloudinaryClient.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: [{ width: 800, crop: 'limit' }],
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error || !result) {
            reject(
              new InternalServerErrorException(
                `Cloudinary upload failed: ${error?.message ?? 'unknown error'}`,
              ),
            );
            return;
          }
          resolve({
            cloudinaryId: result.public_id,
            url:          result.secure_url,
          });
        },
      );

      // Pipe the in-memory buffer into the upload stream
      const readable = new Readable();
      readable.push(file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  /**
   * Permanently delete an asset from Cloudinary by its public_id.
   */
  async deleteImage(cloudinaryId: string): Promise<void> {
    const result = await this.cloudinaryClient.uploader.destroy(cloudinaryId);
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new InternalServerErrorException(
        `Failed to delete image "${cloudinaryId}" from Cloudinary`,
      );
    }
  }

  /**
   * Generate a signed upload signature so the browser can upload directly to
   * Cloudinary without routing the file through this server (optional flow).
   *
   * Returns the parameters that the front-end must include in its upload
   * request, together with the computed signature.
   */
  generateSignature(
    folder: ImageFolder,
  ): { timestamp: number; signature: string; folder: string; apiKey: string } {
    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign  = { folder, timestamp };
    const signature = this.cloudinaryClient.utils.api_sign_request(
      paramsToSign,
      // The SDK reads from the config set during initialisation
      (this.cloudinaryClient.config() as { api_secret: string }).api_secret,
    );
    return {
      timestamp,
      signature,
      folder,
      apiKey: (this.cloudinaryClient.config() as { api_key: string }).api_key,
    };
  }
}
