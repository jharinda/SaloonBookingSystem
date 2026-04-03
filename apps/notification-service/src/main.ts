/**
 * Notification Service — HTTP + Bull queue consumer.
 * Exposes HTTP endpoints for receiving events from booking-service
 * and processes notification jobs via Redis queues.
 */
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { GlobalExceptionFilter, initSentry } from '@org/shared-auth';
import { AppModule } from './app/app.module';

async function bootstrap() {
  initSentry('notification-service');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SnapSalon Notification Service')
    .setDescription('Inbox, SSE-related HTTP handlers, and internal enqueue endpoints')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('notifications', 'Notifications')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3004;
  await app.listen(port);
  Logger.log(
    `🚀 Notification service is running on: http://localhost:${port}/${globalPrefix}`,
  );
  Logger.log(`📚 Swagger UI: http://localhost:${port}/docs`);
}

bootstrap();
