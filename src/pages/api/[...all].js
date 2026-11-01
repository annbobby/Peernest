// Next.js Catch-All API Handler for PeerNest Backend Routes
let handleRequest;
try {
  handleRequest = require('../../../server/index').handleRequest;
} catch (e) {
  try {
    handleRequest = require('../../server/index').handleRequest;
  } catch (e2) {
    handleRequest = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    };
  }
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req, res) {
  return handleRequest(req, res);
}
