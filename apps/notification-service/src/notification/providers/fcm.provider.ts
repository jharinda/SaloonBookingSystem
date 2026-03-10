import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export const FCM_PROVIDER = 'FCM_PROVIDER';

/**
 * Factory provider that initializes Firebase Admin SDK for FCM.
 * Reads FIREBASE_SERVICE_ACCOUNT_KEY from env (JSON string).
 */
export const fcmProvider = {
  provide: FCM_PROVIDER,
  useFactory: (config: ConfigService): admin.app.App | null => {
    const logger = new Logger('FCMProvider');
    const serviceAccountKey = config.get<string>('FIREBASE_SERVICE_ACCOUNT_KEY', '');

    if (!serviceAccountKey) {
      logger.warn('FIREBASE_SERVICE_ACCOUNT_KEY not configured — FCM push disabled');
      return null;
    }

    try {
      const serviceAccount = JSON.parse(serviceAccountKey);
      const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      logger.log('Firebase Admin SDK initialized for FCM');
      return app;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to initialize Firebase Admin: ${message}`);
      return null;
    }
  },
  inject: [ConfigService],
};
