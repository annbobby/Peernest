// ============================================================================
// PEERNEST - Student-to-Student Rental Marketplace Module
// ============================================================================

const crypto = require('node:crypto');
const { queryAll, queryOne, execute, transaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sanitizeProfile } = require('./auth');

// Calculate billable rental days (inclusive of dates or min 1 day)
function calculateBillableDays(startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

function calculateRentalPricing(dailyPrice, billableDays) {
  const settings = queryAll("SELECT key, value FROM platform_settings WHERE category = 'commission'");
  let commissionPercent = 10.0;
  for (const s of settings) {
    if (s.key === 'rental_commission_percent') commissionPercent = parseFloat(s.value);
  }

  const rentalCharge = Math.round(dailyPrice * billableDays * 100) / 100;
  const platformCommission = Math.round(rentalCharge * (commissionPercent / 100) * 100) / 100;
  const ownerEarnings = Math.round((rentalCharge - platformCommission) * 100) / 100;

  return {
    billableDays,
    dailyPrice,
    rentalCharge,
    platformCommission,
    ownerEarnings
  };
}

function registerRentalRoutes(router) {
  // 1. GET CATEGORIES
  router.get('/api/rentals/categories', (req, res) => {
    const categories = queryAll('SELECT * FROM rental_categories WHERE is_active = 1 ORDER BY name');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ categories }));
  });

  // 2. BROWSE MARKETPLACE LISTINGS
  router.get('/api/rentals/listings', (req, res) => {
    const { category, search, condition, minPrice, maxPrice, sort = 'newest' } = req.query || {};

    let query = `
      SELECT 
        l.*,
        c.name AS category_name, c.slug AS category_slug,
        p.full_name AS owner_name, p.student_verified AS owner_verified,
        p.campus AS owner_campus, p.hostel_block AS owner_hostel,
        p.avatar_url AS owner_avatar
      FROM rental_listings l
      JOIN rental_categories c ON l.category_id = c.id
      JOIN user_profiles p ON l.owner_id = p.user_id
      WHERE l.is_active = 1 AND l.is_paused = 0
    `;
    const params = [];

    if (category) {
      query += ' AND (c.slug = ? OR c.id = ?)';
      params.push(category, category);
    }

    if (search) {
      query += ' AND (l.title LIKE ? OR l.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (condition) {
      query += ' AND l.condition = ?';
      params.push(condition);
    }

    if (minPrice) {
      query += ' AND l.daily_price >= ?';
      params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      query += ' AND l.daily_price <= ?';
      params.push(parseFloat(maxPrice));
    }

    if (sort === 'price_asc') {
      query += ' ORDER BY l.daily_price ASC';
    } else if (sort === 'price_desc') {
      query += ' ORDER BY l.daily_price DESC';
    } else if (sort === 'popular') {
      query += ' ORDER BY l.views_count DESC';
    } else {
      query += ' ORDER BY l.created_at DESC';
    }

    const rawListings = queryAll(query, params);
    const listings = rawListings.map(item => ({
      ...item,
      photos: JSON.parse(item.photos || '[]')
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ listings }));
  });

  // 3. GET SINGLE LISTING
  router.get('/api/rentals/listings/:id', (req, res) => {
    const item = queryOne(`
      SELECT 
        l.*,
        c.name AS category_name, c.slug AS category_slug,
        p.full_name AS owner_name, p.student_verified AS owner_verified,
        p.campus AS owner_campus, p.hostel_block AS owner_hostel,
        p.avatar_url AS owner_avatar, p.bio AS owner_bio
      FROM rental_listings l
      JOIN rental_categories c ON l.category_id = c.id
      JOIN user_profiles p ON l.owner_id = p.user_id
      WHERE l.id = ?
    `, [req.params.id]);

    if (!item) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Rental listing not found.' }));
    }

    // Increment view count
    execute('UPDATE rental_listings SET views_count = views_count + 1 WHERE id = ?', [item.id]);

    // Fetch owner ratings summary
    const reviews = queryAll(`
      SELECT r.rating, r.review_text, r.created_at, p.full_name AS reviewer_name
      FROM reviews r
      JOIN user_profiles p ON r.reviewer_id = p.user_id
      WHERE r.reviewee_id = ?
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [item.owner_id]);

    const avgRating = reviews.length > 0
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
      : 5.0;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      listing: {
        ...item,
        photos: JSON.parse(item.photos || '[]'),
        ownerAverageRating: avgRating,
        totalReviewsCount: reviews.length,
        recentReviews: reviews
      }
    }));
  });

  // 4. CREATE RENTAL LISTING (Lend items)
  router.post('/api/rentals/listings', (req, res) => {
    requireAuth(req, res, () => {
      const {
        title,
        categoryId,
        description,
        condition = 'good',
        dailyPrice,
        securityDeposit,
        declaredValue,
        minDurationDays = 1,
        maxDurationDays = 30,
        handoverLocation,
        terms,
        latePolicy,
        photos = []
      } = req.body || {};

      if (!title || !categoryId || !description || dailyPrice === undefined || securityDeposit === undefined || declaredValue === undefined || !handoverLocation) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Title, category, description, daily price, refundable security deposit, declared item value, and handover location are required.' }));
      }

      const numDaily = parseFloat(dailyPrice);
      const numDeposit = parseFloat(securityDeposit);
      const numDeclared = parseFloat(declaredValue);

      if (numDaily <= 0 || numDeposit < 0 || numDeclared <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Daily rental price and declared item value must be positive numbers.' }));
      }

      const category = queryOne('SELECT id FROM rental_categories WHERE id = ?', [categoryId]);
      if (!category) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Selected rental category does not exist.' }));
      }

      const listingId = 'list-' + crypto.randomUUID();
      try {
        execute(`
          INSERT INTO rental_listings (
            id, owner_id, title, category_id, description, condition,
            daily_price, security_deposit, declared_value, min_duration_days,
            max_duration_days, handover_location, terms, late_policy, photos,
            is_active, is_paused, views_count, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, datetime('now'), datetime('now'))
        `, [
          listingId,
          req.user.id,
          title.trim(),
          categoryId,
          description.trim(),
          condition,
          numDaily,
          numDeposit,
          numDeclared,
          parseInt(minDurationDays, 10) || 1,
          parseInt(maxDurationDays, 10) || 30,
          handoverLocation.trim(),
          terms ? terms.trim() : null,
          latePolicy ? latePolicy.trim() : null,
          JSON.stringify(Array.isArray(photos) ? photos : [])
        ]);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Rental listing published successfully!',
          listingId
        }));
      } catch (err) {
        console.error('Create listing error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to create rental listing.' }));
      }
    });
  });

  // 5. PRICE QUOTE & CALCULATION FOR BOOKING
  router.post('/api/rentals/quote', (req, res) => {
    const { listingId, startDate, endDate } = req.body || {};
    if (!listingId || !startDate || !endDate) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Listing ID, start date, and end date are required.' }));
    }

    const listing = queryOne('SELECT * FROM rental_listings WHERE id = ?', [listingId]);
    if (!listing) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Listing not found.' }));
    }

    const billableDays = calculateBillableDays(startDate, endDate);
    if (billableDays < listing.min_duration_days) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `Minimum rental duration for this item is ${listing.min_duration_days} day(s).` }));
    }
    if (billableDays > listing.max_duration_days) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `Maximum rental duration for this item is ${listing.max_duration_days} day(s).` }));
    }

    const pricing = calculateRentalPricing(listing.daily_price, billableDays);
    const totalPayable = Math.round((pricing.rentalCharge + listing.security_deposit) * 100) / 100;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      listingId: listing.id,
      title: listing.title,
      startDate,
      endDate,
      billableDays,
      dailyPrice: listing.daily_price,
      rentalCharge: pricing.rentalCharge,
      platformCommission: pricing.platformCommission,
      ownerEarnings: pricing.ownerEarnings,
      refundableSecurityDeposit: listing.security_deposit,
      declaredItemValue: listing.declared_value,
      totalPayable
    }));
  });

  // 6. BOOK RENTAL ITEM (Concurrency Protected & Self-rental Prevention)
  router.post('/api/rentals/book', (req, res) => {
    requireAuth(req, res, () => {
      const { listingId, startDate, endDate } = req.body || {};
      if (!listingId || !startDate || !endDate) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Listing ID, start date, and end date are required.' }));
      }

      try {
        const result = transaction(() => {
          const listing = queryOne('SELECT * FROM rental_listings WHERE id = ?', [listingId]);
          if (!listing) return { error: 'Listing not found.', status: 404 };

          // STRICT RULE: Student cannot rent their own item!
          if (listing.owner_id === req.user.id) {
            return { error: 'You cannot rent your own item. Self-rental is strictly prohibited.', status: 400 };
          }

          if (!listing.is_active || listing.is_paused) {
            return { error: 'This listing is currently unavailable for booking.', status: 400 };
          }

          const billableDays = calculateBillableDays(startDate, endDate);
          if (billableDays < listing.min_duration_days || billableDays > listing.max_duration_days) {
            return { error: `Requested duration must be between ${listing.min_duration_days} and ${listing.max_duration_days} days.`, status: 400 };
          }

          // CONCURRENCY CHECK: Prevent overlapping confirmed/active bookings
          const overlapping = queryOne(`
            SELECT id FROM rental_bookings
            WHERE listing_id = ?
              AND status IN ('accepted', 'payment_pending', 'active')
              AND (
                (start_date <= ? AND end_date >= ?) OR
                (start_date <= ? AND end_date >= ?) OR
                (start_date >= ? AND end_date <= ?)
              )
          `, [listingId, startDate, startDate, endDate, endDate, startDate, endDate]);

          if (overlapping) {
            return { error: 'This item is already booked for the selected date range. Please choose different dates.', status: 409 };
          }

          const pricing = calculateRentalPricing(listing.daily_price, billableDays);
          const totalPayable = Math.round((pricing.rentalCharge + listing.security_deposit) * 100) / 100;
          const bookingId = 'bk-' + crypto.randomUUID();

          execute(`
            INSERT INTO rental_bookings (
              id, listing_id, borrower_id, owner_id, start_date, end_date,
              billable_days, daily_price, total_rental_charge, security_deposit,
              platform_commission, total_payable, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
          `, [
            bookingId,
            listing.id,
            req.user.id,
            listing.owner_id,
            startDate,
            endDate,
            billableDays,
            listing.daily_price,
            pricing.rentalCharge,
            listing.security_deposit,
            pricing.platformCommission,
            totalPayable
          ]);

          // Notify owner
          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, 'New Rental Booking Request', ?, 'rental', '/dashboard/lender', 0, datetime('now'))
          `, [
            'notif-' + crypto.randomUUID(),
            listing.owner_id,
            `A student requested to rent "${listing.title}" for ${billableDays} days. Please review and accept or reject.`,
          ]);

          return { success: true, bookingId, totalPayable };
        });

        if (result.error) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: result.error }));
        }

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Rental booking request submitted. Awaiting owner confirmation.',
          ...result
        }));
      } catch (err) {
        console.error('Book rental error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to submit rental booking.' }));
      }
    });
  });

  // 7. OWNER ACCEPTS OR REJECTS BOOKING REQUEST
  router.post('/api/rentals/bookings/:id/respond', (req, res) => {
    requireAuth(req, res, () => {
      const bookingId = req.params.id;
      const { action } = req.body || {}; // 'accept' or 'reject'

      if (action !== 'accept' && action !== 'reject') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: "Action must be either 'accept' or 'reject'." }));
      }

      try {
        const result = transaction(() => {
          const booking = queryOne(`
            SELECT b.*, l.title AS item_title
            FROM rental_bookings b
            JOIN rental_listings l ON b.listing_id = l.id
            WHERE b.id = ?
          `, [bookingId]);

          if (!booking) return { error: 'Booking not found.', status: 404 };

          if (booking.owner_id !== req.user.id && !req.profile.is_admin) {
            return { error: 'Only the item owner can respond to this booking request.', status: 403 };
          }

          if (booking.status !== 'pending') {
            return { error: `Booking has already been processed (current status: ${booking.status}).`, status: 400 };
          }

          if (action === 'reject') {
            execute("UPDATE rental_bookings SET status = 'rejected', updated_at = datetime('now') WHERE id = ?", [bookingId]);
            execute(`
              INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
              VALUES (?, ?, 'Rental Request Declined', ?, 'rental', '/dashboard/borrower', 0, datetime('now'))
            `, ['notif-' + crypto.randomUUID(), booking.borrower_id, `Your request to rent "${booking.item_title}" was declined by the owner.`]);
            return { success: true, status: 'rejected' };
          }

          // ACCEPT BOOKING
          execute("UPDATE rental_bookings SET status = 'accepted', updated_at = datetime('now') WHERE id = ?", [bookingId]);

          // Create private transaction conversation between owner and borrower
          const convId = 'conv-' + crypto.randomUUID();
          execute(`
            INSERT OR IGNORE INTO conversations (id, transaction_type, transaction_id, created_at, updated_at)
            VALUES (?, 'rental', ?, datetime('now'), datetime('now'))
          `, [convId, bookingId]);

          const existingConv = queryOne("SELECT id FROM conversations WHERE transaction_type = 'rental' AND transaction_id = ?", [bookingId]);
          const actualConvId = existingConv ? existingConv.id : convId;

          execute(`
            INSERT OR IGNORE INTO conversation_participants (id, conversation_id, user_id, joined_at)
            VALUES (?, ?, ?, datetime('now'))
          `, ['cp-' + crypto.randomUUID(), actualConvId, booking.owner_id]);

          execute(`
            INSERT OR IGNORE INTO conversation_participants (id, conversation_id, user_id, joined_at)
            VALUES (?, ?, ?, datetime('now'))
          `, ['cp-' + crypto.randomUUID(), actualConvId, booking.borrower_id]);

          // System message in chat
          execute(`
            INSERT INTO messages (id, conversation_id, sender_id, message_type, content, is_read, created_at)
            VALUES (?, ?, ?, 'system', 'Rental request accepted by owner! Complete payment and coordinate handover location here.', 0, datetime('now'))
          `, ['msg-' + crypto.randomUUID(), actualConvId, req.user.id]);

          // In-app notification to borrower
          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, 'Rental Request Accepted!', ?, 'rental', '/dashboard/borrower', 0, datetime('now'))
          `, [
            'notif-' + crypto.randomUUID(),
            booking.borrower_id,
            `Your rental request for "${booking.item_title}" was accepted! Please complete payment to confirm handover.`
          ]);

          return { success: true, status: 'accepted', conversationId: actualConvId };
        });

        if (result.error) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: result.error }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: `Booking request ${action}ed successfully.`,
          ...result
        }));
      } catch (err) {
        console.error('Respond booking error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to process booking response.' }));
      }
    });
  });

  // 8. COMPLETE PAYMENT (Borrower pays rental fee + refundable security deposit)
  router.post('/api/rentals/bookings/:id/pay', (req, res) => {
    requireAuth(req, res, () => {
      const bookingId = req.params.id;
      const { paymentMethod = 'upi' } = req.body || {};

      try {
        const result = transaction(() => {
          const booking = queryOne(`
            SELECT b.*, l.title AS item_title
            FROM rental_bookings b
            JOIN rental_listings l ON b.listing_id = l.id
            WHERE b.id = ?
          `, [bookingId]);

          if (!booking) return { error: 'Booking not found.', status: 404 };
          if (booking.borrower_id !== req.user.id && !req.profile.is_admin) {
            return { error: 'Only the borrower can complete payment for this booking.', status: 403 };
          }
          if (booking.status !== 'accepted') {
            return { error: `Booking cannot be paid from status '${booking.status}'. Must be 'accepted'.`, status: 400 };
          }

          // Record payment
          const orderId = 'ORD-RENT-' + crypto.randomUUID().slice(0, 8).toUpperCase();
          const paymentId = 'pay-' + crypto.randomUUID();

          execute(`
            INSERT INTO payments (
              id, order_id, transaction_type, transaction_id, payer_id, amount,
              currency, gateway, gateway_payment_id, status, fee_breakdown_json,
              created_at, updated_at
            )
            VALUES (?, ?, 'rental', ?, ?, ?, 'INR', 'razorpay_mock', ?, 'captured', ?, datetime('now'), datetime('now'))
          `, [
            paymentId,
            orderId,
            bookingId,
            req.user.id,
            booking.total_payable,
            'pay_mock_' + crypto.randomUUID().slice(0, 10),
            JSON.stringify({
              rentalCharge: booking.total_rental_charge,
              platformCommission: booking.platform_commission,
              refundableDeposit: booking.security_deposit,
              paymentMethod
            })
          ]);

          // Status moves to 'active' (or ready for handover condition report)
          execute("UPDATE rental_bookings SET status = 'active', updated_at = datetime('now') WHERE id = ?", [bookingId]);

          // System message in chat
          const conv = queryOne("SELECT id FROM conversations WHERE transaction_type = 'rental' AND transaction_id = ?", [bookingId]);
          if (conv) {
            execute(`
              INSERT INTO messages (id, conversation_id, sender_id, message_type, content, is_read, created_at)
              VALUES (?, ?, ?, 'system', 'Payment verified! Rental charge and refundable deposit received. Both students may now record the pre-handover condition checklist.', 0, datetime('now'))
            `, ['msg-' + crypto.randomUUID(), conv.id, req.user.id]);
          }

          // Notify owner
          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, 'Payment Confirmed For Rental', ?, 'payment', '/dashboard/lender', 0, datetime('now'))
          `, [
            'notif-' + crypto.randomUUID(),
            booking.owner_id,
            `Borrower paid ₹${booking.total_payable} for "${booking.item_title}". Meet for handover and complete the condition report.`
          ]);

          return { success: true, bookingId, orderId, amountPaid: booking.total_payable };
        });

        if (result.error) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: result.error }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Payment verified successfully! Rental is now active.',
          ...result
        }));
      } catch (err) {
        console.error('Rental payment error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to process payment.' }));
      }
    });
  });

  // 9. RECORD HANDOVER CONDITION REPORT (Pre-handover inspection)
  router.post('/api/rentals/bookings/:id/handover', (req, res) => {
    requireAuth(req, res, () => {
      const bookingId = req.params.id;
      const { conditionRating = 'good', defectsNotes, checklist, photoUrls = [] } = req.body || {};

      try {
        const result = transaction(() => {
          const booking = queryOne('SELECT * FROM rental_bookings WHERE id = ?', [bookingId]);
          if (!booking) return { error: 'Booking not found.', status: 404 };

          const isParticipant = booking.borrower_id === req.user.id || booking.owner_id === req.user.id || req.profile.is_admin;
          if (!isParticipant) return { error: 'Unauthorized.', status: 403 };

          const reportId = 'cond-' + crypto.randomUUID();
          execute(`
            INSERT INTO rental_condition_reports (
              id, booking_id, stage, reported_by_user_id, condition_rating,
              defects_notes, checklist_json, photo_urls, confirmed_by_counterpart,
              created_at
            )
            VALUES (?, ?, 'pre_handover', ?, ?, ?, ?, ?, 1, datetime('now'))
          `, [
            reportId,
            bookingId,
            req.user.id,
            conditionRating,
            defectsNotes || 'No pre-existing defects reported at handover.',
            JSON.stringify(checklist || { functional: true, clean: true, accessoriesIncluded: true }),
            JSON.stringify(Array.isArray(photoUrls) ? photoUrls : [])
          ]);

          execute(`
            UPDATE rental_bookings
            SET handover_confirmed_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
          `, [bookingId]);

          // Chat message
          const conv = queryOne("SELECT id FROM conversations WHERE transaction_type = 'rental' AND transaction_id = ?", [bookingId]);
          if (conv) {
            execute(`
              INSERT INTO messages (id, conversation_id, sender_id, message_type, content, is_read, created_at)
              VALUES (?, ?, ?, 'system', 'Handover condition report recorded with photos. Item is now in active rental custody.', 0, datetime('now'))
            `, ['msg-' + crypto.randomUUID(), conv.id, req.user.id]);
          }

          return { success: true, reportId };
        });

        if (result.error) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: result.error }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Handover condition report recorded successfully.',
          ...result
        }));
      } catch (err) {
        console.error('Handover report error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to record condition report.' }));
      }
    });
  });

  // 10. RETURN ITEM & DEPOSIT REFUND / DAMAGE CLAIM INSPECTION
  router.post('/api/rentals/bookings/:id/return', (req, res) => {
    requireAuth(req, res, () => {
      const bookingId = req.params.id;
      const { returnPhotoUrls = [], defectsFound = false, damageDescription, repairEstimate = 0 } = req.body || {};

      try {
        const result = transaction(() => {
          const booking = queryOne(`
            SELECT b.*, l.title AS item_title, l.declared_value
            FROM rental_bookings b
            JOIN rental_listings l ON b.listing_id = l.id
            WHERE b.id = ?
          `, [bookingId]);

          if (!booking) return { error: 'Booking not found.', status: 404 };

          if (booking.owner_id !== req.user.id && !req.profile.is_admin) {
            return { error: 'Only the item owner can complete the return inspection and deposit settlement.', status: 403 };
          }

          if (booking.status !== 'active') {
            return { error: `Booking cannot be returned from status '${booking.status}'. Must be 'active'.`, status: 400 };
          }

          // Case A: Damage Claim filed by Owner
          if (defectsFound && damageDescription) {
            const numEstimate = parseFloat(repairEstimate) || 0;
            const claimId = 'claim-' + crypto.randomUUID();

            execute(`
              INSERT INTO rental_damage_claims (
                id, booking_id, owner_id, borrower_id, claim_description,
                repair_estimate, photo_urls, status, settlement_deduction,
                refund_amount, created_at, updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_borrower_response', ?, ?, datetime('now'), datetime('now'))
            `, [
              claimId,
              bookingId,
              booking.owner_id,
              booking.borrower_id,
              damageDescription.trim(),
              numEstimate,
              JSON.stringify(returnPhotoUrls),
              numEstimate,
              Math.max(0, booking.security_deposit - numEstimate)
            ]);

            execute("UPDATE rental_bookings SET status = 'disputed', return_confirmed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [bookingId]);

            // Notify borrower of damage claim
            execute(`
              INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
              VALUES (?, ?, 'Damage Claim Filed for Rental Return', ?, 'dispute', '/dashboard/borrower', 0, datetime('now'))
            `, [
              'notif-' + crypto.randomUUID(),
              booking.borrower_id,
              `Owner reported damage for "${booking.item_title}" (Claim: ₹${numEstimate}). You have 24 hours to review and respond.`
            ]);

            return {
              success: true,
              status: 'disputed',
              damageClaimFiled: true,
              message: 'Return recorded with damage claim. Awaiting borrower review.'
            };
          }

          // Case B: Clean Return -> Full Deposit Refund & Owner Earnings Payout
          execute("UPDATE rental_bookings SET status = 'completed', return_confirmed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [bookingId]);

          // Full deposit refund record
          const refundId = 'ref-' + crypto.randomUUID();
          execute(`
            INSERT INTO refunds (id, payment_id, transaction_id, transaction_type, amount, reason, status, created_at)
            VALUES (?, (SELECT id FROM payments WHERE transaction_id = ? LIMIT 1), ?, 'rental_deposit_refund', ?, 'Full security deposit returned after satisfactory item inspection.', 'processed', datetime('now'))
          `, [refundId, bookingId, bookingId, booking.security_deposit]);

          // Owner earnings payout record
          const ownerEarnings = booking.total_rental_charge - booking.platform_commission;
          execute(`
            INSERT INTO payouts (id, user_id, user_role, amount, reference_type, reference_id, status, notes, processed_at, created_at)
            VALUES (?, ?, 'rental_lender', ?, 'rental_earnings', ?, 'completed', ?, datetime('now'), datetime('now'))
          `, [
            'payo-' + crypto.randomUUID(),
            booking.owner_id,
            ownerEarnings,
            bookingId,
            `Rental income for "${booking.item_title}" (${booking.billable_days} days)`
          ]);

          // Post-return condition report
          execute(`
            INSERT INTO rental_condition_reports (
              id, booking_id, stage, reported_by_user_id, condition_rating,
              defects_notes, photo_urls, confirmed_by_counterpart, created_at
            )
            VALUES (?, ?, 'post_return', ?, 'good', 'Returned in good working order. Full deposit released.', ?, 1, datetime('now'))
          `, ['cond-' + crypto.randomUUID(), bookingId, req.user.id, JSON.stringify(returnPhotoUrls)]);

          // Notifications
          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, 'Security Deposit Refunded!', ?, 'payment', '/dashboard/borrower', 0, datetime('now'))
          `, [
            'notif-' + crypto.randomUUID(),
            booking.borrower_id,
            `Your full security deposit of ₹${booking.security_deposit} for "${booking.item_title}" has been refunded!`
          ]);

          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, 'Rental Payout Credited', ?, 'payment', '/dashboard/lender', 0, datetime('now'))
          `, [
            'notif-' + crypto.randomUUID(),
            booking.owner_id,
            `₹${ownerEarnings} has been credited to your account for renting "${booking.item_title}".`
          ]);

          // Chat message
          const conv = queryOne("SELECT id FROM conversations WHERE transaction_type = 'rental' AND transaction_id = ?", [bookingId]);
          if (conv) {
            execute(`
              INSERT INTO messages (id, conversation_id, sender_id, message_type, content, is_read, created_at)
              VALUES (?, ?, ?, 'system', 'Item return inspection complete! Full deposit of ₹${booking.security_deposit} refunded to borrower. Rental completed.', 0, datetime('now'))
            `, ['msg-' + crypto.randomUUID(), conv.id, req.user.id]);
          }

          return {
            success: true,
            status: 'completed',
            depositRefunded: booking.security_deposit,
            ownerEarnings
          };
        });

        if (result.error) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: result.error }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Item return processed successfully.',
          ...result
        }));
      } catch (err) {
        console.error('Return item error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to process item return.' }));
      }
    });
  });

  // 11. BORROWER RESPONDS TO DAMAGE CLAIM
  router.post('/api/rentals/bookings/:id/respond-claim', (req, res) => {
    requireAuth(req, res, () => {
      const bookingId = req.params.id;
      const { borrowerResponse, acceptClaim = false, counterEvidenceUrls = [] } = req.body || {};

      try {
        const result = transaction(() => {
          const claim = queryOne('SELECT * FROM rental_damage_claims WHERE booking_id = ?', [bookingId]);
          if (!claim) return { error: 'Damage claim not found.', status: 404 };

          if (claim.borrower_id !== req.user.id && !req.profile.is_admin) {
            return { error: 'Only the borrower can respond to this damage claim.', status: 403 };
          }

          const booking = queryOne('SELECT * FROM rental_bookings WHERE id = ?', [bookingId]);

          if (acceptClaim) {
            // Borrower accepts owner claim
            const deduction = Math.min(booking.security_deposit, claim.repair_estimate);
            const refund = booking.security_deposit - deduction;

            execute(`
              UPDATE rental_damage_claims
              SET borrower_response = ?, status = 'settled_mutual', settlement_deduction = ?, refund_amount = ?, updated_at = datetime('now')
              WHERE id = ?
            `, [borrowerResponse || 'Accepted damage deduction.', deduction, refund, claim.id]);

            execute("UPDATE rental_bookings SET status = 'completed', updated_at = datetime('now') WHERE id = ?", [bookingId]);

            // Payout deduction to owner
            execute(`
              INSERT INTO payouts (id, user_id, user_role, amount, reference_type, reference_id, status, notes, processed_at, created_at)
              VALUES (?, ?, 'rental_lender', ?, 'damage_compensation', ?, 'completed', 'Damage compensation approved by borrower', datetime('now'), datetime('now'))
            `, ['payo-' + crypto.randomUUID(), claim.owner_id, deduction, bookingId]);

            // Refund balance to borrower if any
            if (refund > 0) {
              execute(`
                INSERT INTO refunds (id, payment_id, transaction_id, transaction_type, amount, reason, status, created_at)
                VALUES (?, (SELECT id FROM payments WHERE transaction_id = ? LIMIT 1), ?, 'rental_deposit_partial', ?, 'Remaining deposit after damage deduction.', 'processed', datetime('now'))
              `, ['ref-' + crypto.randomUUID(), bookingId, bookingId, refund]);
            }

            return { success: true, status: 'settled_mutual', deduction, refund };
          } else {
            // Borrower disputes claim -> moves to admin review
            execute(`
              UPDATE rental_damage_claims
              SET borrower_response = ?, borrower_evidence_urls = ?, status = 'admin_review', updated_at = datetime('now')
              WHERE id = ?
            `, [borrowerResponse || 'Borrower disputes damage assessment.', JSON.stringify(counterEvidenceUrls), claim.id]);

            // Notify admins
            const admins = queryAll("SELECT user_id FROM user_profiles WHERE is_admin = 1");
            for (const a of admins) {
              execute(`
                INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
                VALUES (?, ?, 'Rental Damage Dispute Needs Review', 'A rental damage dispute was escalated to campus administration.', 'dispute', '/admin/disputes', 0, datetime('now'))
              `, ['notif-' + crypto.randomUUID(), a.user_id]);
            }

            return { success: true, status: 'admin_review', message: 'Dispute escalated to administrator for evidence review.' };
          }
        });

        if (result.error) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: result.error }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Response submitted successfully.',
          ...result
        }));
      } catch (err) {
        console.error('Damage response error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to submit response.' }));
      }
    });
  });

  // 12. GET MY LISTINGS & INCOMING BOOKINGS (Lender Dashboard)
  router.get('/api/rentals/my-listings', (req, res) => {
    requireAuth(req, res, () => {
      const listings = queryAll(`
        SELECT l.*, c.name AS category_name
        FROM rental_listings l
        JOIN rental_categories c ON l.category_id = c.id
        WHERE l.owner_id = ?
        ORDER BY l.created_at DESC
      `, [req.user.id]).map(l => ({ ...l, photos: JSON.parse(l.photos || '[]') }));

      const incomingBookings = queryAll(`
        SELECT 
          b.*,
          l.title AS item_title, l.declared_value,
          p.full_name AS borrower_name, p.student_verified AS borrower_verified,
          p.hostel_block AS borrower_hostel,
          conv.id AS conversation_id,
          claim.status AS damage_claim_status, claim.repair_estimate AS damage_claim_amount
        FROM rental_bookings b
        JOIN rental_listings l ON b.listing_id = l.id
        JOIN user_profiles p ON b.borrower_id = p.user_id
        LEFT JOIN conversations conv ON (conv.transaction_type = 'rental' AND conv.transaction_id = b.id)
        LEFT JOIN rental_damage_claims claim ON claim.booking_id = b.id
        WHERE b.owner_id = ?
        ORDER BY b.created_at DESC
      `, [req.user.id]);

      // Calculate earnings summary
      const completedBookings = incomingBookings.filter(b => b.status === 'completed');
      const totalEarned = completedBookings.reduce((sum, b) => sum + (b.total_rental_charge - b.platform_commission), 0);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        listings,
        bookings: incomingBookings,
        summary: {
          totalListings: listings.length,
          activeBookings: incomingBookings.filter(b => b.status === 'active').length,
          pendingRequests: incomingBookings.filter(b => b.status === 'pending').length,
          totalEarned: Math.round(totalEarned * 100) / 100
        }
      }));
    });
  });

  // 13. GET MY BOOKINGS (Borrower Dashboard)
  router.get('/api/rentals/my-bookings', (req, res) => {
    requireAuth(req, res, () => {
      const bookings = queryAll(`
        SELECT 
          b.*,
          l.title AS item_title, l.declared_value, l.handover_location,
          l.photos AS item_photos,
          p.full_name AS owner_name, p.student_verified AS owner_verified,
          p.hostel_block AS owner_hostel,
          conv.id AS conversation_id,
          claim.id AS claim_id, claim.status AS claim_status, claim.repair_estimate,
          claim.claim_description, claim.borrower_response
        FROM rental_bookings b
        JOIN rental_listings l ON b.listing_id = l.id
        JOIN user_profiles p ON b.owner_id = p.user_id
        LEFT JOIN conversations conv ON (conv.transaction_type = 'rental' AND conv.transaction_id = b.id)
        LEFT JOIN rental_damage_claims claim ON claim.booking_id = b.id
        WHERE b.borrower_id = ?
        ORDER BY b.created_at DESC
      `, [req.user.id]).map(b => ({
        ...b,
        item_photos: JSON.parse(b.item_photos || '[]')
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ bookings }));
    });
  });
}

module.exports = { registerRentalRoutes };
