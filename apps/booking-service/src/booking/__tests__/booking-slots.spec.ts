import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bull';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { BookingService } from '../booking.service';
import { Booking } from '../schemas/booking.schema';
import { StylistBreak } from '../schemas/stylist-break.schema';
import { BOOKING_QUEUE, BookingEvent } from '../constants/booking-events.constants';
import { BookingStatus } from '@org/models';
import { REDIS_CLIENT } from '@org/shared-auth';
import { SubscriptionCheckService } from '@org/subscription-check';

// ─── Constants mirrored from the service (must stay in sync) ─────────────────
const SLOT_INTERVAL_MINUTES = 30;
const BOOKING_BUFFER_MINUTES = 15;
const CACHE_TTL_SECONDS = 60;

// ─── Stable test fixtures ─────────────────────────────────────────────────────
// ObjectId-compatible hex string used as salonId throughout all tests.
const SALON_ID = '507f1f77bcf86cd799439011';

// 2026-04-06 is a Monday → getUTCDay() of '2026-04-06T12:00:00.000Z' = 1.
const DATE = '2026-04-06';

// Suppress @nestjs/bull's internal usage of these (unused in unit scope):
void SLOT_INTERVAL_MINUTES;
void BOOKING_BUFFER_MINUTES;

// ─── Fixtures shared across describe blocks ───────────────────────────────────

