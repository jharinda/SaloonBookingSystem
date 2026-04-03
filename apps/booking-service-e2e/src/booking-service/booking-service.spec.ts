/**
 * Booking Flow Integration Tests
 *
 * Tests the booking-service HTTP endpoints end-to-end against a real
 * MongoDB (MongoMemoryServer) with all external dependencies mocked:
 *   • salon-service / auth-service  → HttpService mock (configurable per test)
 *   • Redis                         → ioredis-mock (in-process)
 *   • Bull queues                   → jest.fn() stubs
 *   • SubscriptionCheckService      → jest.fn() stub (default: allowed)
 *
 * Run:  npx nx e2e booking-service-e2e
 */
import request from 'supertest';
import { SubscriptionCheckService } from '@org/subscription-check';
import {
  TestApp,
  createTestApp,
  createTestSalon,
  createTestUser,
  MOCK_SALON_ID,
  MOCK_SERVICE_ID,
  MOCK_STYLIST_ID,
} from '../support/test-app';

// ── Shared fixtures ────────────────────────────────────────────────────────────

/** A Monday far enough in the future that auto-cancel cron never touches it. */
const TEST_DATE = '2027-03-08'; // Monday

/** Base request body for a 30-minute Haircut booking with the mock stylist. */
const baseBookingBody = () => ({
  salonId:         MOCK_SALON_ID,
  salonName:       'Test Salon',
  stylistId:       MOCK_STYLIST_ID,
  appointmentDate: TEST_DATE,
  startTime:       '10:00',
  services: [
    {
      serviceId:       MOCK_SERVICE_ID,
      name:            'Haircut',
      price:           1500,
      durationMinutes: 30,
    },
  ],
});

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('Booking Flow Integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 30_000); // NestJS init + Mongoose connect can be slow

  afterAll(async () => {
    await testApp.closeApp();
  });

  // Wipe all collections between tests so each case starts from a clean slate.
  beforeEach(() => testApp.clearDatabase());

  // ── 1. GET /api/bookings/slots ─────────────────────────────────────────────

  it('GET /api/bookings/slots returns available slots for an open Monday', async () => {
    const salon = createTestSalon();

    const res = await request(testApp.httpServer)
      .get('/api/bookings/slots')
      .query({ salonId: salon.salonId, date: TEST_DATE, durationMinutes: 30 })
      .expect(200);

    expect(res.body).toMatchObject({ salonId: MOCK_SALON_ID, date: TEST_DATE });
    expect(Array.isArray(res.body.slots)).toBe(true);
    expect(res.body.slots.length).toBeGreaterThan(0);

    // Salon opens at 09:00 — first slot must be 09:00
    expect(res.body.slots[0]).toBe('09:00');

    // Each element must look like 'HH:mm'
    for (const slot of res.body.slots as string[]) {
      expect(slot).toMatch(/^\d{2}:\d{2}$/);
    }

    // Last slot for 30-min service in 09:00–18:00 window: 17:30
    const slots = res.body.slots as string[];
    expect(slots[slots.length - 1]).toBe('17:30');
  });

  // ── 2. POST /api/bookings — happy path ───────────────────────────────────

  it('POST /api/bookings creates a booking and returns PENDING status', async () => {
    const { headers, userId } = createTestUser(testApp.jwtService, 'client');

    const res = await request(testApp.httpServer)
      .post('/api/bookings')
      .set(headers)
      .send(baseBookingBody())
      .expect(201);

    expect(res.body).toMatchObject({
      salonId:   MOCK_SALON_ID,
      stylistId: MOCK_STYLIST_ID,
      clientId:  userId,
      startTime: '10:00',
      endTime:   '10:30',
      status:    'PENDING',
    });
    expect(res.body.id).toBeTruthy();
    expect(res.body.totalPrice).toBe(1500);
  });

  // ── 3. Double-booking prevention ─────────────────────────────────────────

  it('POST /api/bookings prevents double-booking at the same slot for same stylist', async () => {
    const { headers: clientHeaders } = createTestUser(testApp.jwtService, 'client');
    const body = baseBookingBody();

    // First booking — should succeed
    await request(testApp.httpServer)
      .post('/api/bookings')
      .set(clientHeaders)
      .send(body)
      .expect(201);

    // Second booking at the exact same slot + stylist — must be rejected
    const conflict = await request(testApp.httpServer)
      .post('/api/bookings')
      .set(clientHeaders)
      .send(body)
      .expect(400);

    expect(conflict.body.message).toMatch(/no longer available/i);
  });

  // ── 4. Confirm a booking ──────────────────────────────────────────────────

  it('PATCH /api/bookings/:id/confirm transitions booking to CONFIRMED', async () => {
    const { headers: clientHeaders } = createTestUser(testApp.jwtService, 'client');
    const { headers: ownerHeaders }  = createTestUser(testApp.jwtService, 'salon_owner');

    // Create a PENDING booking as a client
    const created = await request(testApp.httpServer)
      .post('/api/bookings')
      .set(clientHeaders)
      .send(baseBookingBody())
      .expect(201);

    const bookingId: string = created.body.id;

    // Confirm it as a salon owner
    const confirmed = await request(testApp.httpServer)
      .patch(`/api/bookings/${bookingId}/confirm`)
      .set(ownerHeaders)
      .expect(200);

    expect(confirmed.body.status).toBe('CONFIRMED');
    expect(confirmed.body.id).toBe(bookingId);
  });

  // ── 5. Cancel a booking ────────────────────────────────────────────────────

  it('PATCH /api/bookings/:id/cancel cancels a confirmed booking', async () => {
    const { headers: clientHeaders } = createTestUser(testApp.jwtService, 'client');
    const { headers: ownerHeaders }  = createTestUser(testApp.jwtService, 'salon_owner');

    // Create and confirm
    const created = await request(testApp.httpServer)
      .post('/api/bookings')
      .set(clientHeaders)
      .send(baseBookingBody())
      .expect(201);

    const bookingId: string = created.body.id;

    await request(testApp.httpServer)
      .patch(`/api/bookings/${bookingId}/confirm`)
      .set(ownerHeaders)
      .expect(200);

    // Cancel as salon owner (no cancellation-window restriction for non-clients)
    const cancelled = await request(testApp.httpServer)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set(ownerHeaders)
      .send({ reason: 'Test cancellation' })
      .expect(200);

    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.cancellationReason).toBe('Test cancellation');
  });

  // ── 6. Slot availability updates after a booking ──────────────────────────

  it('GET /api/bookings/slots reflects updated availability after booking', async () => {
    const { headers: clientHeaders } = createTestUser(testApp.jwtService, 'client');

    // 6a. Fetch slots before booking — 10:00 should be present
    const before = await request(testApp.httpServer)
      .get('/api/bookings/slots')
      .query({ salonId: MOCK_SALON_ID, date: TEST_DATE, durationMinutes: 30 })
      .expect(200);

    expect(before.body.slots).toContain('10:00');

    // 6b. Create a booking at 10:00 for the only stylist in the mock
    await request(testApp.httpServer)
      .post('/api/bookings')
      .set(clientHeaders)
      .send(baseBookingBody())
      .expect(201);

    // 6c. Fetch slots again — 10:00 must be gone
    //     (booking creation invalidates the Redis slot cache)
    const after = await request(testApp.httpServer)
      .get('/api/bookings/slots')
      .query({ salonId: MOCK_SALON_ID, date: TEST_DATE, durationMinutes: 30 })
      .expect(200);

    expect(after.body.slots).not.toContain('10:00');
  });

  // ── 7. Complete a booking ─────────────────────────────────────────────────

  it('PATCH /api/bookings/:id/complete transitions CONFIRMED booking to COMPLETED', async () => {
    const { headers: clientHeaders } = createTestUser(testApp.jwtService, 'client');
    const { headers: ownerHeaders }  = createTestUser(testApp.jwtService, 'salon_owner');

    // Create → Confirm → Complete
    const created = await request(testApp.httpServer)
      .post('/api/bookings')
      .set(clientHeaders)
      .send(baseBookingBody())
      .expect(201);

    const bookingId: string = created.body.id;

    await request(testApp.httpServer)
      .patch(`/api/bookings/${bookingId}/confirm`)
      .set(ownerHeaders)
      .expect(200);

    const completed = await request(testApp.httpServer)
      .patch(`/api/bookings/${bookingId}/complete`)
      .set(ownerHeaders)
      .expect(200);

    expect(completed.body.status).toBe('COMPLETED');
  });

  // ── 8. Subscription gate ──────────────────────────────────────────────────

  it('POST /api/bookings rejects booking when subscription is inactive', async () => {
    const { headers: clientHeaders } = createTestUser(testApp.jwtService, 'client');

    // Temporarily override the subscription check to deny this salon
    const subCheckService = testApp.app.get(SubscriptionCheckService);
    const original = subCheckService.getFeatureCheckDetails;
    subCheckService.getFeatureCheckDetails = jest
      .fn()
      .mockResolvedValueOnce({ allowed: false, plan: 'starter', reason: 'Subscription expired' });

    try {
      const res = await request(testApp.httpServer)
        .post('/api/bookings')
        .set(clientHeaders)
        .send(baseBookingBody())
        .expect(400);

      expect(res.body.message).toBe('Subscription expired');
    } finally {
      // Restore so subsequent tests are not affected
      subCheckService.getFeatureCheckDetails = original;
    }
  });
});
