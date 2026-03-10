import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';

import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { Review, ReviewSchema } from './schemas/review.schema';
import { SharedAuthModule } from '@org/shared-auth';
import { AdminReviewsController } from '../admin/admin-reviews.controller';

@Module({
  imports: [
    SharedAuthModule.forRoot(),
    MongooseModule.forFeature([{ name: Review.name, schema: ReviewSchema }]),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
  ],
  controllers: [ReviewController, AdminReviewsController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
