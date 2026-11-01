// ============================================================================
// PEERNEST - Comprehensive Administrator Dashboard Module
// ============================================================================

const crypto = require('node:crypto');
const { queryAll, queryOne, execute, transaction } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { sanitizeProfile } = require('./auth');

function logAdminAction(adminId, action, targetType, targetId, details, ip = '127.0.0.1') {
  execute(`
    INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details_json, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `, ['log-' + crypto.randomUUID(), adminId, action, targetType, targetId, JSON.stringify(details), ip]);
}

function registerAdminRoutes(router) {
  // 1. GET ADMIN OVERVIEW STATS
  router.get('/api/admin/overview', (req, res) => {
    requireAdmin(req, res, () => {
      const totalStudents = queryOne('SELECT COUNT(*) AS count FROM users WHERE is_verified = 1').count;
      const activeDeliveries = queryOne("SELECT COUNT(*) AS count FROM parcel_requests WHERE status IN ('accepted', 'collected', 'out_for_delivery')").count;
      const completedDeliveries = queryOne("SELECT COUNT(*) AS count FROM parcel_requests WHERE status = 'completed'").count;
      const activeRentals = queryOne("SELECT COUNT(*) AS count FROM rental_bookings WHERE status = 'active'").count;
      const completedRentals = queryOne("SELECT COUNT(*) AS count FROM rental_bookings WHERE status = 'completed'").count;
      const activeListings = queryOne('SELECT COUNT(*) AS count FROM rental_listings WHERE is_active = 1').count;
      const openDisputes = queryOne("SELECT COUNT(*) AS count FROM parcel_disputes WHERE status = 'under_investigation'").count +
                           queryOne("SELECT COUNT(*) AS count FROM rental_damage_claims WHERE status IN ('admin_review', 'borrower_disputed')").count;

      // Financials
      const parcelCommissionSum = queryOne("SELECT COALESCE(SUM(platform_commission), 0) AS total FROM parcel_requests WHERE status = 'completed'").total;
      const rentalCommissionSum = queryOne("SELECT COALESCE(SUM(platform_commission), 0) AS total FROM rental_bookings WHERE status = 'completed'").total;
      const totalRevenue = Math.round((parcelCommissionSum + rentalCommissionSum) * 100) / 100;

      const partnerEarningsSum = queryOne("SELECT COALESCE(SUM(amount), 0) AS total FROM payouts WHERE user_role = 'delivery_partner' AND status = 'completed'").total;
      const lenderEarningsSum = queryOne("SELECT COALESCE(SUM(amount), 0) AS total FROM payouts WHERE user_role = 'rental_lender' AND status = 'completed'").total;
      const refundsSum = queryOne("SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE status = 'processed'").total;

      const reserveTx = queryOne("SELECT balance_after FROM protection_reserve_transactions ORDER BY created_at DESC LIMIT 1");
      const protectionReserve = reserveTx ? reserveTx.balance_after : 10000.0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        metrics: {
          totalStudents,
          activeDeliveries,
          completedDeliveries,
          activeRentals,
          completedRentals,
          activeListings,
          openDisputes
        },
        financials: {
          totalPlatformRevenue: totalRevenue,
          parcelCommissions: parcelCommissionSum,
          rentalCommissions: rentalCommissionSum,
          studentPartnerEarnings: partnerEarningsSum,
          studentLenderEarnings: lenderEarningsSum,
          totalRefundsProcessed: refundsSum,
          protectionReserveBalance: protectionReserve,
          netPlatformProfit: Math.round((totalRevenue - refundsSum) * 100) / 100
        }
      }));
    });
  });

  // 2. USER MANAGEMENT
  router.get('/api/admin/users', (req, res) => {
    requireAdmin(req, res, () => {
      const { search } = req.query || {};
      let sql = `
        SELECT u.id, u.email, u.is_verified, u.created_at,
               p.full_name, p.registration_number, p.phone_number,
               p.campus, p.hostel_block, p.room_number, p.is_admin,
               p.is_suspended, p.student_verified
        FROM users u
        LEFT JOIN user_profiles p ON u.id = p.user_id
      `;
      const params = [];
      if (search) {
        sql += ` WHERE u.email LIKE ? OR p.full_name LIKE ? OR p.registration_number LIKE ?`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      sql += ' ORDER BY u.created_at DESC';

      const users = queryAll(sql, params);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ users }));
    });
  });

  router.put('/api/admin/users/:id/toggle-suspend', (req, res) => {
    requireAdmin(req, res, () => {
      const targetUserId = req.params.id;
      const profile = queryOne('SELECT is_suspended, full_name FROM user_profiles WHERE user_id = ?', [targetUserId]);

      if (!profile) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'User profile not found.' }));
      }

      const newStatus = profile.is_suspended ? 0 : 1;
      execute("UPDATE user_profiles SET is_suspended = ?, updated_at = datetime('now') WHERE user_id = ?", [newStatus, targetUserId]);

      logAdminAction(req.user.id, newStatus ? 'SUSPEND_USER' : 'UNSUSPEND_USER', 'user', targetUserId, {
        targetName: profile.full_name,
        newStatus
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: `Student account ${newStatus ? 'suspended' : 'reactivated'} successfully.`,
        isSuspended: Boolean(newStatus)
      }));
    });
  });

  // 3. PARCEL MANAGEMENT
  router.get('/api/admin/parcels', (req, res) => {
    requireAdmin(req, res, () => {
      const parcels = queryAll(`
        SELECT 
          p.*,
          c.name AS collection_centre_name,
          h.name AS destination_hostel_name,
          req_p.full_name AS requester_name,
          part_p.full_name AS partner_name
        FROM parcel_requests p
        JOIN campus_locations c ON p.collection_centre_id = c.id
        JOIN hostel_locations h ON p.destination_hostel_id = h.id
        JOIN user_profiles req_p ON p.requester_id = req_p.user_id
        LEFT JOIN parcel_assignments a ON p.id = a.parcel_request_id
        LEFT JOIN user_profiles part_p ON a.delivery_partner_id = part_p.user_id
        ORDER BY p.created_at DESC
      `);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ parcels }));
    });
  });

  // 4. RENTAL MANAGEMENT
  router.get('/api/admin/rentals', (req, res) => {
    requireAdmin(req, res, () => {
      const listings = queryAll(`
        SELECT l.*, c.name AS category_name, p.full_name AS owner_name
        FROM rental_listings l
        JOIN rental_categories c ON l.category_id = c.id
        JOIN user_profiles p ON l.owner_id = p.user_id
        ORDER BY l.created_at DESC
      `);

      const bookings = queryAll(`
        SELECT b.*, l.title AS item_title,
               own.full_name AS owner_name,
               bor.full_name AS borrower_name
        FROM rental_bookings b
        JOIN rental_listings l ON b.listing_id = l.id
        JOIN user_profiles own ON b.owner_id = own.user_id
        JOIN user_profiles bor ON b.borrower_id = bor.user_id
        ORDER BY b.created_at DESC
      `);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ listings, bookings }));
    });
  });

  // 5. PLATFORM CONFIGURATION & SETTINGS
  router.get('/api/admin/settings', (req, res) => {
    requireAdmin(req, res, () => {
      const settings = queryAll('SELECT * FROM platform_settings ORDER BY category, key');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ settings }));
    });
  });

  router.put('/api/admin/settings', (req, res) => {
    requireAdmin(req, res, () => {
      const { settings } = req.body || {};
      if (!Array.isArray(settings)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Settings must be an array of { key, value } objects.' }));
      }

      transaction(() => {
        for (const item of settings) {
          if (item.key && item.value !== undefined) {
            execute(`
              UPDATE platform_settings
              SET value = ?, updated_at = datetime('now')
              WHERE key = ?
            `, [String(item.value), item.key]);
          }
        }
      });

      logAdminAction(req.user.id, 'UPDATE_PLATFORM_SETTINGS', 'settings', null, { settingsUpdated: settings.length });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Platform settings updated successfully.' }));
    });
  });

  // 6. DISPUTE MANAGEMENT & RESOLUTION
  router.get('/api/admin/disputes', (req, res) => {
    requireAdmin(req, res, () => {
      const parcelDisputes = queryAll(`
        SELECT d.*, p.parcel_code, p.parcel_reference, p.total_fee, p.declared_value,
               rep.full_name AS reporter_name,
               adm.full_name AS resolver_name
        FROM parcel_disputes d
        JOIN parcel_requests p ON d.parcel_request_id = p.id
        JOIN user_profiles rep ON d.reporter_id = rep.user_id
        LEFT JOIN user_profiles adm ON d.resolved_by_admin_id = adm.user_id
        ORDER BY d.created_at DESC
      `);

      const rentalDisputes = queryAll(`
        SELECT c.*, b.listing_id, b.security_deposit, b.daily_price,
               l.title AS item_title, l.declared_value,
               own.full_name AS owner_name,
               bor.full_name AS borrower_name,
               adm.full_name AS resolver_name
        FROM rental_damage_claims c
        JOIN rental_bookings b ON c.booking_id = b.id
        JOIN rental_listings l ON b.listing_id = l.id
        JOIN user_profiles own ON c.owner_id = own.user_id
        JOIN user_profiles bor ON c.borrower_id = bor.user_id
        LEFT JOIN user_profiles adm ON c.resolved_by_admin_id = adm.user_id
        ORDER BY c.created_at DESC
      `);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ parcelDisputes, rentalDisputes }));
    });
  });

  // Resolve Parcel Dispute
  router.post('/api/admin/disputes/parcel/:id/resolve', (req, res) => {
    requireAdmin(req, res, () => {
      const disputeId = req.params.id;
      const { resolution, resolutionNotes, compensationAmount = 0 } = req.body || {};
      // resolution: 'refund_requester', 'compensate_from_reserve', 'reject'

      try {
        const result = transaction(() => {
          const dispute = queryOne('SELECT * FROM parcel_disputes WHERE id = ?', [disputeId]);
          if (!dispute) return { error: 'Dispute not found.', status: 404 };

          const parcel = queryOne('SELECT * FROM parcel_requests WHERE id = ?', [dispute.parcel_request_id]);
          const numComp = parseFloat(compensationAmount) || 0;

          if (resolution === 'refund_requester') {
            execute(`
              UPDATE parcel_disputes
              SET status = 'resolved_refund', resolution_notes = ?, resolved_by_admin_id = ?, updated_at = datetime('now')
              WHERE id = ?
            `, [resolutionNotes || 'Delivery fee refunded to requester.', req.user.id, disputeId]);

            execute(`
              INSERT INTO refunds (id, payment_id, transaction_id, transaction_type, amount, reason, status, created_at)
              VALUES (?, (SELECT id FROM payments WHERE transaction_id = ? LIMIT 1), ?, 'parcel_delivery_refund', ?, ?, 'processed', datetime('now'))
            `, ['ref-' + crypto.randomUUID(), parcel.id, parcel.id, parcel.total_fee, resolutionNotes || 'Parcel delivery dispute refund']);

            execute("UPDATE parcel_requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?", [parcel.id]);
          } else if (resolution === 'compensate_from_reserve') {
            // Deduct compensation from PeerNest protection reserve
            const currentReserve = queryOne("SELECT balance_after FROM protection_reserve_transactions ORDER BY created_at DESC LIMIT 1");
            const newBal = (currentReserve ? currentReserve.balance_after : 10000) - numComp;

            execute(`
              INSERT INTO protection_reserve_transactions (id, type, amount, reference_type, reference_id, balance_after, notes, created_at)
              VALUES (?, 'payout', ?, 'parcel_damage_compensation', ?, ?, ?, datetime('now'))
            `, ['res-' + crypto.randomUUID(), numComp, parcel.id, newBal, `Compensation payout for parcel #${parcel.parcel_code}`]);

            execute(`
              INSERT INTO parcel_compensation (id, dispute_id, parcel_request_id, recipient_id, amount, source, reason, approved_by_admin_id, status, created_at)
              VALUES (?, ?, ?, ?, ?, 'protection_reserve', ?, ?, 'disbursed', datetime('now'))
            `, ['comp-' + crypto.randomUUID(), disputeId, parcel.id, parcel.requester_id, numComp, resolutionNotes || 'Parcel loss/damage compensation', req.user.id]);

            execute(`
              UPDATE parcel_disputes
              SET status = 'resolved_compensated', resolution_notes = ?, resolved_by_admin_id = ?, updated_at = datetime('now')
              WHERE id = ?
            `, [resolutionNotes || `Compensated ₹${numComp} from protection reserve.`, req.user.id, disputeId]);

            execute("UPDATE parcel_requests SET status = 'completed', updated_at = datetime('now') WHERE id = ?", [parcel.id]);
          } else {
            // Rejected
            execute(`
              UPDATE parcel_disputes
              SET status = 'rejected', resolution_notes = ?, resolved_by_admin_id = ?, updated_at = datetime('now')
              WHERE id = ?
            `, [resolutionNotes || 'Claim rejected after evidence verification.', req.user.id, disputeId]);

            execute("UPDATE parcel_requests SET status = 'completed', updated_at = datetime('now') WHERE id = ?", [parcel.id]);
          }

          logAdminAction(req.user.id, 'RESOLVE_PARCEL_DISPUTE', 'dispute', disputeId, { resolution, notes: resolutionNotes, numComp });
          return { success: true, resolution };
        });

        if (result.error) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: result.error }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Dispute resolved successfully.', ...result }));
      } catch (err) {
        console.error('Resolve parcel dispute error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to resolve dispute.' }));
      }
    });
  });

  // Resolve Rental Damage Dispute
  router.post('/api/admin/disputes/rental/:id/resolve', (req, res) => {
    requireAdmin(req, res, () => {
      const claimId = req.params.id;
      const { settlementDeduction, resolutionNotes } = req.body || {};

      try {
        const result = transaction(() => {
          const claim = queryOne('SELECT * FROM rental_damage_claims WHERE id = ?', [claimId]);
          if (!claim) return { error: 'Damage claim not found.', status: 404 };

          const booking = queryOne('SELECT * FROM rental_bookings WHERE id = ?', [claim.booking_id]);
          const deduction = Math.max(0, Math.min(booking.security_deposit, parseFloat(settlementDeduction) || 0));
          const refundAmount = booking.security_deposit - deduction;

          execute(`
            UPDATE rental_damage_claims
            SET status = 'settled_admin', settlement_deduction = ?, refund_amount = ?,
                resolved_by_admin_id = ?, updated_at = datetime('now')
            WHERE id = ?
          `, [deduction, refundAmount, req.user.id, claimId]);

          execute("UPDATE rental_bookings SET status = 'completed', updated_at = datetime('now') WHERE id = ?", [booking.id]);

          // Payout deduction to owner
          if (deduction > 0) {
            execute(`
              INSERT INTO payouts (id, user_id, user_role, amount, reference_type, reference_id, status, notes, processed_at, created_at)
              VALUES (?, ?, 'rental_lender', ?, 'damage_compensation', ?, 'completed', ?, datetime('now'), datetime('now'))
            `, ['payo-' + crypto.randomUUID(), claim.owner_id, deduction, booking.id, `Admin-approved damage compensation: ${resolutionNotes || ''}`]);
          }

          // Refund remaining deposit to borrower
          if (refundAmount > 0) {
            execute(`
              INSERT INTO refunds (id, payment_id, transaction_id, transaction_type, amount, reason, status, created_at)
              VALUES (?, (SELECT id FROM payments WHERE transaction_id = ? LIMIT 1), ?, 'rental_deposit_settlement', ?, ?, 'processed', datetime('now'))
            `, ['ref-' + crypto.randomUUID(), booking.id, booking.id, refundAmount, resolutionNotes || 'Admin deposit dispute settlement refund']);
          }

          logAdminAction(req.user.id, 'RESOLVE_RENTAL_DAMAGE', 'rental_claim', claimId, { deduction, refundAmount, resolutionNotes });

          return { success: true, deduction, refundAmount };
        });

        if (result.error) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: result.error }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Rental damage claim settled by administrator.', ...result }));
      } catch (err) {
        console.error('Resolve rental claim error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to settle rental dispute.' }));
      }
    });
  });

  // 7. AUDIT LOGS
  router.get('/api/admin/audit-logs', (req, res) => {
    requireAdmin(req, res, () => {
      const logs = queryAll(`
        SELECT l.*, p.full_name AS admin_name
        FROM admin_audit_logs l
        JOIN user_profiles p ON l.admin_id = p.user_id
        ORDER BY l.created_at DESC
        LIMIT 100
      `);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ logs }));
    });
  });
}

module.exports = { registerAdminRoutes };
