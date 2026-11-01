// ============================================================================
// PEERNEST - Notifications Center Module
// ============================================================================

const crypto = require('node:crypto');
const { queryAll, queryOne, execute } = require('../db');
const { requireAuth } = require('../middleware/auth');

function registerNotificationRoutes(router) {
  // 1. GET USER NOTIFICATIONS
  router.get('/api/notifications', (req, res) => {
    requireAuth(req, res, () => {
      const notifications = queryAll(`
        SELECT * FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `, [req.user.id]);

      const unreadCount = queryOne(`
        SELECT COUNT(*) AS count FROM notifications
        WHERE user_id = ? AND is_read = 0
      `, [req.user.id]).count;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ notifications, unreadCount }));
    });
  });

  // 2. MARK SINGLE NOTIFICATION AS READ
  router.put('/api/notifications/:id/read', (req, res) => {
    requireAuth(req, res, () => {
      execute(`
        UPDATE notifications
        SET is_read = 1
        WHERE id = ? AND user_id = ?
      `, [req.params.id, req.user.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
  });

  // 3. MARK ALL AS READ
  router.put('/api/notifications/read-all', (req, res) => {
    requireAuth(req, res, () => {
      execute(`
        UPDATE notifications
        SET is_read = 1
        WHERE user_id = ?
      `, [req.user.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'All notifications marked as read.' }));
    });
  });
}

module.exports = { registerNotificationRoutes };
