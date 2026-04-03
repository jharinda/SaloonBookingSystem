import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as CryptoJS from 'crypto-js';

import { SubscriptionService } from '../subscription.service';
import { Subscription } from '../schemas/subscription.schema';
import { PlanEntry } from '../schemas/plan-config.schema';
import { PayhereWebhookDto } from '../dto/subscription.dto';
import { PLANS } from '../plans.config';

// ─── Config fixtures ──────────────────────────────────────────────────────────
const MERCHANT_ID = '1234';
const SECRET = 'test-secret';

// ─── Hash helpers (mirror the service algorithm exactly) ──────────────────────

/**
 * Mirrors handleWebhook's signature verification:
 *   MD5(merchant_id + order_id + amount + currency + status_code + MD5(secret).toUpper()).toUpper()
 */
function computeWebhookSig(
  merchantId: string,
  orderId: string,
  amount: string,
  currency: string,
  statusCode: string,
  secret: string,
): string {
  const secretMd5 = CryptoJS.MD5(secret).toString().toUpperCase();
  return CryptoJS.MD5(merchantId + orderId + amount + currency + statusCode + secretMd5)
    .toString()
    .toUpperCase();
}

/**
 * Mirrors generatePayherePayment's hash computation:
 *   MD5(merchant_id + order_id + amount + currency + MD5(secret).toUpper()).toUpper()
 * Note: no status_code — the payment form hash uses only 4 fields + secretMd5.
 */
