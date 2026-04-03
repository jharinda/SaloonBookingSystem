import { SendEmailOptions } from '../providers/email.service';
import { SendSmsOptions } from '../providers/sms.service';
import { SendWhatsAppOptions } from '../providers/whatsapp.service';
import { PushNotificationData } from '../providers/push-notification.service';

// ── Email ────────────────────────────────────────────────────────────────────

/**
 * Abstract contract for email delivery providers (SendGrid, SES, Mailgun, etc.).
 * Consumers inject the token — never the concrete implementation.
 */
export interface IEmailService {
  sendEmail(options: SendEmailOptions): Promise<string | null>;
}

/** NestJS injection token for the IEmailService interface. */
export const EMAIL_SERVICE = 'EMAIL_SERVICE';

// ── SMS ──────────────────────────────────────────────────────────────────────

/**
 * Abstract contract for SMS delivery providers (Dialog Axiata, Twilio, etc.).
 * Consumers inject the token — never the concrete implementation.
 */
export interface ISmsService {
  sendSms(options: SendSmsOptions): Promise<string | null>;
}

/** NestJS injection token for the ISmsService interface. */
export const SMS_SERVICE = 'SMS_SERVICE';

// ── WhatsApp ─────────────────────────────────────────────────────────────────

/**
 * Abstract contract for WhatsApp notification providers (Meta Cloud API, etc.).
 * Consumers inject the token — never the concrete implementation.
 */
export interface IWhatsAppService {
  sendMessage(options: SendWhatsAppOptions): Promise<string | null>;
}

/** NestJS injection token for the IWhatsAppService interface. */
export const WHATSAPP_SERVICE = 'WHATSAPP_SERVICE';

// ── Push Notifications ───────────────────────────────────────────────────────

/**
 * Abstract contract for push notification providers (FCM, APNs, OneSignal, etc.).
 * Consumers inject the token — never the concrete implementation.
 */
export interface IPushNotificationService {
  sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: PushNotificationData,
  ): Promise<void>;
}

/** NestJS injection token for the IPushNotificationService interface. */
export const PUSH_NOTIFICATION_SERVICE = 'PUSH_NOTIFICATION_SERVICE';
