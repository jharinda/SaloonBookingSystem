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
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { GlobalExceptionFilter, initSentry } from '@org/shared-auth';
import { AppModule } from './app/app.module';

async function bootstrap() {
  initSentry('chat-service');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.useGlobalFilters(new GlobalExceptionFilter());
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SnapSalon Chat Service')
    .setDescription('In-app chat, WhatsApp and Instagram webhooks')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('chat', 'Chat')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = process.env.CHAT_PORT || 3009;
  await app.listen(port);
  Logger.log(
    `🚀 Chat service is running on: http://localhost:${port}/${globalPrefix}`,
  );
  Logger.log(`📚 Swagger UI: http://localhost:${port}/docs`);
}

bootstrap();
