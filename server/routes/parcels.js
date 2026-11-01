// ============================================================================
// PEERNEST - Parcel Pickup and Delivery Module
// ============================================================================

const crypto = require('node:crypto');
const { queryAll, queryOne, execute, transaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { calculateDeliveryFare, calculateRouteDistance } = require('./gps');

function generateParcelCode() {
  const dateStr = new Date().toISOString().slice(0, 7).replace('-', '');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `PN-PAR-${dateStr}-${randomSuffix}`;
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function registerParcelRoutes(router) {
  // 1. CREATE PARCEL REQUEST
  router.post('/api/parcels/request', (req, res) => {
    requireAuth(req, res, () => {
      const {
        parcelReference,
        collectionCentreId,
        destinationHostelId,
        designatedLocation,
        preferredPickupTime,
        instructions,
        declaredValue = 500,
        partnerLat,
        partnerLng,
        useFallback = false
      } = req.body || {};

      if (!parcelReference || !collectionCentreId || !destinationHostelId || !designatedLocation) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Please provide courier tracking reference, collection centre, hostel, and designated drop-off location.' }));
      }

      // Check max declared value setting
      const maxValSetting = queryOne("SELECT value FROM platform_settings WHERE key = 'max_declared_parcel_value'");
      const maxAllowedValue = maxValSetting ? parseFloat(maxValSetting.value) : 10000.0;
      const numDeclaredValue = parseFloat(declaredValue) || 500.0;

      if (numDeclaredValue > maxAllowedValue) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `Declared parcel value exceeds campus maximum limit of ₹${maxAllowedValue}.` }));
      }

      const centre = queryOne('SELECT * FROM campus_locations WHERE id = ?', [collectionCentreId]);
      const hostel = queryOne('SELECT * FROM hostel_locations WHERE id = ?', [destinationHostelId]);
      if (!centre || !hostel) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Selected campus collection centre or hostel does not exist.' }));
      }

      // Calculate distance & fare
      let totalDistance = 0.5;
      if (!useFallback) {
        const segB = calculateRouteDistance(centre.latitude, centre.longitude, hostel.latitude, hostel.longitude);
        totalDistance = Math.round((0.3 + segB) * 10) / 10;
      }
      const fare = calculateDeliveryFare(totalDistance, useFallback);

      const parcelId = 'par-' + crypto.randomUUID();
      const parcelCode = generateParcelCode();

      try {
        transaction(() => {
          execute(`
            INSERT INTO parcel_requests (
              id, parcel_code, requester_id, parcel_reference, collection_centre_id,
              destination_hostel_id, designated_location, preferred_pickup_time,
              instructions, declared_value, distance_km, base_fee, km_fee,
              total_fee, partner_earnings, platform_commission, status,
              created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting_for_partner', datetime('now'), datetime('now'))
          `, [
            parcelId,
            parcelCode,
            req.user.id,
            parcelReference.trim(),
            collectionCentreId,
            destinationHostelId,
            designatedLocation.trim(),
            preferredPickupTime || null,
            instructions ? instructions.trim() : null,
            numDeclaredValue,
            fare.distanceKm,
            fare.baseFee,
            fare.kmFee,
            fare.totalFee,
            fare.partnerEarnings,
            fare.platformCommission
          ]);

          execute(`
            INSERT INTO parcel_status_history (id, parcel_request_id, status, changed_by_user_id, notes, created_at)
            VALUES (?, ?, 'submitted', ?, 'Parcel request submitted by requester.', datetime('now'))
          `, ['hist-' + crypto.randomUUID(), parcelId, req.user.id]);

          // Create notification for requester
          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, 'Parcel Request Created', ?, 'parcel', ?, 0, datetime('now'))
          `, [
            'notif-' + crypto.randomUUID(),
            req.user.id,
            `Your parcel request #${parcelCode} is waiting for an approved delivery partner.`,
            `/dashboard/requester`
          ]);
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Parcel pickup request created successfully.',
          parcelId,
          parcelCode,
          fare
        }));
      } catch (err) {
        console.error('Parcel creation error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to create parcel request.' }));
      }
    });
  });

  // 2. GET AVAILABLE PARCEL REQUESTS (For delivery partners)
  router.get('/api/parcels/available', (req, res) => {
    requireAuth(req, res, () => {
      // Exclude requests created by the user themselves
      const parcels = queryAll(`
        SELECT 
          p.id, p.parcel_code, p.parcel_reference, p.designated_location,
          p.preferred_pickup_time, p.instructions, p.declared_value,
          p.distance_km, p.base_fee, p.km_fee, p.total_fee,
          p.partner_earnings, p.platform_commission, p.status, p.created_at,
          c.name AS collection_centre_name, c.code AS collection_centre_code,
          h.name AS destination_hostel_name, h.code AS destination_hostel_code,
          prof.full_name AS requester_name, prof.student_verified AS requester_verified
        FROM parcel_requests p
        JOIN campus_locations c ON p.collection_centre_id = c.id
        JOIN hostel_locations h ON p.destination_hostel_id = h.id
        JOIN user_profiles prof ON p.requester_id = prof.user_id
        WHERE p.status = 'waiting_for_partner'
          AND p.requester_id != ?
        ORDER BY p.created_at DESC
      `, [req.user.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ parcels }));
    });
  });

  // 3. ACCEPT PARCEL REQUEST (Atomic Concurrency Protected)
  router.post('/api/parcels/:id/accept', (req, res) => {
    requireAuth(req, res, () => {
      const parcelId = req.params.id;
      const { partnerLat, partnerLng } = req.body || {};

      try {
        const result = transaction(() => {
          // Check parcel current state with immediate lock
          const parcel = queryOne('SELECT * FROM parcel_requests WHERE id = ?', [parcelId]);
          if (!parcel) {
            return { error: 'Parcel request not found.', status: 404 };
          }

          if (parcel.status !== 'waiting_for_partner') {
            return { error: 'This parcel request is no longer available. It may have already been accepted by another student.', status: 409 };
          }

          if (parcel.requester_id === req.user.id) {
            return { error: 'You cannot accept your own parcel delivery request.', status: 400 };
          }

          // Check active deliveries limit for delivery partner
          const maxLimitSetting = queryOne("SELECT value FROM platform_settings WHERE key = 'max_active_deliveries_per_partner'");
          const maxActiveDeliveries = maxLimitSetting ? parseInt(maxLimitSetting.value, 10) : 3;

          const activeCount = queryOne(`
            SELECT COUNT(*) AS count
            FROM parcel_assignments a
            JOIN parcel_requests p ON a.parcel_request_id = p.id
            WHERE a.delivery_partner_id = ?
              AND p.status IN ('accepted', 'collected', 'out_for_delivery')
          `, [req.user.id]).count;

          if (activeCount >= maxActiveDeliveries) {
            return {
              error: `You currently have ${activeCount} active deliveries. The campus limit is ${maxActiveDeliveries} simultaneous active deliveries to ensure punctual transit.`,
              status: 400
            };
          }

          // Assign parcel to partner
          const assignmentId = 'asgn-' + crypto.randomUUID();
          execute(`
            INSERT INTO parcel_assignments (
              id, parcel_request_id, delivery_partner_id, partner_latitude,
              partner_longitude, status, accepted_at
            )
            VALUES (?, ?, ?, ?, ?, 'assigned', datetime('now'))
          `, [assignmentId, parcelId, req.user.id, partnerLat || null, partnerLng || null]);

          // Update parcel status
          execute(`
            UPDATE parcel_requests
            SET status = 'accepted', updated_at = datetime('now')
            WHERE id = ?
          `, [parcelId]);

          // Status audit history
          execute(`
            INSERT INTO parcel_status_history (id, parcel_request_id, status, changed_by_user_id, notes, created_at)
            VALUES (?, ?, 'accepted', ?, 'Delivery partner accepted parcel request.', datetime('now'))
          `, ['hist-' + crypto.randomUUID(), parcelId, req.user.id]);

          // Create private transaction conversation if not exists
          const convId = 'conv-' + crypto.randomUUID();
          execute(`
            INSERT OR IGNORE INTO conversations (id, transaction_type, transaction_id, created_at, updated_at)
            VALUES (?, 'parcel', ?, datetime('now'), datetime('now'))
          `, [convId, parcelId]);

          const existingConv = queryOne("SELECT id FROM conversations WHERE transaction_type = 'parcel' AND transaction_id = ?", [parcelId]);
          const actualConvId = existingConv ? existingConv.id : convId;

          // Add participants (requester and partner)
          execute(`
            INSERT OR IGNORE INTO conversation_participants (id, conversation_id, user_id, joined_at)
            VALUES (?, ?, ?, datetime('now'))
          `, ['cp-' + crypto.randomUUID(), actualConvId, parcel.requester_id]);

          execute(`
            INSERT OR IGNORE INTO conversation_participants (id, conversation_id, user_id, joined_at)
            VALUES (?, ?, ?, datetime('now'))
          `, ['cp-' + crypto.randomUUID(), actualConvId, req.user.id]);

          // System message in chat
          execute(`
            INSERT INTO messages (id, conversation_id, sender_id, message_type, content, is_read, created_at)
            VALUES (?, ?, ?, 'system', 'Delivery partner has accepted this parcel request. Coordinate pickup and delivery instructions here.', 0, datetime('now'))
          `, ['msg-' + crypto.randomUUID(), actualConvId, req.user.id]);

          // In-app notification to requester
          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, 'Delivery Partner Assigned!', ?, 'parcel', ?, 0, datetime('now'))
          `, [
            'notif-' + crypto.randomUUID(),
            parcel.requester_id,
            `A student delivery partner has accepted parcel #${parcel.parcel_code} and is heading to collect it.`,
            `/dashboard/requester`
          ]);

          return { success: true, parcelId, parcelCode: parcel.parcel_code, conversationId: actualConvId };
        });

        if (result.error) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: result.error }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Parcel request accepted successfully!',
          ...result
        }));
      } catch (err) {
        console.error('Accept parcel error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to accept parcel.' }));
      }
    });
  });

  // 4. CONFIRM COLLECTION & GENERATE DELIVERY OTP (Stage 1 of 2-stage verification)
  router.post('/api/parcels/:id/collect', (req, res) => {
    requireAuth(req, res, () => {
      const parcelId = req.params.id;
      const { collectionPhotoUrl, conditionNotes } = req.body || {};

      try {
        const result = transaction(() => {
          const parcel = queryOne('SELECT * FROM parcel_requests WHERE id = ?', [parcelId]);
          if (!parcel) return { error: 'Parcel not found.', status: 404 };

          const assignment = queryOne('SELECT * FROM parcel_assignments WHERE parcel_request_id = ? AND delivery_partner_id = ?', [parcelId, req.user.id]);
          if (!assignment && !req.profile.is_admin) {
            return { error: 'Only the assigned delivery partner can record collection.', status: 403 };
          }

          if (parcel.status !== 'accepted') {
            return { error: `Parcel cannot be collected from status '${parcel.status}'. Must be 'accepted'.`, status: 400 };
          }

          // Record collection photo
          if (collectionPhotoUrl) {
            execute(`
              INSERT INTO parcel_photos (id, parcel_request_id, stage, photo_url, notes, uploaded_by_user_id, created_at)
              VALUES (?, ?, 'collection', ?, ?, ?, datetime('now'))
            `, ['photo-' + crypto.randomUUID(), parcelId, collectionPhotoUrl, conditionNotes || 'Parcel collected from campus parcel centre.', req.user.id]);
          }

          // Generate 6-digit delivery OTP for recipient
          const otpCode = generateOtp();
          const otpExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 60 mins expiry

          execute(`
            INSERT OR REPLACE INTO parcel_otps (
              id, parcel_request_id, otp_code, expires_at, attempts_count, max_attempts, is_verified, created_at
            )
            VALUES (?, ?, ?, ?, 0, 5, 0, datetime('now'))
          `, ['otp-' + crypto.randomUUID(), parcelId, otpCode, otpExpires]);

          // Update status to 'out_for_delivery'
          execute(`
            UPDATE parcel_requests
            SET status = 'out_for_delivery', updated_at = datetime('now')
            WHERE id = ?
          `, [parcelId]);

          execute(`
            INSERT INTO parcel_status_history (id, parcel_request_id, status, changed_by_user_id, notes, created_at)
            VALUES (?, ?, 'collected', ?, 'Parcel verified and collected from campus parcel centre.', datetime('now'))
          `, ['hist-' + crypto.randomUUID(), parcelId, req.user.id]);

          execute(`
            INSERT INTO parcel_status_history (id, parcel_request_id, status, changed_by_user_id, notes, created_at)
            VALUES (?, ?, 'out_for_delivery', ?, 'Delivery partner is en route to recipient hostel.', datetime('now'))
          `, ['hist-' + crypto.randomUUID(), parcelId, req.user.id]);

          // Send Delivery OTP Notification to Recipient
          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, 'Parcel Out For Delivery - Delivery OTP Generated', ?, 'parcel', ?, 0, datetime('now'))
          `, [
            'notif-' + crypto.randomUUID(),
            parcel.requester_id,
            `Your parcel #${parcel.parcel_code} is out for delivery! Give OTP: [ ${otpCode} ] to the delivery partner upon receiving your package.`,
            `/dashboard/requester`
          ]);

          // System message in chat
          const conv = queryOne("SELECT id FROM conversations WHERE transaction_type = 'parcel' AND transaction_id = ?", [parcelId]);
          if (conv) {
            execute(`
              INSERT INTO messages (id, conversation_id, sender_id, message_type, content, is_read, created_at)
              VALUES (?, ?, ?, 'system', 'Parcel has been collected from the campus parcel centre and is out for delivery. Recipient has received the secure delivery OTP.', 0, datetime('now'))
            `, ['msg-' + crypto.randomUUID(), conv.id, req.user.id]);
          }

          return { success: true, otpCode, requesterId: parcel.requester_id };
        });

        if (result.error) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: result.error }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Parcel collection confirmed. Parcel is now out for delivery.',
          recipientNotified: true,
          demoDeliveryOtp: result.otpCode // Transparent in test/demo mode so tester can test OTP easily
        }));
      } catch (err) {
        console.error('Collect parcel error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to confirm parcel collection.' }));
      }
    });
  });

  // 5. VERIFY DELIVERY WITH OTP (Stage 2 of 2-stage verification)
  router.post('/api/parcels/:id/verify-delivery', (req, res) => {
    requireAuth(req, res, () => {
      const parcelId = req.params.id;
      const { otp, deliveryPhotoUrl } = req.body || {};

      if (!otp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Delivery OTP provided by recipient is required.' }));
      }

      try {
        const result = transaction(() => {
          const parcel = queryOne('SELECT * FROM parcel_requests WHERE id = ?', [parcelId]);
          if (!parcel) return { error: 'Parcel not found.', status: 404 };

          const assignment = queryOne('SELECT * FROM parcel_assignments WHERE parcel_request_id = ? AND delivery_partner_id = ?', [parcelId, req.user.id]);
          if (!assignment && !req.profile.is_admin) {
            return { error: 'Only the assigned delivery partner can complete delivery.', status: 403 };
          }

          if (parcel.status !== 'out_for_delivery') {
            return { error: `Parcel cannot be delivered from status '${parcel.status}'. Must be 'out_for_delivery'.`, status: 400 };
          }

          const otpRecord = queryOne('SELECT * FROM parcel_otps WHERE parcel_request_id = ?', [parcelId]);
          if (!otpRecord) {
            return { error: 'No delivery OTP generated for this parcel.', status: 400 };
          }

          if (otpRecord.attempts_count >= otpRecord.max_attempts) {
            return { error: 'Too many incorrect OTP attempts. For campus security, this parcel has been placed under administrative review.', status: 403 };
          }

          if (new Date(otpRecord.expires_at) < new Date()) {
            return { error: 'Delivery OTP has expired. Recipient must request a fresh OTP.', status: 400 };
          }

          if (otpRecord.otp_code !== otp.trim()) {
            execute('UPDATE parcel_otps SET attempts_count = attempts_count + 1 WHERE id = ?', [otpRecord.id]);
            const remaining = otpRecord.max_attempts - (otpRecord.attempts_count + 1);
            return { error: `Invalid delivery OTP. ${remaining} attempts remaining before security lock.`, status: 400 };
          }

          // Mark OTP as verified
          execute(`
            UPDATE parcel_otps
            SET is_verified = 1, verified_at = datetime('now')
            WHERE id = ?
          `, [otpRecord.id]);

          // Optional delivery photo
          if (deliveryPhotoUrl) {
            execute(`
              INSERT INTO parcel_photos (id, parcel_request_id, stage, photo_url, notes, uploaded_by_user_id, created_at)
              VALUES (?, ?, 'delivery', ?, 'Delivery handover photo verification.', ?, datetime('now'))
            `, ['photo-' + crypto.randomUUID(), parcelId, deliveryPhotoUrl, req.user.id]);
          }

          // Update parcel to 'delivered', then 'completed'
          execute(`
            UPDATE parcel_requests
            SET status = 'completed', updated_at = datetime('now')
            WHERE id = ?
          `, [parcelId]);

          execute(`
            UPDATE parcel_assignments
            SET status = 'completed', completed_at = datetime('now')
            WHERE id = ?
          `, [assignment ? assignment.id : '']);

          execute(`
            INSERT INTO parcel_status_history (id, parcel_request_id, status, changed_by_user_id, notes, created_at)
            VALUES (?, ?, 'delivered', ?, 'Recipient OTP verified successfully. Handover complete.', datetime('now'))
          `, ['hist-' + crypto.randomUUID(), parcelId, req.user.id]);

          execute(`
            INSERT INTO parcel_status_history (id, parcel_request_id, status, changed_by_user_id, notes, created_at)
            VALUES (?, ?, 'completed', ?, 'Parcel transaction finished. Funds credited to partner.', datetime('now'))
          `, ['hist-' + crypto.randomUUID(), parcelId, req.user.id]);

          // Payout to delivery partner
          const payoutId = 'payo-' + crypto.randomUUID();
          execute(`
            INSERT INTO payouts (id, user_id, user_role, amount, reference_type, reference_id, status, notes, processed_at, created_at)
            VALUES (?, ?, 'delivery_partner', ?, 'parcel_earnings', ?, 'completed', ?, datetime('now'), datetime('now'))
          `, [payoutId, req.user.id, parcel.partner_earnings, parcelId, `Earnings for delivering parcel #${parcel.parcel_code}`]);

          // Protection reserve contribution (5% of platform commission)
          const reserveContrib = Math.round(parcel.platform_commission * 0.1 * 100) / 100;
          const currentReserve = queryOne("SELECT balance_after FROM protection_reserve_transactions ORDER BY created_at DESC LIMIT 1");
          const newBal = (currentReserve ? currentReserve.balance_after : 10000) + reserveContrib;

          execute(`
            INSERT INTO protection_reserve_transactions (id, type, amount, reference_type, reference_id, balance_after, notes, created_at)
            VALUES (?, 'contribution', ?, 'delivery_commission_cut', ?, ?, 'Platform reserve contribution from parcel delivery', datetime('now'))
          `, ['res-' + crypto.randomUUID(), reserveContrib, parcelId, newBal]);

          // Notifications
          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, 'Parcel Delivered Successfully!', ?, 'parcel', ?, 0, datetime('now'))
          `, [
            'notif-' + crypto.randomUUID(),
            parcel.requester_id,
            `Your parcel #${parcel.parcel_code} has been delivered and verified via OTP. Please rate your delivery partner!`,
            `/dashboard/requester`
          ]);

          execute(`
            INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
            VALUES (?, ?, 'Delivery Payout Credited', ?, 'payment', ?, 0, datetime('now'))
          `, [
            'notif-' + crypto.randomUUID(),
            req.user.id,
            `₹${parcel.partner_earnings} has been credited to your PeerNest balance for completing parcel #${parcel.parcel_code}.`,
            `/dashboard/partner`
          ]);

          // System message in chat
          const conv = queryOne("SELECT id FROM conversations WHERE transaction_type = 'parcel' AND transaction_id = ?", [parcelId]);
          if (conv) {
            execute(`
              INSERT INTO messages (id, conversation_id, sender_id, message_type, content, is_read, created_at)
              VALUES (?, ?, ?, 'system', 'Delivery successfully verified via OTP and marked as completed. Thank you for using PeerNest!', 0, datetime('now'))
            `, ['msg-' + crypto.randomUUID(), conv.id, req.user.id]);
          }

          return { success: true, earnings: parcel.partner_earnings, fee: parcel.total_fee };
        });

        if (result.error) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: result.error }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Parcel delivery verified successfully! Payment credited to your partner balance.',
          earnings: result.earnings
        }));
      } catch (err) {
        console.error('Verify delivery error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to verify delivery.' }));
      }
    });
  });

  // 6. REPORT PARCEL DISPUTE / MISSING / DAMAGE
  router.post('/api/parcels/:id/report-issue', (req, res) => {
    requireAuth(req, res, () => {
      const parcelId = req.params.id;
      const { issueType, description, evidenceUrls = [] } = req.body || {};

      if (!issueType || !description) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Issue type and detailed description are required.' }));
      }

      const parcel = queryOne('SELECT * FROM parcel_requests WHERE id = ?', [parcelId]);
      if (!parcel) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Parcel not found.' }));
      }

      try {
        transaction(() => {
          const disputeId = 'disp-' + crypto.randomUUID();
          execute(`
            INSERT INTO parcel_disputes (
              id, parcel_request_id, reporter_id, issue_type, description,
              evidence_urls, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'under_investigation', datetime('now'), datetime('now'))
          `, [disputeId, parcelId, req.user.id, issueType, description.trim(), JSON.stringify(evidenceUrls)]);

          execute(`
            UPDATE parcel_requests
            SET status = 'under_investigation', updated_at = datetime('now')
            WHERE id = ?
          `, [parcelId]);

          execute(`
            INSERT INTO parcel_status_history (id, parcel_request_id, status, changed_by_user_id, notes, created_at)
            VALUES (?, ?, 'under_investigation', ?, ?, datetime('now'))
          `, ['hist-' + crypto.randomUUID(), parcelId, req.user.id, `Issue reported: ${issueType}. Placed under investigation.`]);

          // Notify admins
          const admins = queryAll("SELECT user_id FROM user_profiles WHERE is_admin = 1");
          for (const a of admins) {
            execute(`
              INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at)
              VALUES (?, ?, 'New Parcel Issue Reported', ?, 'dispute', '/admin/disputes', 0, datetime('now'))
            `, ['notif-' + crypto.randomUUID(), a.user_id, `Parcel #${parcel.parcel_code} reported for ${issueType}. Requires investigation.`]);
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Issue reported successfully. The parcel has been placed under investigation by campus administrators.'
        }));
      } catch (err) {
        console.error('Report parcel issue error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to report parcel issue.' }));
      }
    });
  });

  // 7. GET MY REQUESTS (Requester Dashboard)
  router.get('/api/parcels/my-requests', (req, res) => {
    requireAuth(req, res, () => {
      const requests = queryAll(`
        SELECT 
          p.*,
          c.name AS collection_centre_name,
          h.name AS destination_hostel_name,
          a.delivery_partner_id,
          prof.full_name AS partner_name,
          prof.student_verified AS partner_verified,
          otp.otp_code AS delivery_otp,
          otp.is_verified AS otp_verified,
          conv.id AS conversation_id
        FROM parcel_requests p
        JOIN campus_locations c ON p.collection_centre_id = c.id
        JOIN hostel_locations h ON p.destination_hostel_id = h.id
        LEFT JOIN parcel_assignments a ON p.id = a.parcel_request_id
        LEFT JOIN user_profiles prof ON a.delivery_partner_id = prof.user_id
        LEFT JOIN parcel_otps otp ON p.id = otp.parcel_request_id
        LEFT JOIN conversations conv ON (conv.transaction_type = 'parcel' AND conv.transaction_id = p.id)
        WHERE p.requester_id = ?
        ORDER BY p.created_at DESC
      `, [req.user.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ requests }));
    });
  });

  // 8. GET MY DELIVERIES (Partner Dashboard)
  router.get('/api/parcels/my-deliveries', (req, res) => {
    requireAuth(req, res, () => {
      const deliveries = queryAll(`
        SELECT 
          p.*,
          c.name AS collection_centre_name,
          h.name AS destination_hostel_name,
          a.accepted_at, a.completed_at,
          prof.full_name AS requester_name,
          prof.student_verified AS requester_verified,
          conv.id AS conversation_id
        FROM parcel_assignments a
        JOIN parcel_requests p ON a.parcel_request_id = p.id
        JOIN campus_locations c ON p.collection_centre_id = c.id
        JOIN hostel_locations h ON p.destination_hostel_id = h.id
        JOIN user_profiles prof ON p.requester_id = prof.user_id
        LEFT JOIN conversations conv ON (conv.transaction_type = 'parcel' AND conv.transaction_id = p.id)
        WHERE a.delivery_partner_id = ?
        ORDER BY p.created_at DESC
      `, [req.user.id]);

      // Calculate total earnings summary
      const completed = deliveries.filter(d => d.status === 'completed');
      const totalEarned = completed.reduce((sum, d) => sum + d.partner_earnings, 0);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        deliveries,
        summary: {
          totalDeliveries: deliveries.length,
          completedCount: completed.length,
          activeCount: deliveries.length - completed.length,
          totalEarned: Math.round(totalEarned * 100) / 100
        }
      }));
    });
  });

  // 9. GET SINGLE PARCEL DETAILS & AUDIT TRAIL
  router.get('/api/parcels/:id', (req, res) => {
    requireAuth(req, res, () => {
      const parcel = queryOne(`
        SELECT 
          p.*,
          c.name AS collection_centre_name, c.latitude AS centre_lat, c.longitude AS centre_lng,
          h.name AS destination_hostel_name, h.latitude AS hostel_lat, h.longitude AS hostel_lng,
          a.delivery_partner_id,
          req_p.full_name AS requester_name,
          part_p.full_name AS partner_name
        FROM parcel_requests p
        JOIN campus_locations c ON p.collection_centre_id = c.id
        JOIN hostel_locations h ON p.destination_hostel_id = h.id
        LEFT JOIN parcel_assignments a ON p.id = a.parcel_request_id
        JOIN user_profiles req_p ON p.requester_id = req_p.user_id
        LEFT JOIN user_profiles part_p ON a.delivery_partner_id = part_p.user_id
        WHERE p.id = ?
      `, [req.params.id]);

      if (!parcel) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Parcel not found.' }));
      }

      // Check authorization (must be requester, partner, or admin)
      const isRequester = parcel.requester_id === req.user.id;
      const isPartner = parcel.delivery_partner_id === req.user.id;
      const isAdmin = Boolean(req.profile.is_admin);

      if (!isRequester && !isPartner && !isAdmin) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized to view details of this parcel transaction.' }));
      }

      const history = queryAll('SELECT * FROM parcel_status_history WHERE parcel_request_id = ? ORDER BY created_at ASC', [parcel.id]);
      const photos = queryAll('SELECT * FROM parcel_photos WHERE parcel_request_id = ? ORDER BY created_at ASC', [parcel.id]);
      const dispute = queryOne('SELECT * FROM parcel_disputes WHERE parcel_request_id = ?', [parcel.id]);

      let otpInfo = null;
      if (isRequester || isAdmin) {
        otpInfo = queryOne('SELECT otp_code, is_verified, expires_at FROM parcel_otps WHERE parcel_request_id = ?', [parcel.id]);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        parcel,
        history,
        photos,
        dispute,
        otpInfo
      }));
    });
  });
}

module.exports = { registerParcelRoutes };
