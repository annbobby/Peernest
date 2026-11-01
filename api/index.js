// ============================================================================
// PEERNEST - Vercel Serverless API Gateway
// ============================================================================

const { handleRequest } = require('../server/index');

module.exports = (req, res) => {
  return handleRequest(req, res);
};
