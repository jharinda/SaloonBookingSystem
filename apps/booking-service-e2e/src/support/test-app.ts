/**
 * Integration test helper for booking-service e2e tests.
 *
 * createTestApp()  — Bootstraps a real NestJS app backed by the MongoMemoryServer
 *                    started in global-setup, with all external dependencies mocked:
 *                    • HttpService  → configurable jest mock (no real HTTP calls)
 *                    • REDIS_CLIENT → ioredis-mock (in-process, no real Redis)
 *                    • Bull queues  → jest mock objects (no real queue processing)
 *                    • SubscriptionCheckService → always-allowed mock
 *
 * createTestSalon() — Returns stable fixture IDs + the mock salon payload that the
 *                     HttpService mock will return when booking-service calls salon-service.
 *
 * createTestUser()  — Signs a JWT with the test secret so the request passes
 *                     JwtAuthGuard.  Pass the JwtService from createTestApp().
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { BullModule, getQueueToken } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { Connection, Types } from 'mongoose';
import { of } from 'rxjs';

import { BookingModule } from '../../../booking-service/src/booking/booking.module';
import { BOOKING_QUEUE } from '../../../booking-service/src/booking/constants/booking-events.constants';
import { REDIS_CLIENT } from '@org/shared-auth';
import { SubscriptionCheckService } from '@org/subscription-check';

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * JWT secret used for signing test tokens.
 * Must stay in sync with the value set in test-setup.ts.
 */
export const TEST_JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long!!';

// ── Stable fixture IDs ─────────────────────────────────────────────────────────

export const MOCK_SALON_ID   = new Types.ObjectId().toHexString();
export const MOCK_STYLIST_ID = new Types.ObjectId().toHexString();
export const MOCK_STATION_ID = new Types.ObjectId().toHexString();
export const MOCK_SERVICE_ID = new Types.ObjectId().toHexString();
export const MOCK_CLIENT_ID  = new Types.ObjectId().toHexString();

// ── Mock salon data ────────────────────────────────────────────────────────────

/** Operating-hours returned by the HttpService mock for any salonId. */
const MOCK_OPERATING_HOURS = [
  { day: 0, open: '10:00', close: '16:00', closed: true  }, // Sunday  — closed
  { day: 1, open: '09:00', close: '18:00', closed: false }, // Monday
  { day: 2, open: '09:00', close: '18:00', closed: false }, // Tuesday
  { day: 3, open: '09:00', close: '18:00', closed: false }, // Wednesday
  { day: 4, open: '09:00', close: '18:00', closed: false }, // Thursday
  { day: 5, open: '09:00', close: '18:00', closed: false }, // Friday
  { day: 6, open: '09:00', close: '17:00', closed: false }, // Saturday
];

const MOCK_SALON_DETAIL = {
  _id: MOCK_SALON_ID,
  name: 'Test Salon',
  timezone: 'Asia/Colombo',
  operatingHours: MOCK_OPERATING_HOURS,
  cancellationWindowHours: 24,
  autoConfirmBookings: false,
  stationCount: 1,
};

const MOCK_STATIONS = {
  stations: [{ _id: MOCK_STATION_ID, name: 'Station 1', isActive: true }],
  stationCount: 1,
};

const MOCK_STAFF = [
  {
    _id: MOCK_STYLIST_ID,
    firstName: 'Test',
    lastName: 'Stylist',
    email: 'stylist@test.com',
    role: 'stylist',
  },
];

// ── Internal helpers ───────────────────────────────────────────────────────────

