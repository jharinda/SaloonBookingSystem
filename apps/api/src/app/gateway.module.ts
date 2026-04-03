import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import * as express from 'express';

import { createLoggerConfig } from '@org/shared-auth';
import { GatewayController } from './gateway.controller';
import { NotificationSseController } from './notification-sse.controller';
import { SseService } from './sse.service';
import { ProxyRegistryService } from './proxy-registry.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtValidationMiddleware } from './middleware/jwt-validation.middleware';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import configuration from '../config/configuration';
import { validationSchema } from '../config/validation.schema';

/** Runs before pino-http so request logs include generated or forwarded correlation IDs. */
@Module({
  providers: [CorrelationIdMiddleware],
})
class GatewayCorrelationModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

@Module({
  imports: [
    GatewayCorrelationModule,
    LoggerModule.forRoot(createLoggerConfig('api-gateway')),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1_000,  limit: 10  }, // 10 req/sec  — burst protection
      { name: 'medium', ttl: 60_000, limit: 100 }, // 100 req/min — sustained limit
    ]),
    JwtModule.register({}),
  ],
  controllers: [NotificationSseController, GatewayController],
  providers: [
    {
      provide:  APP_GUARD,
      useClass: ThrottlerGuard,
    },
    ProxyRegistryService,
    JwtValidationMiddleware,
    SseService,
    JwtAuthGuard,
  ],
  exports: [SseService],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Parse JSON body only for the internal push endpoint.
    // All other routes pass through without body buffering so that
    // http-proxy-middleware can stream the raw request body upstream.
    consumer
      .apply(express.json())
      .forRoutes({ path: 'api/notifications/push', method: RequestMethod.POST });

    consumer.apply(JwtValidationMiddleware).forRoutes('{*path}');
  }
}
