import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { GatewayModule } from './app/gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule, {
    // Suppress NestJS body parser — http-proxy-middleware needs the raw stream
    bodyParser: false,
    logger: ['log', 'warn', 'error'],
  });

  // ── Security headers ────────────────────────────────────────────────────────
  app.use(
    helmet({
      // Allow the Angular app to call the gateway from a different port in dev
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // ── Config ──────────────────────────────────────────────────────────────────
  const configService = app.get(ConfigService);

  // ── CORS ────────────────────────────────────────────────────────────────────
  app.enableCors({
    origin:      configService.get<string>('app.corsOrigin') ?? 'http://localhost:4200',
    credentials: true,
    methods:     ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'X-Requested-With',
    ],
  });

  // ── Listen ──────────────────────────────────────────────────────────────────
  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port);

  Logger.log(
    `🚀 API Gateway listening on http://localhost:${port}`,
    'Bootstrap',
  );
  Logger.log(
    `   Upstream env vars: AUTH_SERVICE_URL, SALON_SERVICE_URL, BOOKING_SERVICE_URL,`,
    'Bootstrap',
  );
  Logger.log(
    `                      REVIEW_SERVICE_URL, CALENDAR_SERVICE_URL, SUBSCRIPTION_SERVICE_URL`,
    'Bootstrap',
  );
}

bootstrap();
