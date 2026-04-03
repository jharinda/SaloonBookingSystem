import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { firstValueFrom } from 'rxjs';
import type { Request } from 'express';
import type Redis from 'ioredis';

import { SalonService } from '../salon/salon.service';
import { JwtAuthGuard, RolesGuard, Roles, UserRole, REDIS_CLIENT } from '@org/shared-auth';
import { AdminSalonDto } from '../salon/salon.service';

const STATS_CACHE_KEY = 'admin:platform-stats';
const STATS_CACHE_TTL = 300; // 5 minutes

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
  totalSalons:        number;
  pendingApproval:    number;
  activeSalons:       number;
  totalClients:       number;
  bookingsToday:      number;
  monthlyRevenue:     number;
  totalBookings?:     number;
  completionRate?:    number;
  revenueBySalon?:    Array<{ salonId: string; salonName: string; revenue: number }>;
  trends?: {
    totalSalons:            number;
    pendingApproval:        number;
    totalClients:           number;
    bookingsToday:          number;
    monthlyRevenue:         number;
  };
}

export interface AdminSalonsPageDto {
  data:  AdminSalonDto[];
  total: number;
  page:  number;
  limit: number;
}

@ApiTags('admin')
@ApiBearerAuth('JWT')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly salonService: SalonService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @ApiOperation({ summary: 'Admin dashboard stats' })
  @ApiResponse({ status: 200, description: 'Aggregate stats' })
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats(@Req() req: Request): Promise<AdminStatsResponseDto> {
    const authorization = req.headers['authorization'] as string | undefined;
    // Serve from Redis cache when available
    try {
      const cached = await this.redis.get(STATS_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached) as AdminStatsResponseDto;
      }
    } catch {
      // Cache miss / Redis unavailable — fall through to live queries
    }

    const authUrl     = this.configService.get<string>('services.authUrl');
    const bookingUrl  = this.configService.get<string>('services.bookingUrl');

    const [salonStats, totalClients, bookingStats] = await Promise.all([
      this.salonService.adminGetStats(),
      this.fetchClientCount(authUrl, authorization),
      this.fetchBookingStats(bookingUrl, authorization),
    ]);

    const stats: AdminStatsResponseDto = {
      ...salonStats,
      totalClients,
      bookingsToday:   bookingStats.bookingsToday,
      monthlyRevenue:  bookingStats.monthlyRevenue,
      totalBookings:   bookingStats.totalBookings,
      completionRate:  bookingStats.completionRate,
      revenueBySalon:  bookingStats.revenueBySalon,
      trends: {
        totalSalons:    0,
        pendingApproval: 0,
        totalClients:   0,
        bookingsToday:  bookingStats.trends?.bookingsTodayVsLastMonth   ?? 0,
        monthlyRevenue: bookingStats.trends?.monthlyRevenueVsLastMonth  ?? 0,
      },
    };

    // Store in Redis (best-effort — ignore errors)
    try {
      await this.redis.set(STATS_CACHE_KEY, JSON.stringify(stats), 'EX', STATS_CACHE_TTL);
    } catch {
      // ignore caching failure
    }

    return stats;
  }

  // ── Cross-service helpers ─────────────────────────────────────────────────

  private async fetchClientCount(authUrl: string | undefined, authorization: string | undefined): Promise<number> {
    try {
      const url = `${authUrl}/api/admin/users/count`;
      const res = await firstValueFrom(
        this.httpService.get<{ count: number }>(url, {
          headers: this.forwardHeaders(authorization),
        }),
      );
      return res.data?.count ?? 0;
    } catch (err) {
      this.logger.warn(`Failed to fetch client count from auth-service: ${(err as Error).message}`);
      return 0;
    }
  }

  private async fetchBookingStats(bookingUrl: string | undefined, authorization: string | undefined): Promise<{
    bookingsToday: number;
    monthlyRevenue: number;
    totalBookings: number;
    completionRate: number;
    revenueBySalon: Array<{ salonId: string; salonName: string; revenue: number }>;
    trends: { bookingsTodayVsLastMonth: number; monthlyRevenueVsLastMonth: number };
  }> {
    const empty = {
      bookingsToday: 0, monthlyRevenue: 0, totalBookings: 0, completionRate: 0, revenueBySalon: [],
      trends: { bookingsTodayVsLastMonth: 0, monthlyRevenueVsLastMonth: 0 },
    };
    try {
      const url = `${bookingUrl}/api/bookings/admin/platform-stats`;
      const res = await firstValueFrom(
        this.httpService.get<typeof empty>(url, {
          headers: this.forwardHeaders(authorization),
        }),
      );
      return res.data ?? empty;
    } catch (err) {
      this.logger.warn(`Failed to fetch booking stats from booking-service: ${(err as Error).message}`);
      return empty;
    }
  }

  /** Forward the original JWT so downstream admin guards pass. */
  private forwardHeaders(authorization: string | undefined): Record<string, string> {
    return authorization ? { Authorization: authorization } : {};
  }

  @ApiOperation({ summary: 'List salons for admin' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiResponse({ status: 200, description: 'Paginated salons' })
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
