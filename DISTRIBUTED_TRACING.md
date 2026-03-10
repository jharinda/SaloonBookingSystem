# Distributed Tracing & Fault Tolerance

This document describes the correlation ID propagation and circuit breaker patterns implemented in SnapSalon for production reliability.

## Correlation IDs for Distributed Tracing

Every HTTP request through the API Gateway is assigned a unique correlation ID that propagates across all microservices. This enables tracing a single user request through the entire distributed system.

### Implementation

- **API Gateway** (`apps/api`)
  - `CorrelationIdMiddleware` checks for `X-Correlation-ID` header
  - If not present, generates a new UUID
  - Propagates the ID to all upstream services via proxy
  - Returns the ID in the response header for client debugging

- **Microservices**
  - `CorrelationLoggingMiddleware` extracts the correlation ID from request headers
  - Attaches it to `req.correlationId` for access in services
  - Returns it in response headers

- **Proxy Configuration**
  - `proxy-registry.service.ts` ensures all headers (including correlation IDs) are forwarded to upstream services
  - WebSocket proxy also forwards correlation IDs for real-time connections

### Usage in Logs

Access the correlation ID in any service:

```typescript
@Injectable()
export class MyService {
  async handleRequest(@Request() req: Express.Request & { correlationId?: string }) {
    this.logger.log(`Processing request ${req.correlationId}`);
    // ... your logic
  }
}
```

### Client Integration

Clients can:
- Send `X-Correlation-ID` header to track specific requests
- Read `X-Correlation-ID` from response headers to correlate with backend logs

Example:
```typescript
// Angular HttpClient
this.http.get('/api/bookings', {
  headers: { 'X-Correlation-ID': 'my-trace-id-123' },
  observe: 'response'
}).subscribe(response => {
  console.log('Correlation ID:', response.headers.get('X-Correlation-ID'));
});
```

## HTTP Timeouts & Circuit Breaker

All microservices that make HTTP calls now have timeout and retry configuration to prevent cascading failures.

### Configuration

**HttpModule Timeout** — All services configure a 5-second timeout:

```typescript
HttpModule.register({
  timeout: 5000,
  maxRedirects: 3,
})
```

Services configured:
- ✅ booking-service
- ✅ review-service
- ✅ calendar-service
- ✅ notification-service
- ✅ salon-service

### Retry with Exponential Backoff

For **critical** inter-service calls (those required for the request to succeed), use the `httpRetryWithBackoff` utility:

```typescript
import { httpRetryWithBackoff } from '@org/shared-auth';
import { firstValueFrom } from 'rxjs';

// Example: Fetching salon operating hours (critical for booking creation)
const { data } = await firstValueFrom(
  this.httpService.get<SalonResponse>(`${url}/api/salons/${id}`).pipe(
    httpRetryWithBackoff(this.logger)
  )
);
```

**Retry behavior:**
- Retries up to 2 times
- Exponential backoff: 500ms, 1000ms
- Logs each retry attempt with correlation ID

### Fire-and-Forget for Non-Critical Calls

For **non-critical** calls (e.g., enriching client names, syncing ratings), use the `fireAndForget` utility:

```typescript
import { fireAndForget } from '@org/shared-auth';

// Example: Fetching user name for display (not critical)
const userName = await fireAndForget(
  this.httpService.get(`${authUrl}/api/users/${userId}`),
  this.logger,
) ?? 'Unknown User';
```

**Fire-and-forget behavior:**
- Never throws errors
- Returns `undefined` on failure
- Logs failures at debug level only
- Does not retry (fails fast)

## Implementation Examples

### Booking Service

The booking service demonstrates both patterns:

**Critical calls with retry:**
- Fetching salon operating hours → required for slot generation
- Fetching active stations → required for station assignment
- Fetching staff members → required for stylist assignment

**Non-critical calls (already fire-and-forget):**
- `fetchClientName()` — enriches booking response with client name
- `fetchStylistName()` — enriches booking response with stylist name
- Both catch all errors and return empty string

### Other Services

Apply the same patterns:
- Review service: Retry salon lookups, fire-and-forget for client enrichment
- Calendar service: Retry booking lookups, fire-and-forget for user profile sync
- Notification service: Fire-and-forget for all external API calls (email, SMS)

## Monitoring & Debugging

### Log Correlation

All log entries from a single request chain will share the same correlation ID, enabling:

```bash
# Example: Find all logs for a specific request
kubectl logs -l app=booking-service | grep "abc-123-def"
```

### Retry Monitoring

Watch for retry warnings in logs:
```
[BookingService] HTTP request retry 1/2 (delay: 500ms): connect ECONNREFUSED
```

Frequent retries indicate:
- Service instability
- Network issues
- Need for actual circuit breaker (e.g., Resilience4j, Polly)

## Future Enhancements

- **AsyncLocalStorage**: Use Node.js AsyncLocalStorage to automatically thread correlation ID through all async operations without manual propagation
- **True Circuit Breaker**: Implement a stateful circuit breaker (CLOSED → OPEN → HALF_OPEN) to prevent cascading failures
- **Metrics**: Emit retry/timeout metrics to Prometheus for alerting
- **OpenTelemetry**: Replace custom correlation logic with OpenTelemetry for industry-standard distributed tracing

## Related Files

- [`apps/api/src/app/middleware/correlation-id.middleware.ts`](../apps/api/src/app/middleware/correlation-id.middleware.ts) — API Gateway correlation ID generation
- [`libs/shared-auth/src/lib/middleware/correlation-logging.middleware.ts`](../libs/shared-auth/src/lib/middleware/correlation-logging.middleware.ts) — Microservice correlation ID extraction
- [`libs/shared-auth/src/lib/utils/http-resilience.util.ts`](../libs/shared-auth/src/lib/utils/http-resilience.util.ts) — Retry and fire-and-forget utilities
- [`apps/api/src/app/proxy-registry.service.ts`](../apps/api/src/app/proxy-registry.service.ts) — Proxy header forwarding
- [`apps/booking-service/src/booking/booking.service.ts`](../apps/booking-service/src/booking/booking.service.ts) — Example retry implementation
