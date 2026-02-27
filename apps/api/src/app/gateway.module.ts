import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { GatewayController } from './gateway.controller';
import { JwtValidationMiddleware } from './middleware/jwt-validation.middleware';
import configuration from '../config/configuration';
import { validationSchema } from '../config/validation.schema';

@Module({
  imports: [
    // Load .env and make ConfigService available globally (with Joi validation)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),

    // Rate limiting: max 100 requests per 60 seconds per IP
    ThrottlerModule.forRoot([
      {
        ttl:   60_000, // milliseconds
        limit: 100,
      },
    ]),

    // JwtModule is used by JwtValidationMiddleware to verify tokens
    JwtModule.register({}),
  ],
  controllers: [GatewayController],
  providers: [
    // Apply ThrottlerGuard globally so all routes are rate-limited
    {
      provide:  APP_GUARD,
      useClass: ThrottlerGuard,
    },
    JwtValidationMiddleware,
  ],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply JWT validation middleware to every route.
    // The middleware itself decides whether a route is public or protected.
    consumer.apply(JwtValidationMiddleware).forRoutes('*');
  }
}
