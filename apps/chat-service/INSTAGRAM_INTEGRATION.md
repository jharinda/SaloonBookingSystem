# Chat Service - Instagram Messaging Integration

## Environment Variables

Add the following environment variables to configure Instagram messaging:

### Instagram API Configuration

```bash
# Instagram Verify Token (for webhook verification)
# This is a token you choose and set in Meta's Webhook settings
# Can use same token as WhatsApp for convenience
INSTAGRAM_VERIFY_TOKEN=your_secure_verify_token_here

# Instagram Page Access Token (from Meta Business API)
# Get this from your Meta Business App for your Instagram Page
INSTAGRAM_PAGE_ACCESS_TOKEN=your_instagram_page_access_token_here

# Mapping of Instagram Page IDs to Salon IDs
# Format: "pageId1:salonId1,pageId2:salonId2"
# Example: "123456789:507f1f77bcf86cd799439011,987654321:507f1f77bcf86cd799439012"
INSTAGRAM_PAGE_TO_SALON_ID="123456789:507f1f77bcf86cd799439011"

# Notification Service URL (for FCM push notifications)
NOTIFICATION_SERVICE_URL=http://localhost:3004
```

## Setup Instructions

### 1. Create/Configure Meta Business App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Use existing WhatsApp Business App or create a new one
3. Add Instagram product to your app
4. Connect your Instagram Business Account
5. Get your Page Access Token

### 2. Configure Webhook

1. In Meta Business settings, configure webhook URL:
   - URL: `https://your-domain.com/api/chat/webhooks/instagram`
   - Verify Token: Same as `INSTAGRAM_VERIFY_TOKEN`
2. Subscribe to `messages` webhook field

**For local testing:**
- Use [ngrok](https://ngrok.com/) to expose your local server
- Run: `ngrok http 3009`
- Use the ngrok URL in Meta webhook settings

### 3. Test Webhook

1. Send a DM to your Instagram Business account
2. Check chat-service logs for incoming webhook
3. Verify message is saved in MongoDB
4. Confirm real-time notification is sent to salon owner
5. Reply from salon owner
6. Confirm Instagram user receives message

## API Endpoints

### Webhook Verification (GET)
```
GET /api/chat/webhooks/instagram?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=CHALLENGE_STRING
```

Returns the challenge string if verification succeeds.

### Webhook Handler (POST)
```
POST /api/chat/webhooks/instagram
```

Receives Instagram message events from Meta.

## Features

- ✅ Receive Instagram DMs from customers
- ✅ Create/update conversations in MongoDB with `channel: 'instagram'`
- ✅ Real-time Socket.io notifications to salon owner
- ✅ FCM push notifications to salon owner
- ✅ Send Instagram replies when salon owner responds
- ✅ Support for text and image messages
- ✅ Automatic routing based on conversation channel

## Architecture

```
Instagram User → Meta API → Webhook → ChatService → MongoDB
                                    ↓
                            Socket.io (real-time)
                                    ↓
                            FCM Push (offline)
                                    ↓
                            Salon Owner App

Salon Owner → Angular App → API Gateway → ChatService → InstagramSendService → Meta API → Instagram User
```

## Important Notes

### Instagram Messaging Requirements

1. **User Must Initiate**: Instagram policies require the customer to message first. Salons cannot initiate new conversations.

2. **24-Hour Window**: After user sends a message, the business has 24 hours to respond freely. After that, only specific template messages are allowed (not implemented yet).

3. **Instagram Business Account Required**: Your Instagram account must be a Business or Creator account connected to a Facebook Page.

4. **Page Access Token**: Unlike WhatsApp which uses a Phone Number ID, Instagram uses a Page Access Token.

## Message Flow

**Incoming Instagram DMs:**
```
Instagram User → Meta Graph API → POST /webhooks/instagram
  ↓
Parse webhook payload (entry.messaging)
  ↓
Extract: sender.id (PSID), message.text, mid
  ↓
findOrCreateInstagramConversation() [channel='instagram']
  ↓
createMessage() [saves to MongoDB]
  ↓
emitToSalonOwner() [Socket.io real-time]
  ↓
sendPushToSalonOwner() [FCM notification]
```

**Outgoing Replies:**
```
Salon Owner → Angular App → WebSocket 'send_message'
  ↓
ChatGateway.handleSendMessage()
  ↓
ChatService.sendMessage()
  ↓
Checks conversation.channel === 'instagram'
  ↓
InstagramSendService.sendMessage()
  ↓
POST to graph.facebook.com/v18.0/me/messages → Instagram User
```

## Webhook Payload Example

**Incoming Message:**
```json
{
  "object": "instagram",
  "entry": [{
    "id": "PAGE_ID",
    "time": 1682534400,
    "messaging": [{
      "sender": {
        "id": "INSTAGRAM_PSID"
      },
      "recipient": {
        "id": "PAGE_ID"
      },
      "timestamp": 1682534400000,
      "message": {
        "mid": "MESSAGE_ID",
        "text": "Hello, I'd like to book an appointment"
      }
    }]
  }]
}
```

## Security Features

✅ Webhook verification using `INSTAGRAM_VERIFY_TOKEN`  
✅ JWT authentication for WebSocket connections  
✅ Environment-based credentials (no hardcoded tokens)  
✅ Automatic error handling (non-blocking)  

## Channel Badge in Conversation List

The conversation API now includes a `channel` field with values:
- `"internal"` - Internal SnapSalon chat
- `"whatsapp"` - WhatsApp conversation
- `"instagram"` - Instagram DM conversation

Frontend UI should display appropriate channel icons based on this field.

## Chatbot Automation Hook (Future)

After saving each incoming message, you can publish to a Bull queue:

```typescript
await this.queueService.add('chatbot-trigger', {
  conversationId: conversation._id.toString(),
  channel: 'instagram',
  message: messageText,
  salonId,
});
```

This allows a separate chatbot worker to:
- Process the message with AI
- Generate automated replies
- Send responses via InstagramSendService
- Without modifying core chat code

## Differences from WhatsApp

| Feature | WhatsApp | Instagram |
|---------|----------|-----------|
| Identifier | Phone Number | Page-Scoped ID (PSID) |
| Auth Token | Phone Number ID + Access Token | Page Access Token |
| Webhook Object | `whatsapp_business_account` | `instagram` |
| Webhook Field | `messages` in `changes` | `messaging` in `entry` |
| Can Initiate | ✅ Yes (with templates) | ❌ No |
| Message Window | 24 hours | 24 hours |
| Media Support | Images, videos, documents, audio | Images, videos (limited) |

## Troubleshooting

1. **Webhook not receiving messages:**
   - Verify Instagram account is Business/Creator
   - Check Page is connected properly
   - Ensure webhook subscriptions are active
   - Test with Meta's webhook testing tool

2. **Cannot send messages:**
   - Verify Page Access Token is valid
   - Check 24-hour window hasn't expired
   - Ensure PSID is correct

3. **Messages appearing in wrong salon:**
   - Verify `INSTAGRAM_PAGE_TO_SALON_ID` mapping is correct
   - Check Page ID in webhook payload matches mapping

## Future Enhancements

- [ ] Verify webhook signature using X-Hub-Signature-256
- [ ] Support for Instagram Story replies
- [ ] Support for image and video attachments
- [ ] Template messages for outside 24-hour window
- [ ] Instagram Insights integration
- [ ] Auto-reply bot integration via Bull queue
- [ ] Rich media attachments (carousels, quick replies)
