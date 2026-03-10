import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

export interface SharedAuthModuleOptions {
  jwtSecret: string;
}

@Global()
@Module({})
export class SharedAuthModule {
  static forRoot(options?: SharedAuthModuleOptions): DynamicModule {
    return {
      module: SharedAuthModule,
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService): JwtModuleOptions => {
            const secret =
              options?.jwtSecret ||
              configService.get<string>('jwt.accessSecret') ||
              configService.get<string>('JWT_SECRET') ||
              'default-secret';
            const expiresIn = configService.get<string>('jwt.accessExpiresIn') || '1h';

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return {
              secret,
              signOptions: { expiresIn: expiresIn as any },
            };
          },
        }),
      ],
      providers: [JwtStrategy, JwtAuthGuard, RolesGuard],
      exports: [JwtStrategy, JwtAuthGuard, RolesGuard, JwtModule, PassportModule],
    };
  }
}
