/**
 * Notification Service — HTTP + Bull queue consumer.
 * Exposes HTTP endpoints for receiving events from booking-service
 * and processes notification jobs via Redis queues.
 */
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3004;
  await app.listen(port);
  Logger.log(
    `🚀 Notification service is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
