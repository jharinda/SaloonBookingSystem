import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { GatewayController } from './gateway.controller';
import { ProxyRegistryService } from './proxy-registry.service';
import { JwtValidationMiddleware } from './middleware/jwt-validation.middleware';
import configuration from '../config/configuration';
import { validationSchema } from '../config/validation.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    JwtModule.register({}),
  ],
  controllers: [GatewayController],
  providers: [
    {
      provide:  APP_GUARD,
      useClass: ThrottlerGuard,
    },
    ProxyRegistryService,
    JwtValidationMiddleware,
  ],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(JwtValidationMiddleware).forRoutes('{*path}');
  }
}
