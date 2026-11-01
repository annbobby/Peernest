-- ============================================================================
-- PEERNEST - VIT VELLORE FULL-STACK CAMPUS CONVENIENCE PLATFORM
-- Database Schema Migration 002: Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE protection_reserve_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_condition_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_damage_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_id = auth.uid() AND is_admin = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. USERS & PROFILES
CREATE POLICY "Users can read own record"
    ON users FOR SELECT
    USING (auth.uid() = id OR is_admin());

CREATE POLICY "Public can view non-sensitive profile info"
    ON user_profiles FOR SELECT
    USING (TRUE);

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = user_id);

-- 2. PARCEL REQUESTS
CREATE POLICY "Users can view submitted/waiting parcel requests or their own"
    ON parcel_requests FOR SELECT
    USING (
        status = 'waiting_for_partner' 
        OR requester_id = auth.uid() 
        OR EXISTS (
            SELECT 1 FROM parcel_assignments 
            WHERE parcel_request_id = parcel_requests.id 
            AND delivery_partner_id = auth.uid()
        )
        OR is_admin()
    );

CREATE POLICY "Requesters can insert parcel requests"
    ON parcel_requests FOR INSERT
    WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Participants or admins can update parcel request"
    ON parcel_requests FOR UPDATE
    USING (
        requester_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM parcel_assignments 
            WHERE parcel_request_id = parcel_requests.id 
            AND delivery_partner_id = auth.uid()
        )
        OR is_admin()
    );

-- 3. PARCEL OTPS (Strictly private!)
CREATE POLICY "Only admins or authorized backend can access OTPs"
    ON parcel_otps FOR ALL
    USING (is_admin());

-- 4. RENTAL LISTINGS
CREATE POLICY "Anyone can view active rental listings"
    ON rental_listings FOR SELECT
    USING (is_active = TRUE OR owner_id = auth.uid() OR is_admin());

CREATE POLICY "Owners can insert their own listings"
    ON rental_listings FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their own listings"
    ON rental_listings FOR UPDATE
    USING (auth.uid() = owner_id OR is_admin());

-- 5. RENTAL BOOKINGS
CREATE POLICY "Borrower, owner, or admin can view booking"
    ON rental_bookings FOR SELECT
    USING (borrower_id = auth.uid() OR owner_id = auth.uid() OR is_admin());

CREATE POLICY "Borrowers can create booking (cannot rent own item)"
    ON rental_bookings FOR INSERT
    WITH CHECK (auth.uid() = borrower_id AND borrower_id != owner_id);

CREATE POLICY "Participants or admin can update booking status"
    ON rental_bookings FOR UPDATE
    USING (borrower_id = auth.uid() OR owner_id = auth.uid() OR is_admin());

-- 6. CONVERSATIONS & MESSAGES (Strictly scoped to participants)
CREATE POLICY "Participants can view conversations"
    ON conversations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants 
            WHERE conversation_id = conversations.id 
            AND user_id = auth.uid()
        )
        OR is_admin()
    );

CREATE POLICY "Participants can view messages"
    ON messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants 
            WHERE conversation_id = messages.conversation_id 
            AND user_id = auth.uid()
        )
        OR is_admin()
    );

CREATE POLICY "Participants can insert messages"
    ON messages FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
            SELECT 1 FROM conversation_participants 
            WHERE conversation_id = messages.conversation_id 
            AND user_id = auth.uid()
        )
    );

-- 7. NOTIFICATIONS
CREATE POLICY "Users can only read and update own notifications"
    ON notifications FOR ALL
    USING (auth.uid() = user_id);

-- 8. PAYMENTS & PAYOUTS
CREATE POLICY "Users can view own payments"
    ON payments FOR SELECT
    USING (payer_id = auth.uid() OR is_admin());

CREATE POLICY "Users can view own payouts"
    ON payouts FOR SELECT
    USING (user_id = auth.uid() OR is_admin());

-- 9. ADMIN AUDIT & CONFIGURATION
CREATE POLICY "Only admins can access audit logs"
    ON admin_audit_logs FOR ALL
    USING (is_admin());
