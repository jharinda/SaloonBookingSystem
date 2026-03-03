import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard, RolesGuard, Roles, UserRole } from '@org/shared-auth';

import { ReviewService, AdminReviewsPageDto } from '../review/review.service';

class AdminReviewsQueryDto {
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
}

@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminReviewsController {
  constructor(private readonly reviewService: ReviewService) {}

  /** GET /api/admin/reviews?page=1&limit=10 */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listReviews(
    @Query() query: AdminReviewsQueryDto,
  ): Promise<AdminReviewsPageDto> {
    return this.reviewService.adminListReviews({
      page:  query.page,
      limit: query.limit,
    });
  }
}
