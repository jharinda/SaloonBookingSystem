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
import { firstValueFrom, timeout } from 'rxjs';

import { Review, ReviewDocument } from './schemas/review.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import {
  PaginatedReviewsDto,
  ReviewImageResponseDto,
  ReviewResponseDto,
} from './dto/review-response.dto';

export interface AdminReviewDto {
  _id:        string;
  salonName:  string;
  clientName: string;
  rating:     number;
  comment:    string;
  isVisible:  boolean;
  createdAt:  Date;
}

export interface AdminReviewsPageDto {
  data:  AdminReviewDto[];
  total: number;
  page:  number;
  limit: number;
}

/** Minimal booking shape returned by booking-service GET /api/bookings/internal/:id */
interface BookingStub {
  id: string;
  clientId: string;
  salonId: string;
  status: string;
  clientName: string;
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
      'services.bookingUrl',
      'http://localhost:3002',
    );

    let booking: BookingStub;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<BookingStub>(
          `${bookingServiceUrl}/api/bookings/internal/${dto.bookingId}`,
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
      clientName: booking.clientName || '',
      stylistIds: dto.stylistIds ?? [],
      rating: dto.rating,
      comment: dto.comment ?? null,
      images: dto.images ?? [],
      isVisible: true,
      ownerReply: null,
    });

    // 5. Recalculate and push salon rating (best-effort)
    await this.syncSalonRating(dto.salonId);

    // 6. Update stylist portfolios (best-effort, fire-and-forget)
    if (dto.stylistIds && dto.stylistIds.length > 0) {
      this.updateStylistPortfolios(
        review,
        dto.stylistIds,
        booking.clientName || '',
      ).catch(() => { /* swallow */ });
    }

    // 7. Notify salon owner of the new review (best-effort, fire-and-forget)
    this.notifyReviewPosted(review, booking.clientName).catch(() => { /* swallow */ });

    return this.toResponse(review);
  }

  async getSalonReviews(
    salonId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedReviewsDto> {
    return this.paginate({ salonId, isVisible: true }, page, limit);
  }

  /**
   * Returns all reviews written by the given client, newest first.
   * Used by the "My Bookings" page to check which bookings are already reviewed.
   */
  async getClientReviews(clientId: string): Promise<ReviewResponseDto[]> {
    const reviews = await this.reviewModel
      .find({ clientId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return reviews.map((r) => this.toResponse(r as unknown as ReviewDocument));
  }

  async getStylistReviews(
    stylistId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedReviewsDto> {
    return this.paginate({ stylistIds: stylistId, isVisible: true }, page, limit);
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

  async adminListReviews(params: {
    page?:  number;
    limit?: number;
  }): Promise<AdminReviewsPageDto> {
    const page  = params.page  ?? 1;
    const limit = Math.min(params.limit ?? 10, 100);
    const skip  = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.reviewModel.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.reviewModel.countDocuments({}),
    ]);

    // Enrich reviews with salon and client names in parallel
    const enrichedReviews = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reviews.map(async (r: any) => {
        const [salonName, clientName] = await Promise.all([
          this.fetchSalonName(r.salonId),
          this.fetchClientName(r.clientId),
        ]);

        return {
          _id:        r._id?.toString(),
          salonName,
          clientName,
          rating:     r.rating,
          comment:    r.comment ?? '',
          isVisible:  r.isVisible,
          createdAt:  r.createdAt,
        };
      }),
    );

    return {
      data: enrichedReviews,
      total,
      page,
      limit,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async fetchSalonName(salonId: string): Promise<string> {
    const salonServiceUrl = this.config.get<string>(
      'services.salonUrl',
      'http://localhost:3001',
    );

    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${salonServiceUrl}/api/salons/${salonId}`).pipe(
          timeout(500),
        ),
      );
      return data.name ?? salonId;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch salon name for ${salonId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return salonId;
    }
  }

  private async fetchClientName(clientId: string): Promise<string> {
    const authServiceUrl = this.config.get<string>(
      'services.authUrl',
      'http://localhost:3003',
    );

    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${authServiceUrl}/api/auth/users/${clientId}`).pipe(
          timeout(500),
        ),
      );
      const firstName = data.firstName ?? '';
      const lastName = data.lastName ?? '';
      return `${firstName} ${lastName}`.trim() || clientId;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch client name for ${clientId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return clientId;
    }
  }

  private async notifyReviewPosted(
    review: ReviewDocument,
    clientName: string,
  ): Promise<void> {
    const notificationUrl = this.config.get<string>(
      'services.notificationUrl',
      'http://localhost:3004',
    );
    try {
      await firstValueFrom(
        this.httpService.post(
          `${notificationUrl}/api/notifications/review-posted`,
          {
            bookingId:   review.bookingId,
            salonId:     review.salonId,
            clientName:  clientName || review.clientName,
            rating:      review.rating,
            comment:     review.comment ?? '',
            serviceName: '',
          },
        ),
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to push review-posted notification: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async updateStylistPortfolios(
    review: ReviewDocument,
    stylistIds: string[],
    clientName: string,
  ): Promise<void> {
    const authServiceUrl = this.config.get<string>(
      'services.authUrl',
      'http://localhost:3003',
    );
    const internalToken = this.config.get<string>('internalToken', '');

    const portfolioData = {
      reviewId: review.id,
      salonId: review.salonId,
      rating: review.rating,
      comment: review.comment ?? '',
      serviceName: '', // TODO: Get from booking service if available
      clientName: clientName || review.clientName,
      date: review.createdAt,
    };

    // Update each stylist's portfolio in parallel
    await Promise.allSettled(
      stylistIds.map(async (stylistId) => {
        try {
          await firstValueFrom(
            this.httpService.patch(
              `${authServiceUrl}/api/auth/users/${stylistId}/portfolio-review`,
              portfolioData,
              {
                headers: { 'x-internal-token': internalToken },
                timeout: 2000,
              },
            ),
          );
        } catch (err) {
          this.logger.warn(
            `Failed to update portfolio for stylist ${stylistId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }),
    );
  }

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
      'services.salonUrl',
      'http://localhost:3001',
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
      clientName: review.clientName || '',
      stylistIds: review.stylistIds ?? [],
      rating: review.rating,
      comment: review.comment ?? undefined,
      images,
      isVisible: review.isVisible,
      ownerReply: review.ownerReply ?? undefined,
      createdAt: review.createdAt,
    };
  }
}
