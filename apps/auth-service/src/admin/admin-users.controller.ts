import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { AuthService, AdminUserDto } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { sub: string; email: string; role: string };
}

class AdminUsersQueryDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  role?: string;
}

export interface AdminUsersPageDto {
  data:  AdminUserDto[];
  total: number;
  page:  number;
  limit: number;
}

@Controller('admin/users')
@UseGuards(JwtAuthGuard)
export class AdminUsersController {
  constructor(private readonly authService: AuthService) {}

  /** GET /api/admin/users?page=1&limit=10&role=client|salon_owner|admin */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listUsers(
    @Req() req: AuthenticatedRequest,
    @Query() query: AdminUsersQueryDto,
  ): Promise<AdminUsersPageDto> {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.authService.adminListUsers({
      page:  query.page,
      limit: query.limit,
      role:  query.role,
    });
  }

  /** PATCH /api/admin/users/:id/suspend */
  @Patch(':id/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  async suspendUser(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.authService.adminSuspendUser(id);
  }
}
