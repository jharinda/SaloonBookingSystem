import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CloudinaryProvider } from '../auth/cloudinary.config';
import { AvatarUploadService } from '../auth/avatar-upload.service';
import { UsersController } from './users.controller';
import { AdminUsersController } from '../admin/admin-users.controller';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, AdminUsersController],
  providers: [CloudinaryProvider, AvatarUploadService],
})
export class UsersModule {}
