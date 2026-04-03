# User Service Migration Summary

## ✅ What Was Completed

### 1. **Created User Service** (Port 3008)
- Generated new NestJS microservice at `apps/user-service`
- Separate MongoDB database: `snapsalon-users` (not auth-db)
- Connected to Redis for Bull queue processing

### 2. **Migrated Profile Management from Auth Service**
Profile endpoints moved to user-service:
- ✅ `GET /api/users/me` - Get user profile
- ✅ `PATCH /api/users/me` - Update profile (firstName, lastName, phone, timezone, address)
- ✅ `PATCH /api/users/me/notifications` - Update notification preferences
- ✅ `DELETE /api/users/me` - Delete account
- ✅ `PATCH /api/users/me/stylist-profile` - Update stylist bio/specialties
- ✅ `POST /api/users/me/stylist-profile/portfolio-images` - Add portfolio images
- ✅ `DELETE /api/users/me/stylist-profile/portfolio-images/:id` - Remove portfolio image
- ✅ `POST /api/users/me/stylist-profile/portfolio-reviews` - Add portfolio reviews
- ✅ `PATCH /api/users/me/stylist-profile/working-hours` - Update working hours

### 3. **Event-Driven Sync from Auth Service**
- Bull queue: `user-events`
- Processors handle:
  - `user.created` - Creates user profile when new user registers
  - `user.updated` - Syncs basic user data (email, name)
  - `user.deleted` - Removes user profile

**Auth service still owns:** Registration, login, JWT, OAuth, password reset, FCM tokens

### 4. **Updated Infrastructure**

#### API Gateway (`apps/api`)
- Updated `proxy-registry.service.ts`: `/api/users` → `user-service` (was auth-service)
- Added `services.userUrl` configuration

#### Docker Compose
- Added user-service container on port **3008**
  - `USER_MONGODB_URI`: mongodb://mongodb:27017/snapsalon-users
  - Connected to Redis for queues

#### Inter-Service Communication
- Public endpoint: `GET /api/users/:userId/basic-info`
  - Used by booking-service to get client names
  - Returns: firstName, lastName, email

## 📦 Database Schema

### UserProfile Collection
```typescript
{
  userId: string;           // From auth-service (unique)
  email: string;
  firstName: string;
  lastName: string;
  role: string;             // 'client' | 'salon_owner' | 'stylist' | 'admin'
  phone?: string;
  avatarUrl?: string;
  timezone: string;
  address?: {
    street, city, state, zipCode, country
  };
  notificationPreferences: {
    email, sms, whatsapp, push
  };
  stylistProfile?: {
    bio, specialties, yearsExperience,
    portfolioImages[], portfolioReviews[],
    currentSalonId, joinRequestStatus,
    isAvailable, workingHours[]
  };
  createdAt: Date;
  updatedAt: Date;
}
```

## 🔄 Next Steps (Migration Path)

### ⚠️ IMPORTANT: DO NOT delete auth-service user endpoints yet!

### Step 1: Deploy user-service
```bash
# Build and test locally first
npx nx build user-service
npx nx serve user-service

# Verify endpoints work
curl http://localhost:3008/api/users/me \
  -H "Authorization: Bearer <token>"
```

### Step 2: Emit events from auth-service
Add to `apps/auth-service/src/auth/auth.service.ts`:
```typescript
// After creating user in register()
await this.userEventsQueue.add('user.created', {
  userId: user._id.toString(),
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
});
```

### Step 3: Update booking-service
Change from:
```typescript
// OLD:const userResponse = await this.httpService.axiosRef.get(
  `${AUTH_SERVICE_URL}/api/users/${userId}`
);
```
To:
```typescript
// NEW:
const userResponse = await this.httpService.axiosRef.get(
  `${USER_SERVICE_URL}/api/users/${userId}/basic-info`
);
```

### Step 4: Test in production
1. Deploy user-service to production
2. Verify events are flowing (check Bull queue dashboard)
3. Monitor logs for sync errors
4. Gradually migrate frontend calls from auth-service to user-service

### Step 5: Deprecate auth-service user endpoints (later)
Only after full migration and verification:
- Mark routes as deprecated
- Add warning logs
- Eventually remove after grace period

## 🔧 Environment Variables

Add to `.env`:
```bash
# User Service
USER_PORT=3008
USER_MONGODB_URI=mongodb://localhost:27017/snapsalon-users
USER_SERVICE_URL=http://localhost:3008

# Shared
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_ACCESS_SECRET=<same-as-auth-service>
```

## 📝 Files Modified

### New Files
- `apps/user-service/src/user/schemas/user-profile.schema.ts`
- `apps/user-service/src/user/dto/user-profile.dto.ts`
- `apps/user-service/src/user/user.service.ts`
- `apps/user-service/src/user/user.controller.ts`
- `apps/user-service/src/user/user.module.ts`
- `apps/user-service/src/user/processors/user-events.processor.ts`
- `apps/user-service/src/app/app.module.ts`
- `apps/user-service/src/config/configuration.ts`
- `apps/user-service/Dockerfile`

### Modified Files
- `apps/api/src/app/proxy-registry.service.ts` - Routes /api/users to user-service
- `apps/api/src/config/configuration.ts` - Added userUrl
- `docker-compose.yml` - Added user-service container
- `apps/user-service/project.json` - Build configuration
- `apps/user-service/webpack.config.js` - Build output path

## ✅ Verification Checklist

- [x] User-service builds successfully
- [x] API gateway routes /api/users to user-service
- [x] Docker compose includes user-service
- [x] SharedAuthModule integrated for JWT verification
- [x] Bull queue processor ready for auth-service events
- [ ] Auth-service emits user.created events (TODO: next step)
- [ ] Booking-service updated to call user-service (TODO: next step)
- [ ] Frontend updated to use new endpoints (TODO: next step)
- [ ] Avatar upload handled (note: may need coordination with auth-service)
