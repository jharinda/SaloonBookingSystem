import {
  All,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';

/**
 * A route entry mapping a path prefix (and optional method allowlist) to a
 * target service URL.  Routes are evaluated top-to-bottom — the first match wins.
 */
interface RouteEntry {
  /** Path prefix to match (e.g. '/api/auth'). */
  prefix: string;
  /** If provided, only these HTTP methods will be proxied to this route. */
  methods?: string[];
  /** Nested ConfigService key that holds the target service base URL. */
  configKey: string;
  /** Public alias for logging purposes. */
  name: string;
}

const ROUTES: RouteEntry[] = [
  // Auth — always public (no JWT check performed upstream)
  { prefix: '/api/auth',          name: 'auth-service',          configKey: 'services.authUrl' },

  // Salon — public reads, protected mutations
  { prefix: '/api/salons',        name: 'salon-service',         configKey: 'services.salonUrl' },

  // Booking — all methods protected
  { prefix: '/api/bookings',      name: 'booking-service',       configKey: 'services.bookingUrl' },

  // Reviews — public reads, protected mutations
  { prefix: '/api/reviews',       name: 'review-service',        configKey: 'services.reviewUrl' },

  // Calendar — all methods protected
  { prefix: '/api/calendar',      name: 'calendar-service',      configKey: 'services.calendarUrl' },

  // Subscriptions — all methods protected
  { prefix: '/api/subscriptions', name: 'subscription-service',  configKey: 'services.subscriptionUrl' },

  // Admin — all methods admin-only (role enforced by JWT middleware)
  { prefix: '/api/admin',         name: 'salon-service',         configKey: 'services.salonUrl' },
];

@Controller()
export class GatewayController {
  private readonly logger = new Logger(GatewayController.name);

  /**
   * Pre-built proxy middleware instances keyed by envKey.
   * One instance per upstream service avoids re-creating the proxy on every request.
   */
  private readonly proxies = new Map<string, RequestHandler>();

  constructor(private readonly configService: ConfigService) {
    this.buildProxies();
  }

  // ---------------------------------------------------------------------------
  // Wildcard handler — catches every HTTP method and every path
  // ---------------------------------------------------------------------------

  @All('*')
  async proxy(@Req() req: Request, @Res() res: Response): Promise<void> {
    const entry = this.resolveRoute(req.path, req.method);

    if (!entry) {
      res.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message:    `No upstream service registered for ${req.method} ${req.path}`,
      });
      return;
    }

    const handler = this.proxies.get(entry.configKey);

    if (!handler) {
      this.logger.error(
        `Proxy not initialised for ${entry.name} (missing config key ${entry.configKey}?)`,
      );
      throw new HttpException('Bad Gateway', HttpStatus.BAD_GATEWAY);
    }

    // Delegate to http-proxy-middleware.  We wrap in a Promise so NestJS can
    // correctly await the async completion of the proxied request.
    return new Promise<void>((resolve) => {
      handler(req, res, (err?: unknown) => {
        if (err) {
          this.logger.error(`Proxy error for ${entry.name}: ${err}`);
          if (!res.headersSent) {
            res.status(HttpStatus.BAD_GATEWAY).json({
              statusCode: HttpStatus.BAD_GATEWAY,
              message:    'Upstream service unavailable',
            });
          }
        }
        resolve();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resolveRoute(path: string, method: string): RouteEntry | undefined {
    return ROUTES.find((r) => {
      if (!path.startsWith(r.prefix)) return false;
      if (r.methods && !r.methods.includes(method.toUpperCase())) return false;
      return true;
    });
  }

  private buildProxies(): void {
    // Collect unique configKeys so we create at most one proxy per service.
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

        // Forward the original host header so services can log it
        headers: {
          'x-forwarded-by': 'snap-salon-gateway',
        },

        on: {
          error: (err) => {
            this.logger.error(`[${route.name}] proxy error: ${(err as Error).message}`);
          },
          proxyReq: (proxyReq) => {
            // Ensure content-type is preserved for bodies
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
