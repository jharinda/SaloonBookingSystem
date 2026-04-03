import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { CLOUDINARY } from './cloudinary.config';
import { FileUploadService } from './interfaces/file-upload.interface';

@Injectable()
export class CloudinaryUploadService implements FileUploadService {
  private readonly logger = new Logger(CloudinaryUploadService.name);

  constructor(
    @Inject(CLOUDINARY) private readonly cloudinaryClient: typeof cloudinary,
  ) {}

  upload(file: Express.Multer.File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const uploadStream = this.cloudinaryClient.uploader.upload_stream(
        {
          folder: 'users/avatars',
          resource_type: 'image',
          transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error || !result) {
            reject(new InternalServerErrorException(
              `Avatar upload failed: ${error?.message ?? 'unknown error'}`,
            ));
            return;
          }
          resolve(result.secure_url);
        },
      );

      const readable = new Readable();
      readable.push(file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  /**
   * Extracts the Cloudinary public ID from a secure_url and deletes the resource.
   * Silently logs on failure so avatar upload is not blocked.
   */
  async delete(avatarUrl: string): Promise<void> {
    try {
      // Cloudinary URL pattern: https://res.cloudinary.com/<cloud>/image/upload/v123/users/avatars/<publicId>.ext
      const match = avatarUrl.match(/\/upload\/(?:v\d+\/)?(.*?)(?:\.[a-z]+)?$/);
      if (!match?.[1]) {
        this.logger.warn(`Could not extract public ID from avatar URL: ${avatarUrl}`);
        return;
      }
      const publicId = match[1];
      await this.cloudinaryClient.uploader.destroy(publicId, { resource_type: 'image' });
      this.logger.log(`Deleted old avatar from Cloudinary: ${publicId}`);
    } catch (error) {
      this.logger.warn(`Failed to delete old avatar: ${(error as Error).message}`);
    }
  }
}
