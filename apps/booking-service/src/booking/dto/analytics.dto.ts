import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class BookingAnalyticsQueryDto {
  @ApiProperty({ description: 'Salon ID' })
  @IsString()
  salonId: string;

  @ApiPropertyOptional({ description: 'Start date YYYY-MM-DD (default: 30 days ago)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'End date YYYY-MM-DD (default: today)' })
  @IsOptional()
  @IsString()
  to?: string;
}

export interface DailyRevenueDto {
  date: string; // YYYY-MM-DD
  revenue: number; // LKR
  count: number; // number of bookings
}

export interface BookingStatusBreakdownDto {
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

export interface PeakHourDto {
  hour: number; // 0-23
  count: number; // number of bookings at this hour
}

export interface SalonAnalyticsResponseDto {
  salonId: string;
  period: { from: string; to: string };
  totalRevenue: number;
  totalBookings: number;
  completionRate: number; // completed / (completed + cancelled + noShow)
  averageBookingValue: number;
  dailyRevenue: DailyRevenueDto[];
  statusBreakdown: BookingStatusBreakdownDto;
  peakHours: PeakHourDto[];
  topServices: Array<{ serviceName: string; count: number; revenue: number }>;
}

// ── Client analytics ────────────────────────────────────────────────────────

export interface ClientAnalyticsResponseDto {
  totalBookings: number;
  totalSpent: number;
  averageBookingValue: number;
  visitFrequency: number; // average days between consecutive bookings
  favoriteServices: Array<{ serviceName: string; count: number }>;
  favoriteSalons: Array<{
    salonId: string;
    salonName: string;
    visitCount: number;
    lastServiceIds: string[];
  }>;
  monthlySpending: Array<{ month: string; total: number }>;
  lastVisit: string | null; // ISO date string
}

/** OpenAPI / Swagger schema (mirrors {@link SalonAnalyticsResponseDto}) */
export class SalonAnalyticsResponseSwaggerDto {
  @ApiProperty()
  salonId: string;

  @ApiProperty()
  period: { from: string; to: string };

  @ApiProperty({ description: 'LKR (completed bookings only)' })
  totalRevenue: number;

  @ApiProperty()
  totalBookings: number;

  @ApiProperty({
    description: 'completed / (completed + cancelled + noShow); 0 if denominator is 0',
  })
  completionRate: number;

  @ApiProperty({ description: 'totalRevenue / completed count; 0 if none' })
  averageBookingValue: number;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  dailyRevenue: DailyRevenueDto[];

  @ApiProperty()
  statusBreakdown: BookingStatusBreakdownDto;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  peakHours: PeakHourDto[];

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        serviceName: { type: 'string' },
        count: { type: 'number' },
        revenue: { type: 'number' },
      },
    },
  })
  topServices: Array<{ serviceName: string; count: number; revenue: number }>;
}
