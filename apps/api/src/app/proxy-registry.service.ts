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
  { prefix: '/api/auth',          name: 'auth-service',         configKey: 'services.authUrl' },
  { prefix: '/api/users',         name: 'auth-service',         configKey: 'services.authUrl' },
  { prefix: '/api/salons',        name: 'salon-service',        configKey: 'services.salonUrl' },
  { prefix: '/api/bookings',      name: 'booking-service',      configKey: 'services.bookingUrl' },
  { prefix: '/api/reviews',       name: 'review-service',       configKey: 'services.reviewUrl' },
  { prefix: '/api/calendar',      name: 'calendar-service',     configKey: 'services.calendarUrl' },
  { prefix: '/api/subscriptions', name: 'subscription-service', configKey: 'services.subscriptionUrl' },
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
        headers: { 'x-forwarded-by': 'snap-salon-gateway' },
        on: {
          error: (err) => {
            this.logger.error(`[${route.name}] proxy error: ${(err as Error).message}`);
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
