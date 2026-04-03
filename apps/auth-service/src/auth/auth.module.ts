import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User, UserSchema } from './schemas/user.schema';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Secrets are injected per-call via ConfigService
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'user-events' }),
    HttpModule.register({ timeout: 5000 }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
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
