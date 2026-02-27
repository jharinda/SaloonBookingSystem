import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  RolesGuard,
  Roles,
  CurrentUser,
  JwtUser,
  UserRole,
} from '@org/shared-auth';

import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { OwnerReplyDto } from './dto/owner-reply.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import {
  PaginatedReviewsDto,
  ReviewResponseDto,
} from './dto/review-response.dto';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * GET /api/reviews?salonId=...&page=1&limit=20
   * GET /api/reviews?stylistId=...&page=1&limit=20
   * Visible reviews only, newest-first.
   */
  @Get()
  async findAll(@Query() query: ReviewQueryDto): Promise<PaginatedReviewsDto> {
    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;

    if (query.stylistId) {
      return this.reviewService.getStylistReviews(query.stylistId, page, limit);
    }
    if (query.salonId) {
      return this.reviewService.getSalonReviews(query.salonId, page, limit);
    }
    // No filter — return empty set rather than doing a full-collection scan
    return { data: [], total: 0, page, limit, totalPages: 0 };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  async create(
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: JwtUser,
  ): Promise<ReviewResponseDto> {
    return this.reviewService.createReview(dto, user.sub);
  }

  @Patch(':id/reply')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALON_OWNER)
  async addOwnerReply(
    @Param('id') id: string,
    @Body() dto: OwnerReplyDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewService.addOwnerReply(id, dto.reply);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string): Promise<ReviewResponseDto> {
    return this.reviewService.removeReview(id);
  }
}
