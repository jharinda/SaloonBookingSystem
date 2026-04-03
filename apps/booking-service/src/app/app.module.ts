import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import {
  CorrelationLoggingMiddleware,
  createLoggerConfig,
  getBullRedisConnection,
  HealthModule,
} from '@org/shared-auth';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BookingModule } from '../booking/booking.module';
import configuration from '../config/configuration';
import { validationSchema } from '../config/validation.schema';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('booking-service')),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('db.uri'),
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: getBullRedisConnection(config),
      }),
    }),
    HealthModule.forRoot({ redis: true }),
    BookingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationLoggingMiddleware).forRoutes('*');
  }
}
