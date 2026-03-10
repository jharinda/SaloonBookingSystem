import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { FeatureCheckResponse } from './interfaces/subscription-check.interface';

interface CacheEntry {
  data: FeatureCheckResponse;
  expiresAt: number;
}

@Injectable()
export class SubscriptionCheckService {
  private readonly logger = new Logger(SubscriptionCheckService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private subscriptionServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.subscriptionServiceUrl =
      this.configService.get<string>('services.subscriptionUrl') ??
      'http://localhost:3007';
  }

  async checkFeature(salonId: string, feature: string): Promise<boolean> {
    const cacheKey = `${salonId}:${feature}`;
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this.logger.debug(`Cache hit for ${cacheKey}`);
      return cached.data.allowed;
    }

    // Call subscription-service
    try {
      const url = `${this.subscriptionServiceUrl}/api/subscriptions/${salonId}/check-feature`;
      const response = await firstValueFrom(
        this.httpService.get<FeatureCheckResponse>(url, {
          params: { feature },
        }),
      );

      const result = response.data;

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        expiresAt: now + this.CACHE_TTL_MS,
      });

      this.logger.debug(
        `Feature check: salonId=${salonId} feature=${feature} allowed=${result.allowed}`,
      );

      return result.allowed;
    } catch (error) {
      this.logger.error(
        `Failed to check feature ${feature} for salon ${salonId}:`,
        error instanceof Error ? error.message : error,
      );
      // Fail closed (deny access on error)
      return false;
    }
  }

  async getFeatureCheckDetails(
    salonId: string,
    feature: string,
  ): Promise<FeatureCheckResponse> {
    const cacheKey = `${salonId}:${feature}`;
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    // Call subscription-service
    try {
      const url = `${this.subscriptionServiceUrl}/api/subscriptions/${salonId}/check-feature`;
      const response = await firstValueFrom(
        this.httpService.get<FeatureCheckResponse>(url, {
          params: { feature },
        }),
      );

      const result = response.data;

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        expiresAt: now + this.CACHE_TTL_MS,
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to check feature ${feature} for salon ${salonId}:`,
        error instanceof Error ? error.message : error,
      );
      return {
        allowed: false,
        plan: 'unknown',
        reason: 'Unable to verify subscription status',
      };
    }
  }

  clearCache(salonId?: string): void {
    if (salonId) {
      // Clear all entries for a specific salon
      const keysToDelete: string[] = [];
      this.cache.forEach((_, key) => {
        if (key.startsWith(`${salonId}:`)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => this.cache.delete(key));
      this.logger.log(`Cleared cache for salon ${salonId}`);
    } else {
      // Clear entire cache
      this.cache.clear();
      this.logger.log('Cleared entire feature check cache');
    }
  }

  async getPlanLimits(
    salonId: string,
  ): Promise<{ plan: string; maxStaff: number; maxLocations: number; maxStations: number; status: string }> {
    try {
      const url = `${this.subscriptionServiceUrl}/api/subscriptions/${salonId}/plan-limits`;
      const response = await firstValueFrom(
        this.httpService.get<{
          plan: string;
          maxStaff: number;
          maxLocations: number;
          maxStations: number;
          status: string;
        }>(url),
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get plan limits for salon ${salonId}:`,
        error instanceof Error ? error.message : error,
      );
      // Return default starter plan limits on error
      return {
        plan: 'starter',
        maxStaff: 3,
        maxLocations: 1,
        maxStations: 2,
        status: 'unknown',
      };
    }
  }
}
