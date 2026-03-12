# SnapSalon Chat Message Routing - How It Works

## Overview
When a **client sends a message to a salon**, the message goes into a **conversation** that BOTH parties can see and access.

---

## Message Flow

### 1. **Conversation Structure**
Each conversation has:
- **`clientId`**: The user ID of the client sending messages
- **`salonId`**: The user ID of the salon owner receiving messages
- **`participants`**: Array containing both user IDs `[clientId, salonId]`

### 2. **Creating a Conversation**
When a client clicks "Message" on a salon detail page:
```typescript
// Frontend: libs/features/discover/src/lib/salon-detail/salon-detail.component.ts
openChat() {
  this.router.navigate(['/chat'], {
    state: {
      salon: {
        id: this.salon()._id,      // Salon owner's user ID
        name: this.salon().name,
        avatar: this.salon().avatar
      }
    }
  });
}
```

The chat component then creates/finds a conversation:
```typescript
// Frontend: libs/features/chat/src/lib/chat/chat.ts
this.chatService.createConversation(salonData.id)  // Passes salon owner's user ID as salonId
```

This calls the backend:
```typescript
// Backend: chat-service/src/chat/chat.controller.ts
POST /api/chat/conversations
Body: { salonId: "69b0f9f91bf455d1e2f1a3ab" }  // Salon owner's user ID

// Creates conversation with:
{
  clientId: "69b12b9b1bf455d1e2f1a3c4",  // Current user (client)
  salonId: "69b0f9f91bf455d1e2f1a3ab",   // Salon owner's user ID
  participants: ["69b12b9b1bf455d1e2f1a3c4", "69b0f9f91bf455d1e2f1a3ab"]
}
```

---

## Who Receives Messages?

### ✅ **CLIENT's Inbox** (User who sent the message)
- User: `z@z.com` (client)
- Role: `client`
- Query: `{ clientId: userId }`
- **Result**: Sees all conversations where they are the client

```typescript
// Backend query for clients
{
  isArchived: false,
  clientId: "69b12b9b1bf455d1e2f1a3c4"  // Client's user ID
}
```

### ✅ **SALON OWNER's Inbox** (User receiving the message)
- User: `e@e.com` (salon owner)
- Role: `salon_owner`  
- Query: `{ salonId: userId }`
- **Result**: Sees all conversations where they are the salon

```typescript
// Backend query for salon owners
{
  isArchived: false,
  salonId: "69b0f9f91bf455d1e2f1a3ab"  // Salon owner's user ID
}
```

---

## Real-Time Message Delivery

### When CLIENT sends a message:

1. **Client emits WebSocket event**:
   ```typescript
   socket.emit('send_message', {
     conversationId: "69b1b52e4987909a649800de",
     body: "Hello, when are you available?",
     mediaUrl: null
   });
   ```

2. **Backend saves message to MongoDB**:
   ```typescript
   {
     _id: "...",
     conversationId: "69b1b52e4987909a649800de",
     senderId: "69b12b9b1bf455d1e2f1a3c4",    // Client
     senderName: "Client Name",
     body: "Hello, when are you available?",
     deliveryStatus: "sent",
     createdAt: "2026-03-12T10:15:00Z"
   }
   ```

3. **Backend broadcasts to conversation room**:
   ```typescript
   // All users in this conversation room receive:
   server.to(conversationId).emit('new_message', {
     message: { /* message object */ }
   });
   ```

4. **Salon owner receives real-time notification**:
   - If they're online and in the chat page: **Instant message appears**
   - If they're offline: **Push notification sent via FCM**
   ```typescript
   POST http://localhost:3004/api/notifications/push
   {
     userId: "69b0f9f91bf455d1e2f1a3ab",  // Salon owner
     title: "New message from Client Name",
     body: "Hello, when are you available?",
     data: {
       type: "new_message",
       conversationId: "69b1b52e4987909a649800de",
       senderId: "69b12b9b1bf455d1e2f1a3c4"
     }
   }
   ```

