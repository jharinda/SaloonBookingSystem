import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';

import { SalonController } from './salon.controller';
import { SalonService } from './salon.service';
import { Salon, SalonSchema } from './schemas/salon.schema';
import { JwtStrategy } from '../common/strategies/jwt.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([{ name: Salon.name, schema: SalonSchema }]),
  ],
  controllers: [SalonController],
  providers: [SalonService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [SalonService],
})
export class SalonModule {}
