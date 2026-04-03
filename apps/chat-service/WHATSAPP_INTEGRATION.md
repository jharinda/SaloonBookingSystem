# Chat Service - WhatsApp Integration

## Environment Variables

Add the following environment variables to configure WhatsApp integration:

### WhatsApp API Configuration

```bash
# WhatsApp Verify Token (for webhook verification)
# This is a token you choose and set in Meta's Webhook settings
WHATSAPP_VERIFY_TOKEN=your_secure_verify_token_here

# WhatsApp Access Token (from Meta Business API)
# Get this from your Meta Business App
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token_here

# WhatsApp Phone Number ID (from Meta Business API)
# This is the ID of your WhatsApp Business phone number
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here

# Mapping of WhatsApp phone numbers to Salon IDs
# Format: "phone1:salonId1,phone2:salonId2"
# Example: "+14155552671:507f1f77bcf86cd799439011,+14155552672:507f1f77bcf86cd799439012"
WHATSAPP_PHONE_TO_SALON_ID="+14155552671:507f1f77bcf86cd799439011"

# Notification Service URL (for FCM push notifications)
NOTIFICATION_SERVICE_URL=http://localhost:3004
```

## Setup Instructions

### 1. Create Meta Business App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new Business App
3. Add WhatsApp product to your app
4. Get your Phone Number ID and Access Token

### 2. Configure Webhook

1. In Meta Business settings, configure webhook URL:
   - URL: `https://your-domain.com/api/chat/webhooks/whatsapp`
   - Verify Token: Same as `WHATSAPP_VERIFY_TOKEN`
2. Subscribe to `messages` webhook field

**For local testing:**
- Use [ngrok](https://ngrok.com/) to expose your local server
- Run: `ngrok http 3009`
- Use the ngrok URL in Meta webhook settings

### 3. Test Webhook

1. Send a test message to your WhatsApp Business number
2. Check chat-service logs for incoming webhook
3. Verify message is saved in MongoDB
4. Confirm real-time notification is sent to salon owner

## API Endpoints

### Webhook Verification (GET)
```
GET /api/chat/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=CHALLENGE_STRING
```

Returns the challenge string if verification succeeds.

### Webhook Handler (POST)
```
POST /api/chat/webhooks/whatsapp
```

Receives WhatsApp message events from Meta.

## Features

- ✅ Receive WhatsApp messages from customers
- ✅ Create/update conversations in MongoDB
- ✅ Real-time Socket.io notifications to salon owner
- ✅ FCM push notifications to salon owner
- ✅ Send WhatsApp replies when salon owner responds
- ✅ Support for text and media messages
- ✅ Automatic routing based on conversation channel

## Architecture

```
WhatsApp User → Meta API → Webhook → ChatService → MongoDB
                                   ↓
                            Socket.io (real-time)
                                   ↓
                            FCM Push (offline)
                                   ↓
                            Salon Owner App

Salon Owner → Angular App → API Gateway → ChatService → WhatsappSendService → Meta API → WhatsApp User
```

## Security Notes

- ✅ Webhook verification using WHATSAPP_VERIFY_TOKEN
- 🔜 Webhook signature validation using X-Hub-Signature-256 header
- ✅ JWT authentication for internal WebSocket connections
- ✅ Access token secured via environment variables

## Future Enhancements

- [ ] Verify webhook signature using X-Hub-Signature-256
- [ ] Support for media messages (images, videos, documents)
- [ ] WhatsApp message templates
- [ ] Auto-reply bot integration via Bull queue
- [ ] Message status tracking (sent, delivered, read)
- [ ] Instagram DM integration (similar architecture)
