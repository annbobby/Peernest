// ============================================================================
// PEERNEST - Private Transaction-Based Chat System & Real-Time SSE
// ============================================================================

const crypto = require('node:crypto');
const { queryAll, queryOne, execute, transaction } = require('../db');
const { requireAuth } = require('../middleware/auth');

// In-memory list of active SSE client connections: Map<userId, Set<responseObject>>
const sseClients = new Map();

function sendSseEvent(userId, eventName, data) {
  const connections = sseClients.get(userId);
  if (!connections || connections.size === 0) return;

  const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const clientRes of connections) {
    try {
      clientRes.write(message);
    } catch (e) {
      // Socket may have closed
    }
  }
}

function registerChatRoutes(router) {
  // 1. REAL-TIME SERVER-SENT EVENTS (SSE) STREAM
  router.get('/api/chat/stream', (req, res) => {
    // Authenticate via query token or cookie or authorization header
    const token = req.query.token || (req.headers['authorization'] || '').replace('Bearer ', '');
    const { verifyToken } = require('../middleware/auth');
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized SSE connection.' }));
    }

    const userId = decoded.userId;

    // Set headers for long-lived SSE connection
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(':\n\n'); // SSE comment to establish stream

    // Add to sseClients
    if (!sseClients.has(userId)) {
      sseClients.set(userId, new Set());
    }
    sseClients.get(userId).add(res);

    // Heartbeat every 25 seconds
    const interval = setInterval(() => {
      try {
        res.write('event: ping\ndata: {}\n\n');
      } catch (e) {
        clearInterval(interval);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(interval);
      const userConns = sseClients.get(userId);
      if (userConns) {
        userConns.delete(res);
        if (userConns.size === 0) sseClients.delete(userId);
      }
    });
  });

  // 2. GET USER'S CONVERSATIONS
  router.get('/api/chat/conversations', (req, res) => {
    requireAuth(req, res, () => {
      const convs = queryAll(`
        SELECT 
          c.id, c.transaction_type, c.transaction_id, c.updated_at,
          cp.last_read_at,
          (
            SELECT content FROM messages 
            WHERE conversation_id = c.id 
            ORDER BY created_at DESC LIMIT 1
          ) AS last_message_content,
          (
            SELECT created_at FROM messages 
            WHERE conversation_id = c.id 
            ORDER BY created_at DESC LIMIT 1
          ) AS last_message_time,
          (
            SELECT COUNT(*) FROM messages 
            WHERE conversation_id = c.id 
              AND sender_id != ? 
              AND created_at > cp.last_read_at
          ) AS unread_count
        FROM conversations c
        JOIN conversation_participants cp ON c.id = cp.conversation_id
        WHERE cp.user_id = ?
        ORDER BY c.updated_at DESC
      `, [req.user.id, req.user.id]);

      // Enrich with counterpart and transaction details
      const enriched = convs.map(conv => {
        // Find other participant
        const counterpart = queryOne(`
          SELECT p.user_id, p.full_name, p.student_verified, p.avatar_url, p.hostel_block
          FROM conversation_participants cp
          JOIN user_profiles p ON cp.user_id = p.user_id
          WHERE cp.conversation_id = ? AND cp.user_id != ?
          LIMIT 1
        `, [conv.id, req.user.id]);

        let txTitle = '';
        let txStatus = '';
        let txCode = '';

        if (conv.transaction_type === 'parcel') {
          const parcel = queryOne('SELECT parcel_code, status, parcel_reference FROM parcel_requests WHERE id = ?', [conv.transaction_id]);
          if (parcel) {
            txTitle = `Parcel: ${parcel.parcel_reference}`;
            txStatus = parcel.status;
            txCode = parcel.parcel_code;
          }
        } else if (conv.transaction_type === 'rental') {
          const booking = queryOne(`
            SELECT b.status, l.title 
            FROM rental_bookings b 
            JOIN rental_listings l ON b.listing_id = l.id 
            WHERE b.id = ?
          `, [conv.transaction_id]);
          if (booking) {
            txTitle = `Rental: ${booking.title}`;
            txStatus = booking.status;
            txCode = 'BOOKING';
          }
        }

        return {
          ...conv,
          counterpart: counterpart || { full_name: 'PeerNest Campus Desk', student_verified: 1 },
          transactionTitle: txTitle,
          transactionStatus: txStatus,
          transactionCode: txCode
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversations: enriched }));
    });
  });

  // 3. GET MESSAGES FOR A CONVERSATION
  router.get('/api/chat/conversations/:id/messages', (req, res) => {
    requireAuth(req, res, () => {
      const convId = req.params.id;

      // Verify participant authorization
      const participant = queryOne(`
        SELECT * FROM conversation_participants 
        WHERE conversation_id = ? AND user_id = ?
      `, [convId, req.user.id]);

      if (!participant && !req.profile.is_admin) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'You are not an authorized participant in this private transaction chat.' }));
      }

      // Mark messages as read
      execute(`
        UPDATE conversation_participants
        SET last_read_at = datetime('now')
        WHERE conversation_id = ? AND user_id = ?
      `, [convId, req.user.id]);

      execute(`
        UPDATE messages
        SET is_read = 1
        WHERE conversation_id = ? AND sender_id != ?
      `, [convId, req.user.id]);

      const messages = queryAll(`
        SELECT 
          m.*,
          p.full_name AS sender_name,
          p.student_verified AS sender_verified,
          p.avatar_url AS sender_avatar
        FROM messages m
        LEFT JOIN user_profiles p ON m.sender_id = p.user_id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at ASC
      `, [convId]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages }));
    });
  });

  // 4. SEND MESSAGE
  router.post('/api/chat/conversations/:id/messages', (req, res) => {
    requireAuth(req, res, () => {
      const convId = req.params.id;
      const { content, attachmentUrl, messageType = 'text' } = req.body || {};

      if (!content || !content.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Message content cannot be empty.' }));
      }

      // Verify authorization
      const participant = queryOne(`
        SELECT * FROM conversation_participants 
        WHERE conversation_id = ? AND user_id = ?
      `, [convId, req.user.id]);

      if (!participant && !req.profile.is_admin) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'You are not an authorized participant in this private transaction chat.' }));
      }

      const msgId = 'msg-' + crypto.randomUUID();
      const trimmedContent = content.trim();

      try {
        transaction(() => {
          execute(`
            INSERT INTO messages (id, conversation_id, sender_id, message_type, content, attachment_url, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
          `, [msgId, convId, req.user.id, messageType, trimmedContent, attachmentUrl || null]);

          execute(`
            UPDATE conversations
            SET updated_at = datetime('now')
            WHERE id = ?
          `, [convId]);

          // Update sender's last_read_at
          execute(`
            UPDATE conversation_participants
            SET last_read_at = datetime('now')
            WHERE conversation_id = ? AND user_id = ?
          `, [convId, req.user.id]);
        });

        // Broadcast to other participants via SSE
        const otherParticipants = queryAll(`
          SELECT user_id FROM conversation_participants
          WHERE conversation_id = ? AND user_id != ?
        `, [convId, req.user.id]);

        const messageData = {
          id: msgId,
          conversation_id: convId,
          sender_id: req.user.id,
          sender_name: req.profile.full_name,
          sender_verified: req.profile.student_verified,
          message_type: messageType,
          content: trimmedContent,
          attachment_url: attachmentUrl || null,
          created_at: new Date().toISOString()
        };

        for (const p of otherParticipants) {
          sendSseEvent(p.user_id, 'new_message', messageData);

          // In-app notification for new message
          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, ?, ?, 'chat', ?, 0, datetime('now'))
          `, [
            'notif-' + crypto.randomUUID(),
            p.user_id,
            `New message from ${req.profile.full_name}`,
            trimmedContent.length > 60 ? trimmedContent.slice(0, 57) + '...' : trimmedContent,
            `/chat?conversationId=${convId}`
          ]);
        }

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Message sent successfully.',
          messageData
        }));
      } catch (err) {
        console.error('Send message error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to send message.' }));
      }
    });
  });
}

module.exports = { registerChatRoutes, sendSseEvent };
