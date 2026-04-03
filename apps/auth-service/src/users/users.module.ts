import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { AdminUsersController } from '../admin/admin-users.controller';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, AdminUsersController],
})
export class UsersModule {}
