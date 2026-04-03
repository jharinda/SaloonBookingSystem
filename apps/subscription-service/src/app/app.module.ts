import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import { createLoggerConfig, HealthModule } from '@org/shared-auth';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import configuration from '../config/configuration';
import { validationSchema } from '../config/validation.schema';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('subscription-service')),
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
    ScheduleModule.forRoot(),
    SubscriptionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
