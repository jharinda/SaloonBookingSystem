import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User, UserSchema } from './schemas/user.schema';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Secrets are injected per-call via ConfigService
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule implements OnModuleInit {
  private readonly logger = new Logger(AuthModule.name);

  constructor(private readonly googleStrategy: GoogleStrategy) {}

  onModuleInit(): void {
    if (this.googleStrategy.isDisabled) {
      this.logger.warn(
        '⚠️  Google OAuth is not configured. ' +
        'Set AUTH_GOOGLE_CLIENT_ID and AUTH_GOOGLE_CLIENT_SECRET to enable it. ' +
        'The /api/auth/google routes will return errors until credentials are provided.',
      );
    }
  }
}