function createMockQueue() {
  return {
    add:   jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    process: jest.fn(),
    on:    jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Builds a mock HttpService that routes calls by URL pattern.
 * Tests can access `mockHttpService.get` directly to adjust return values
 * for specific scenarios.
 */
export function createMockHttpService() {
  return {
    get: jest.fn().mockImplementation((url: string) => {
      // Auth-service: individual user lookup
      if (url.match(/\/api\/auth\/users\/[^/]+$/)) {
        return of({ data: { firstName: 'Test', lastName: 'Client', email: 'client@test.com' } });
      }
      // Auth-service: stylist staff list
      if (url.includes('/staff') || url.includes('/api/auth/staff')) {
        return of({ data: MOCK_STAFF });
      }
      // Salon-service: stations endpoint
      if (url.includes('/stations')) {
        return of({ data: MOCK_STATIONS });
      }
      // Salon-service: individual salon / operating hours (fallback)
      return of({ data: MOCK_SALON_DETAIL });
    }),
    post:   jest.fn().mockReturnValue(of({ data: {} })),
    put:    jest.fn().mockReturnValue(of({ data: {} })),
    delete: jest.fn().mockReturnValue(of({ data: {} })),
    request: jest.fn().mockReturnValue(of({ data: {} })),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface TestApp {
  /** The NestJS application instance. */
  app: INestApplication;
  /** Pass to supertest: `request(httpServer).get(...)` */
  httpServer: ReturnType<INestApplication['getHttpServer']>;
  /** JwtService configured with TEST_JWT_SECRET — use in createTestUser(). */
  jwtService: JwtService;
  /**
   * The mock HttpService — individual tests can override `.get.mockImplementation`
   * to simulate specific salon-service / auth-service responses.
   */
  mockHttpService: ReturnType<typeof createMockHttpService>;
  /**
   * Drops every document from every collection in the test database.
   * Call in `beforeEach` or `afterEach` for test isolation.
   *
   * @example
   * beforeEach(() => testApp.clearDatabase());
   */
  clearDatabase: () => Promise<void>;
  /** Cleanly shuts down the NestJS app and the in-process Redis mock. */
  closeApp: () => Promise<void>;
}

/**
 * Creates and initialises a NestJS test application backed by:
 * - Real MongoDB (MongoMemoryServer started by global-setup)
 * - ioredis-mock (in-process Redis substitute)
 * - Mock Bull queues (no real job processing)
 * - Mock HttpService (no real calls to salon-service / auth-service)
 * - Mock SubscriptionCheckService (always allows bookings)
 *
 * Call `app.closeApp()` in `afterAll` to release resources.
 */
export async function createTestApp(): Promise<TestApp> {
  const mongoUri = process.env['BOOKING_MONGODB_URI'];
  if (!mongoUri) {
    throw new Error(
      'BOOKING_MONGODB_URI is not set. Make sure global-setup.ts ran ' +
      'and test-setup.ts is listed under setupFiles in jest.config.',
    );
  }

  // ioredis-mock: drop-in in-memory substitute for ioredis.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const IORedisMock = require('ioredis-mock') as new (...args: unknown[]) => {
    quit: () => Promise<void>;
    [key: string]: unknown;
  };
  const redisMock = new IORedisMock();

  const mockHttpService = createMockHttpService();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      // ── Configuration ──────────────────────────────────────────────────────
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            app: { port: 3099, env: 'test' },
            db:  { uri: mongoUri },
            redis: { host: 'localhost', port: 6379 },
            jwt:  { accessSecret: TEST_JWT_SECRET },
            services: {
              authUrl:         'http://mock-auth-service',
              salonUrl:        'http://mock-salon-service',
              notificationUrl: 'http://mock-notification-service',
              calendarUrl:     'http://mock-calendar-service',
              apiGatewayUrl:   'http://mock-api-gateway',
            },
            internalToken: 'mock-internal-token',
          }),
        ],
      }),

      // ── Infrastructure ─────────────────────────────────────────────────────
      ScheduleModule.forRoot(),
      MongooseModule.forRoot(mongoUri),

      /**
       * BullModule.forRoot with createClient wires Bull to use ioredis-mock for
       * all its internal connections (client / subscriber / bclient).
       * This avoids any real TCP connections to Redis while still satisfying
       * Bull's initialisation.  All queue *providers* are then replaced by mock
       * objects (below) so no real job processing happens.
       */
      BullModule.forRoot({
        createClient: (() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const RedisMock = require('ioredis-mock') as new () => unknown;
          // Bull calls createClient once per connection type ('client', 'subscriber',
          // 'bclient').  Each gets its own ioredis-mock instance so subscriber
          // connections don't interfere with regular command connections.
          return () => new RedisMock() as never;
        })(),
      }),

      // ── Feature module under test ─────────────────────────────────────────
      BookingModule,
    ],
  })
    // ── Provider overrides ────────────────────────────────────────────────────
    .overrideProvider(REDIS_CLIENT)
    .useValue(redisMock)

    .overrideProvider(getQueueToken(BOOKING_QUEUE))
    .useValue(createMockQueue())

    .overrideProvider(getQueueToken('notifications'))
    .useValue(createMockQueue())

    .overrideProvider(getQueueToken('calendar'))
    .useValue(createMockQueue())

    .overrideProvider(HttpService)
    .useValue(mockHttpService)

    .overrideProvider(SubscriptionCheckService)
    .useValue({
      getFeatureCheckDetails: jest.fn().mockResolvedValue({ allowed: true, plan: 'basic' }),
      checkFeature:           jest.fn().mockResolvedValue(true),
    })

    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  const jwtService = moduleRef.get(JwtService);

  // Get the managed Mongoose connection so clearDatabase() uses the right db.
  const mongooseConnection = moduleRef.get<Connection>(getConnectionToken());

  return {
    app,
    httpServer: app.getHttpServer(),
    jwtService,
    mockHttpService,
    clearDatabase: async () => {
      const db = mongooseConnection.db;
      if (db) {
        const collections = await db.collections();
        await Promise.all(collections.map((c) => c.deleteMany({})));
      }
    },
    closeApp: async () => {
      await app.close();
      await redisMock.quit();
    },
  };
}

