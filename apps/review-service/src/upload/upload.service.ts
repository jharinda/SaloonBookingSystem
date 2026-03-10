import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { Readable } from 'stream';
import { CLOUDINARY } from './cloudinary.config';

export interface UploadResult {
  cloudinaryId: string;
  url: string;
}

@Injectable()
export class UploadService {
  constructor(
    @Inject(CLOUDINARY) private readonly cloudinaryClient: typeof cloudinary,
  ) {}

  uploadImage(file: Express.Multer.File): Promise<UploadResult> {
    return new Promise<UploadResult>((resolve, reject) => {
      const uploadStream = this.cloudinaryClient.uploader.upload_stream(
        {
          folder: 'reviews',
          resource_type: 'image',
          transformation: [{ width: 1200, crop: 'limit' }],
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
          resolve({ cloudinaryId: result.public_id, url: result.secure_url });
        },
      );

      const readable = new Readable();
      readable.push(file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }
}
