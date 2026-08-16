import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptor/response';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = process.env.PORT || 3000;
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.setGlobalPrefix('api/v1');

  // Configure Swagger OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Sports Venue Management Platform API')
    .setDescription(
      `## Overview
The REST API documentation for the **Sports Venue Management Platform**.
All endpoints (except public authentication and dashboard routes) require a Bearer JWT token in the \`Authorization\` header.

### Global Response Wrapper
All successful responses are returned in the following structure:
\`\`\`json
{
  "success": true,
  "statusCode": 200,
  "message": "done",
  "data": { ... }
}
\`\`\`

### Real-Time WebSocket Gateway
- **URL**: \`ws://<host>:<port>\` (Socket.IO)
- **Events**:
  - \`join_venue\`: \`{ "venueId": "..." }\` -> Emits \`joined_venue\`
  - \`leave_venue\`: \`{ "venueId": "..." }\` -> Emits \`left_venue\`
  - Listen for \`slot_locked\`, \`slot_released\`, \`booking_confirmed\` on room \`venue_<venueId>\`.
  - Listen for \`owner_<ownerId>\` for real-time owner booking notifications.`,
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your JWT access token (Bearer <token>)',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'Customer mobile OTP login, Google OAuth & Dashboard Admin authentication')
    .addTag('Users', 'User profile, customer list, and admin management')
    .addTag('Venues', 'Sports venues, court working hours, multi-image upload, and pricing')
    .addTag('Amenities', 'Venue facility features (Parking, Showers, WiFi, Lockers, etc.)')
    .addTag('Bookings', 'Slot reservations, QR code verification, cancellation, and status updates')
    .addTag('Payments', 'Wallet payments, cash settlements, Paymob webhook, and refunds')
    .addTag('Coupons', 'Promotional discounts (fixed & percentage) and validation')
    .addTag('Wallet', 'Digital wallet balance, deposit, deduction, and transaction history')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: 'Sports Venue Management API Docs',
  });

  await app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`Swagger API Docs available at: http://localhost:${port}/api/docs`);
  });
}
bootstrap();