/** Minimal booking document returned by bookingModel.create() in createBooking tests. */
const MOCK_CREATED_BOOKING = {
  _id: '507f1f77bcf86cd799439099',
  id:  '507f1f77bcf86cd799439099',
  clientId: '507f1f77bcf86cd799439011',
  salonId: '507f1f77bcf86cd799439011',
  salonName: 'Test Salon',
  clientName: '',
  stylistId: '507f1f77bcf86cd799439012',
  stylistName: '',
  stationId: null,
  stationName: '',
  services: [],
  appointmentDate: new Date('2026-04-06T00:00:00.000Z'),
  startTime: '10:00',
  endTime: '10:30',
  totalPrice: 2500,
  notes: null,
  status: 'pending',
  assignedAutomatically: false,
  createdAt: new Date('2026-04-06T09:00:00.000Z'),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a chainable .find().lean().exec() mock that resolves to `rows`. */
function makeFindChain(rows: unknown[] = []) {
  return { lean: () => ({ exec: () => Promise.resolve(rows) }) };
}

/** Build the operatingHours entry that the salon-service would return. */
function makeOperatingHours(opts: {
  day: number;
  open: string;
  close: string;
  closed: boolean;
}) {
  return [opts];
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BookingService', () => {
  let service: BookingService;

  // Typed references to the mocks so individual tests can inspect / override them.
  let bookingModelMock: {
    find: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    countDocuments: jest.Mock;
  };
  let breakModelMock: { find: jest.Mock; findOne: jest.Mock };
  let bookingQueueMock: { add: jest.Mock };
  let httpServiceMock: { get: jest.Mock };
  let configServiceMock: { get: jest.Mock };
  let redisMock: {
    get: jest.Mock;
    setex: jest.Mock;
    set: jest.Mock;
    keys: jest.Mock;
    del: jest.Mock;
    eval: jest.Mock;
  };
  let subscriptionCheckMock: { getFeatureCheckDetails: jest.Mock };

  beforeEach(async () => {
    // ── Build fresh mock objects for each test ──────────────────────────────
    bookingModelMock = {
      find: jest.fn().mockReturnValue(makeFindChain()),
      findOne: jest.fn().mockResolvedValue(null),     // no clash by default
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(MOCK_CREATED_BOOKING),
      countDocuments: jest.fn().mockResolvedValue(0),
    };

    breakModelMock = {
      find: jest.fn().mockReturnValue(makeFindChain()),
      findOne: jest.fn().mockResolvedValue(null),     // no break conflict by default
    };

    bookingQueueMock = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    httpServiceMock = {
      get: jest.fn(),
    };

    configServiceMock = {
      get: jest.fn((key: string, defaultVal?: string) => {
        const values: Record<string, string> = {
          'services.salonUrl': 'http://salon-service:3001',
          'services.authUrl': 'http://localhost:3003',
        };
        return values[key] ?? defaultVal;
      }),
    };

    redisMock = {
      // Default: cache miss so the service proceeds to the HTTP / DB path.
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      // set returning 'OK' lets acquireLock() succeed on the first attempt.
      set: jest.fn().mockResolvedValue('OK'),
      keys: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(1),
      // eval is used by releaseLock() — must resolve so the finally block completes.
      eval: jest.fn().mockResolvedValue(1),
    };

    // Default: subscription is active so existing slot tests are unaffected.
    subscriptionCheckMock = {
      getFeatureCheckDetails: jest.fn().mockResolvedValue({ allowed: true, plan: 'basic' }),
    };

    // ── Wire up the NestJS test module ──────────────────────────────────────
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: getModelToken(Booking.name), useValue: bookingModelMock },
        { provide: getModelToken(StylistBreak.name), useValue: breakModelMock },
        { provide: getQueueToken(BOOKING_QUEUE), useValue: bookingQueueMock },
        { provide: HttpService, useValue: httpServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: SubscriptionCheckService, useValue: subscriptionCheckMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
  });

  // ── Shared HTTP mock helper ────────────────────────────────────────────────

  /**
   * Configures httpServiceMock.get() to route requests by URL pattern:
   *  • `/api/salons/<id>`           → salon details with the given operatingHours
   *  • `/api/salons/<id>/stations`  → { stations: [], stationCount }
   *  • `/api/auth/salons/<id>/staff`→ [] (empty staff list → falls back to station-capacity)
   */
  function setupSalonHttp(
    operatingHours: ReturnType<typeof makeOperatingHours>,
    stationCount = 1,
  ) {
    httpServiceMock.get.mockImplementation((url: string) => {
      if (url.includes('/stations')) {
        return of({ data: { stations: [], stationCount } });
      }
      if (url.includes('/staff')) {
        // Empty staff list → service uses station-capacity fallback (all slots pass
        // through when there are zero existing bookings).
        return of({ data: [] });
      }
      // Salon-details endpoint (must be last to avoid matching sub-paths)
      return of({ data: { operatingHours } });
    });
  }

  // ── describe('getAvailableSlots') ─────────────────────────────────────────

  describe('getAvailableSlots', () => {
    it('returns empty slots when salon is closed on the requested day', async () => {
      // day: 1 corresponds to Monday, matching DATE = '2026-04-06'.
      setupSalonHttp(makeOperatingHours({ day: 1, open: '09:00', close: '18:00', closed: true }));

      const result = await service.getAvailableSlots(SALON_ID, null, DATE, 60);

      expect(result.salonId).toBe(SALON_ID);
      expect(result.date).toBe(DATE);
      expect(result.slots).toEqual([]);
    });

    it('generates correct 30-minute interval slots for a 60-minute service', async () => {
      // Salon open 09:00–18:00.  Service is 60 min.
      // The loop: slot + 60 <= 1080 (18:00).
      //   First slot: 09:00 (540 + 60 = 600 ≤ 1080 ✓)
      //   Last slot:  17:00 (1020 + 60 = 1080 ≤ 1080 ✓)
      //   17:30 (1050 + 60 = 1110 > 1080 ✗) → excluded
      setupSalonHttp(makeOperatingHours({ day: 1, open: '09:00', close: '18:00', closed: false }));

      const result = await service.getAvailableSlots(SALON_ID, null, DATE, 60);

      expect(result.slots.length).toBeGreaterThan(0);
      expect(result.slots[0]).toBe('09:00');
      expect(result.slots[result.slots.length - 1]).toBe('17:00');

      // Verify the 30-minute step is respected.
      expect(result.slots).toContain('09:30');
      expect(result.slots).toContain('10:00');

      // 17:30 cannot fit a 60-minute service before 18:00.
      expect(result.slots).not.toContain('17:30');
      expect(result.slots).not.toContain('18:00');
    });

    it('generates correct slots for a 30-minute service', async () => {
      // Service is 30 min.
      // Last slot: 17:30 (1050 + 30 = 1080 ≤ 1080 ✓)
      // 18:00 (1080 + 30 = 1110 > 1080 ✗) → excluded
      setupSalonHttp(makeOperatingHours({ day: 1, open: '09:00', close: '18:00', closed: false }));

      const result = await service.getAvailableSlots(SALON_ID, null, DATE, 30);

      expect(result.slots.length).toBeGreaterThan(0);
      expect(result.slots[0]).toBe('09:00');
      expect(result.slots[result.slots.length - 1]).toBe('17:30');

      // 18:00 cannot start a 30-minute service that fits inside the close time.
      expect(result.slots).not.toContain('18:00');
    });

    it('returns cached result when Redis has data', async () => {
      const cachedPayload = {
        salonId: SALON_ID,
        date: DATE,
        slots: ['10:00', '10:30', '11:00'],
      };
      // Simulate a warm cache entry.
      redisMock.get.mockResolvedValue(JSON.stringify(cachedPayload));

      const result = await service.getAvailableSlots(SALON_ID, null, DATE, 60);

      expect(result).toEqual(cachedPayload);

      // The service must short-circuit before ever calling the salon-service.
      expect(httpServiceMock.get).not.toHaveBeenCalled();
    });

    it('caches result in Redis with 60s TTL after computing', async () => {
      setupSalonHttp(makeOperatingHours({ day: 1, open: '09:00', close: '18:00', closed: false }));

      await service.getAvailableSlots(SALON_ID, null, DATE, 60);

      // The cache key format used by the service:
      // `slots:${salonId}:${date}:${durationMinutes}:${stylistId ?? 'any'}`
      const expectedKey = `slots:${SALON_ID}:${DATE}:60:any`;

      expect(redisMock.setex).toHaveBeenCalledWith(
        expectedKey,
        CACHE_TTL_SECONDS,
        expect.any(String),
      );

      // The stored value must be valid JSON containing the expected shape.
      const [, , cachedJson] = redisMock.setex.mock.calls[0] as [string, number, string];
      const cached = JSON.parse(cachedJson) as { salonId: string; date: string; slots: string[] };

      expect(cached.salonId).toBe(SALON_ID);
      expect(cached.date).toBe(DATE);
      expect(Array.isArray(cached.slots)).toBe(true);
    });
  });

  // ── describe('getAvailableSlots - booking collisions') ────────────────────

  describe('getAvailableSlots - booking collisions', () => {
    // Valid-looking ObjectId hex strings for two distinct stylists.
    const STYLIST_A_ID = '507f1f77bcf86cd799439012';
    const STYLIST_B_ID = '507f1f77bcf86cd799439013';

    // Reused operating-hours fixture: Monday, 09:00–18:00, open.
    const OPEN = makeOperatingHours({ day: 1, open: '09:00', close: '18:00', closed: false });

    /**
     * HTTP mock for stylist-specific tests (steps 1–4 of the service).
     * The staff endpoint is never reached when stylistId is provided because
     * the service returns early inside the `if (stylistId)` branch.
     */
    function setupStylistHttp() {
      setupSalonHttp(OPEN);
    }

    /**
     * HTTP mock for any-stylist tests that need a known staff list.
     * Routes:
     *   /stations → { stations: [], stationCount }
     *   /staff    → staff array
     *   otherwise → salon details with OPEN hours
     */
    function setupAnyStylistHttp(
      staff: Array<{ _id: string }>,
      stationCount = 1,
    ) {
      httpServiceMock.get.mockImplementation((url: string) => {
        if (url.includes('/stations')) {
          return of({ data: { stations: [], stationCount } });
        }
        if (url.includes('/staff')) {
          return of({ data: staff });
        }
        return of({ data: { operatingHours: OPEN } });
      });
    }

    /**
     * HTTP mock for any-stylist tests where the auth-service staff call
     * throws, forcing the station-capacity fallback path.
     */
    function setupStaffFailHttp(stationCount = 1) {
      httpServiceMock.get.mockImplementation((url: string) => {
        if (url.includes('/stations')) {
          return of({ data: { stations: [], stationCount } });
        }
        if (url.includes('/staff')) {
          return throwError(() => new Error('auth-service unavailable'));
        }
        return of({ data: { operatingHours: OPEN } });
      });
    }

    // ── Stylist-specific booking collision tests ────────────────────────────

    it('marks slot as unavailable when a stylist has an existing booking at that time', async () => {
      // Stylist A has a booking at 10:00–10:30.
      // Blocked window (with 15-min buffer): 10:00–10:45.
      // 09:00 slot (09:00–09:30): slotEnd 570 > bStart 600? → false → NOT blocked.
      // 10:00 slot (10:00–10:30): 600 < 645 && 630 > 600 → BLOCKED.
      // 11:00 slot (11:00–11:30): slotStart 660 < bEnd 645? → false → NOT blocked.
      bookingModelMock.find.mockReturnValue(
        makeFindChain([{ startTime: '10:00', endTime: '10:30', stylistId: STYLIST_A_ID }]),
      );
      setupStylistHttp();

      const result = await service.getAvailableSlots(SALON_ID, STYLIST_A_ID, DATE, 30);

      expect(result.slots).not.toContain('10:00');
      expect(result.slots).toContain('09:00');
      expect(result.slots).toContain('11:00');
    });

    it('applies 15-minute buffer after existing bookings', async () => {
      // Booking at 10:00–10:30 → buffer end = 10:30 + 15 min = 10:45 (645 min).
      // 10:30 slot (630–660): slotStart 630 < bEnd 645 && slotEnd 660 > bStart 600 → BLOCKED.
      // 11:00 slot (660–690): slotStart 660 < bEnd 645? → false → NOT blocked.
      bookingModelMock.find.mockReturnValue(
        makeFindChain([{ startTime: '10:00', endTime: '10:30', stylistId: STYLIST_A_ID }]),
      );
      setupStylistHttp();

      const result = await service.getAvailableSlots(SALON_ID, STYLIST_A_ID, DATE, 30);

      expect(result.slots).not.toContain('10:30');
      expect(result.slots).toContain('11:00');
    });

    // ── Any-stylist per-staff availability tests ────────────────────────────

    it('allows overlapping slots when different stylists are booked', async () => {
      // Only Stylist A is booked at 10:00.  Stylist B is free.
      // In any-stylist mode the service checks each staff member independently:
      //   • Stylist A → hasBooking = true → cannot serve
      //   • Stylist B → hasBooking = false → CAN serve → slot is available
      bookingModelMock.find.mockReturnValue(
        makeFindChain([{ startTime: '10:00', endTime: '10:30', stylistId: STYLIST_A_ID }]),
      );
      setupAnyStylistHttp([{ _id: STYLIST_A_ID }, { _id: STYLIST_B_ID }]);

      const result = await service.getAvailableSlots(SALON_ID, null, DATE, 30);

      expect(result.slots).toContain('10:00');
    });

    it('blocks slot when ALL stylists are booked (any-stylist mode)', async () => {
      // Both Stylist A and Stylist B have bookings at 10:00.
      // For each staff member, the booking check (with 15-min buffer) returns true →
      // staffIds.some(...) is false → slot 10:00 is NOT available.
      bookingModelMock.find.mockReturnValue(
        makeFindChain([
          { startTime: '10:00', endTime: '10:30', stylistId: STYLIST_A_ID },
          { startTime: '10:00', endTime: '10:30', stylistId: STYLIST_B_ID },
        ]),
      );
      setupAnyStylistHttp([{ _id: STYLIST_A_ID }, { _id: STYLIST_B_ID }]);

      const result = await service.getAvailableSlots(SALON_ID, null, DATE, 30);

      expect(result.slots).not.toContain('10:00');
    });

    // ── Station-capacity fallback tests ────────────────────────────────────

    it('falls back to station-capacity logic when staff fetch fails', async () => {
      // Auth-service is down → staffIds stays [] → fallback path.
      // Fallback uses raw booking overlap (no 15-min buffer) vs stationCount.
      // 1 booking at 10:00–10:30, stationCount = 2 → concurrent (1) < stationCount (2) → available.
      bookingModelMock.find.mockReturnValue(
        makeFindChain([{ startTime: '10:00', endTime: '10:30' }]),
      );
      setupStaffFailHttp(2);

      const result = await service.getAvailableSlots(SALON_ID, null, DATE, 30);

      expect(result.slots).toContain('10:00');
    });

    it('blocks slot when station capacity is reached (fallback mode)', async () => {
      // 1 booking at 10:00–10:30, stationCount = 1 → concurrent (1) >= stationCount (1) → NOT available.
      // Note: the fallback check has NO 15-min buffer (uses raw endTime).
      bookingModelMock.find.mockReturnValue(
        makeFindChain([{ startTime: '10:00', endTime: '10:30' }]),
      );
      setupStaffFailHttp(1);

      const result = await service.getAvailableSlots(SALON_ID, null, DATE, 30);

      expect(result.slots).not.toContain('10:00');
    });

    // ── Stylist break tests ────────────────────────────────────────────────

    it('blocks slots during stylist break periods', async () => {
      // Break: 12:00–13:00 (no extra buffer applied to breaks).
      // 12:00 slot (720–750): 720 < 780 && 750 > 720 → BLOCKED.
      // 12:30 slot (750–780): 750 < 780 && 780 > 720 → BLOCKED.
      // 11:30 slot (690–720): 690 < 780 && 720 > 720 → false (slotEnd == br.start) → NOT blocked.
      // 13:00 slot (780–810): 780 < 780 → false → NOT blocked.
      breakModelMock.find.mockReturnValue(
        makeFindChain([{ stylistId: STYLIST_A_ID, startTime: '12:00', endTime: '13:00' }]),
      );
      setupStylistHttp();

      const result = await service.getAvailableSlots(SALON_ID, STYLIST_A_ID, DATE, 30);

      expect(result.slots).not.toContain('12:00');
      expect(result.slots).not.toContain('12:30');
      expect(result.slots).toContain('11:30');
      expect(result.slots).toContain('13:00');
    });

    it('in any-stylist mode, a slot is available if at least one stylist has no break', async () => {
      // Stylist A has a break 12:00–13:00.  Stylist B has no break.
      // For slot 12:00: Stylist A → hasBreak = true → skip.
      //                 Stylist B → hasBreak = false, hasBooking = false → free → slot available.
      breakModelMock.find.mockReturnValue(
        makeFindChain([{ stylistId: STYLIST_A_ID, startTime: '12:00', endTime: '13:00' }]),
      );
      setupAnyStylistHttp([{ _id: STYLIST_A_ID }, { _id: STYLIST_B_ID }]);

      const result = await service.getAvailableSlots(SALON_ID, null, DATE, 30);

      expect(result.slots).toContain('12:00');
    });
  });

  // ── describe('createBooking - subscription validation') ───────────────────

  describe('createBooking - subscription validation', () => {
    const CLIENT_ID = '507f1f77bcf86cd799439011';
    const STYLIST_ID = '507f1f77bcf86cd799439012';
    const SERVICE_ID = '507f1f77bcf86cd799439020';

    /** Minimal valid CreateBookingDto for these tests. */
    const baseDto = {
      salonId: SALON_ID,
      salonName: 'Test Salon',
      stylistId: STYLIST_ID,
      appointmentDate: DATE,
      startTime: '10:00',
      services: [
        { serviceId: SERVICE_ID, name: 'Haircut', price: 2500, durationMinutes: 30 },
      ],
    };

    it('throws BadRequestException when salon subscription is inactive', async () => {
      subscriptionCheckMock.getFeatureCheckDetails.mockResolvedValue({
        allowed: false,
        plan: 'starter',
        reason: 'Subscription expired',
      });

      await expect(service.createBooking(baseDto, CLIENT_ID)).rejects.toThrow(
        BadRequestException,
      );

      // The reason from the subscription check must surface in the error message.
      const error = await service.createBooking(baseDto, CLIENT_ID).catch((e: unknown) => e);
      expect((error as BadRequestException).message).toBe('Subscription expired');

      // The lock must NEVER be acquired for an inactive salon.
      expect(redisMock.set).not.toHaveBeenCalled();
    });

    it('allows booking when subscription is active', async () => {
      // subscriptionCheckMock already returns { allowed: true } from the outer beforeEach.
      // No clash (bookingModel.findOne → null) and no break conflict (breakModel.findOne → null).

      // The station auto-assignment step calls httpService.get('/stations').pipe(retry(...)).
      // All other HTTP calls (auth-service user lookups, auto-confirm check) fail gracefully
      // because their code paths are wrapped in try/catch.
      httpServiceMock.get.mockImplementation((url: string) => {
        if (url.includes('/stations')) {
          return of({
            data: {
              stations: [{ _id: '507f1f77bcf86cd799439030', name: 'Station 1', isActive: true }],
              stationCount: 1,
            },
          });
        }
        return throwError(() => new Error('not needed for this test'));
      });

      const result = await service.createBooking(baseDto, CLIENT_ID);

      expect(result).toBeDefined();
      expect(subscriptionCheckMock.getFeatureCheckDetails).toHaveBeenCalledWith(
        SALON_ID,
        'basic_booking',
      );
      // The lock must be acquired (redis.set called with NX option).
      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining('booking-lock:'),
        expect.any(String),
        'EX',
        5,
        'NX',
      );
    });
  });

  describe('markNoShow', () => {
    const BOOKING_ID = '507f1f77bcf86cd799439099';

    it('transitions CONFIRMED booking to NO_SHOW', async () => {
      const bookingDoc = {
        _id: BOOKING_ID,
        status: BookingStatus.CONFIRMED,
        salonId: { toString: () => SALON_ID },
        appointmentDate: new Date(`${DATE}T00:00:00.000Z`),
        clientId: '507f1f77bcf86cd799439011',
        services: [],
        startTime: '10:00',
        endTime: '10:30',
        totalPrice: 2500,
        save: jest.fn().mockResolvedValue(undefined),
      };
      bookingModelMock.findById.mockResolvedValue(bookingDoc);

      await service.markNoShow(BOOKING_ID);

      expect(bookingDoc.status).toBe(BookingStatus.NO_SHOW);
      expect(bookingDoc.save).toHaveBeenCalled();
    });

    it('throws BadRequestException for already CANCELLED booking', async () => {
      const bookingDoc = {
        status: BookingStatus.CANCELLED,
        save: jest.fn(),
      };
      bookingModelMock.findById.mockResolvedValue(bookingDoc);

      await expect(service.markNoShow(BOOKING_ID)).rejects.toThrow(BadRequestException);

      expect(bookingDoc.save).not.toHaveBeenCalled();
    });

    it('emits booking.no_show event to queue', async () => {
      const bookingDoc = {
        _id: BOOKING_ID,
        status: BookingStatus.CONFIRMED,
        salonId: { toString: () => SALON_ID },
        appointmentDate: new Date(`${DATE}T00:00:00.000Z`),
        clientId: '507f1f77bcf86cd799439011',
        services: [],
        startTime: '10:00',
        endTime: '10:30',
        totalPrice: 2500,
        save: jest.fn().mockResolvedValue(undefined),
      };
      bookingModelMock.findById.mockResolvedValue(bookingDoc);

      await service.markNoShow(BOOKING_ID);

      expect(bookingQueueMock.add).toHaveBeenCalledWith(
        BookingEvent.NO_SHOW,
        expect.objectContaining({ status: BookingStatus.NO_SHOW }),
      );
    });
  });
});
