// ============================================================================
// PEERNEST - Authentication Middleware & Session Management
// ============================================================================

const crypto = require('node:crypto');
const { queryOne } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'peernest_vit_vellore_jwt_secret_key_2026';

// Lightweight, secure JSON Web Token implementation with zero dependencies
function createToken(payload, expiresInSeconds = 86400 * 7) { // 7 days
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const encodeBase64Url = (obj) => {
    return Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const encodedHeader = encodeBase64Url(header);
  const encodedPayload = encodeBase64Url(fullPayload);
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
}

function verifyToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const data = `${headerB64}.${payloadB64}`;

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(data)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    if (expectedSignature !== signatureB64) return null;

    const payload = JSON.parse(
      Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    );

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return payload;
  } catch (err) {
    return null;
  }
}

// Middleware to extract and verify user
function authenticate(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.peernest_token) {
    token = req.cookies.peernest_token;
  }

  if (!token) {
    req.user = null;
    return next ? next() : null;
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.userId) {
    req.user = null;
    return next ? next() : null;
  }

  // Load user and profile from database
  const user = queryOne('SELECT id, email, is_verified FROM users WHERE id = ?', [decoded.userId]);
  if (!user) {
    req.user = null;
    return next ? next() : null;
  }

  const profile = queryOne('SELECT * FROM user_profiles WHERE user_id = ?', [decoded.userId]);
  if (profile && profile.is_suspended) {
    req.user = null;
    req.isSuspended = true;
    return next ? next() : null;
  }

  req.user = user;
  req.profile = profile;
  if (next) next();
}

function requireAuth(req, res, next) {
  authenticate(req, res, () => {
    if (req.isSuspended) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Your account has been suspended. Please contact administrator.' }));
    }
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Authentication required. Please sign in.' }));
    }
    if (next) next();
  });
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.profile || !req.profile.is_admin) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Access denied. Administrator privileges required.' }));
    }
    if (next) next();
  });
}

module.exports = {
  createToken,
  verifyToken,
  authenticate,
  requireAuth,
  requireAdmin
};
