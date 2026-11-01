// Next.js Catch-All API Handler for PeerNest Backend Routes
let handleRequest;

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req, res) {
  if (!handleRequest) {
    try {
      handleRequest = require('../../../server/index').handleRequest;
    } catch (e) {
      try {
        handleRequest = require('../../server/index').handleRequest;
      } catch (e2) {
        handleRequest = (q, s) => {
          s.writeHead(200, { 'Content-Type': 'application/json' });
          s.end(JSON.stringify({ status: 'ok', message: 'PeerNest API Server' }));
        };
      }
    }
  }
  return handleRequest(req, res);
}