---

## Example: Complete Message Flow

### Scenario
**Client** (z@z.com) sends message to **Salon Owner** (e@e.com)

```
[CLIENT]                                [CHAT SERVICE]                    [SALON OWNER]
   |                                          |                                  |
   | 1. Click "Message" on salon page         |                                  |
   |----------------------------------------->|                                  |
   |                                          |                                  |
   | 2. Create conversation                   |                                  |
   |    POST /chat/conversations              |                                  |
   |    { salonId: "salon-owner-user-id" }    |                                  |
   |----------------------------------------->|                                  |
   |                                          | Create conversation              |
   |                                          | - clientId: client-user-id       |
   |                                          | - salonId: salon-owner-user-id   |
   |                                          |                                  |
   | 3. Connect to WebSocket                  |                                  |
   |    ws://localhost:3009/chat              |                                  |
   |----------------------------------------->|                                  |
   |                                          |                                  |
   | 4. Join conversation room                |                                  |
   |    emit('join_conversation',             |                                  |
   |          { conversationId })             |                                  |
   |----------------------------------------->|                                  |
   |                                          |                                  |
   | 5. Send message                          |                                  |
   |    emit('send_message', { body })        |                                  |
   |----------------------------------------->|                                  |
   |                                          | Save to MongoDB                  |
   |                                          | Broadcast to room                |
   |                                          |--------------------------------->|
   |                                          | emit('new_message')              | ✅ Message received!
   |                                          |                                  |
   |                                          | Send push notification           |
   |                                          |--------------------------------->|
   |                                          | POST /notifications/push         | 🔔 Push notification!
   |                                          |                                  |
```

---

## Persistence

Messages are **permanently stored** in MongoDB:

```javascript
// Messages Collection
{
  _id: ObjectId("..."),
  conversationId: ObjectId("69b1b52e4987909a649800de"),
  senderId: ObjectId("69b12b9b1bf455d1e2f1a3c4"),
  senderName: "Client Name",
  senderRole: "client",
  body: "Hello, when are you available?",
  mediaUrl: null,
  channel: "internal",
  deliveryStatus: "sent",
  isDeleted: false,
  createdAt: ISODate("2026-03-12T10:15:00Z")
}

// Conversations Collection
{
  _id: ObjectId("69b1b52e4987909a649800de"),
  participants: [
    ObjectId("69b12b9b1bf455d1e2f1a3c4"),  // Client
    ObjectId("69b0f9f91bf455d1e2f1a3ab")   // Salon owner
  ],
  clientId: ObjectId("69b12b9b1bf455d1e2f1a3c4"),
  salonId: ObjectId("69b0f9f91bf455d1e2f1a3ab"),
  channel: "internal",
  lastMessage: {
    body: "Hello, when are you available?",
    senderId: ObjectId("69b12b9b1bf455d1e2f1a3c4"),
    sentAt: ISODate("2026-03-12T10:15:00Z")
  },
  lastReadAt: [
    {
      userId: ObjectId("69b12b9b1bf455d1e2f1a3c4"),
      readAt: ISODate("2026-03-12T10:15:05Z")
    }
  ],
  isArchived: false,
  createdAt: ISODate("2026-03-12T10:14:00Z"),
  updatedAt: ISODate("2026-03-12T10:15:00Z")
}
```

---

## Summary

**When a client sends a message to a salon:**

1. ✅ **Client's inbox** shows the conversation
2. ✅ **Salon owner's inbox** shows the conversation  
3. ✅ **Both users** can see all messages in the conversation
4. ✅ Messages are **persisted** to MongoDB
5. ✅ **Real-time delivery** via WebSocket if users are online
6. ✅ **Push notifications** sent if users are offline
7. ✅ **Read receipts** and **typing indicators** work for both parties

The salon owner receives messages in their chat inbox, accessible via the Messages/Chat page in the application.
