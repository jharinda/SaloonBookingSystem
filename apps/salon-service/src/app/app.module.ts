import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';

import { CorrelationLoggingMiddleware, createLoggerConfig, HealthModule } from '@org/shared-auth';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SalonModule } from '../salon/salon.module';
import configuration from '../config/configuration';
import { validationSchema } from '../config/validation.schema';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('salon-service')),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('db.uri'),
      }),
    }),
    HealthModule.forRoot(),
    SalonModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationLoggingMiddleware).forRoutes('*');
  }
}
