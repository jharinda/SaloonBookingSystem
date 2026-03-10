import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';

export interface RouteEntry {
  prefix: string;
  methods?: string[];
  configKey: string;
  name: string;
}

export const ROUTES: RouteEntry[] = [
  { prefix: '/api/auth',                name: 'auth-service',         configKey: 'services.authUrl' },
  { prefix: '/api/users',               name: 'auth-service',         configKey: 'services.authUrl' },
  { prefix: '/api/salons',              name: 'salon-service',        configKey: 'services.salonUrl' },
  { prefix: '/api/bookings',            name: 'booking-service',      configKey: 'services.bookingUrl' },
  { prefix: '/api/reviews',             name: 'review-service',       configKey: 'services.reviewUrl' },
  { prefix: '/api/calendar',            name: 'calendar-service',     configKey: 'services.calendarUrl' },
  { prefix: '/api/subscriptions',       name: 'subscription-service', configKey: 'services.subscriptionUrl' },
  // Notification inbox — proxied to notification-service.
  // /api/notifications/stream and /api/notifications/push are handled directly
  // by NotificationSseController and never reach this catch-all.
  { prefix: '/api/notifications/inbox', name: 'notification-service', configKey: 'services.notificationUrl' },
  // More-specific admin sub-routes must come before the generic /api/admin entry
  { prefix: '/api/admin/users',   name: 'auth-service',         configKey: 'services.authUrl' },
  { prefix: '/api/admin/reviews', name: 'review-service',       configKey: 'services.reviewUrl' },
  { prefix: '/api/admin',         name: 'salon-service',        configKey: 'services.salonUrl' },
];

/**
 * Builds and owns all http-proxy-middleware instances.
 * Extracted into a provider so ConfigService is fully resolved before
 * proxy construction — providers are initialised before controllers in NestJS.
 */
@Injectable()
export class ProxyRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ProxyRegistryService.name);
  private readonly proxies = new Map<string, RequestHandler>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.buildProxies();
  }

  getProxy(configKey: string): RequestHandler | undefined {
    return this.proxies.get(configKey);
  }

  resolveRoute(path: string, method: string): RouteEntry | undefined {
    return ROUTES.find((r) => {
      if (!path.startsWith(r.prefix)) return false;
      if (r.methods && !r.methods.includes(method.toUpperCase())) return false;
      return true;
    });
  }

  private buildProxies(): void {
    const seen = new Set<string>();

    for (const route of ROUTES) {
      if (seen.has(route.configKey)) continue;
      seen.add(route.configKey);

      const target = this.configService.get<string>(route.configKey);

      if (!target) {
        this.logger.warn(
          `${route.configKey} is not set — requests to ${route.prefix} will return 502`,
        );
        continue;
      }

      const proxy = createProxyMiddleware<Request, Response>({
        target,
        changeOrigin: true,
        // Disable persistent keep-alive connections to upstream services.
        // This prevents ECONNRESET errors caused by the proxy reusing a
        // connection that the upstream closed while idle (common during
        // NX watch-mode restarts or after cold starts).
        headers: { 'x-forwarded-by': 'snap-salon-gateway', 'connection': 'close' },
        on: {
          error: (err, req, res) => {
            const e = err as NodeJS.ErrnoException;
            const detail = e.code ? `${e.code}${e.message ? ': ' + e.message : ''}` : (e.message || String(err));
            const reqInfo = req ? `${(req as Request).method} ${(req as Request).url}` : '';
            this.logger.error(`[${route.name}] proxy error${reqInfo ? ' (' + reqInfo + ')' : ''}: ${detail}`);
            const r = res as Response;
            if (r && typeof r.headersSent !== 'undefined' && !r.headersSent) {
              r.status(502).json({ statusCode: 502, message: 'Bad Gateway' });
            }
          },
          proxyReq: (proxyReq) => {
            if (!proxyReq.getHeader('content-type')) {
              proxyReq.setHeader('content-type', 'application/json');
            }
          },
        },
      });

      this.proxies.set(route.configKey, proxy);
      this.logger.log(`✓ Proxy ${route.name} → ${target}`);
    }
  }
}
