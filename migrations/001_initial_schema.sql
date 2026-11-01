-- ============================================================================
-- PEERNEST - VIT VELLORE FULL-STACK CAMPUS CONVENIENCE PLATFORM
-- Database Schema Migration 001: Initial Schema (PostgreSQL / Supabase compatible)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS & AUTH
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_otp VARCHAR(10),
    verification_otp_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. USER PROFILES
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    registration_number VARCHAR(20) UNIQUE NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    campus VARCHAR(50) DEFAULT 'Vellore',
    hostel_block VARCHAR(50) NOT NULL,
    room_number VARCHAR(20),
    avatar_url TEXT,
    bio TEXT,
    student_verified BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    is_suspended BOOLEAN DEFAULT FALSE,
    selected_activities TEXT[] DEFAULT ARRAY['request_parcel', 'borrow_items']::TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_reg_no ON user_profiles(registration_number);

-- 3. CAMPUS LOCATIONS (VIT Vellore)
CREATE TABLE IF NOT EXISTS campus_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'parcel_centre', 'academic_building', 'gate', 'amenity'
    latitude NUMERIC(10, 6) NOT NULL,
    longitude NUMERIC(10, 6) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. HOSTEL LOCATIONS (VIT Vellore MH & LH Blocks)
CREATE TABLE IF NOT EXISTS hostel_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('M', 'F')),
    latitude NUMERIC(10, 6) NOT NULL,
    longitude NUMERIC(10, 6) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PARCEL REQUESTS
CREATE TABLE IF NOT EXISTS parcel_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_code VARCHAR(30) UNIQUE NOT NULL, -- e.g. PN-PAR-202611-ABCD
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    parcel_reference VARCHAR(100) NOT NULL, -- carrier slip / AWB / courier name
    collection_centre_id UUID NOT NULL REFERENCES campus_locations(id),
    destination_hostel_id UUID NOT NULL REFERENCES hostel_locations(id),
    designated_location VARCHAR(200) NOT NULL,
    preferred_pickup_time TIMESTAMPTZ,
    instructions TEXT,
    declared_value NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
    distance_km NUMERIC(5, 2) NOT NULL DEFAULT 1.00,
    base_fee NUMERIC(8, 2) NOT NULL DEFAULT 8.00,
    km_fee NUMERIC(8, 2) NOT NULL DEFAULT 5.00,
    total_fee NUMERIC(8, 2) NOT NULL DEFAULT 13.00,
    partner_earnings NUMERIC(8, 2) NOT NULL DEFAULT 10.00,
    platform_commission NUMERIC(8, 2) NOT NULL DEFAULT 3.00,
    status VARCHAR(50) NOT NULL DEFAULT 'submitted' CHECK (
        status IN (
            'submitted', 'waiting_for_partner', 'accepted', 
            'collected', 'out_for_delivery', 'delivered', 
            'completed', 'cancelled', 'delayed', 'disputed', 
            'under_investigation'
        )
    ),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parcel_requests_requester ON parcel_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_parcel_requests_status ON parcel_requests(status);

-- 6. PARCEL ASSIGNMENTS
CREATE TABLE IF NOT EXISTS parcel_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_request_id UUID UNIQUE NOT NULL REFERENCES parcel_requests(id) ON DELETE CASCADE,
    delivery_partner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    partner_latitude NUMERIC(10, 6),
    partner_longitude NUMERIC(10, 6),
    segment_a_distance NUMERIC(5, 2) DEFAULT 0.00,
    segment_b_distance NUMERIC(5, 2) DEFAULT 0.00,
    accepted_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'assigned'
);

CREATE INDEX IF NOT EXISTS idx_assignments_partner ON parcel_assignments(delivery_partner_id);

