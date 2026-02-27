# SnapSalon Architecture

## Services
- api-gateway (port 3000) — routes all requests, validates JWT
- auth-service (port 3001) — login, register, JWT, Google OAuth
- user-service (port 3002) — client & stylist profiles
- salon-service (port 3003) — salon CRUD, services, staff
- booking-service (port 3004) — appointments, availability
- notification-service (port 3005) — email/SMS/WhatsApp
- calendar-service (port 3006) — Google Calendar & iCal
- review-service (port 3007) — ratings and reviews
- subscription-service (port 3008) — PayHere, plans

## Key Rules
- Services communicate via Redis Bull queues for async events
- Each service has its own MongoDB database
- JWT: access token (15min, in memory) + refresh token (7days, httpOnly cookie)


- strictly use the SOLID principles