// ── Fixture helpers ────────────────────────────────────────────────────────────

/**
 * Returns the stable fixture IDs and the salon data that the mock HttpService
 * will serve when booking-service calls the salon-service API.
 *
 * These IDs are constants defined at module level, so they are the same across
 * every call within a test file.
 */
export function createTestSalon() {
  return {
    salonId:   MOCK_SALON_ID,
    stylistId: MOCK_STYLIST_ID,
    stationId: MOCK_STATION_ID,
    serviceId: MOCK_SERVICE_ID,
    salonName: MOCK_SALON_DETAIL.name,
    operatingHours: MOCK_OPERATING_HOURS,
  };
}

/**
 * Signs a JWT token that will pass JwtAuthGuard in the test app.
 *
 * @param jwtService - The JwtService retrieved from the test module inside createTestApp().
 * @param role       - User role embedded in the token payload.
 * @returns  token     — raw JWT string
 *           userId    — the `sub` claim (stable per call with a fixed seed, or random)
 *           headers   — `{ Authorization: 'Bearer <token>' }` ready for supertest
 */
export function createTestUser(
  jwtService: JwtService,
  role: 'client' | 'salon_owner' | 'stylist' = 'client',
): { token: string; userId: string; headers: Record<string, string> } {
  const userId = new Types.ObjectId().toHexString();
  const token = jwtService.sign(
    { sub: userId, email: `${role}-${userId.slice(-6)}@test.com`, role },
    { secret: TEST_JWT_SECRET, expiresIn: '1h' },
  );
  return {
    token,
    userId,
    headers: { Authorization: `Bearer ${token}` },
  };
}

/**
 * Module-level clearDatabase helper retained for backwards-compatibility.
 * Prefer `testApp.clearDatabase()` which uses the NestJS-managed connection.
 *
 * @deprecated Use testApp.clearDatabase() instead.
 */
export async function clearDatabase(): Promise<void> {
  // This export is intentionally kept but the TestApp method is preferred.
  // It will only work if called after createTestApp() has connected Mongoose.
  const mongoose = await import('mongoose');
  const conn = mongoose.connections.find((c) => c.readyState === 1);
  if (conn?.db) {
    const collections = await conn.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  }
}
