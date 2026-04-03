/**
 * Abstract contract for file-upload providers (Cloudinary, S3, Azure Blob, etc.).
 * Controllers and services inject the token — never a concrete implementation.
 */
export interface FileUploadService {
  /** Upload a file and return its public URL. */
  upload(file: Express.Multer.File): Promise<string>;

  /** Delete a previously uploaded file by its public URL. */
  delete(url: string): Promise<void>;
}

/** NestJS injection token for the FileUploadService interface. */
export const FILE_UPLOAD_SERVICE = 'FILE_UPLOAD_SERVICE';