function computePaymentHash(
  merchantId: string,
  orderId: string,
  amount: string,
  currency: string,
  secret: string,
): string {
  const secretMd5 = CryptoJS.MD5(secret).toString().toUpperCase();
  return CryptoJS.MD5(merchantId + orderId + amount + currency + secretMd5)
    .toString()
    .toUpperCase();
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  let subscriptionModelMock: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
    updateMany: jest.Mock;
  };
  let configServiceMock: { get: jest.Mock };

  beforeEach(async () => {
    subscriptionModelMock = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
      // Resolves to the doc passed in so the service's return value is meaningful.
      create: jest.fn().mockImplementation((doc: unknown) => Promise.resolve(doc)),
      // Used by cron jobs — must not throw during tests.
      find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };

    configServiceMock = {
      get: jest.fn((key: string, defaultVal?: string) => {
        const config: Record<string, string> = {
          'payhere.merchantId': MERCHANT_ID,
          'payhere.secret': SECRET,
        };
        return config[key] ?? defaultVal;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: getModelToken(Subscription.name), useValue: subscriptionModelMock },
        {
          provide: getModelToken(PlanEntry.name),
          useValue: {
            countDocuments: jest.fn().mockResolvedValue(1),
            find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
          },
        },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  // ── describe('handleWebhook') ─────────────────────────────────────────────

  describe('handleWebhook', () => {
    // Stable payload fields shared across all webhook tests.
    const ORDER_ID = 'SS-123';
    const AMOUNT = '2500.00';
    const CURRENCY = 'LKR';
    const SALON_ID = 'salon-id-abc';
    const PLAN = 'basic';

    /**
     * Builds a PayhereWebhookDto with a correctly-computed md5sig.
     * custom_1 carries the salonId; custom_2 carries the plan name
     * (both are accessed via the DTO's index signature in the service).
     */
    function makePayload(statusCode: string): PayhereWebhookDto {
      return {
        merchant_id: MERCHANT_ID,
        order_id: ORDER_ID,
        payhere_amount: AMOUNT,
        payhere_currency: CURRENCY,
        status_code: statusCode,
        custom_1: SALON_ID,
        custom_2: PLAN,
        md5sig: computeWebhookSig(MERCHANT_ID, ORDER_ID, AMOUNT, CURRENCY, statusCode, SECRET),
      };
    }

    it("activates subscription on successful payment (status_code='2')", async () => {
      await service.handleWebhook(makePayload('2'));

      expect(subscriptionModelMock.findOne).toHaveBeenCalledWith({ salonId: SALON_ID });

      // Verify findOneAndUpdate was called with the right salonId, status, plan,
      // and a paymentHistory $push entry carrying the expected fields.
      expect(subscriptionModelMock.findOneAndUpdate).toHaveBeenCalledWith(
        { salonId: SALON_ID },
        expect.objectContaining({
          plan: PLAN,
          status: 'active',
          payhereOrderId: ORDER_ID,
          $push: {
            paymentHistory: expect.objectContaining({
              orderId: ORDER_ID,
              amount: parseFloat(AMOUNT), // 2500
              currency: CURRENCY,
              status: 'SUCCESS',
            }),
          },
        }),
        { upsert: false },
      );

      const update = subscriptionModelMock.findOneAndUpdate.mock.calls[0][1] as {
        currentPeriodEnd: Date;
      };
      const expectedFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(update.currentPeriodEnd.getTime() - expectedFromNow)).toBeLessThan(2000);
    });

    it('extends period from current end date for early renewal', async () => {
      const futureEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      subscriptionModelMock.findOne.mockResolvedValueOnce({
        salonId: SALON_ID,
        currentPeriodEnd: futureEnd,
        status: 'active',
      });

      await service.handleWebhook(makePayload('2'));

      const update = subscriptionModelMock.findOneAndUpdate.mock.calls[0][1] as {
        currentPeriodEnd: Date;
      };
      const expectedEnd = new Date(futureEnd.getTime() + 30 * 24 * 60 * 60 * 1000);
      expect(Math.abs(update.currentPeriodEnd.getTime() - expectedEnd.getTime())).toBeLessThan(1000);
    });

    it('extends period from now for late renewal (past_due)', async () => {
      const pastEnd = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      subscriptionModelMock.findOne.mockResolvedValueOnce({
        salonId: SALON_ID,
        currentPeriodEnd: pastEnd,
        status: 'past_due',
      });

      await service.handleWebhook(makePayload('2'));

      const update = subscriptionModelMock.findOneAndUpdate.mock.calls[0][1] as {
        currentPeriodEnd: Date;
      };
      const expectedFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(update.currentPeriodEnd.getTime() - expectedFromNow)).toBeLessThan(2000);
    });

    it('throws UnauthorizedException on invalid signature', async () => {
      // Tamper with the md5sig after computing a valid payload.
      const payload = makePayload('2');
      payload.md5sig = 'INVALID-SIGNATURE-XYZ';

      await expect(service.handleWebhook(payload)).rejects.toThrow(
        new UnauthorizedException('Invalid webhook signature'),
      );
    });

    it("does not activate subscription on non-success status codes (status_code='0')", async () => {
      // status_code '0' means pending — service logs a warning and returns.
      await service.handleWebhook(makePayload('0'));

      expect(subscriptionModelMock.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("does not activate on status_code='-1' (canceled)", async () => {
      await service.handleWebhook(makePayload('-1'));

      expect(subscriptionModelMock.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("handles status_code='-3' (chargedback)", async () => {
      await service.handleWebhook(makePayload('-3'));

      expect(subscriptionModelMock.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  // ── describe('generatePayherePayment') ───────────────────────────────────

  describe('generatePayherePayment', () => {
    it('generates correct hash for payment form', async () => {
      const { paymentData, paymentUrl } = await service.generatePayherePayment({
        salonId: 'salon-abc',
        plan: 'basic',
      });

      // Static / config-driven fields.
      expect(paymentData.merchant_id).toBe(MERCHANT_ID);
      expect(paymentData.amount).toBe(PLANS.basic.price.toFixed(2)); // '2500.00'
      expect(paymentData.currency).toBe('LKR');
      expect(paymentUrl).toBe('https://sandbox.payhere.lk/pay/checkout');

      // The hash is computed over merchantId+orderId+amount+currency+MD5(secret).
      // The orderId is dynamic (SS-<timestamp>); retrieve it from paymentData to verify.
      const expectedHash = computePaymentHash(
        MERCHANT_ID,
        paymentData.order_id,
        paymentData.amount,
        paymentData.currency,
        SECRET,
      );
      expect(paymentData.hash).toBe(expectedHash);
    });

    it("throws ConflictException for free plan (starter, price=0)", async () => {
      // PLANS.starter.price === 0 → service throws before doing any hashing.
      await expect(
        service.generatePayherePayment({ salonId: 'salon-abc', plan: 'starter' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── describe('startTrial') ────────────────────────────────────────────────

  describe('startTrial', () => {
    it('creates a 30-day trial subscription', async () => {
      await service.startTrial('salon-trial-123');

      // Verify create was invoked with the correct static fields.
      expect(subscriptionModelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          salonId: 'salon-trial-123',
          plan: 'starter',
          status: 'trial',
          currentPeriodEnd: null,
          payhereOrderId: null,
          paymentHistory: [],
        }),
      );

      // Verify trialEndsAt is approximately 30 days from now (within 1 second tolerance).
      const [createArg] = subscriptionModelMock.create.mock.calls[0] as [
        { trialEndsAt: Date },
      ];
      const expectedMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(createArg.trialEndsAt.getTime() - expectedMs)).toBeLessThan(1000);
    });

    it('throws ConflictException if subscription already exists', async () => {
      // Simulate an existing subscription for the salon.
      subscriptionModelMock.findOne.mockResolvedValue({
        salonId: 'salon-trial-123',
        plan: 'starter',
        status: 'trial',
      });

      await expect(service.startTrial('salon-trial-123')).rejects.toThrow(ConflictException);

      // No new subscription should be created.
      expect(subscriptionModelMock.create).not.toHaveBeenCalled();
    });
  });

  describe('checkExpiringSubscriptions', () => {
    it('marks active subscription as past_due when period ends', async () => {
      subscriptionModelMock.updateMany = jest
        .fn()
        .mockResolvedValueOnce({ modifiedCount: 2 })
        .mockResolvedValueOnce({ modifiedCount: 0 });

      await service.checkExpiringSubscriptions();

      expect(subscriptionModelMock.updateMany).toHaveBeenNthCalledWith(
        1,
        {
          status: 'active',
          currentPeriodEnd: { $lt: expect.any(Date) },
        },
        { $set: { status: 'past_due' } },
      );
    });

    it('cancels past_due subscription after 7-day grace period', async () => {
      subscriptionModelMock.updateMany = jest
        .fn()
        .mockResolvedValueOnce({ modifiedCount: 0 })
        .mockResolvedValueOnce({ modifiedCount: 1 });

      await service.checkExpiringSubscriptions();

      expect(subscriptionModelMock.updateMany).toHaveBeenNthCalledWith(
        2,
        {
          status: 'past_due',
          currentPeriodEnd: { $lt: expect.any(Date) },
        },
        { $set: { status: 'cancelled' } },
      );
    });
  });
});
