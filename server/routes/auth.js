// ============================================================================
// PEERNEST - Authentication & VIT Student Verification Routes
// ============================================================================

const crypto = require('node:crypto');
const { queryOne, queryAll, execute, transaction } = require('../db');
const { createToken, requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'peernest_salt_2026').digest('hex');
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function sanitizeProfile(profile, isOwnerOrAdmin = false) {
  if (!profile) return null;
  const safe = {
    userId: profile.user_id,
    user_id: profile.user_id,
    fullName: profile.full_name,
    full_name: profile.full_name,
    campus: profile.campus,
    hostelBlock: profile.hostel_block,
    hostel_block: profile.hostel_block,
    avatarUrl: profile.avatar_url,
    avatar_url: profile.avatar_url,
    bio: profile.bio,
    studentVerified: Boolean(profile.student_verified),
    student_verified: Boolean(profile.student_verified),
    isAdmin: Boolean(profile.is_admin),
    is_admin: Boolean(profile.is_admin),
    selectedActivities: JSON.parse(profile.selected_activities || '[]'),
    selected_activities: profile.selected_activities,
    createdAt: profile.created_at,
    created_at: profile.created_at
  };

  // Only expose private fields to the owner or authorized administrator
  if (isOwnerOrAdmin) {
    safe.registrationNumber = profile.registration_number;
    safe.registration_number = profile.registration_number;
    safe.phoneNumber = profile.phone_number;
    safe.phone_number = profile.phone_number;
    safe.roomNumber = profile.room_number;
    safe.room_number = profile.room_number;
  }

  return safe;
}

const authRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 2000, prefix: 'auth' });
const otpRateLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 500, prefix: 'otp' });

