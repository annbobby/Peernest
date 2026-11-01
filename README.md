# 📦 PeerNest — VIT Vellore Full-Stack Campus Platform

> **Production-grade student-to-student convenience platform** initially designed exclusively for the students of **Vellore Institute of Technology (VIT), Vellore**.

PeerNest combines two core campus micro-economies:
1. **Campus Parcel Pickup & Delivery:** Route-based GPS pricing from campus parcel centres (Post Office / SJT Courier Kiosk) to student hostel blocks with two-stage OTP handover verification.
2. **Student-to-Student Rental Marketplace:** Peer lending & borrowing of academic textbooks, scientific calculators (Casio 991EX/CW), lab coats, electronic kits, and sports gear with separate daily rent, declared item values, and refundable security deposits.

---

## 🏛️ VIT Vellore Campus Specifics

- **Institutional Domain Restriction:** Only accounts ending in `@vitstudent.ac.in` can register and log in. Personal emails (`@gmail.com`, etc.) are strictly rejected.
- **Privacy First:** Student registration numbers (e.g. `23BCE1042`), phone numbers, and room numbers remain encrypted and private. They are never shown on public listings.
- **Verified Coordinates:** Includes exact GPS coordinates for VIT Vellore Men's Hostels (MH Blocks A through T), Ladies' Hostels (LH Blocks A through H), Campus Central Post Office (near Gate 2 / Foodys), Silver Jubilee Tower (SJT), and Technology Tower (TT).
- **Two-Stage Handover OTP:** Delivery partners cannot mark packages as delivered without obtaining the 6-digit one-time PIN from the recipient.

---

## 🚀 Quick Start (Zero External Dependencies)

The server runs natively on Node.js (v20+) using native SQLite (`node:sqlite`) with ACID transactions, atomic locks, and real-time Server-Sent Events (SSE).

### 1. Run the Full-Stack Application

```bash
# Navigate to project directory
cd C:\Users\annbo\.gemini\antigravity\scratch\peernest

# Start the full-stack server
node server/index.js
```

