import type { Params } from 'nestjs-pino';

export function createLoggerConfig(serviceName: string): Params {
  const isProduction = process.env['NODE_ENV'] === 'production';
  return {
    pinoHttp: {
      level: isProduction ? 'info' : 'debug',
      transport: isProduction
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
      // Structured fields on every log line
      base: { service: serviceName, pid: process.pid },
      // Extract correlation ID from request headers
      customProps: (req: any, _res: any) => ({
        correlationId: req.headers?.['x-correlation-id'] || 'none',
      }),
      // Redact sensitive fields
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[REDACTED]',
      },
      // Serialize request/response concisely
      serializers: {
        req: (req: any) => ({
          method: req.method,
          url: req.url,
          correlationId: req.headers?.['x-correlation-id'],
        }),
        res: (res: any) => ({
          statusCode: res.statusCode,
        }),
      },
      // Auto-assign log level based on status code
      customLogLevel: (_req: any, res: any, err: any) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    },
  };
}
