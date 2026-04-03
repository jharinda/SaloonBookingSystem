/**
 * Abstract contract for external messaging channel providers (WhatsApp, Instagram, etc.)
 * used by ChatService. Consumers inject the token — never the concrete implementation.
 *
 * This allows swapping providers (e.g. Meta WhatsApp → Twilio WhatsApp) by
 * changing a single line in the module registration.
 */
export interface ChannelSendService {
  /** Send a text message to the given recipient. */
  sendMessage(recipient: string, body: string): Promise<void>;

  /** Send a media/image message to the given recipient. */
  sendMediaMessage(recipient: string, mediaUrl: string, caption?: string): Promise<void>;
}

/** NestJS injection token for the WhatsApp channel send service. */
export const WHATSAPP_SEND_SERVICE = 'WHATSAPP_SEND_SERVICE';

/** NestJS injection token for the Instagram channel send service. */
export const INSTAGRAM_SEND_SERVICE = 'INSTAGRAM_SEND_SERVICE';
