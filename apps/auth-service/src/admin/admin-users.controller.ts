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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
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

@ApiTags('admin-users')
@ApiBearerAuth('JWT')
@Controller('admin/users')
@UseGuards(JwtAuthGuard)
export class AdminUsersController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Count users with role=client (admin)' })
  @ApiResponse({ status: 200, description: 'Client count' })
  @Get('count')
  @HttpCode(HttpStatus.OK)
  async getUserCount(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ count: number }> {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.authService.adminCountClients();
  }

  @ApiOperation({ summary: 'List users (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'role', required: false })
  @ApiResponse({ status: 200, description: 'Paginated users' })
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

  @ApiOperation({ summary: 'Suspend user (admin)' })
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiResponse({ status: 204, description: 'Suspended' })
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
