import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';

import { User, UserDocument } from '../schemas/user.schema';

/** Returned by validate() when the Google account has no local user yet. */
export interface GooglePendingProfile {
  pending: true;
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);
  /** True when OAuth credentials are absent — routes will fail gracefully. */
  readonly isDisabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    const clientId     = configService.get<string>('google.clientId', '');
    const clientSecret = configService.get<string>('google.clientSecret', '');
    const callbackUrl  = configService.get<string>(
      'google.callbackUrl',
      'http://localhost:3003/api/auth/google/callback',
    );

    const disabled = !clientId || !clientSecret;

    super({
      clientID:     disabled ? 'GOOGLE_OAUTH_DISABLED' : clientId,
      clientSecret: disabled ? 'GOOGLE_OAUTH_DISABLED' : clientSecret,
      callbackURL:  callbackUrl,
      scope: ['email', 'profile'],
    });

    this.isDisabled = disabled;
    if (disabled) {
      this.logger.warn(
        'Google OAuth disabled — AUTH_GOOGLE_CLIENT_ID / AUTH_GOOGLE_CLIENT_SECRET not configured.',
      );
    }
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const googleId  = profile.id;
      const email     = profile.emails?.[0]?.value?.toLowerCase();
      const firstName = profile.name?.givenName ?? profile.displayName ?? 'Unknown';
      const lastName  = profile.name?.familyName || firstName;
      const photoUrl  = profile.photos?.[0]?.value ?? null;

      // 1. Try to find by googleId
      let user = await this.userModel.findOne({ googleId });

      if (!user && email) {
        // 2. Try to find existing account by email
        user = await this.userModel.findOne({ email });

        if (user) {
          // Link googleId to the existing email-based account
          user.googleId = googleId;
          user.isEmailVerified = true;
          if (photoUrl && !user.avatarUrl) user.avatarUrl = photoUrl;
          await user.save();
        }
      }

      // 3. No existing account — return a pending profile; the user must
      //    choose their account type before the account is created.
      if (!user) {
        if (!email) {
          return done(new UnauthorizedException('Google account has no email address'));
        }
        const pending: GooglePendingProfile = {
          pending: true,
          googleId,
          email,
          firstName,
          lastName,
          avatarUrl: photoUrl,
        };
        return done(null, pending as unknown as Express.User);
      }

      if (user.isActive === false) {
        return done(
          new UnauthorizedException(
            'Your account has been suspended. Please contact support.',
          ),
        );
      }

      done(null, user);
    } catch (err) {
      done(err as Error);
    }
  }
}
