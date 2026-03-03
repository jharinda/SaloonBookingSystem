import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';

import { User, UserDocument } from '../schemas/user.schema';
import { UserRole } from '../dto/register.dto';

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

    // passport-oauth2 throws TypeError if clientID is falsy, so we supply
    // placeholder values when credentials are absent. The strategy is
    // registered but its routes simply won't work until real creds are set.
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
      const googleId = profile.id;
      const email = profile.emails?.[0]?.value?.toLowerCase();
      const firstName = profile.name?.givenName ?? profile.displayName ?? 'Unknown';
      const lastName = profile.name?.familyName ?? '';

      // 1. Try to find by googleId
      let user = await this.userModel.findOne({ googleId });

      if (!user && email) {
        // 2. Try to find existing account by email
        user = await this.userModel.findOne({ email });

        if (user) {
          // Link googleId to an existing email-based account
          user.googleId = googleId;
          user.isEmailVerified = true;
          await user.save();
        } else {
          // 3. Create a new OAuth user — no passwordHash needed
          user = await this.userModel.create({
            googleId,
            email,
            firstName,
            lastName,
            role: UserRole.CLIENT,
            isEmailVerified: true,
            passwordHash: null,
          });
        }
      }

      done(null, user ?? undefined);
    } catch (err) {
      done(err as Error);
    }
  }
}
