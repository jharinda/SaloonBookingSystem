# Chat UI - Integration Guide

## Overview
Professional, mobile-native chat interface with real-time Socket.io messaging for WhatsApp, Instagram, and SnapSalon channels.

## Features Implemented

### ✅ Layout & UI
- **Left Panel**: Conversation list with avatars, names, last messages, channel badges, and unread counts
- **Right Panel**: Message thread with bubbles, timestamps, typing indicators, and input bar
- **Mobile-responsive**: Sliding panels on screens < 768px
- **Channel badges**: WhatsApp (green), Instagram (gradient), SnapSalon (blue) indicators

### ✅ Real-time Messaging
- Socket.io client service with auto-reconnection
- Live message updates via `new_message` event
- Typing indicators via `user_typing` event
- Message status updates (sent/delivered/read)
- Auto-scroll to bottom when messages arrive

### ✅ Components Created
1. **ChatComponent** (`libs/features/chat/src/lib/chat/`)
   - Full-height flex column layout
   - Signal-based reactive state
   - ViewChild for scroll management
   
2. **SocketService** (`libs/shared/socket/socket.service.ts`)
   - Wraps socket.io-client
   - Observable-based event handling
   - JWT token authentication
   - Configurable socket URL

3. **Chat Models** (`libs/shared/models/src/lib/chat.models.ts`)
   - `Message`, `Conversation`, `TypingIndicator` interfaces
   - `MessageChannel`, `MessageStatus` enums
   - `SendMessagePayload` for sending messages

## Usage

### 1. Import the ChatComponent
```typescript
import { ChatComponent } from '@org/chat';

// In your routing or component
{
  path: 'messages',
  component: ChatComponent
}
```

### 2. Configure Socket URL
The socket service auto-configures from `window.__env.apiUrl` or falls back to `http://localhost:3000`.

To set environment variable in production:
```typescript
// In index.html or environment setup
window.__env = {
  apiUrl: 'https://your-api-url.com'
};
```

### 3. Backend Integration
Ensure your backend emits these Socket.io events:
- `new_message` - When a new message arrives
- `user_typing` - When a user is typing
- `message_status` - When message status changes
- `conversation_updated` - When conversation metadata updates

Listen for these client events:
- `send_message` - When user sends a message
- `typing` - When user is typing

### 4. Authentication
Socket connects with JWT from `localStorage.getItem('access_token')`.
Ensure the token is set after login:
```typescript
localStorage.setItem('access_token', yourJwtToken);
```

## Mobile Behavior
- **Desktop (≥768px)**: Both panels visible side-by-side
- **Mobile (<768px)**: 
  - Shows conversation list by default
  - Tapping a conversation slides in the thread
  - Back button (‹) returns to conversation list

## Scroll Behavior
- Auto-scrolls to bottom when new messages arrive
- Only scrolls if user was already at the bottom
- Smooth scroll animation
- Tracks scroll position to prevent unwanted jumps

## Customization

### Modify Channel Icons
```typescript
// In chat.ts
getChannelIcon(channel: MessageChannel): string {
  switch (channel) {
    case MessageChannel.WHATSAPP:
      return '📱'; // Change this
    // ...
  }
}
```

### Adjust Timestamp Grouping
```typescript
// In chat.ts, shouldShowTimestamp()
return timeDiff > 300000; // 5 minutes - adjust this value
```

### Style Customization
Edit `chat.css` to customize:
- Colors (see `.user-bubble`, `.channel-badge`)
- Bubble shapes (border-radius values)
- Avatar sizes
- Font sizes and spacing

## API Integration
Currently uses mock data. Replace with real API calls:

```typescript
// In loadConversations()
private async loadConversations(): Promise<void> {
  const conversations = await this.http.get<Conversation[]>('/api/conversations').toPromise();
  this.conversations.set(conversations);
}

// In loadMessages()
private async loadMessages(conversationId: string): Promise<void> {
  const messages = await this.http.get<Message[]>(`/api/conversations/${conversationId}/messages`).toPromise();
  this.messages.set(messages);
}
```

## Dependencies
✅ Installed:
- `socket.io-client` - For real-time messaging

## Future Enhancements
- 📎 File attachments
- 📹 Video/voice calls
- 🔍 Search conversations
- 📌 Pin important conversations
- 🔕 Mute notifications
- 📱 Push notifications integration
- ✏️ Edit/delete messages
- ⬇️ Scroll to load older messages (pagination)

## Troubleshooting

### Socket not connecting
1. Check `localStorage` has `access_token`
2. Verify backend Socket.io server is running
3. Check browser console for connection errors
4. Ensure CORS is configured on backend

### Messages not appearing
1. Verify backend emits `new_message` event
2. Check event payload matches `Message` interface
3. Open browser DevTools > Network > WS to see WebSocket traffic

### Mobile panels not sliding
1. Ensure viewport width is < 768px
2. Check CSS transitions are enabled
3. Verify `showConversationList` signal is toggling
