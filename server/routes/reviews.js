// ============================================================================
// PEERNEST - Student Reliability & Reviews Module
// ============================================================================

const crypto = require('node:crypto');
const { queryAll, queryOne, execute, transaction } = require('../db');
const { requireAuth } = require('../middleware/auth');

function registerReviewRoutes(router) {
  // 1. SUBMIT TRANSACTION REVIEW
  router.post('/api/reviews', (req, res) => {
    requireAuth(req, res, () => {
      const { transactionType, transactionId, rating, reviewText } = req.body || {};

      if (!transactionType || !transactionId || !rating) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Transaction type, transaction ID, and rating (1-5) are required.' }));
      }

      const numRating = parseInt(rating, 10);
      if (numRating < 1 || numRating > 5) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Rating must be an integer between 1 and 5.' }));
      }

      let revieweeId = null;

      if (transactionType === 'parcel') {
        const parcel = queryOne(`
          SELECT p.*, a.delivery_partner_id 
          FROM parcel_requests p
          LEFT JOIN parcel_assignments a ON p.id = a.parcel_request_id
          WHERE p.id = ?
        `, [transactionId]);

        if (!parcel) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Parcel not found.' }));
        }

        if (parcel.status !== 'completed') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Reviews can only be submitted for completed deliveries.' }));
        }

        if (parcel.requester_id === req.user.id) {
          revieweeId = parcel.delivery_partner_id;
        } else if (parcel.delivery_partner_id === req.user.id) {
          revieweeId = parcel.requester_id;
        } else {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'You are not a participant in this parcel delivery.' }));
        }
      } else if (transactionType === 'rental') {
        const booking = queryOne('SELECT * FROM rental_bookings WHERE id = ?', [transactionId]);
        if (!booking) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Rental booking not found.' }));
        }

        if (booking.status !== 'completed') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Reviews can only be submitted for completed rentals.' }));
        }

        if (booking.borrower_id === req.user.id) {
          revieweeId = booking.owner_id;
        } else if (booking.owner_id === req.user.id) {
          revieweeId = booking.borrower_id;
        } else {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'You are not a participant in this rental booking.' }));
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid transaction type.' }));
      }

      // Check duplicate review
      const existing = queryOne(`
        SELECT id FROM reviews 
        WHERE transaction_type = ? AND transaction_id = ? AND reviewer_id = ?
      `, [transactionType, transactionId, req.user.id]);

      if (existing) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'You have already submitted a review for this transaction.' }));
      }

      const reviewId = 'rev-' + crypto.randomUUID();
      execute(`
        INSERT INTO reviews (id, transaction_type, transaction_id, reviewer_id, reviewee_id, rating, review_text, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [reviewId, transactionType, transactionId, req.user.id, revieweeId, numRating, reviewText ? reviewText.trim() : null]);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Review submitted successfully. Thank you for building campus trust on PeerNest!',
        reviewId
      }));
    });
  });

  // 2. GET USER REVIEWS & RELIABILITY SCORE
  router.get('/api/reviews/user/:userId', (req, res) => {
    const userId = req.params.userId;
    const profile = queryOne('SELECT full_name, student_verified, campus, hostel_block FROM user_profiles WHERE user_id = ?', [userId]);

    if (!profile) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Student not found.' }));
    }

    const reviews = queryAll(`
      SELECT 
        r.id, r.rating, r.review_text, r.transaction_type, r.created_at,
        p.full_name AS reviewer_name, p.student_verified AS reviewer_verified
      FROM reviews r
      JOIN user_profiles p ON r.reviewer_id = p.user_id
      WHERE r.reviewee_id = ?
      ORDER BY r.created_at DESC
    `, [userId]);

    const count = reviews.length;
    const avgRating = count > 0 ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 5.0;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      user: {
        fullName: profile.full_name,
        studentVerified: Boolean(profile.student_verified),
        campus: profile.campus,
        hostelBlock: profile.hostel_block
      },
      averageRating: avgRating,
      totalReviews: count,
      reviews
    }));
  });
}

module.exports = { registerReviewRoutes };
