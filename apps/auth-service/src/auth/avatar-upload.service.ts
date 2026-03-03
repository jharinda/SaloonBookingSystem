import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { CLOUDINARY } from './cloudinary.config';

@Injectable()
export class AvatarUploadService {
  constructor(
    @Inject(CLOUDINARY) private readonly cloudinaryClient: typeof cloudinary,
  ) {}

  uploadAvatar(file: Express.Multer.File): Promise<string> {
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
}
