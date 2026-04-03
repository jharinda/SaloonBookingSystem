import {
  All,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { ProxyRegistryService } from './proxy-registry.service';

@Controller()
export class GatewayController {
  private readonly logger = new Logger(GatewayController.name);

  constructor(private readonly proxyRegistry: ProxyRegistryService) {}

  /**
   * Health check — responds before the catch-all proxy route so it is always
   * reachable without hitting an upstream service.  Used by load balancers,
   * orchestrators (k8s liveness probe), and uptime monitors.
   */
  @Get('health')
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @All('{*path}')
  async proxy(@Req() req: Request, @Res() res: Response): Promise<void> {
    const fullPath = req.originalUrl.split('?')[0];
    const entry = this.proxyRegistry.resolveRoute(fullPath, req.method);

    if (!entry) {
      res.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message:    `No upstream service registered for ${req.method} ${fullPath}`,
      });
      return;
    }

    const handler = this.proxyRegistry.getProxy(entry.configKey);

    if (!handler) {
      this.logger.error(
        `Proxy not initialised for ${entry.name} (missing config key ${entry.configKey}?)`,
      );
      throw new HttpException('Bad Gateway', HttpStatus.BAD_GATEWAY);
    }

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
}