Open your browser at: **[http://localhost:3000](http://localhost:3000)**

### 2. Run the Automated End-to-End Test Suite

```bash
node tests/run-tests.js
```

Outputs 23/23 passing end-to-end integration and security assertions across auth, parcel claiming, concurrency locks, two-stage OTPs, rentals, chat, and admin accounting.

---

## 🔑 Pre-Seeded Demo Accounts

| Role | Institutional Email | Password | Access / Scope |
| :--- | :--- | :--- | :--- |
| **Campus Admin** | `admin.peernest@vitstudent.ac.in` | `VITStudent@2026` | Full Admin Console, Ledger, Dispute Arbitration, Platform Config |
| **Student 1 (Aarav)** | `aarav.sharma2023@vitstudent.ac.in` | `VITStudent@2026` | MH-D Block (Requester & Borrower) |
| **Student 2 (Priya)** | `priya.nair2022@vitstudent.ac.in` | `VITStudent@2026` | LH-B Block (Delivery Partner & Lender) |
| **Student 3 (Rohit)** | `rohit.verma2024@vitstudent.ac.in` | `VITStudent@2026` | MH-L Block (Delivery Partner & Borrower) |

---

## 🏗️ Project Architecture & File Hierarchy

```
peernest/
├── .env.example                     # Environment variables template
├── package.json                     # Project manifest and scripts
├── tsconfig.json                    # TypeScript configuration
├── README.md                        # Documentation and architecture guide
├── migrations/
│   ├── 001_initial_schema.sql       # PostgreSQL / Supabase schema (25 tables)
│   ├── 002_rls_policies.sql         # Row Level Security (RLS) policies
│   └── 003_seed_data.sql            # VIT Vellore locations, hostels, categories & config
├── server/
│   ├── index.js                     # HTTP server, routing, static server & middleware
│   ├── db.js                        # node:sqlite database adapter with ACID transactions
│   ├── seed.js                      # Database seeder
│   ├── middleware/
│   │   ├── auth.js                  # JWT token signer, validator, requireAuth & requireAdmin
│   │   └── rateLimit.js             # Sliding-window rate limiting for auth & OTP
│   └── routes/
│       ├── auth.js                  # Registration, email OTP, login, profiles, activity preferences
│       ├── gps.js                   # Routing engine, Haversine + road factor, fare calculation
│       ├── parcels.js               # Parcel pickup requests, atomic acceptance, 2-stage OTP
│       ├── rentals.js               # Listings, anti-self rental check, double-booking lock, deposits
│       ├── chat.js                  # Private transaction chat & real-time SSE stream
│       ├── payments.js              # Razorpay integration + test mode engine & receipts
│       ├── notifications.js         # In-app notifications center
│       ├── reviews.js               # Star ratings and reliability score calculator
│       └── admin.js                 # Admin overview, users, parcels, rentals, finances, disputes
├── public/                          # Static assets and icons
├── src/
│   ├── index.html                   # Single-Page App HTML shell with Tailwind & Lucide
│   └── app.js                       # Client router, reactive state, modals & UI views
└── tests/
    └── run-tests.js                 # 23 automated end-to-end integration tests
```

---

## 🧮 Delivery Pricing & Commission Engine

```
Delivery Fee = Base Fee + (Total Route Distance × Price per Kilometre)
```

- **Segment A:** Delivery partner location to Campus Central Parcel Centre (Post Office near Gate 2 / SJT Kiosk).
- **Segment B:** Campus Central Parcel Centre to destination hostel (e.g. MH-D Block).
- **Default Config:**
  - Base Fee: `₹8.00`
  - Rate per km: `₹5.00`
  - Min delivery fee: `₹10.00`
  - Campus Road Multiplier: `1.22x` (accounts for pedestrian paths and campus roads)
- **Financial Split:**
  - Requester pays: `₹15.00`
  - Delivery Partner earns: `₹12.00` (credited directly to partner payout balance)
  - PeerNest platform fee: `₹3.00` (10% contributed to Protection Reserve)

---

## 🛡️ Security, Privacy & Concurrency Safeguards

1. **Atomic Parcel Assignment:** Wrapped in immediate database transactions (`BEGIN IMMEDIATE`) to prevent race conditions where two students accept the same parcel simultaneously.
2. **Double-Booking Prevention:** Rental calendar checks query overlapping date ranges for active bookings before confirming.
3. **Anti-Self Rental:** Enforced on both frontend and backend; item owners are blocked from renting their own belongings.
4. **Two-Stage Delivery Handover:**
   - *Stage 1:* Partner records parcel collection at campus centre.
   - *Stage 2:* 6-digit delivery OTP generated and sent to recipient. Delivery partner must enter the recipient's OTP to complete the transaction and release payment.
5. **Private Transaction Chats:** Direct chat rooms are strictly scoped to verified transaction participants (requester + partner, or lender + borrower). No arbitrary unsolicited messaging.
6. **Protection Reserve:** A separately audited ledger accounts for funds allocated for lost or damaged parcels under official campus transit policy.

---

## 💳 External Services Configuration (Production Deployment)

| Provider | Purpose | Status | Environment Variable Required |
| :--- | :--- | :--- | :--- |
| **Supabase** | Managed PostgreSQL, Auth & Storage | Ready (SQL migrations included) | `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **Razorpay** | UPI & Indian Card Payments | Integrated + Active Test Mode | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| **Google Maps / Mapbox** | Precise routing polyline | Integrated + Active Campus Engine | `GOOGLE_MAPS_API_KEY` or `MAPBOX_ACCESS_TOKEN` |
| **Resend / SMTP** | Transactional Emails | Integrated + Active In-App OTP Mode | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` |

*Note: In the absence of external API credentials, PeerNest transparently runs in **Test/Demo Mode** with fully functional mock orders, signatures, receipts, and OTP verification.*
