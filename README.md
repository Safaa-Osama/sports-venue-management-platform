# 🏟️ Sports Venue Management Platform (ArenaHub API)

[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%209.x-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-Upstash%20%2F%20In--Memory-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Real--Time%20Events-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![AWS S3](https://img.shields.io/badge/AWS%20S3%20%2F%20Cloudflare%20R2-Storage-FF9900?style=for-the-badge&logo=amazons3&logoColor=white)](https://aws.amazon.com/s3/)
[![Paymob](https://img.shields.io/badge/Paymob-Payment%20Gateway-0072CE?style=for-the-badge)](https://paymob.com/)
[![Swagger](https://img.shields.io/badge/OpenAPI%203.0-Swagger%20Docs-85EA2D?style=for-the-badge&logo=swagger&logoColor=black)](http://localhost:3000/api/docs)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

> A modern, scalable, enterprise-grade backend REST & WebSocket API built with **NestJS 11** for sports complexes, stadium reservations, real-time slot concurrency locking, digital wallet ledger accounting, payment gateway integration, QR ticket verification, and multi-tier venue management.

---

## 📋 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Key Features](#-key-features)
- [System Architecture Flow](#-system-architecture-flow)
- [Tech Stack](#-tech-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [Environment Variables](#-environment-variables)
- [Database Seeding](#-database-seeding)
- [Running the Application](#-running-the-application)
- [API Documentation (Swagger UI)](#-api-documentation-swagger-ui)
- [Core Endpoints Overview](#-core-endpoints-overview)
- [Real-Time WebSocket Gateway](#-real-time-websocket-gateway)
- [Payment & Wallet System](#-payment--wallet-system)
- [Concurrency & Idempotency Engine](#-concurrency--idempotency-engine)
- [Role-Based Access Control (RBAC)](#-role-based-access-control-rbac)
- [Automated Scheduled Tasks (Cron)](#-automated-scheduled-tasks-cron)
- [Testing](#-testing)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview & Architecture

**ArenaHub** provides a centralized backend solution for managing sports arenas, football pitches, padel courts, tennis centers, and multi-sport facilities. The platform handles end-to-end customer bookings, instantaneous slot locking across concurrent users, digital payments, automated notifications, and on-site staff verification via QR codes.

### Key Highlights:
- **Clean Architecture & Domain Separation**: Modular NestJS structure following Repository Pattern, Dependency Injection, and Single Responsibility Principles.
- **Race Condition Prevention**: Distributed slot locking and idempotency protection using Redis to guarantee zero double bookings.
- **Bi-Directional Communication**: Instant WebSocket updates to synchronize field calendar views across all connected clients.
- **Financial Integrity**: Digital wallet transaction ledger, automated refunds on cancellation, cash settlement workflows, and Paymob HMAC SHA-512 webhook validation.
- **Enterprise Storage**: S3-compatible cloud storage (AWS S3 / Cloudflare R2) for high-resolution venue photo galleries and customer profile avatars.

---

## 🚀 Key Features

### 🏟️ Venue & Court Management
- Manage venues with operating hours (e.g. 08:00 – 24:00), GPS coordinates (latitude/longitude), address, and multi-sport categorization (`Football`, `Padel`, `Tennis`, `Basketball`, etc.).
- Flexible pricing matrix: Default hourly price + custom hourly price rules (e.g. higher peak rates for prime night slots).
- Multi-image gallery uploads directly to AWS S3 / Cloudflare R2 with image deletion and presigned URLs.
- Global amenities catalog (Parking, Showers, Floodlights, WiFi, Lockers, Changing Rooms).

### ⏱️ Real-Time Booking & Concurrency Engine
- Reserve individual time slots with conflict validation across dates and hours.
- **Distributed Locking with Redis**: Prevents competing users from booking the same court time simultaneously.
- **Idempotency Key Verification**: Protects against duplicate reservation requests during network retries.
- **WebSocket Broadcasts**: Emits `slot_locked`, `slot_released`, and `booking_confirmed` events in real time to venue-specific rooms.
- **Automated Expired Cleanup**: Scheduled NestJS Cron job clears unpaid reservations past their hold expiration and releases slots automatically.

### 🎟️ Instant QR Code & Ticket Verification
- Generates high-resolution base64 QR codes and human-readable 6-character booking codes (`BKXXXX`).
- On-site venue reception verification endpoint to validate tickets upon player arrival.

### 💳 Payment & Wallet Infrastructure
- **Paymob Gateway Integration**: Supports Cards, Mobile Wallets, and Kiosk payments. Processes both Intention API and Legacy Paymob Webhook formats with HMAC SHA-512 signature authentication.
- **Digital Wallet**: Dedicated balance account per customer. Supports instant deposits, deductions, booking checkout, and automatic wallet refunds upon booking cancellation.
- **Cash / Pay-at-Venue**: Allows reservations with cash settlement, enabling venue staff to mark payments as paid on arrival.
- **Full Transaction Ledger**: Audit trail of every deposit, debit, booking charge, and refund.

### 🏷️ Promotional Coupons & Discounts
- Create percentage or fixed value discount coupons.
- Set start/end validity dates and maximum usage quotas.
- Interactive coupon validation endpoint calculating checkout discounts dynamically.

### 🔐 Authentication & Role-Based Access Control (RBAC)
- **Customer Auth**: Phone number SMS OTP verification and Google OAuth 2.0 (`google-auth-library`).
- **Dashboard Staff Auth**: Email and bcrypt-hashed password authentication with JWT Bearer access & refresh tokens.
- **6-Tier Permission Roles**: `superAdmin`, `admin`, `owner`, `manager`, `customer`, `user`.

### 📢 Banner Advertisements & Inquiries
- Publish dashboard banner advertisements across placements (`DASHBOARD_TOP`, `DASHBOARD_MIDDLE`, `DASHBOARD_SIDEBAR`).
- Live click-through rate (CTR) tracking with impression & click logging.
- Priority drag-and-drop reordering, scheduling (start/end dates), and real-time refresh broadcasting.
- Public contact and advertising inquiry form with admin lifecycle status tracking.

### 📊 Executive Reports & Business Intelligence
- Comprehensive operational and financial reports across 9 analytical dimensions.
- Revenue breakdown (gross vs net, cash vs card vs wallet, deposit splits).
- Pitch occupancy and 24-hour demand utilization curves.
- Customer retention, booking conversion funnel, repeat booking frequency, and LTV.
- Automated owner commission calculations, net payouts, and dispute auditing.

### 🔔 Mobile Push Notifications
- Built-in Expo Push Notification engine with automatic device token management for both authenticated users and anonymous guest devices.
- Event-driven push notifications for booking confirmations, slot releases, payment reminders, and promotional campaigns.

---

## 🏗️ System Architecture Flow

```mermaid
flowchart TD
    subgraph Clients["Frontend & Client Apps"]
        CustomerApp["Mobile App (Flutter / React Native)"]
        AdminDashboard["Admin Dashboard (React / Next.js)"]
        GateStaff["Venue Reception / Scanner"]
    end

    subgraph Gateway["NestJS API Gateway & Middleware"]
        Helmet["Helmet Security & CORS"]
        Pipes["Validation Pipes (Class Validator)"]
        AuthGuard["JWT & RBAC Guards"]
        Interceptors["Global Response & Multer Interceptors"]
    end

    subgraph CoreModules["Core Application Modules"]
        AuthMod["Auth Module (OTP & Google OAuth)"]
        VenueMod["Venue & Amenities Module"]
        BookingMod["Booking Engine & Slot Manager"]
        PaymentMod["Payment Module (Paymob & Wallet)"]
        AdMod["Advertisement & Inquiries Module"]
        SocketGateway["Socket.IO WebSocket Gateway"]
    end

    subgraph Infrastructure["Data & Cloud Services"]
        Mongo[("MongoDB Atlas (Database)")]
        RedisDB[("Redis (Locks & Idempotency)")]
        S3Storage[("AWS S3 / Cloudflare R2 (Media)")]
        PaymobAPI["Paymob Gateway"]
        SMTP["Nodemailer (SMTP Mailer)"]
    end

    CustomerApp -->|HTTP REST & WS| Gateway
    AdminDashboard -->|HTTP REST| Gateway
    GateStaff -->|Verify QR / Booking Code| Gateway

    Gateway --> Pipes --> AuthGuard --> Interceptors --> CoreModules

    BookingMod <-->|Distributed Locks & Keys| RedisDB
    BookingMod -->|Persist Bookings| Mongo
    BookingMod -->|Emit Events| SocketGateway
    SocketGateway -.->|Real-time Events| CustomerApp
    SocketGateway -.->|Owner Notifications| AdminDashboard

    VenueMod -->|Upload Images| S3Storage
    VenueMod --> Mongo
    PaymentMod -->|Verify HMAC & Webhook| PaymobAPI
    PaymentMod --> Mongo
    AuthMod --> Mongo
    AuthMod -.->|Send Email Alerts| SMTP
```

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
|---|---|---|
| **Framework** | [NestJS 11](https://nestjs.com/) | Progressive Node.js framework for scalable server-side systems |
| **Language** | [TypeScript 5.7](https://www.typescriptlang.org/) | Strongly typed JavaScript |
| **Database** | [MongoDB](https://www.mongodb.com/) / [Mongoose 9](https://mongoosejs.com/) | Document database with schema modeling |
| **Cache & Lock** | [Redis 6](https://redis.io/) / [Upstash](https://upstash.com/) | In-memory distributed lock & caching |
| **Real-Time** | [Socket.IO 4](https://socket.io/) / `@nestjs/websockets` | Bi-directional event communication |
| **Storage** | [AWS SDK v3 S3](https://aws.amazon.com/sdk-for-javascript/) / Cloudflare R2 | Object storage for venue and avatar assets |
| **Payment** | [Paymob Egypt](https://paymob.com/) | Credit/Debit cards, digital wallets & webhook processing |
| **Authentication** | `@nestjs/jwt`, `bcrypt`, `google-auth-library` | JWT tokens, password hashing, and Google ID token validation |
| **Scheduling** | `@nestjs/schedule` | Cron tasks for automated booking expiry cleanup |
| **Security** | `helmet`, `crypto-js`, `class-validator` | Security headers, request validation, payload encryption |
| **Documentation** | `@nestjs/swagger` | OpenAPI 3.0 interactive API playground |
| **Testing** | [Jest](https://jestjs.io/), [Supertest](https://github.com/ladjs/supertest) | Unit and End-to-End (E2E) test suites |

---

## 📁 Project Directory Structure

```text
sports-venue-management-platform/
├── .env.development              # Local/Dev environment configuration
├── .env.example                  # Template of required environment variables
├── eslint.config.mjs             # ESLint configuration
├── nest-cli.json                 # NestJS CLI configuration
├── package.json                  # NPM scripts and project dependencies
├── tsconfig.json                 # TypeScript compiler configuration
├── src/
│   ├── main.ts                   # Application bootstrap, Swagger, Pipes & Helmet
│   ├── app.module.ts             # Root application module & DB connection
│   ├── app.controller.ts         # Base health checks
│   ├── app.service.ts            # Base application service
│   ├── seed-admin.ts             # Initial SuperAdmin database seeder
│   │
│   ├── common/                   # Shared architectural utilities
│   │   ├── decorator/            # @auth(), @User(), @AtLeastOne()
│   │   ├── enums/                # Booking, User, Wallet, Coupon, Ad enums
│   │   ├── guards/               # Authentication & RBAC Authorization guards
│   │   ├── integration/          # Paymob gateway service, HMAC validator & types
│   │   ├── interceptor/          # Global response wrapper, error handling & multer
│   │   ├── pipes/                # User & file validation pipes
│   │   ├── repositories/         # BaseRepository & MongoDB entity repositories
│   │   └── services/             # Redis service, S3 service, Mailer service
│   │
│   ├── modules/                  # Feature domain modules
│   │   ├── auth/                 # Customer OTP, Google OAuth & Admin login
│   │   ├── user/                 # User profiles, staff accounts & customer list
│   │   ├── venue/                # Venues, working hours, pricing & S3 galleries
│   │   ├── booking/              # Slot reservation, Redis locks, QR codes & WS gateway
│   │   ├── payment/              # Paymob checkout, webhook listener & cash settlement
│   │   ├── wallet/               # Digital wallet, deposits, deductions & ledger
│   │   ├── coupon/               # Promotional discount codes & calculator
│   │   ├── amenities/            # Master sports venue amenities catalog
│   │   ├── advertisement/        # Banner ads, scheduling, impressions & CTR tracking
│   │   └── contact/              # Contact forms & sponsorship inquiry handling
│   │
│   └── utilis/                   # Helper functions (encryption, date tools)
└── test/
    ├── jest-e2e.json             # End-to-End test configuration
    └── booking.e2e-spec.ts       # Booking suite e2e integration tests
```

---

## 📦 Prerequisites

Ensure you have the following installed on your local environment:
- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Package Manager**: `npm` (v10+), `yarn`, or `pnpm`
- **MongoDB**: A running local instance or a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster connection string
- **Redis**: A running local Redis server or an [Upstash Redis](https://upstash.com/) cloud instance
- **AWS S3 / Cloudflare R2 Bucket**: For image uploads (optional in mock environments)
- **Paymob Merchant Account**: For processing live card payments and webhook testing

---

## ⚙️ Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/Safaa-Osama/sports-venue-management-platform.git
cd sports-venue-management-platform
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the `.env.example` file to `.env.development`:
```bash
cp .env.example .env.development
```
Open `.env.development` and populate it with your database URIs, Redis credentials, JWT secrets, and AWS/Paymob keys.

---

## 🔑 Environment Variables

| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | HTTP server port | `3000` |
| `ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost:3000,http://localhost:5000` |
| `DB_URI_ATLAS` | MongoDB Atlas / replica connection string | `mongodb+srv://user:pass@cluster.mongodb.net/` |
| `DB_LOCAL` | Local MongoDB fallback string | `mongodb://127.0.0.1:27017/SportVenues` |
| `REDIS_URI` | Redis connection URI (supports `redis://` or `rediss://`) | `rediss://default:pass@host:6379` |
| `SALT_ROUND` | Salt rounds for bcrypt hashing | `10` |
| `SECRET_KEY_USER` | Secret key for customer JWT tokens | `userSecretKeyString` |
| `SECRET_KEY_ADMIN` | Secret key for staff/admin JWT tokens | `adminSecretKeyString` |
| `REFRESH_SECRET_KEY_USER`| Refresh token secret for customers | `userRefreshSecretString` |
| `REFRESH_SECRET_KEY_ADMIN`| Refresh token secret for admins | `adminRefreshSecretString` |
| `ENCRYPTION_KEY` | AES cryptographic encryption key | `16_or_32_chars_secret` |
| `CLIENT_ID` | Google OAuth 2.0 Web Client ID | `7128...apps.googleusercontent.com` |
| `INITIAL_ADMIN_EMAIL` | SuperAdmin seed email | `admin@venue.com` |
| `INITIAL_ADMIN_PASSWORD` | SuperAdmin seed password | `Admin@123456` |
| `EMAIL` | SMTP sender email (Nodemailer) | `notifications@example.com` |
| `PASS` | SMTP application-specific password | `app_password_here` |
| `AWS_REGION` | AWS / S3 Compatible Region | `us-east-1` |
| `AWS_ENDPOINT` | Custom endpoint (e.g. Cloudflare R2) | `https://<id>.r2.cloudflarestorage.com` |
| `AWS_BUCKET_NAME` | S3 / R2 storage bucket name | `arenahub` |
| `AWS_ACCESS_KEY` | AWS / R2 Access Key ID | `your_access_key` |
| `AWS_SECRET_ACCESS_KEY` | AWS / R2 Secret Access Key | `your_secret_key` |
| `AWS_APP_NAME` | Folder prefix in storage bucket | `ArenaHub-app` |
| `PAYMOB_SECRET_KEY` | Paymob secret API key | `egy_sk_test_...` |
| `PAYMOB_PUBLIC_KEY` | Paymob public API key | `egy_pk_test_...` |
| `PAYMOB_INTEGRATION_ID` | Paymob card integration ID | `3143838` |
| `PAYMOB_HMAC_SECRET` | Paymob HMAC secret for webhook validation | `CF847A...` |

---

## 👤 Database Seeding

Before starting, seed the initial `SuperAdmin` account into MongoDB:

```bash
npm run seed:admin
```

> **Default Seed Credentials:**
> - **Email**: `admin@venue.com` (or value of `INITIAL_ADMIN_EMAIL`)
> - **Password**: `Admin@123456` (or value of `INITIAL_ADMIN_PASSWORD`)
> - **Role**: `superAdmin`

---

## 🏃 Running the Application

### Development Mode (with hot-reload)
```bash
npm run start:dev
```

### Production Build & Run
```bash
# 1. Build the TypeScript code
npm run build

# 2. Run compiled production bundle
npm run start:prod
```

### Formatting & Linting
```bash
# Format code with Prettier
npm run format

# Run ESLint fix
npm run lint
```

---

## 📖 API Documentation (Swagger UI)

The API documentation is automatically generated via OpenAPI 3.0. Once the server is running, navigate to:

👉 **[http://localhost:3000/api/docs](http://localhost:3000/api/docs)**

### Features in Swagger UI:
- **Built-in JWT Authorization**: Click the **Authorize 🔓** button and enter your Bearer token: `Bearer <token>`.
- **Pre-filled Example Payloads**: Complete request bodies and response schemas.
- **Grouped Tags**: Auth, Users, Venues, Amenities, Bookings, Payments, Coupons, Wallet, Advertisements, Contacts.

---

## 🌐 Core Endpoints Overview

All REST routes are prefixed with `/api/v1`.

### 1. Authentication (`/api/v1/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/auth/customer/send-otp` | Public | Send 6-digit OTP via SMS to customer mobile |
| `POST` | `/auth/customer/verify-otp` | Public | Verify OTP, provision wallet, complete profile & avatar |
| `POST` | `/auth/signup-google` | Public | Sign in / register using Google OAuth ID token |
| `POST` | `/auth/dashboard/login` | Public | Staff email/password login (Admin, Owner, Manager) |
| `POST` | `/auth/dashboard/users` | SuperAdmin, Admin | Create a new administrative or manager account |

### 2. Venues & Pricing (`/api/v1/venue`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/venue` | Public | List active venues with sport and amenity filters |
| `GET` | `/venue/:id` | Public | Get venue details, hourly price rules & coordinates |
| `POST` | `/venue` | Admin, SuperAdmin | Create venue with working hours & up to 5 photos |
| `PATCH` | `/venue/:id` | Admin, SuperAdmin | Update venue details or append new gallery photos |
| `DELETE` | `/venue/:id` | Admin, SuperAdmin, Owner, Manager | Soft delete venue |
| `DELETE` | `/venue/:id/image` | Admin, SuperAdmin, Owner, Manager | Delete specific image from S3 storage & gallery |

### 3. Bookings & Availability (`/api/v1/booking`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/booking/availability/:venueId` | Public | Get booked and locked time slots for a venue |
| `POST` | `/booking` | Authenticated | Create slot booking (supports `idempotency-key` header) |
| `POST` | `/booking/:bookingId/pay` | Authenticated | Pay for pending booking via wallet, Paymob, or cash |
| `GET` | `/booking/my-bookings` | Customer | Get customer booking history with pagination |
| `GET` | `/booking/venue/:venueId` | Staff / Owner | Get all reservations for a specific venue |
| `GET` | `/booking/verify/:bookingCode` | Staff / Owner | Verify booking code / QR code at the entrance gate |
| `GET` | `/booking/:id` | Authenticated | Get single booking details with QR code |
| `PATCH` | `/booking/:id/cancel` | Authenticated | Cancel booking, release slot & auto-refund wallet |
| `PATCH` | `/booking/:id/status` | Staff / Owner | Manually update booking status |

### 4. Payments & Webhooks (`/api/v1/payment`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/payment` | Authenticated | Initiate payment via Wallet, Paymob, or Cash |
| `GET` | `/payment/my-payments` | Customer | Customer transaction history |
| `GET` | `/payment/venue/:venueId` | Staff / Owner | Financial payment reports for a venue |
| `PATCH` | `/payment/:id/mark-cash-paid` | Staff / Owner | Confirm cash payment collected at reception |
| `POST` | `/payment/:id/refund` | Staff / Owner | Issue manual refund to customer |
| `POST/GET`| `/payment/webhook/paymob` | Public Webhook | Paymob Intention & Legacy callback with HMAC check |

### 5. Digital Wallet (`/api/v1/wallet`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/wallet/:id` | Authenticated | Get current wallet balance |
| `GET` | `/wallet/transactions` | Authenticated | Audit ledger of deposits, deductions, and refunds |
| `POST` | `/wallet/create` | Admin, SuperAdmin | Manually initialize user wallet |
| `POST` | `/wallet/deposit` | Admin, SuperAdmin | Deposit credit into customer wallet (cash collection) |
| `POST` | `/wallet/deduct` | Authenticated | Deduct funds from own wallet |
| `POST` | `/wallet/admin/deduct` | Admin, SuperAdmin | Administrative deduction with mandatory audit reason |

### 6. Discount Coupons (`/api/v1/coupon`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/coupon` | Staff / Owner | Create percentage or fixed discount coupon |
| `POST` | `/coupon/validate` | Authenticated | Validate coupon code and calculate net discount |
| `PATCH` | `/coupon/:id` | Staff / Owner | Update coupon limits or validity dates |
| `DELETE` | `/coupon/:id` | Staff / Owner | Permanently delete coupon code |

### 7. Advertisements (`/api/v1/advertisements`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/advertisements/dashboard` | Public | Get active ads by position (`DASHBOARD_TOP`, etc.) |
| `POST` | `/advertisements/:id/impression`| Public | Increment impression counter |
| `POST` | `/advertisements/:id/click` | Public | Increment click counter |
| `POST` | `/advertisements` | Staff / Owner | Create banner advertisement with image upload |
| `PATCH` | `/advertisements/reorder` | Staff / Owner | Bulk reorder advertisement priorities |
| `PATCH` | `/advertisements/:id/status` | Staff / Owner | Toggle status (`active`, `inactive`, `scheduled`) |

### 8. Executive Reports & Analytics (`/api/v1/reports`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/reports/overview` | Staff / Owner | Consolidated executive KPI cards, revenue & utilization trends |
| `GET` | `/reports/revenue` | Staff / Owner | Gross vs net revenue, payment method & deposit breakdown |
| `GET` | `/reports/refunds-wallet` | Staff / Owner | Refund rates, customer wallet liability & audit ledger |
| `GET` | `/reports/no-shows` | Staff / Owner | Unattended match rates & financial loss analysis |
| `GET` | `/reports/coupons` | Staff / Owner | Coupon redemption rates & promotional ROI |
| `GET` | `/reports/ads` | Staff / Owner | Advertiser spend, CTR metrics & placement utilization |
| `GET` | `/reports/venue-utilization` | Staff / Owner | Court occupancy rates & 24-hour demand curves |
| `GET` | `/reports/customers-funnel` | Staff / Owner | Booking funnel conversion, retention & customer LTV |
| `GET` | `/reports/payouts-disputes` | Staff / Owner | Pitch owner payouts, commission fees & dispute summary |

---

## ⚡ Real-Time WebSocket Gateway

The platform features a **Socket.IO** gateway to provide immediate real-time sync across web and mobile clients without polling.

- **WebSocket URL**: `ws://<host>:<port>` (e.g. `ws://localhost:3000`)
- **Transport**: `websocket`, `polling`

### Client-to-Server Events
```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

// 1. Join a venue room to listen for live calendar updates
socket.emit("join_venue", { venueId: "64e8b0a1f2b4c10012345678" });

// 2. Leave venue room when exiting calendar screen
socket.emit("leave_venue", { venueId: "64e8b0a1f2b4c10012345678" });
```

### Server-to-Client Broadcast Events
| Event Name | Room | Payload | Description |
|---|---|---|---|
| `slot_locked` | `venue_<venueId>` | `{ bookingId, venueId, date, startTime, endTime, expiresAt }` | Emitted when a user creates a pending reservation |
| `slot_released` | `venue_<venueId>` | `{ bookingId, venueId, date, startTime, endTime }` | Emitted when a pending slot expires or is cancelled |
| `booking_confirmed` | `venue_<venueId>` | `{ bookingId, venueId, date, startTime, endTime }` | Emitted when payment is completed |
| `owner_<ownerId>` | Broadcast | `{ eventType, booking }` | Direct push notification for venue owners |
| `advertisements_updated` | Broadcast | `{ action, adId, timestamp }` | Signals client dashboard to refresh banner carousel |

---

## 🔒 Concurrency & Idempotency Engine

To prevent **double-booking collisions** when thousands of users attempt to book peak-hour slots (e.g., 8:00 PM Friday):

1. **Redis Key Lock**: During `createBooking`, the engine hashes `(venueId, date, startTime, endTime)` into an atomic lock key in Redis.
2. **Idempotency Protection**: Accepts an `idempotency-key` header (UUID). If a mobile client retries an identical request within the idempotency window, the server returns the cached response instead of charging or re-booking.
3. **Optimistic Hold**: Slots are initially placed into `pending` status with an expiration timer (e.g. 15 minutes). If payment is not completed before `expiresAt`, the automated cron job clears the hold and frees the slot.

---

## 🛡️ Role-Based Access Control (RBAC)

The system enforces granular access control through the `@auth({ roles: [...] })` decorator and NestJS execution guards:

| Role | Permissions |
|---|---|
| `superAdmin` | Full platform control, system settings, admin provisioning, global financial ledger |
| `admin` | Manage all venues, user accounts, master amenities, global advertisements, refunds |
| `owner` | Manage owned venues, court hours, view venue bookings, mark cash payments as paid |
| `manager` | Day-to-day operations at assigned venues, verify ticket QR codes at reception |
| `customer` | Book courts, view personal bookings, manage personal digital wallet, apply coupons |
| `user` | Standard authenticated user |

---

## 🧪 Testing

The codebase includes unit and end-to-end (E2E) integration test suites using Jest:

```bash
# Run unit tests
npm run test

# Run tests with coverage report
npm run test:cov

# Run End-to-End (E2E) booking concurrency tests
npm run test:e2e

# Run tests in watch mode
npm run test:watch
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ for sports communities and venue managers worldwide.
</p>