-- 7. PARCEL STATUS HISTORY (Audit Trail)
CREATE TABLE IF NOT EXISTS parcel_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_request_id UUID NOT NULL REFERENCES parcel_requests(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    changed_by_user_id UUID NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. PARCEL PHOTOS & EVIDENCE
CREATE TABLE IF NOT EXISTS parcel_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_request_id UUID NOT NULL REFERENCES parcel_requests(id) ON DELETE CASCADE,
    stage VARCHAR(30) NOT NULL CHECK (stage IN ('collection', 'condition', 'delivery', 'damage')),
    photo_url TEXT NOT NULL,
    notes TEXT,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. PARCEL OTPS (Two-stage Delivery Verification)
CREATE TABLE IF NOT EXISTS parcel_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_request_id UUID UNIQUE NOT NULL REFERENCES parcel_requests(id) ON DELETE CASCADE,
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts_count INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. PARCEL DISPUTES & ISSUES
CREATE TABLE IF NOT EXISTS parcel_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_request_id UUID UNIQUE NOT NULL REFERENCES parcel_requests(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id),
    issue_type VARCHAR(50) NOT NULL CHECK (
        issue_type IN ('missing_parcel', 'damaged_parcel', 'incorrect_parcel', 'wrong_recipient', 'incomplete_delivery', 'other')
    ),
    description TEXT NOT NULL,
    evidence_urls TEXT[],
    status VARCHAR(50) DEFAULT 'open' CHECK (
        status IN ('open', 'under_investigation', 'resolved_refund', 'resolved_compensated', 'rejected')
    ),
    resolution_notes TEXT,
    resolved_by_admin_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PARCEL COMPENSATION & PROTECTION RESERVE
CREATE TABLE IF NOT EXISTS parcel_compensation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID REFERENCES parcel_disputes(id) ON DELETE SET NULL,
    parcel_request_id UUID NOT NULL REFERENCES parcel_requests(id),
    recipient_id UUID NOT NULL REFERENCES users(id),
    amount NUMERIC(10, 2) NOT NULL,
    source VARCHAR(50) NOT NULL CHECK (source IN ('protection_reserve', 'delivery_partner_deduction', 'platform_grant')),
    reason TEXT NOT NULL,
    approved_by_admin_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(30) DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'disbursed', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS protection_reserve_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(30) NOT NULL CHECK (type IN ('contribution', 'payout', 'adjustment')),
    amount NUMERIC(10, 2) NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID,
    balance_after NUMERIC(12, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. RENTAL CATEGORIES
CREATE TABLE IF NOT EXISTS rental_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. RENTAL LISTINGS
CREATE TABLE IF NOT EXISTS rental_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    category_id UUID NOT NULL REFERENCES rental_categories(id),
    description TEXT NOT NULL,
    condition VARCHAR(30) NOT NULL CHECK (condition IN ('brand_new', 'like_new', 'good', 'fair')),
    daily_price NUMERIC(10, 2) NOT NULL,
    security_deposit NUMERIC(10, 2) NOT NULL,
    declared_value NUMERIC(10, 2) NOT NULL,
    min_duration_days INT DEFAULT 1,
    max_duration_days INT DEFAULT 30,
    handover_location VARCHAR(200) NOT NULL,
    terms TEXT,
    late_policy TEXT,
    photos TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    is_paused BOOLEAN DEFAULT FALSE,
    views_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rental_listings_owner ON rental_listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_rental_listings_category ON rental_listings(category_id);

-- 14. RENTAL BOOKINGS
CREATE TABLE IF NOT EXISTS rental_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES rental_listings(id) ON DELETE RESTRICT,
    borrower_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    billable_days INT NOT NULL CHECK (billable_days >= 1),
    daily_price NUMERIC(10, 2) NOT NULL,
    total_rental_charge NUMERIC(10, 2) NOT NULL,
    security_deposit NUMERIC(10, 2) NOT NULL,
    platform_commission NUMERIC(10, 2) NOT NULL,
    total_payable NUMERIC(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (
        status IN (
            'pending', 'accepted', 'rejected', 'payment_pending', 
            'active', 'return_pending', 'returned', 'completed', 
            'cancelled', 'disputed'
        )
    ),
    handover_confirmed_at TIMESTAMPTZ,
    return_confirmed_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_borrower_not_owner CHECK (borrower_id != owner_id),
    CONSTRAINT chk_date_order CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_bookings_listing ON rental_bookings(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_borrower ON rental_bookings(borrower_id);
CREATE INDEX IF NOT EXISTS idx_bookings_owner ON rental_bookings(owner_id);

-- 15. RENTAL CONDITION REPORTS
CREATE TABLE IF NOT EXISTS rental_condition_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
    stage VARCHAR(30) NOT NULL CHECK (stage IN ('pre_handover', 'post_return')),
    reported_by_user_id UUID NOT NULL REFERENCES users(id),
    condition_rating VARCHAR(30) NOT NULL,
    defects_notes TEXT,
    checklist_json JSONB,
    photo_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
    confirmed_by_counterpart BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. RENTAL DAMAGE CLAIMS & DEPOSIT DISPUTES
CREATE TABLE IF NOT EXISTS rental_damage_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID UNIQUE NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id),
    borrower_id UUID NOT NULL REFERENCES users(id),
    claim_description TEXT NOT NULL,
    repair_estimate NUMERIC(10, 2) NOT NULL,
    photo_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
    borrower_response TEXT,
    borrower_evidence_urls TEXT[],
    status VARCHAR(50) DEFAULT 'pending_borrower_response' CHECK (
        status IN ('pending_borrower_response', 'borrower_disputed', 'admin_review', 'settled_mutual', 'settled_admin', 'dismissed')
    ),
    settlement_deduction NUMERIC(10, 2) DEFAULT 0.00,
    refund_amount NUMERIC(10, 2) DEFAULT 0.00,
    resolved_by_admin_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. CONVERSATIONS & PRIVATE TRANSACTION CHAT
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('parcel', 'rental')),
    transaction_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_tx ON conversations(transaction_type, transaction_id);

CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_conv_participant UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    message_type VARCHAR(30) DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'image')),
    content TEXT NOT NULL,
    attachment_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);

