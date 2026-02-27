import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { JwtAuthGuard, RolesGuard, Roles, CurrentUser, JwtUser, UserRole } from '@org/shared-auth';
import { UploadService, ImageFolder } from './upload.service';
import { SalonService } from '../salon/salon.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Multer memory storage config — reused by every file interceptor in this controller */
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

@Controller('salons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly salonService: SalonService,
  ) {}

  // ── POST /salons/:id/images ─────────────────────────────────────────────

  /**
   * Upload an image and attach it to a salon.
   *
   * The `folder` query param selects the Cloudinary destination:
   *   - `profiles`  → salons/profiles
   *   - `gallery`   → salons/gallery  (default)
   *   - `stylists`  → stylists
   */
  @Post(':id/images')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SALON_OWNER)
  @UseInterceptors(FileInterceptor('image', multerConfig))
  async uploadImage(
    @Param('id') salonId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('folder') folderParam: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) {
      throw new BadRequestException('No image file provided (field name: "image")');
    }

    const folder = resolveFolder(folderParam);

    const { cloudinaryId, url } = await this.uploadService.uploadImage(file, folder);

    return this.salonService.pushImage(salonId, { cloudinaryId, url }, user.sub);
  }

  // ── DELETE /salons/:id/images/:imageId ─────────────────────────────────

  /**
   * Remove an image from Cloudinary and from the salon's `images` array.
   * `:imageId` is the MongoDB `_id` of the SalonImage subdocument.
   */
  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SALON_OWNER)
  async deleteImage(
    @Param('id') salonId: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: JwtUser,
  ) {
    // Resolve the cloudinaryId before deleting it from the DB
    const salon = await this.salonService.findById(salonId);
    const image = salon.images?.find((img) => img.cloudinaryId === imageId || (img as unknown as { _id: string })._id?.toString() === imageId);

    if (!image) {
      throw new BadRequestException(`Image "${imageId}" not found on salon ${salonId}`);
    }

    if (salon.ownerId !== user.sub && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You do not own this salon');
    }

    await this.uploadService.deleteImage(image.cloudinaryId);

    return this.salonService.removeImage(salonId, image.cloudinaryId, user.sub);
  }

  // ── PATCH /salons/:id/images/:imageId/primary ──────────────────────────

  /**
   * Set a specific image as the primary (hero) image for the salon.
   * Clears `isPrimary` on all other images first.
   */
  @Patch(':id/images/:imageId/primary')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SALON_OWNER)
  async setPrimaryImage(
    @Param('id') salonId: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.salonService.setPrimaryImage(salonId, imageId, user.sub);
  }

  // ── GET /salons/:id/upload-signature ───────────────────────────────────

  /**
   * Returns a short-lived Cloudinary signature so the browser can upload
   * directly without routing the binary through this server (optional flow).
   */
  @Get(':id/upload-signature')
  @Roles(UserRole.SALON_OWNER)
  generateSignature(@Query('folder') folderParam: string | undefined) {
    const folder = resolveFolder(folderParam);
    return this.uploadService.generateSignature(folder);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveFolder(param: string | undefined): ImageFolder {
  switch (param) {
    case 'profiles': return 'salons/profiles';
    case 'stylists': return 'stylists';
    default:         return 'salons/gallery';
  }
}
