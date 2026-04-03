import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bull';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuthService } from '../auth.service';
import { User } from '../schemas/user.schema';
import { UserRole } from '@org/shared-auth';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { REDIS_CLIENT } from '@org/shared-auth';

// ─── Allow longer timeouts — register() runs real bcrypt with 12 rounds ───────
jest.setTimeout(60_000);

// ─── Pre-computed fixtures (1 round = fast bcrypt.compare in tests) ──────────
// The service's own BCRYPT_SALT_ROUNDS (12) still applies to new hashes it creates.
const VALID_PASSWORD = 'Test@123';
const VALID_PASSWORD_HASH = bcrypt.hashSync(VALID_PASSWORD, 1);

// Used by the refreshToken tests to simulate a matching stored refresh token hash.
const MOCK_REFRESH_TOKEN = 'incoming-refresh-token-fixture';
const MOCK_REFRESH_TOKEN_HASH = bcrypt.hashSync(MOCK_REFRESH_TOKEN, 1);

// ─── Reusable mock user documents ─────────────────────────────────────────────

const MOCK_USER_ID = '507f1f77bcf86cd799439011';

/** Base user returned by userModel.create() for register tests. */
const mockCreatedUser = {
  id: MOCK_USER_ID,
  _id: MOCK_USER_ID,
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  role: UserRole.CLIENT,
  isEmailVerified: false,
  isActive: true,
  phone: null,
  avatarUrl: null,
  stylistProfile: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

/** User returned by userModel.findOne().select('+passwordHash') for login tests. */
const loginUser = {
  ...mockCreatedUser,
  isEmailVerified: true,
  passwordHash: VALID_PASSWORD_HASH,
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  let userModelMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findById: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    updateMany: jest.Mock;
  };
  let jwtServiceMock: { signAsync: jest.Mock; sign: jest.Mock; verify: jest.Mock; decode: jest.Mock };
  let configServiceMock: { get: jest.Mock };
  let httpServiceMock: { get: jest.Mock; post: jest.Mock };
  let notifQueueMock: { add: jest.Mock };
  let userEventsQueueMock: { add: jest.Mock };
  let redisMock: {
    get: jest.Mock;
    setex: jest.Mock;
    set: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    userModelMock = {
      // Default: await findOne({...}) → null  (works for register's direct await).
      // Login tests override this to return a chainable { select: fn } object.
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockCreatedUser),
      findByIdAndUpdate: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      countDocuments: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };

    // signAsync distinguishes access vs refresh tokens by their expiresIn option.
    jwtServiceMock = {
      signAsync: jest.fn().mockImplementation((_payload, options) =>
        Promise.resolve(options?.expiresIn === '7d' ? 'mock-refresh-token' : 'mock-access-token'),
      ),
      sign: jest.fn().mockReturnValue('mock-access-token'),
      verify: jest.fn(),
      decode: jest.fn(),
    };

    configServiceMock = {
      get: jest.fn((key: string, defaultVal?: string) => {
        const config: Record<string, string> = {
          'jwt.accessSecret': 'test-access-secret',
          'jwt.refreshSecret': 'test-refresh-secret',
        };
        return config[key] ?? defaultVal;
      }),
    };

    httpServiceMock = {
      get: jest.fn(),
      post: jest.fn(),
    };

    notifQueueMock = { add: jest.fn().mockResolvedValue(undefined) };
    userEventsQueueMock = { add: jest.fn().mockResolvedValue(undefined) };

    redisMock = {
      get: jest.fn().mockResolvedValue(null),    // no lockout by default
      setex: jest.fn().mockResolvedValue('OK'),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),      // 1st failed attempt (< 5)
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: userModelMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: HttpService, useValue: httpServiceMock },
        { provide: getQueueToken('notifications'), useValue: notifQueueMock },
        { provide: getQueueToken('user-events'), useValue: userEventsQueueMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── Shared register DTO builder ────────────────────────────────────────────

  function makeRegisterDto(overrides: Partial<RegisterDto> = {}): RegisterDto {
    return {
      email: 'test@example.com',
      password: 'Test@123!',
      firstName: 'John',
      lastName: 'Doe',
      role: UserRole.CLIENT,
      ...overrides,
    };
  }

  // ── describe('register') ──────────────────────────────────────────────────

  describe('register', () => {
    it('creates a new user with hashed password', async () => {
      await service.register(makeRegisterDto());

      expect(userModelMock.create).toHaveBeenCalled();

      // The service must pass a real bcrypt hash, not the plain-text password.
      const [createArg] = userModelMock.create.mock.calls[0] as [
        { passwordHash: string },
      ];
      expect(createArg.passwordHash).toMatch(/^\$2b\$/);
      expect(createArg.passwordHash).not.toBe('Test@123!');
    });

    it('throws ConflictException when email already exists', async () => {
      // Simulate an existing account for the same email.
      userModelMock.findOne.mockResolvedValue({ email: 'test@example.com' });

      await expect(service.register(makeRegisterDto())).rejects.toThrow(
        ConflictException,
      );

      // No user should be created if one already exists.
      expect(userModelMock.create).not.toHaveBeenCalled();
    });

    it('sends email verification notification on registration', async () => {
      await service.register(makeRegisterDto());

      expect(notifQueueMock.add).toHaveBeenCalledWith(
        'send-email-verification',
        expect.objectContaining({
          email: 'test@example.com',
          userId: MOCK_USER_ID,
          token: expect.any(String),
        }),
      );
    });

    it('returns accessToken and user response without passwordHash', async () => {
      const result = await service.register(makeRegisterDto());

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.user.email).toBe('test@example.com');
      // toUserResponse() strips passwordHash — it must not leak into the response.
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('lowercases email before saving', async () => {
      await service.register(makeRegisterDto({ email: 'Test@Example.COM' }));

      const [createArg] = userModelMock.create.mock.calls[0] as [
        { email: string },
      ];
      expect(createArg.email).toBe('test@example.com');
    });

    it('creates stylistProfile when role is stylist', async () => {
      const stylistUser = {
        ...mockCreatedUser,
        email: 'stylist@example.com',
        role: UserRole.STYLIST,
        stylistProfile: {
          bio: 'Hair colour specialist',
          specialties: ['coloring', 'highlights'],
          yearsExperience: 3,
          portfolioImages: [],
          portfolioReviews: [],
          currentSalonId: null,
          joinRequestStatus: 'none',
          salonInvitations: [],
          isAvailable: true,
          workingHours: [],
        },
      };
      userModelMock.create.mockResolvedValue(stylistUser);

      await service.register(
        makeRegisterDto({
          email: 'stylist@example.com',
          role: UserRole.STYLIST,
          stylistProfile: {
            bio: 'Hair colour specialist',
            specialties: ['coloring', 'highlights'],
            yearsExperience: 3,
          },
        }),
      );

      const [createArg] = userModelMock.create.mock.calls[0] as [
        { stylistProfile: Record<string, unknown> },
      ];
      expect(createArg.stylistProfile).toBeDefined();
      expect(createArg.stylistProfile.bio).toBe('Hair colour specialist');
      expect(createArg.stylistProfile.specialties).toEqual(
        expect.arrayContaining(['coloring', 'highlights']),
      );
      // Invariant defaults that the service always sets.
      expect(createArg.stylistProfile.portfolioReviews).toEqual([]);
      expect(createArg.stylistProfile.currentSalonId).toBeNull();
      expect(createArg.stylistProfile.joinRequestStatus).toBe('none');
    });
  });

  // ── describe('login') ─────────────────────────────────────────────────────

  describe('login', () => {
    /** Override findOne for the login path: needs .select('+passwordHash') chain. */
    function stubFindOneForLogin(user: unknown) {
      userModelMock.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });
    }

    beforeEach(() => {
      // Default for all login tests: valid user with pre-hashed password.
      stubFindOneForLogin(loginUser);
    });

    it('returns tokens for valid credentials', async () => {
      const result = await service.login({
        email: 'test@example.com',
        password: VALID_PASSWORD,
      } as LoginDto);

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.user.email).toBe('test@example.com');
    });

    it('throws UnauthorizedException for wrong password', async () => {
      // bcrypt.compare('WrongPassword1!', VALID_PASSWORD_HASH) → false
      await expect(
        service.login({ email: 'test@example.com', password: 'WrongPassword1!' } as LoginDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException for non-existent email without leaking info", async () => {
      // findOne().select() returns null → user not found → generic error message.
      stubFindOneForLogin(null);

      const error = await service
        .login({ email: 'nobody@example.com', password: VALID_PASSWORD } as LoginDto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      // The service must NOT distinguish "no account" from "wrong password" —
      // both cases return the same generic message to prevent email enumeration.
      expect((error as UnauthorizedException).message).toBe('Invalid email or password');
    });

    it('throws UnauthorizedException for OAuth-only user (no password)', async () => {
      // User registered via Google — passwordHash is null.
      stubFindOneForLogin({ ...loginUser, passwordHash: null });

      const error = await service
        .login({ email: 'test@example.com', password: VALID_PASSWORD } as LoginDto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      // The error message must mention Google sign-in to guide the user.
      expect((error as UnauthorizedException).message).toContain('Google');
    });
  });

  // ── describe('login - brute force lockout') ───────────────────────────────

  describe('login - brute force lockout', () => {
    // Service constants (mirrored here for readable assertions):
    //   MAX_FAILED_ATTEMPTS = 5
    //   LOCKOUT_TTL_SECONDS = 15 * 60 = 900
    const EMAIL = 'test@example.com';

    beforeEach(() => {
      // All lockout tests hit the password-comparison branch, so findOne must
      // return a user with the .select('+passwordHash') chain.
      userModelMock.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(loginUser),
      });
    });

    it('increments failed attempt counter on wrong password', async () => {
      await service
        .login({ email: EMAIL, password: 'WrongPass1!' } as LoginDto)
        .catch(() => { /* expected rejection */ });

      expect(redisMock.incr).toHaveBeenCalledWith(`login-attempts:${EMAIL}`);
    });

    it('locks account after 5 failed attempts', async () => {
      // Simulate the 5th consecutive failure (= MAX_FAILED_ATTEMPTS).
      redisMock.incr.mockResolvedValue(5);

      await service
        .login({ email: EMAIL, password: 'WrongPass1!' } as LoginDto)
        .catch(() => { /* expected rejection */ });

      expect(redisMock.setex).toHaveBeenCalledWith(
        `login-lockout:${EMAIL}`,
        900,
        '1',
      );
    });

    it('throws UnauthorizedException when account is locked', async () => {
      // redis.get(lockoutKey) returns a truthy value → account locked.
      redisMock.get.mockResolvedValue('1');

      const error = await service
        .login({ email: EMAIL, password: VALID_PASSWORD } as LoginDto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toContain('temporarily locked');
    });

    it('clears failed attempts on successful login', async () => {
      await service.login({ email: EMAIL, password: VALID_PASSWORD } as LoginDto);

      // Service calls: await this.redis.del(attemptsKey, lockoutKey)
      expect(redisMock.del).toHaveBeenCalledWith(
        `login-attempts:${EMAIL}`,
        `login-lockout:${EMAIL}`,
      );
    });
  });

  // ── describe('logout') ────────────────────────────────────────────────────

  describe('logout', () => {
    const ACCESS_TOKEN = 'bearer-access-token-to-blacklist';

    it('blacklists access token in Redis', async () => {
      // Decode returns an exp ~15 min in the future so remainingSeconds > 0.
      const futureExp = Math.floor(Date.now() / 1000) + 900;
      jwtServiceMock.decode.mockReturnValue({ exp: futureExp });

      await service.logout(MOCK_USER_ID, ACCESS_TOKEN);

      // Service: await this.redis.set(`blacklist:${accessToken}`, '1', 'EX', remainingSeconds)
      expect(redisMock.set).toHaveBeenCalledWith(
        `blacklist:${ACCESS_TOKEN}`,
        '1',
        'EX',
        expect.any(Number),
      );
    });
  });

  // ── describe('refreshToken') ──────────────────────────────────────────────

  describe('refreshToken', () => {
    beforeEach(() => {
      // jwtService.verify() (sync) decodes the incoming refresh token.
      jwtServiceMock.verify.mockReturnValue({
        sub: MOCK_USER_ID,
        email: 'test@example.com',
        role: UserRole.CLIENT,
      });

      // findById().select('+refreshToken') returns a user whose stored refreshToken
      // is a bcrypt hash of MOCK_REFRESH_TOKEN (pre-computed with 1 round = fast).
      userModelMock.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          ...mockCreatedUser,
          refreshToken: MOCK_REFRESH_TOKEN_HASH,
        }),
      });
    });

    it('returns new access token for valid refresh token', async () => {
      // MOCK_REFRESH_TOKEN hashes to MOCK_REFRESH_TOKEN_HASH → bcrypt.compare → true.
      const result = await service.refreshToken(MOCK_REFRESH_TOKEN);

      // refreshToken() uses jwtService.sign() (sync) to issue the new access token.
      expect(result.accessToken).toBe('mock-access-token');
    });

    it('throws UnauthorizedException for expired/invalid refresh token', async () => {
      jwtServiceMock.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshToken('bad-or-expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── describe('forgotPassword') ────────────────────────────────────────────

  describe('forgotPassword', () => {
    beforeEach(() => {
      // forgotPassword calls: await userModel.findOne({email}).lean()
      // — needs the .lean() chain.
      userModelMock.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ ...mockCreatedUser }),
      });
    });

    it('generates OTP and stores in Redis with 15-minute TTL', async () => {
      // OTP_TTL_SECONDS = 15 * 60 = 900
      await service.forgotPassword({ email: 'test@example.com' } as ForgotPasswordDto);

      // Service: await this.redis.set(`pwd-reset:${email}`, otp, 'EX', OTP_TTL_SECONDS)
      expect(redisMock.set).toHaveBeenCalledWith(
        'pwd-reset:test@example.com',
        expect.any(String), // random 6-digit OTP
        'EX',
        900,
      );
    });

    it('does NOT throw for non-existent email (no email enumeration)', async () => {
      userModelMock.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null), // unknown email
      });

      // The service must resolve silently — no exception, no Redis write.
      await expect(
        service.forgotPassword({ email: 'ghost@example.com' } as ForgotPasswordDto),
      ).resolves.toBeUndefined();

      expect(redisMock.set).not.toHaveBeenCalled();
    });
  });

  // ── describe('verifyEmail') ───────────────────────────────────────────────

  describe('verifyEmail', () => {
    const VERIFY_TOKEN = 'valid-email-verify-token-abc';

    it('marks user as verified when token is valid', async () => {
      // The user document returned by findById must be mutable (service sets
      // user.isEmailVerified = true and calls user.save()).
      const mockUserDoc = {
        ...mockCreatedUser,
        isEmailVerified: false,
        save: jest.fn().mockResolvedValue(undefined),
      };

      // redis.get('email-verify:<token>') → userId stored at registration time.
      redisMock.get.mockResolvedValue(MOCK_USER_ID);
      userModelMock.findById.mockResolvedValue(mockUserDoc);

      const result = await service.verifyEmail(VERIFY_TOKEN);

      // Service must mutate the document and persist it.
      expect(mockUserDoc.isEmailVerified).toBe(true);
      expect(mockUserDoc.save).toHaveBeenCalled();
      expect(result.message).toContain('verified');
    });

    it('throws when verification token is expired or invalid', async () => {
      // redis.get returns null → token not found → service throws BadRequestException.
      redisMock.get.mockResolvedValue(null);

      await expect(service.verifyEmail('expired-token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
