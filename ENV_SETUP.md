# Environment Variables Setup Guide

This document lists all environment variables required for SnapSalon services. **Never commit `.env` files to Git** — they are already in `.gitignore`.

## Setup Instructions

1. Copy the appropriate `.env.example` file to `.env` in each service directory:
   ```bash
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   cp apps/notification-service/.env.example apps/notification-service/.env
   cp chat-service/.env.example chat-service/.env
   # ... repeat for other services
   ```

2. Fill in the actual values in each `.env` file (see sections below)

## Critical Shared Variables

These MUST be identical across all services:

| Variable | Value | Used By |
|----------|-------|---------|
| `JWT_ACCESS_SECRET` | Min 32 chars | All services |
| `JWT_REFRESH_SECRET` | Min 32 chars | auth-service, others |
| `INTERNAL_SERVICE_TOKEN` | Min 32 chars | api-gateway, notification-service |

## Firebase Configuration (Push Notifications)

### notification-service

| Variable | Description | How to Get |
|----------|-------------|------------|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Admin SDK JSON (single-line string) | Firebase Console → Project Settings → Service Accounts → Generate New Private Key |

**Format:** Entire JSON as a single-line string (escape newlines in private_key with `\\n`)

### web (Angular)

Set in [`apps/web/src/environments/environment.ts`](apps/web/src/environments/environment.ts):

| Variable | Description | How to Get |
|----------|-------------|------------|
| `firebaseConfig.apiKey` | Firebase API key | Firebase Console → Project Settings → General |
| `firebaseConfig.appId` | Firebase App ID | Firebase Console → Project Settings → General |
| `firebaseConfig.projectId` | Firebase Project ID | Firebase Console → Project Settings → General |
| `firebaseConfig.messagingSenderId` | Messaging Sender ID | Firebase Console → Project Settings → General |
| `fcmVapidKey` | Web Push certificate key | Firebase Console → Project Settings → Cloud Messaging → Web Push certificates |

## WhatsApp Business API (chat-service)

| Variable | Description | How to Get |
|----------|-------------|------------|
| `WHATSAPP_VERIFY_TOKEN` | Custom webhook secret (min 32 chars) | Create your own strong random string |
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API permanent token | Meta Business Manager → WhatsApp → API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID | Meta Business Manager → WhatsApp → API Setup |

**Webhook Setup:**
- Webhook URL: `https://your-domain.com/api/chat/webhook/whatsapp`
- Verify Token: Use the value from `WHATSAPP_VERIFY_TOKEN`

## Instagram Business API (chat-service)

| Variable | Description | How to Get |
|----------|-------------|------------|
| `INSTAGRAM_PAGE_ACCESS_TOKEN` | Facebook Page token with `instagram_manage_messages` | Meta Business Manager → Instagram → Settings |
| `INSTAGRAM_VERIFY_TOKEN` | Custom webhook secret (min 32 chars) | Create your own strong random string |

**Webhook Setup:**
- Webhook URL: `https://your-domain.com/api/chat/webhook/instagram`
- Verify Token: Use the value from `INSTAGRAM_VERIFY_TOKEN`

## Service URLs (api-gateway + microservices)

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_SERVICE_URL` | `http://localhost:3003` | auth-service endpoint |
| `USER_SERVICE_URL` | `http://localhost:3003` | user-service endpoint (same as auth) |
| `SALON_SERVICE_URL` | `http://localhost:3001` | salon-service endpoint |
| `BOOKING_SERVICE_URL` | `http://localhost:3002` | booking-service endpoint |
| `CALENDAR_SERVICE_URL` | `http://localhost:3005` | calendar-service endpoint |
| `REVIEW_SERVICE_URL` | `http://localhost:3006` | review-service endpoint |
| `NOTIFICATION_SERVICE_URL` | `http://localhost:3004` | notification-service endpoint |
| `SUBSCRIPTION_SERVICE_URL` | `http://localhost:3007` | subscription-service endpoint |
| `CHAT_SERVICE_URL` | `http://localhost:3009` | chat-service endpoint |

**Docker/Production:** Override these to use service names (e.g., `http://auth-service:3003`)

## Other Third-Party Services

### Google OAuth & Calendar
- See [`.env.example`](.env.example) for `AUTH_GOOGLE_*` and `GOOGLE_*` variables
- Get from Google Cloud Console

### SendGrid (Email)
- `SENDGRID_API_KEY` — Get from SendGrid Dashboard

### Dialog SMS Gateway
- `DIALOG_SMS_API_KEY` — Get from Dialog Sri Lanka

### Cloudinary (Image Uploads)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Get from Cloudinary Dashboard

### PayHere (Payments)
- `PAYHERE_MERCHANT_ID`, `PAYHERE_SECRET`
- Get from PayHere Merchant Dashboard

## Security Checklist

- ✅ `.env` files are in `.gitignore`
- ✅ Never commit secrets to Git
- ✅ Use strong random strings for all secrets (min 32 characters)
- ✅ Rotate secrets regularly in production
- ✅ Use environment-specific values (dev/staging/prod)
- ✅ Store production secrets in secure vaults (AWS Secrets Manager, Azure Key Vault, etc.)

## Verification

After setup, verify all services can start:

```bash
# Start all services
pnpm nx run-many --target=serve --all

# Or start individual services
pnpm nx serve api
pnpm nx serve chat-service
pnpm nx serve notification-service
```

Check logs for "missing environment variable" errors.

## Related Files

- [`.env.example`](.env.example) — Root environment template
- [`apps/api/.env.example`](apps/api/.env.example) — API Gateway template
- [`apps/notification-service/.env.example`](apps/notification-service/.env.example) — Notification service template
- [`chat-service/.env.example`](chat-service/.env.example) — Chat service template
- [`apps/web/src/environments/`](apps/web/src/environments/) — Angular environment files
