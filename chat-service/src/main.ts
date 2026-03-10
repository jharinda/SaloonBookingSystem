/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

/**
 * Chat Service — Real-time messaging for clients and salons.
 * Handles internal chat, WhatsApp, and Instagram messaging.
 */
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.CHAT_PORT || 3009;
  await app.listen(port);
  Logger.log(
    `🚀 Chat service is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
