import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { LoggerModule } from 'nestjs-pino';

import {
  CorrelationLoggingMiddleware,
  createLoggerConfig,
  getBullRedisConnection,
  HealthModule,
} from '@org/shared-auth';
import { CalendarModule } from '../calendar/calendar.module';
import configuration from '../config/configuration';
import { validationSchema } from '../config/validation.schema';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('calendar-service')),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
    MongooseModule.forRootAsync({
      connectionName: 'booking',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('db.bookingUri'),
      }),
    }),
    MongooseModule.forRootAsync({
      connectionName: 'calendar',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('db.calendarUri'),
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: getBullRedisConnection(config),
      }),
    }),
    HealthModule.forRoot({
      redis: true,
      mongooseConnectionNames: ['booking', 'calendar'],
    }),
    CalendarModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationLoggingMiddleware).forRoutes('*');
  }
}
