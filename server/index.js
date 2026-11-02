// ============================================================================
// PEERNEST - Full-Stack HTTP Application Server (Node.js v24 Native)
// ============================================================================

const http = require('node:http');
const url = require('node:url');
const fs = require('node:fs');
const path = require('node:path');

const { initDatabase } = require('./db');
const { seed } = require('./seed');
const { registerAuthRoutes } = require('./routes/auth');
const { registerGpsRoutes } = require('./routes/gps');
const { registerParcelRoutes } = require('./routes/parcels');
const { registerRentalRoutes } = require('./routes/rentals');
const { registerChatRoutes } = require('./routes/chat');
const { registerPaymentRoutes } = require('./routes/payments');
const { registerNotificationRoutes } = require('./routes/notifications');
const { registerReviewRoutes } = require('./routes/reviews');
const { registerAdminRoutes } = require('./routes/admin');
const { registerActivityRoutes } = require('./routes/activities');

// Initialize Database Schema & Seed Data
initDatabase();
seed();

// Router Implementation
class Router {
  constructor() {
    this.routes = {
      GET: [],
      POST: [],
      PUT: [],
      DELETE: []
    };
  }

  add(method, pattern, handler) {
    const paramNames = [];
    const regexPattern = pattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const regex = new RegExp(`^${regexPattern}$`);
    this.routes[method].push({ regex, paramNames, handler });
  }

  get(pattern, handler) { this.add('GET', pattern, handler); }
  post(pattern, handler) { this.add('POST', pattern, handler); }
  put(pattern, handler) { this.add('PUT', pattern, handler); }
  delete(pattern, handler) { this.add('DELETE', pattern, handler); }

  match(method, pathname) {
    const list = this.routes[method] || [];
    for (const route of list) {
      const match = pathname.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });
        return { handler: route.handler, params };
      }
    }
    return null;
  }
}

const router = new Router();

// Register all modular API routes
registerAuthRoutes(router);
registerGpsRoutes(router);
registerParcelRoutes(router);
registerRentalRoutes(router);
registerChatRoutes(router);
registerPaymentRoutes(router);
registerNotificationRoutes(router);
registerReviewRoutes(router);
registerAdminRoutes(router);
registerActivityRoutes(router);

// Static file serving helper
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

function serveStaticFile(res, filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=3600'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

// Master HTTP Request Handler
function handleRequest(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  req.query = Object.fromEntries(parsedUrl.searchParams.entries());

  // If method has no body (GET, HEAD) or body is already parsed (e.g. Vercel serverless functions)
  if (req.method === 'GET' || req.method === 'HEAD' || (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0)) {
    const matched = router.match(req.method, pathname);
    if (matched) {
      req.params = matched.params;
      return matched.handler(req, res);
    }
  }

  // Buffer incoming JSON body for POST/PUT requests
  let bodyData = '';
  req.on('data', chunk => {
    bodyData += chunk;
    if (bodyData.length > 10 * 1024 * 1024) { // 10MB limit
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payload too large.' }));
      req.destroy();
    }
  });

  req.on('end', () => {
    if (bodyData) {
      try {
        req.body = JSON.parse(bodyData);
      } catch (e) {
        req.body = {};
      }
    } else if (!req.body) {
      req.body = {};
    }

    // Try routing API endpoint
    const matched = router.match(req.method, pathname);
    if (matched) {
      req.params = matched.params;
      return matched.handler(req, res);
    }

    // Check static files in /public and /src
    const publicPath = path.join(__dirname, '..', 'public', pathname);
    if (serveStaticFile(res, publicPath)) return;

    const srcPath = path.join(__dirname, '..', 'src', pathname);
    if (serveStaticFile(res, srcPath)) return;

    // SPA Fallback: Serve src/index.html for client-side routing
    const spaIndex = path.join(__dirname, '..', 'src', 'index.html');
    if (serveStaticFile(res, spaIndex)) return;

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found.' }));
  });
}

const server = http.createServer(handleRequest);

const PORT = parseInt(process.env.PORT, 10) || 3000;
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 PEERNEST - VIT Vellore Campus Convenience Platform`);
    console.log(`📡 Server running at http://localhost:${PORT}`);
    console.log(`⚡ Environment: Production Ready (Native Node v24 Engine)`);
    console.log(`======================================================\n`);
  });
}

module.exports = { server, handleRequest, router };
