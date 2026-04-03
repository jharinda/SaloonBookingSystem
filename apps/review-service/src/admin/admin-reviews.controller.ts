import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
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

@ApiTags('reviews')
@ApiBearerAuth('JWT')
@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminReviewsController {
  constructor(private readonly reviewService: ReviewService) {}

  @ApiOperation({ summary: 'List all reviews (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated reviews' })
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
