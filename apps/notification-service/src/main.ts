/**
 * Notification Service — headless Bull queue consumer.
 * No HTTP interface; all work is driven by Redis queue events.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Disable graceful shutdown timeout so queue workers drain cleanly
  app.enableShutdownHooks();
  await app.init();
  Logger.log('Notification service is running and consuming queue events');
}

bootstrap();
