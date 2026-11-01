// ============================================================================
// PEERNEST - API Rate Limiting Middleware
// ============================================================================

const rateLimitBuckets = new Map();

function rateLimit(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  // Generous limit so local testing/retries never get blocked
  const max = options.max || 2000;
  const message = options.message || 'Too many requests. Please slow down and try again later.';

  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
    
    // Whitelist local development
    if (ip === '127.0.0.1' || ip === '::1' || ip.includes('localhost')) {
      if (next) return next();
    }

    const key = `${options.prefix || 'rl'}:${ip}`;
    const now = Date.now();

    let bucket = rateLimitBuckets.get(key);
    if (!bucket || now > bucket.resetTime) {
      bucket = { count: 1, resetTime: now + windowMs };
      rateLimitBuckets.set(key, bucket);
    } else {
      bucket.count++;
    }

    if (bucket.count > max) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil((bucket.resetTime - now) / 1000)
      });
      return res.end(JSON.stringify({ error: message, retryAfter: Math.ceil((bucket.resetTime - now) / 1000) }));
    }

    if (next) next();
  };
}

function clearRateLimits() {
  rateLimitBuckets.clear();
}

module.exports = { rateLimit, clearRateLimits };
