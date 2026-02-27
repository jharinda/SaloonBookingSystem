import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';

import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { Review, ReviewSchema } from './schemas/review.schema';
import { JwtStrategy, JwtAuthGuard, RolesGuard } from '@org/shared-auth';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([{ name: Review.name, schema: ReviewSchema }]),
    HttpModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [ReviewService],
})
export class ReviewModule {}
