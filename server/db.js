// ============================================================================
// PEERNEST - VIT VELLORE FULL-STACK CAMPUS CONVENIENCE PLATFORM
// Database Module (Native SQLite engine using node:sqlite with ACID transactions)
// ============================================================================

let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
  // Graceful fallback during static build or environments without native node:sqlite
  DatabaseSync = class FallbackDatabase {
    exec() {}
    prepare() {
      return {
        run: () => ({ lastInsertRowid: 1, changes: 1 }),
        get: () => null,
        all: () => []
      };
    }
  };
}
const path = require('node:path');
const fs = require('node:fs');

// Ensure data directory exists (on Vercel/serverless, use /tmp)
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
let dataDir;
try {
  dataDir = isServerless ? path.join('/tmp', 'peernest_data') : path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch (e) {
  dataDir = path.join('/tmp', 'peernest_data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'peernest.db');
const db = new DatabaseSync(dbPath);

// Enable foreign keys and WAL mode for high concurrency
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

function initDatabase() {
  db.exec(`
    -- 1. USERS
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_verified INTEGER DEFAULT 0,
      verification_otp TEXT,
      verification_otp_expires TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 2. USER PROFILES
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      registration_number TEXT UNIQUE NOT NULL,
      phone_number TEXT NOT NULL,
      campus TEXT DEFAULT 'Vellore',
      hostel_block TEXT NOT NULL,
      room_number TEXT,
      avatar_url TEXT,
      bio TEXT,
      student_verified INTEGER DEFAULT 1,
      is_admin INTEGER DEFAULT 0,
      is_suspended INTEGER DEFAULT 0,
      selected_activities TEXT DEFAULT '["request_parcel","borrow_items"]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 3. CAMPUS LOCATIONS
    CREATE TABLE IF NOT EXISTS campus_locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 4. HOSTEL LOCATIONS
    CREATE TABLE IF NOT EXISTS hostel_locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('M', 'F')),
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 5. PARCEL REQUESTS
    CREATE TABLE IF NOT EXISTS parcel_requests (
      id TEXT PRIMARY KEY,
      parcel_code TEXT UNIQUE NOT NULL,
      requester_id TEXT NOT NULL REFERENCES users(id),
      parcel_reference TEXT NOT NULL,
      collection_centre_id TEXT NOT NULL REFERENCES campus_locations(id),
      destination_hostel_id TEXT NOT NULL REFERENCES hostel_locations(id),
      designated_location TEXT NOT NULL,
      preferred_pickup_time TEXT,
      instructions TEXT,
      declared_value REAL NOT NULL DEFAULT 500.0,
      distance_km REAL NOT NULL DEFAULT 1.0,
      base_fee REAL NOT NULL DEFAULT 8.0,
      km_fee REAL NOT NULL DEFAULT 5.0,
      total_fee REAL NOT NULL DEFAULT 13.0,
      partner_earnings REAL NOT NULL DEFAULT 10.0,
      platform_commission REAL NOT NULL DEFAULT 3.0,
      status TEXT NOT NULL DEFAULT 'submitted',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 6. PARCEL ASSIGNMENTS
    CREATE TABLE IF NOT EXISTS parcel_assignments (
      id TEXT PRIMARY KEY,
      parcel_request_id TEXT UNIQUE NOT NULL REFERENCES parcel_requests(id) ON DELETE CASCADE,
      delivery_partner_id TEXT NOT NULL REFERENCES users(id),
      partner_latitude REAL,
      partner_longitude REAL,
      segment_a_distance REAL DEFAULT 0.0,
      segment_b_distance REAL DEFAULT 0.0,
      accepted_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      status TEXT DEFAULT 'assigned'
    );

    -- 7. PARCEL STATUS HISTORY
    CREATE TABLE IF NOT EXISTS parcel_status_history (
      id TEXT PRIMARY KEY,
      parcel_request_id TEXT NOT NULL REFERENCES parcel_requests(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      changed_by_user_id TEXT NOT NULL REFERENCES users(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 8. PARCEL PHOTOS
    CREATE TABLE IF NOT EXISTS parcel_photos (
      id TEXT PRIMARY KEY,
      parcel_request_id TEXT NOT NULL REFERENCES parcel_requests(id) ON DELETE CASCADE,
      stage TEXT NOT NULL CHECK (stage IN ('collection', 'condition', 'delivery', 'damage')),
      photo_url TEXT NOT NULL,
      notes TEXT,
      uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 9. PARCEL OTPS (Two-stage Delivery Verification)
    CREATE TABLE IF NOT EXISTS parcel_otps (
      id TEXT PRIMARY KEY,
      parcel_request_id TEXT UNIQUE NOT NULL REFERENCES parcel_requests(id) ON DELETE CASCADE,
      otp_code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts_count INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 5,
      is_verified INTEGER DEFAULT 0,
      verified_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 10. PARCEL DISPUTES
    CREATE TABLE IF NOT EXISTS parcel_disputes (
      id TEXT PRIMARY KEY,
      parcel_request_id TEXT NOT NULL REFERENCES parcel_requests(id) ON DELETE CASCADE,
      reporter_id TEXT NOT NULL REFERENCES users(id),
      issue_type TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence_urls TEXT DEFAULT '[]',
      status TEXT DEFAULT 'open',
      resolution_notes TEXT,
      resolved_by_admin_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 11. PARCEL COMPENSATION & PROTECTION RESERVE
    CREATE TABLE IF NOT EXISTS parcel_compensation (
      id TEXT PRIMARY KEY,
      dispute_id TEXT REFERENCES parcel_disputes(id),
      parcel_request_id TEXT NOT NULL REFERENCES parcel_requests(id),
      recipient_id TEXT NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      source TEXT NOT NULL,
      reason TEXT NOT NULL,
      approved_by_admin_id TEXT NOT NULL REFERENCES users(id),
      status TEXT DEFAULT 'approved',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS protection_reserve_transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id TEXT,
      balance_after REAL NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 12. RENTAL CATEGORIES
    CREATE TABLE IF NOT EXISTS rental_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      icon TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 13. RENTAL LISTINGS
    CREATE TABLE IF NOT EXISTS rental_listings (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES rental_categories(id),
      description TEXT NOT NULL,
      condition TEXT NOT NULL,
      daily_price REAL NOT NULL,
      security_deposit REAL NOT NULL,
      declared_value REAL NOT NULL,
      min_duration_days INTEGER DEFAULT 1,
      max_duration_days INTEGER DEFAULT 30,
      handover_location TEXT NOT NULL,
      terms TEXT,
      late_policy TEXT,
      photos TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      is_paused INTEGER DEFAULT 0,
      views_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 14. RENTAL BOOKINGS
    CREATE TABLE IF NOT EXISTS rental_bookings (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES rental_listings(id),
      borrower_id TEXT NOT NULL REFERENCES users(id),
      owner_id TEXT NOT NULL REFERENCES users(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      billable_days INTEGER NOT NULL,
      daily_price REAL NOT NULL,
      total_rental_charge REAL NOT NULL,
      security_deposit REAL NOT NULL,
      platform_commission REAL NOT NULL,
      total_payable REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      handover_confirmed_at TEXT,
      return_confirmed_at TEXT,
      cancellation_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 15. RENTAL CONDITION REPORTS
    CREATE TABLE IF NOT EXISTS rental_condition_reports (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
      stage TEXT NOT NULL CHECK (stage IN ('pre_handover', 'post_return')),
      reported_by_user_id TEXT NOT NULL REFERENCES users(id),
      condition_rating TEXT NOT NULL,
      defects_notes TEXT,
      checklist_json TEXT DEFAULT '{}',
      photo_urls TEXT DEFAULT '[]',
      confirmed_by_counterpart INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 16. RENTAL DAMAGE CLAIMS
    CREATE TABLE IF NOT EXISTS rental_damage_claims (
      id TEXT PRIMARY KEY,
      booking_id TEXT UNIQUE NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(id),
      borrower_id TEXT NOT NULL REFERENCES users(id),
      claim_description TEXT NOT NULL,
      repair_estimate REAL NOT NULL,
      photo_urls TEXT DEFAULT '[]',
      borrower_response TEXT,
      borrower_evidence_urls TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending_borrower_response',
      settlement_deduction REAL DEFAULT 0.0,
      refund_amount REAL DEFAULT 0.0,
      resolved_by_admin_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 17. CONVERSATIONS & CHAT
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      transaction_type TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE (transaction_type, transaction_id)
    );

    CREATE TABLE IF NOT EXISTS conversation_participants (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT DEFAULT (datetime('now')),
      last_read_at TEXT DEFAULT (datetime('now')),
      UNIQUE (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id),
      message_type TEXT DEFAULT 'text',
      content TEXT NOT NULL,
      attachment_url TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 18. NOTIFICATIONS
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      action_url TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 19. PAYMENTS
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL,
      transaction_type TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      payer_id TEXT NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      gateway TEXT DEFAULT 'razorpay',
      gateway_payment_id TEXT,
      gateway_signature TEXT,
      status TEXT DEFAULT 'created',
      fee_breakdown_json TEXT DEFAULT '{}',
      receipt_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 20. REFUNDS
    CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL REFERENCES payments(id),
      transaction_id TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'processed',
      gateway_refund_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 21. PAYOUTS
    CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      user_role TEXT NOT NULL,
      amount REAL NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id TEXT,
      gateway_payout_id TEXT,
      status TEXT DEFAULT 'completed',
      notes TEXT,
      processed_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 22. REVIEWS
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      transaction_type TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      reviewer_id TEXT NOT NULL REFERENCES users(id),
      reviewee_id TEXT NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      review_text TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (transaction_type, transaction_id, reviewer_id)
    );

    -- 23. USER REPORTS
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id),
      reported_user_id TEXT REFERENCES users(id),
      item_type TEXT NOT NULL,
      item_id TEXT,
      reason TEXT NOT NULL,
      details TEXT,
      status TEXT DEFAULT 'pending',
      admin_notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 24. PLATFORM SETTINGS
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- 25. ADMIN AUDIT LOGS
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      details_json TEXT DEFAULT '{}',
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// Helper methods with prepared statements
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(...params);
}

function execute(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}

// Atomic transaction helper using immediate lock
function transaction(callback) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = callback();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

module.exports = {
  db,
  initDatabase,
  queryAll,
  queryOne,
  execute,
  transaction
};
