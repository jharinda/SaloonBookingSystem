import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
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
      'X-Correlation-ID',
    ],
    exposedHeaders: ['X-Correlation-ID'], // Allow clients to read the correlation ID from responses
  });

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
