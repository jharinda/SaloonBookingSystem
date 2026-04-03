import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';

import { createLoggerConfig, HealthModule } from '@org/shared-auth';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('chat-service')),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI', 'mongodb://localhost:27017/snapsalon-chat'),
      }),
    }),
    HealthModule.forRoot(),
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
