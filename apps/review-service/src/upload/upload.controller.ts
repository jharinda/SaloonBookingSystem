import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { JwtAuthGuard, RolesGuard, Roles, UserRole } from '@org/shared-auth';
import { UploadService } from './upload.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const multerConfig = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(
          `Invalid file type "${file.mimetype}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
        ),
        false,
      );
    }
  },
};

@ApiTags('reviews')
@ApiBearerAuth('JWT')
@Controller('reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * POST /reviews/upload
   * Uploads a single image to Cloudinary and returns { cloudinaryId, url }.
   * Must be declared before any :id routes so NestJS doesn't treat
   * "upload" as a param value.
   */
  @ApiOperation({ summary: 'Upload review image (multipart field: file)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Cloudinary id and URL' })
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.CLIENT)
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async uploadReviewImage(
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided (field name: "file")');
    }
    return this.uploadService.uploadImage(file);
  }
}
