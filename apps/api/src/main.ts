import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Logger as PinoLogger } from 'nestjs-pino';
import { GatewayModule } from './app/gateway.module';
import { initSentry } from '@org/shared-auth';

async function bootstrap() {
  initSentry('api');
  const app = await NestFactory.create(GatewayModule, {
    // Suppress NestJS body parser — http-proxy-middleware needs the raw stream
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  // ── Security headers ────────────────────────────────────────────────────────
  app.use(
    helmet({
      // Allow the Angular app to call the gateway from a different port in dev
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // HSTS: only enforce in production to avoid breaking local HTTP dev servers.
  if (process.env['NODE_ENV'] === 'production') {
    app.use(
      helmet.hsts({ maxAge: 31_536_000, includeSubDomains: true, preload: true }),
    );
  }

  // ── Config ──────────────────────────────────────────────────────────────────
  const configService = app.get(ConfigService);

  // ── CORS ────────────────────────────────────────────────────────────────────
  // CORS_ORIGIN may be a comma-separated list for multi-origin setups.
  const rawOrigin = configService.get<string>('app.corsOrigin', 'http://localhost:4200');
  const corsOrigins = rawOrigin.split(',').map((s) => s.trim()).filter(Boolean);

  app.enableCors({
    origin:      corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
    methods:     ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
    exposedHeaders: ['x-correlation-id'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SnapSalon API')
    .setDescription('Sri Lanka Online Salon Booking Platform API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('auth', 'Authentication & registration')
    .addTag('users', 'User profile management')
    .addTag('salons', 'Salon discovery & management')
    .addTag('bookings', 'Appointment booking')
    .addTag('reviews', 'Review system')
    .addTag('subscriptions', 'Subscription & payments')
    .addTag('calendar', 'Calendar integration')
    .addTag('notifications', 'Notification management')
    .addTag('chat', 'Real-time messaging')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  // ── WebSocket Proxy for chat-service ───────────────────────────────────────
  // Proxy Socket.io connections to chat-service
  const chatServiceUrl = configService.get<string>('services.chatUrl') ?? 'http://localhost:3009';
  const wsProxy = createProxyMiddleware({
    target: chatServiceUrl,
    ws: true,
    changeOrigin: true,
    logger: console,
    pathFilter: '/socket.io',
    on: {
      proxyReqWs: (proxyReq, req) => {
        // Forward correlation ID to WebSocket connections
        const correlationId = req.headers['x-correlation-id'];
        if (correlationId) {
          proxyReq.setHeader('x-correlation-id', correlationId);
        }
      },
      error: (err, req, res) => {
        Logger.error(`WebSocket proxy error: ${err.message}`, 'WebSocketProxy');
      },
    },
  });

  // Apply WebSocket proxy middleware
  app.use('/socket.io', wsProxy);

  // ── Listen ──────────────────────────────────────────────────────────────────
  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port);

  // Get the underlying HTTP server for WebSocket upgrade handling
  const httpServer = app.getHttpServer();

  // Handle WebSocket upgrade requests
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/socket.io')) {
      Logger.log(`WebSocket upgrade request: ${req.url}`, 'WebSocketProxy');
      wsProxy.upgrade?.(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  Logger.log(
    `🚀 API Gateway listening on http://localhost:${port}`,
    'Bootstrap',
  );
  Logger.log(`📚 Swagger UI: http://localhost:${port}/docs`, 'Bootstrap');
  Logger.log(
    `   Upstream env vars: AUTH_SERVICE_URL, SALON_SERVICE_URL, BOOKING_SERVICE_URL,`,
    'Bootstrap',
  );
  Logger.log(
    `                      REVIEW_SERVICE_URL, CALENDAR_SERVICE_URL, SUBSCRIPTION_SERVICE_URL,`,
    'Bootstrap',
  );
  Logger.log(
    `                      CHAT_SERVICE_URL`,
    'Bootstrap',
  );
  Logger.log(
    `   WebSocket proxy enabled for /socket.io -> ${chatServiceUrl}`,
    'Bootstrap',
  );
}

bootstrap();
