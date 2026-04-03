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
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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

@ApiTags('reviews')
@ApiBearerAuth('JWT')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @ApiOperation({ summary: 'List reviews by salon or stylist' })
  @ApiQuery({ name: 'salonId', required: false })
  @ApiQuery({ name: 'stylistId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated reviews' })
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
    return { data: [], total: 0, page, limit, totalPages: 0 };
  }

  @ApiOperation({ summary: 'List reviews written by the current user' })
  @ApiResponse({ status: 200, description: 'User reviews' })
  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMyReviews(
    @CurrentUser() user: JwtUser,
  ): Promise<ReviewResponseDto[]> {
    return this.reviewService.getClientReviews(user.sub);
  }

  @ApiOperation({ summary: 'Create a review (client)' })
  @ApiResponse({ status: 201, description: 'Review created' })
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

  @ApiOperation({ summary: 'Add salon owner reply to a review' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 200, description: 'Review with reply' })
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

  @ApiOperation({ summary: 'Remove a review (admin)' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 200, description: 'Review removed' })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string): Promise<ReviewResponseDto> {
    return this.reviewService.removeReview(id);
  }
}
