import { Inject, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as admin from 'firebase-admin';

import { FCM_PROVIDER } from './fcm.provider';
import { IPushNotificationService } from '../interfaces/notification-channel.interface';

export interface PushNotificationData {
  [key: string]: string;
}

@Injectable()
export class PushNotificationService implements IPushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly authServiceUrl: string;

  constructor(
    @Inject(FCM_PROVIDER)
    private readonly fcmApp: admin.app.App | null,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.authServiceUrl = this.config.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3001',
    );
  }

  /**
   * Send a push notification to a user via FCM.
   *
   * 1. Fetch the user's FCM tokens from auth-service.
   * 2. Send multicast message via Firebase Admin.
   * 3. Clean up invalid tokens by calling auth-service DELETE endpoint.
   *
   * @param userId - The user's ID
   * @param title - Notification title
   * @param body - Notification body text
   * @param data - Optional custom data payload
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: PushNotificationData,
  ): Promise<void> {
    if (!this.fcmApp) {
      this.logger.warn('FCM not initialized — skipping push notification');
      return;
    }

    try {
      // 1. Fetch FCM tokens from auth-service
      const tokens = await this.fetchUserTokens(userId);
      if (tokens.length === 0) {
        this.logger.log(`No FCM tokens found for user ${userId} — skipping push`);
        return;
      }

      // 2. Send multicast message
      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title,
          body,
        },
        data: data ?? {},
        android: {
          priority: 'high',
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
        },
      };

      const response = await admin.messaging(this.fcmApp).sendEachForMulticast(message);

      this.logger.log(
        `FCM sent to user ${userId}: ${response.successCount}/${tokens.length} succeeded`,
      );

      // 3. Clean up invalid tokens
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(tokens[idx]);
          }
        }
      });

      if (invalidTokens.length > 0) {
        await this.cleanupInvalidTokens(invalidTokens);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send FCM push to user ${userId}: ${message}`);
      // Don't rethrow — push notification failure shouldn't break the job
    }
  }

  /**
   * Fetch the user's FCM tokens from auth-service.
   */
  private async fetchUserTokens(userId: string): Promise<string[]> {
    try {
      const url = `${this.authServiceUrl}/api/auth/users/${userId}/fcm-tokens`;
      const response = await firstValueFrom(this.http.get<string[]>(url));
      return response.data ?? [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to fetch FCM tokens for user ${userId}: ${message}`);
      return [];
    }
  }

  /**
   * Clean up invalid FCM tokens by calling auth-service DELETE endpoint.
   */
  private async cleanupInvalidTokens(tokens: string[]): Promise<void> {
    for (const token of tokens) {
      try {
        const url = `${this.authServiceUrl}/api/auth/fcm-token`;
        await firstValueFrom(
          this.http.delete(url, {
            data: { token },
          }),
        );
        this.logger.log(`Cleaned up invalid FCM token: ${token.slice(0, 20)}...`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to cleanup FCM token: ${message}`);
      }
    }
  }
}