function registerAuthRoutes(router) {
  // GET USERS LIST (For instant dropdown login selector)
  router.get('/api/auth/users-list', (req, res) => {
    const users = queryAll(`
      SELECT u.id, u.email, p.full_name, p.hostel_block, p.is_admin
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE u.is_verified = 1
      ORDER BY p.is_admin DESC, p.full_name ASC
    `);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ users }));
  });
  // 1. REGISTER
  router.post('/api/auth/register', (req, res) => {
    authRateLimiter(req, res, () => {
      const {
        email,
        password,
        fullName,
        registrationNumber,
        phoneNumber,
        campus = 'Vellore',
        hostelBlock,
        roomNumber
      } = req.body || {};

      // Backend Validation
      if (!email || !password || !fullName || !registrationNumber || !phoneNumber || !hostelBlock) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'All mandatory fields must be completed.' }));
      }

      // Check configured institutional domain
      const setting = queryOne("SELECT value FROM platform_settings WHERE key = 'institutional_email_domain'");
      const allowedDomain = (setting ? setting.value : 'vitstudent.ac.in').toLowerCase().trim();
      const normalizedEmail = email.toLowerCase().trim();

      if (!normalizedEmail.endsWith(`@${allowedDomain}`)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: `Registration is strictly restricted to VIT Vellore students. Only '@${allowedDomain}' institutional email addresses are permitted.`
        }));
      }

      // Format registration number (e.g., 21BCE1023)
      const cleanRegNo = registrationNumber.toUpperCase().trim();
      const regNoRegex = /^[0-9]{2}[A-Z]{3}[0-9]{4,5}$/;
      if (!regNoRegex.test(cleanRegNo)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: 'Invalid VIT registration number format. Expected format like 22BCE0819 or 23BME1042.'
        }));
      }

      if (password.length < 8) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Password must be at least 8 characters long.' }));
      }

      // Check duplicate email
      const existingUser = queryOne('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
      if (existingUser) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'An account with this VIT institutional email already exists.' }));
      }

      // Check duplicate registration number
      const existingReg = queryOne('SELECT id FROM user_profiles WHERE registration_number = ?', [cleanRegNo]);
      if (existingReg) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'An account with this VIT registration number already exists.' }));
      }

      // Generate Verification OTP (valid for 15 minutes)
      const otp = generateOtp();
      const otpExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const userId = 'usr-' + crypto.randomUUID();
      const profileId = 'prof-' + crypto.randomUUID();
      const passwordHash = hashPassword(password);

      try {
        transaction(() => {
          execute(`
            INSERT INTO users (id, email, password_hash, is_verified, verification_otp, verification_otp_expires, created_at, updated_at)
            VALUES (?, ?, ?, 0, ?, ?, datetime('now'), datetime('now'))
          `, [userId, normalizedEmail, passwordHash, otp, otpExpires]);

          execute(`
            INSERT INTO user_profiles (
              id, user_id, full_name, registration_number, phone_number,
              campus, hostel_block, room_number, student_verified, is_admin,
              selected_activities, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, '["request_parcel","borrow_items"]', datetime('now'), datetime('now'))
          `, [profileId, userId, fullName.trim(), cleanRegNo, phoneNumber.trim(), campus, hostelBlock.trim(), (roomNumber || '').trim()]);

          // Create initial welcome notification
          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, 'Welcome to PeerNest VIT!', 'Verify your institutional email to begin campus deliveries and rentals.', 'system', '/activities', 0, datetime('now'))
          `, ['notif-' + crypto.randomUUID(), userId]);
        });

        // In production, send email via SMTP/Resend. In demo/test mode, return verification token/OTP for immediate testing.
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: `Verification code sent to ${normalizedEmail}.`,
          email: normalizedEmail,
          userId,
          demoVerificationOtp: otp // Transparent test verification code for development / test mode
        }));
      } catch (err) {
        console.error('Registration error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to create account. Please try again.' }));
      }
    });
  });

  // 2. VERIFY EMAIL OTP
  router.post('/api/auth/verify-email', (req, res) => {
    otpRateLimiter(req, res, () => {
      const { email, otp } = req.body || {};
      if (!email || !otp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Email and verification OTP are required.' }));
      }

      const normalizedEmail = email.toLowerCase().trim();
      const user = queryOne('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
      if (!user) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'User not found.' }));
      }

      if (user.is_verified) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Email is already verified. You may log in now.' }));
      }

      if (user.verification_otp !== otp.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid verification OTP code. Please check your email.' }));
      }

      if (new Date(user.verification_otp_expires) < new Date()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Verification OTP has expired. Please request a new one.' }));
      }

      execute(`
        UPDATE users
        SET is_verified = 1, verification_otp = NULL, verification_otp_expires = NULL, updated_at = datetime('now')
        WHERE id = ?
      `, [user.id]);

      const profile = queryOne('SELECT * FROM user_profiles WHERE user_id = ?', [user.id]);
      const token = createToken({ userId: user.id, email: user.email, isAdmin: Boolean(profile.is_admin) });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'VIT Student Institutional Email verified successfully!',
        token,
        user: { id: user.id, email: user.email, isVerified: true },
        profile: sanitizeProfile(profile, true)
      }));
    });
  });

  // 3. RESEND VERIFICATION OTP
  router.post('/api/auth/resend-otp', (req, res) => {
    otpRateLimiter(req, res, () => {
      const { email } = req.body || {};
      if (!email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Email is required.' }));
      }

      const normalizedEmail = email.toLowerCase().trim();
      const user = queryOne('SELECT id, is_verified FROM users WHERE email = ?', [normalizedEmail]);
      if (!user) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'User not found.' }));
      }

      if (user.is_verified) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Account is already verified.' }));
      }

      const newOtp = generateOtp();
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      execute(`
        UPDATE users
        SET verification_otp = ?, verification_otp_expires = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [newOtp, expires, user.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'New verification OTP generated.',
        demoVerificationOtp: newOtp
      }));
    });
  });

  // 4. LOGIN
  router.post('/api/auth/login', (req, res) => {
    authRateLimiter(req, res, () => {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Email and password are required.' }));
      }

      const normalizedEmail = email.toLowerCase().trim();
      const user = queryOne('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid email or password.' }));
      }

      const passwordHash = hashPassword(password);
      if (user.password_hash !== passwordHash) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid email or password.' }));
      }

      // Check verification
      if (!user.is_verified) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: 'Your VIT institutional email has not been verified yet.',
          requiresVerification: true,
          email: user.email
        }));
      }

      const profile = queryOne('SELECT * FROM user_profiles WHERE user_id = ?', [user.id]);
      if (profile && profile.is_suspended) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Your account has been suspended by campus administration.' }));
      }

      const token = createToken({
        userId: user.id,
        email: user.email,
        isAdmin: Boolean(profile && profile.is_admin)
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Login successful.',
        token,
        user: { id: user.id, email: user.email, isVerified: true },
        profile: sanitizeProfile(profile, true)
      }));
    });
  });

  // 5. GET CURRENT USER PROFILE
  router.get('/api/auth/me', (req, res) => {
    requireAuth(req, res, () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        user: { id: req.user.id, email: req.user.email, isVerified: Boolean(req.user.is_verified) },
        profile: sanitizeProfile(req.profile, true)
      }));
    });
  });

  // 6. UPDATE PROFILE (Permitted fields)
  router.put('/api/auth/profile', (req, res) => {
    requireAuth(req, res, () => {
      const { fullName, phoneNumber, hostelBlock, roomNumber, bio, avatarUrl } = req.body || {};

      execute(`
        UPDATE user_profiles
        SET full_name = COALESCE(?, full_name),
            phone_number = COALESCE(?, phone_number),
            hostel_block = COALESCE(?, hostel_block),
            room_number = COALESCE(?, room_number),
            bio = COALESCE(?, bio),
            avatar_url = COALESCE(?, avatar_url),
            updated_at = datetime('now')
        WHERE user_id = ?
      `, [
        fullName ? fullName.trim() : null,
        phoneNumber ? phoneNumber.trim() : null,
        hostelBlock ? hostelBlock.trim() : null,
        roomNumber !== undefined ? roomNumber.trim() : null,
        bio !== undefined ? bio.trim() : null,
        avatarUrl !== undefined ? avatarUrl : null,
        req.user.id
      ]);

      const updated = queryOne('SELECT * FROM user_profiles WHERE user_id = ?', [req.user.id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Profile updated successfully.',
        profile: sanitizeProfile(updated, true)
      }));
    });
  });

  // 7. ACTIVITY SELECTION
  router.put('/api/auth/activities', (req, res) => {
    requireAuth(req, res, () => {
      const { activities } = req.body || {};
      if (!Array.isArray(activities)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Activities must be an array of selected activity keys.' }));
      }

      const validKeys = ['deliver_parcels', 'request_parcel', 'lend_items', 'borrow_items'];
      const sanitized = activities.filter(k => validKeys.includes(k));

      execute(`
        UPDATE user_profiles
        SET selected_activities = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `, [JSON.stringify(sanitized), req.user.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Activities preference updated successfully.',
        selectedActivities: sanitized
      }));
    });
  });

  // 8. PASSWORD RESET REQUEST
  router.post('/api/auth/forgot-password', (req, res) => {
    otpRateLimiter(req, res, () => {
      const { email } = req.body || {};
      if (!email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Email is required.' }));
      }

      const user = queryOne('SELECT id, email FROM users WHERE email = ?', [email.toLowerCase().trim()]);
      if (!user) {
        // Return generic success to prevent email enumeration
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'If an account exists, a password reset code has been sent.' }));
      }

      const resetOtp = generateOtp();
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      execute(`
        UPDATE users
        SET verification_otp = ?, verification_otp_expires = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [resetOtp, expires, user.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Password reset code generated.',
        demoResetOtp: resetOtp
      }));
    });
  });

  // 9. PASSWORD RESET CONFIRM
  router.post('/api/auth/reset-password', (req, res) => {
    otpRateLimiter(req, res, () => {
      const { email, otp, newPassword } = req.body || {};
      if (!email || !otp || !newPassword) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Email, OTP, and new password are required.' }));
      }

      if (newPassword.length < 8) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'New password must be at least 8 characters long.' }));
      }

      const user = queryOne('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
      if (!user || user.verification_otp !== otp.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid or expired password reset code.' }));
      }

      if (new Date(user.verification_otp_expires) < new Date()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Password reset code has expired.' }));
      }

      const newHash = hashPassword(newPassword);
      execute(`
        UPDATE users
        SET password_hash = ?, verification_otp = NULL, verification_otp_expires = NULL, updated_at = datetime('now')
        WHERE id = ?
      `, [newHash, user.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Password has been reset successfully. You may now log in.' }));
    });
  });

  // 10. ACCOUNT DELETION REQUEST
  router.post('/api/auth/delete-request', (req, res) => {
    requireAuth(req, res, () => {
      const { reason } = req.body || {};
      execute(`
        INSERT INTO reports (id, reporter_id, reported_user_id, item_type, reason, details, status, created_at)
        VALUES (?, ?, ?, 'user_deletion_request', 'Account Deletion Requested', ?, 'pending', datetime('now'))
      `, ['rep-' + crypto.randomUUID(), req.user.id, req.user.id, reason || 'Student requested account closure.']);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Account deletion request submitted. An administrator will review and process your data deletion.'
      }));
    });
  });
}

module.exports = { registerAuthRoutes, sanitizeProfile };