-- 18. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('parcel', 'rental', 'chat', 'payment', 'system', 'dispute')),
    action_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- 19. PAYMENTS & RECONCILIATION
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(100) UNIQUE NOT NULL,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('parcel', 'rental')),
    transaction_id UUID NOT NULL,
    payer_id UUID NOT NULL REFERENCES users(id),
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    gateway VARCHAR(50) DEFAULT 'razorpay',
    gateway_payment_id VARCHAR(100),
    gateway_signature VARCHAR(255),
    status VARCHAR(30) DEFAULT 'created' CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded')),
    fee_breakdown_json JSONB,
    receipt_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. REFUNDS
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id),
    transaction_id UUID NOT NULL,
    transaction_type VARCHAR(30) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'processed' CHECK (status IN ('initiated', 'processed', 'failed')),
    gateway_refund_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 21. STUDENT PAYOUTS
CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    user_role VARCHAR(50) NOT NULL CHECK (user_role IN ('delivery_partner', 'rental_lender')),
    amount NUMERIC(10, 2) NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID,
    gateway_payout_id VARCHAR(100),
    status VARCHAR(30) DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    notes TEXT,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. REVIEWS & RATINGS
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('parcel', 'rental')),
    transaction_id UUID NOT NULL,
    reviewer_id UUID NOT NULL REFERENCES users(id),
    reviewee_id UUID NOT NULL REFERENCES users(id),
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_review_tx_reviewer UNIQUE (transaction_type, transaction_id, reviewer_id)
);

-- 23. USER REPORTS & SAFETY
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id),
    reported_user_id UUID REFERENCES users(id),
    item_type VARCHAR(50) NOT NULL,
    item_id UUID,
    reason VARCHAR(100) NOT NULL,
    details TEXT,
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'action_taken', 'dismissed')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24. PLATFORM SETTINGS
CREATE TABLE IF NOT EXISTS platform_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. ADMIN AUDIT LOGS
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(100),
    details_json JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
