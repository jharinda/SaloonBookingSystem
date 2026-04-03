# SnapSalon — Copilot Instructions

## Stack
- Frontend: Angular 17+ (standalone components, signals, OnPush)
- Backend: NestJS with microservices architecture
- Database: MongoDB with Mongoose
- Language: TypeScript everywhere, strict mode ON

## Conventions
- All NestJS services use constructor injection (never property injection)
- All DTOs use class-validator decorators (@IsString, @IsEmail, etc.)
- All controllers return typed response DTOs, never raw DB documents
- Naming: CreateSalonDto, UpdateSalonDto, SalonResponseDto
- Use async/await, never raw Promises or .then() chains
- Error handling: throw NestJS HttpException with proper status codes

## Dependency Inversion Principle (DIP)
- External services (file upload, email, SMS, payment, etc.) MUST be accessed through an abstract interface, never a concrete implementation
- Define a TypeScript interface + injection token for each external concern (e.g. `FileUploadService`, `EMAIL_SERVICE`)
- Concrete implementations (Cloudinary, S3, SendGrid, etc.) implement the interface and are registered via `useClass` in the module
- Controllers and business services inject the token/interface — never the concrete class
- This allows swapping providers (e.g. Cloudinary → S3) by changing ONE line in the module

## File Structure per NestJS Service
src/
  module-name/
    dto/          # Request/response DTOs
    schemas/      # Mongoose schemas
    module-name.controller.ts
    module-name.service.ts
    module-name.module.ts

## Angular Conventions
- Standalone components only (no NgModule)
- Use inject() function instead of constructor injection
- All HTTP calls go through a dedicated service, never in components
- Use signals for local component state
