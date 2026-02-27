import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { Model } from 'mongoose';
import { firstValueFrom } from 'rxjs';

import { Review, ReviewDocument } from './schemas/review.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import {
  PaginatedReviewsDto,
  ReviewImageResponseDto,
  ReviewResponseDto,
} from './dto/review-response.dto';

/** Minimal booking shape returned by booking-service GET /api/bookings/:id */
interface BookingStub {
  id: string;
  clientId: string;
  salonId: string;
  status: string;
}

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async createReview(
    dto: CreateReviewDto,
    clientId: string,
  ): Promise<ReviewResponseDto> {
    // 1. Verify booking exists and is COMPLETED
    const bookingServiceUrl = this.config.get<string>(
      'BOOKING_SERVICE_URL',
      'http://booking-service',
    );

    let booking: BookingStub;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<BookingStub>(
          `${bookingServiceUrl}/api/bookings/${dto.bookingId}`,
        ),
      );
      booking = data;
    } catch {
      throw new NotFoundException(
        `Booking ${dto.bookingId} not found or booking-service unavailable`,
      );
    }

    if (booking.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Reviews can only be submitted for completed bookings',
      );
    }

    // 2. Verify ownership
    if (booking.clientId !== clientId) {
      throw new ForbiddenException('You can only review your own bookings');
    }

    // 3. Guard against duplicate
    const existing = await this.reviewModel.findOne({ bookingId: dto.bookingId });
    if (existing) {
      throw new ConflictException('A review for this booking already exists');
    }

    // 4. Persist
    const review = await this.reviewModel.create({
      salonId: dto.salonId,
      bookingId: dto.bookingId,
      clientId,
      stylistId: dto.stylistId ?? null,
      rating: dto.rating,
      comment: dto.comment ?? null,
      images: dto.images ?? [],
      isVisible: true,
      ownerReply: null,
    });

    // 5. Recalculate and push salon rating (best-effort)
    await this.syncSalonRating(dto.salonId);

    return this.toResponse(review);
  }

  async getSalonReviews(
    salonId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedReviewsDto> {
    return this.paginate({ salonId, isVisible: true }, page, limit);
  }

  async getStylistReviews(
    stylistId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedReviewsDto> {
    return this.paginate({ stylistId, isVisible: true }, page, limit);
  }

  async addOwnerReply(
    reviewId: string,
    reply: string,
  ): Promise<ReviewResponseDto> {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) throw new NotFoundException(`Review ${reviewId} not found`);

    review.ownerReply = reply;
    await review.save();
    return this.toResponse(review);
  }

  async removeReview(reviewId: string): Promise<ReviewResponseDto> {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) throw new NotFoundException(`Review ${reviewId} not found`);

    review.isVisible = false;
    await review.save();
    return this.toResponse(review);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async paginate(
    filter: Record<string, unknown>,
    page: number,
    limit: number,
  ): Promise<PaginatedReviewsDto> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.reviewModel.countDocuments(filter),
    ]);
    return {
      data: data.map((r) => this.toResponse(r as unknown as ReviewDocument)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Aggregate average rating + count for the salon and push the result to
   * salon-service via PATCH /api/salons/:id/rating.
   * Failures are logged but never block the review submission.
   */
  private async syncSalonRating(salonId: string): Promise<void> {
    const salonServiceUrl = this.config.get<string>(
      'SALON_SERVICE_URL',
      'http://salon-service',
    );
    try {
      const agg = await this.reviewModel
        .aggregate<{ avg: number; count: number }>([
          { $match: { salonId, isVisible: true } },
          {
            $group: {
              _id: null,
              avg: { $avg: '$rating' },
              count: { $sum: 1 },
            },
          },
        ])
        .exec();

      const avg   = agg[0]?.avg   ?? 0;
      const count = agg[0]?.count ?? 0;

      await firstValueFrom(
        this.httpService.patch(
          `${salonServiceUrl}/api/salons/${salonId}/rating`,
          { rating: Math.round(avg * 10) / 10, reviewCount: count },
        ),
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to sync rating for salonId=${salonId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponse(review: any): ReviewResponseDto {
    const images: ReviewImageResponseDto[] = (review.images ?? []).map(
      (img: { cloudinaryId: string; url: string }) => ({
        cloudinaryId: img.cloudinaryId,
        url: img.url,
      }),
    );
    return {
      id: (review._id ?? review.id)?.toString(),
      salonId: review.salonId,
      bookingId: review.bookingId,
      clientId: review.clientId,
      stylistId: review.stylistId ?? undefined,
      rating: review.rating,
      comment: review.comment ?? undefined,
      images,
      isVisible: review.isVisible,
      ownerReply: review.ownerReply ?? undefined,
      createdAt: review.createdAt,
    };
  }
}
