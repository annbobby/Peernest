// Next.js Catch-All API Handler for PeerNest Backend Routes
const { handleRequest } = require('../../server/index');

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req, res) {
  return handleRequest(req, res);
}
