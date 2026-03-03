import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { SalonService } from '../salon/salon.service';
import { JwtAuthGuard, RolesGuard, Roles, UserRole } from '@org/shared-auth';
import { AdminSalonDto } from '../salon/salon.service';

class AdminSalonsQueryDto {
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
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export interface AdminStatsResponseDto {
  totalSalons:     number;
  pendingApproval: number;
  activeSalons:    number;
  totalClients:    number;
  bookingsToday:   number;
  monthlyRevenue:  number;
}

export interface AdminSalonsPageDto {
  data:  AdminSalonDto[];
  total: number;
  page:  number;
  limit: number;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly salonService: SalonService) {}

  /** GET /api/admin/stats */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats(): Promise<AdminStatsResponseDto> {
    const salonStats = await this.salonService.adminGetStats();
    return {
      ...salonStats,
      // These would come from other services in a full implementation
      totalClients:   0,
      bookingsToday:  0,
      monthlyRevenue: 0,
    };
  }

  /** GET /api/admin/salons?page=1&limit=10&status=pending|active|suspended&search=... */
  @Get('salons')
  @HttpCode(HttpStatus.OK)
  async getAllSalons(
    @Query() query: AdminSalonsQueryDto,
  ): Promise<AdminSalonsPageDto> {
    return this.salonService.adminFindAll({
      page:   query.page,
      limit:  query.limit,
      search: query.search,
      status: query.status,
    });
  }
}
