// ============================================================================
// PEERNEST - Unified Student Activities & Request Tracking Hub
// ============================================================================

const { queryAll, queryOne } = require('../db');
const { requireAuth } = require('../middleware/auth');

function registerActivityRoutes(router) {
  // 1. GET ALL USER ACTIVITIES (Parcel Requests, Deliveries, Lent Items, Borrowed Items)
  router.get('/api/activities/my-all', (req, res) => {
    requireAuth(req, res, () => {
      const userId = req.user.id;

      try {
        // A. Parcel Requests created by this user
        const parcelRequests = queryAll(`
          SELECT 
            p.*,
            c.name AS collection_centre_name,
            c.code AS collection_centre_code,
            h.name AS destination_hostel_name,
            h.code AS destination_block_code,
            a.delivery_partner_id,
            partner_prof.full_name AS partner_name,
            otp.otp_code AS delivery_otp
          FROM parcel_requests p
          LEFT JOIN campus_locations c ON p.collection_centre_id = c.id
          LEFT JOIN hostel_locations h ON p.destination_hostel_id = h.id
          LEFT JOIN parcel_assignments a ON p.id = a.parcel_request_id
          LEFT JOIN user_profiles partner_prof ON a.delivery_partner_id = partner_prof.user_id
          LEFT JOIN parcel_otps otp ON p.id = otp.parcel_request_id
          WHERE p.requester_id = ?
          ORDER BY p.created_at DESC
        `, [userId]).map(p => ({
          trackingCode: p.parcel_code,
          activityType: 'parcel_request',
          categoryLabel: 'Parcel Request',
          id: p.id,
          title: `Parcel from ${p.collection_centre_name || 'Centre'}`,
          reference: p.parcel_reference,
          status: p.status,
          destination: p.destination_hostel_name,
          location: p.designated_location,
          counterparty: p.partner_name ? `${p.partner_name.split(' ')[0]} (Delivery Partner)` : 'Waiting for Partner',
          fee: p.total_fee,
          otp: (p.status === 'out_for_delivery' || p.status === 'collected') ? p.delivery_otp : null,
          createdAt: p.created_at,
          updatedAt: p.updated_at
        }));

        // B. Parcel Deliveries accepted/performed by this user
        const parcelDeliveries = queryAll(`
          SELECT 
            p.*,
            c.name AS collection_centre_name,
            h.name AS destination_hostel_name,
            a.accepted_at, a.completed_at,
            req_prof.full_name AS requester_name,
            req_prof.hostel_block AS requester_block
          FROM parcel_assignments a
          JOIN parcel_requests p ON a.parcel_request_id = p.id
          LEFT JOIN campus_locations c ON p.collection_centre_id = c.id
          LEFT JOIN hostel_locations h ON p.destination_hostel_id = h.id
          LEFT JOIN user_profiles req_prof ON p.requester_id = req_prof.user_id
          WHERE a.delivery_partner_id = ?
          ORDER BY p.updated_at DESC
        `, [userId]).map(p => ({
          trackingCode: p.parcel_code,
          activityType: 'parcel_delivery',
          categoryLabel: 'Parcel Delivery',
          id: p.id,
          title: `Delivery to ${p.destination_hostel_name || 'Hostel'}`,
          reference: p.parcel_reference,
          status: p.status,
          destination: `${p.destination_hostel_name} (${p.designated_location})`,
          location: p.designated_location,
          counterparty: p.requester_name ? `${p.requester_name.split(' ')[0]} (${p.requester_block || 'Student'})` : 'Requester',
          earnings: p.partner_earnings,
          createdAt: p.created_at,
          updatedAt: p.updated_at
        }));

        // C. Items Lent by this user (Listings + Active Bookings)
        const lentListings = queryAll(`
          SELECT 
            l.*,
            cat.name AS category_name,
            (SELECT COUNT(*) FROM rental_bookings b WHERE b.listing_id = l.id) AS total_bookings_count
          FROM rental_listings l
          LEFT JOIN rental_categories cat ON l.category_id = cat.id
          WHERE l.owner_id = ?
          ORDER BY l.created_at DESC
        `, [userId]).map(l => ({
          trackingCode: `LEND-VIT-${l.id.slice(-6).toUpperCase()}`,
          activityType: 'lent_item',
          categoryLabel: 'Lent Gear',
          id: l.id,
          title: l.title,
          category: l.category_name,
          dailyPrice: l.daily_price,
          securityDeposit: l.security_deposit,
          status: l.is_active ? (l.is_paused ? 'Paused' : 'Listed & Active') : 'Inactive',
          handoverLocation: l.handover_location,
          bookingsCount: l.total_bookings_count,
          createdAt: l.created_at,
          updatedAt: l.updated_at
        }));

        // D. Bookings on Lent Items (Incoming rental requests from borrowers)
        const lentBookings = queryAll(`
          SELECT 
            b.*,
            l.title AS item_title,
            l.handover_location,
            borrower_prof.full_name AS borrower_name,
            borrower_prof.hostel_block AS borrower_block
          FROM rental_bookings b
          JOIN rental_listings l ON b.listing_id = l.id
          LEFT JOIN user_profiles borrower_prof ON b.borrower_id = borrower_prof.user_id
          WHERE b.owner_id = ?
          ORDER BY b.created_at DESC
        `, [userId]).map(b => ({
          trackingCode: `RNTL-VIT-${b.id.slice(-6).toUpperCase()}`,
          activityType: 'rental_agreement',
          categoryLabel: 'Rental Order (Lender)',
          id: b.id,
          listingId: b.listing_id,
          title: `Rent: ${b.item_title}`,
          status: b.status,
          dateRange: `${b.start_date} to ${b.end_date}`,
          billableDays: b.billable_days,
          rentalCharge: b.total_rental_charge,
          securityDeposit: b.security_deposit,
          totalPayable: b.total_payable,
          counterparty: b.borrower_name ? `${b.borrower_name.split(' ')[0]} (${b.borrower_block || 'Borrower'})` : 'Student Borrower',
          createdAt: b.created_at,
          updatedAt: b.updated_at
        }));

        // E. Items Borrowed by this user
        const borrowedItems = queryAll(`
          SELECT 
            b.*,
            l.title AS item_title,
            l.handover_location,
            l.declared_value,
            owner_prof.full_name AS owner_name,
            owner_prof.hostel_block AS owner_block
          FROM rental_bookings b
          JOIN rental_listings l ON b.listing_id = l.id
          LEFT JOIN user_profiles owner_prof ON b.owner_id = owner_prof.user_id
          WHERE b.borrower_id = ?
          ORDER BY b.created_at DESC
        `, [userId]).map(b => ({
          trackingCode: `BORW-VIT-${b.id.slice(-6).toUpperCase()}`,
          activityType: 'borrowed_item',
          categoryLabel: 'Borrowed Item',
          id: b.id,
          listingId: b.listing_id,
          title: b.item_title,
          status: b.status,
          dateRange: `${b.start_date} to ${b.end_date}`,
          billableDays: b.billable_days,
          rentalCharge: b.total_rental_charge,
          securityDeposit: b.security_deposit,
          totalPayable: b.total_payable,
          handoverLocation: b.handover_location,
          counterparty: b.owner_name ? `${b.owner_name.split(' ')[0]} (${b.owner_block || 'Owner'})` : 'Student Owner',
          createdAt: b.created_at,
          updatedAt: b.updated_at
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          summary: {
            totalParcelRequests: parcelRequests.length,
            totalParcelDeliveries: parcelDeliveries.length,
            totalLentItems: lentListings.length,
            totalLentBookings: lentBookings.length,
            totalBorrowedItems: borrowedItems.length,
            totalActivities: parcelRequests.length + parcelDeliveries.length + lentListings.length + borrowedItems.length
          },
          parcelRequests,
          parcelDeliveries,
          lentListings,
          lentBookings,
          borrowedItems
        }));
      } catch (err) {
        console.error('Error fetching user activities:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to retrieve activities.' }));
      }
    });
  });

  // 2. UNIVERSAL TRACK DOWN REQUEST BY CODE OR ID
  router.get('/api/activities/track/:code', (req, res) => {
    requireAuth(req, res, () => {
      const code = (req.params.code || '').trim();
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tracking code is required.' }));
      }

      // Check Parcel Requests
      const parcel = queryOne(`
        SELECT 
          p.*,
          c.name AS collection_centre_name,
          h.name AS destination_hostel_name,
          a.delivery_partner_id,
          req_prof.full_name AS requester_name,
          part_prof.full_name AS partner_name,
          otp.otp_code AS delivery_otp
        FROM parcel_requests p
        LEFT JOIN campus_locations c ON p.collection_centre_id = c.id
        LEFT JOIN hostel_locations h ON p.destination_hostel_id = h.id
        LEFT JOIN parcel_assignments a ON p.id = a.parcel_request_id
        LEFT JOIN user_profiles req_prof ON p.requester_id = req_prof.user_id
        LEFT JOIN user_profiles part_prof ON a.delivery_partner_id = part_prof.user_id
        LEFT JOIN parcel_otps otp ON p.id = otp.parcel_request_id
        WHERE p.parcel_code = ? 
           OR p.id = ? 
           OR UPPER(p.parcel_reference) = UPPER(?)
           OR p.parcel_code LIKE ?
      `, [code, code, code, `%${code}%`]);

      if (parcel) {
        const history = queryAll(`
          SELECT * FROM parcel_status_history
          WHERE parcel_request_id = ?
          ORDER BY created_at ASC
        `, [parcel.id]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          found: true,
          type: 'parcel',
          trackingCode: parcel.parcel_code,
          id: parcel.id,
          title: `Campus Parcel Pickup (${parcel.collection_centre_name || 'Centre'} -> ${parcel.destination_hostel_name || 'Hostel'})`,
          reference: parcel.parcel_reference,
          status: parcel.status,
          isUserRequester: parcel.requester_id === req.user.id,
          isUserPartner: parcel.delivery_partner_id === req.user.id,
          requesterName: parcel.requester_name ? parcel.requester_name.split(' ')[0] : 'Requester',
          partnerName: parcel.partner_name ? parcel.partner_name.split(' ')[0] : (parcel.status === 'submitted' || parcel.status === 'waiting_for_partner' ? 'Waiting for Partner' : 'Delivery Partner'),
          deliveryFee: parcel.total_fee,
          declaredValue: parcel.declared_value,
          preferredPickupTime: parcel.preferred_pickup_time,
          instructions: parcel.instructions,
          otp: (parcel.requester_id === req.user.id && (parcel.status === 'out_for_delivery' || parcel.status === 'collected')) ? parcel.delivery_otp : null,
          history,
          createdAt: parcel.created_at,
          updatedAt: parcel.updated_at
        }));
      }

      // Check Rental Bookings
      const cleanRentalId = code.replace(/^RNTL-VIT-|^BORW-VIT-/i, '').toLowerCase();
      const booking = queryOne(`
        SELECT 
          b.*,
          l.title AS item_title,
          l.handover_location,
          l.declared_value,
          owner_prof.full_name AS owner_name,
          borrower_prof.full_name AS borrower_name
        FROM rental_bookings b
        JOIN rental_listings l ON b.listing_id = l.id
        LEFT JOIN user_profiles owner_prof ON b.owner_id = owner_prof.user_id
        LEFT JOIN user_profiles borrower_prof ON b.borrower_id = borrower_prof.user_id
        WHERE b.id = ? 
           OR b.id LIKE ?
      `, [code, `%${cleanRentalId}%`]);

      if (booking) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          found: true,
          type: 'rental_booking',
          trackingCode: `RNTL-VIT-${booking.id.slice(-6).toUpperCase()}`,
          id: booking.id,
          listingId: booking.listing_id,
          title: `Rental: ${booking.item_title}`,
          status: booking.status,
          isUserOwner: booking.owner_id === req.user.id,
          isUserBorrower: booking.borrower_id === req.user.id,
          ownerName: booking.owner_name ? booking.owner_name.split(' ')[0] : 'Owner',
          borrowerName: booking.borrower_name ? booking.borrower_name.split(' ')[0] : 'Borrower',
          startDate: booking.start_date,
          endDate: booking.end_date,
          billableDays: booking.billable_days,
          dailyPrice: booking.daily_price,
          rentalCharge: booking.total_rental_charge,
          securityDeposit: booking.security_deposit,
          totalPayable: booking.total_payable,
          handoverLocation: booking.handover_location,
          createdAt: booking.created_at,
          updatedAt: booking.updated_at
        }));
      }

      // Check Rental Listings
      const cleanListId = code.replace(/^LEND-VIT-/i, '').toLowerCase();
      const listing = queryOne(`
        SELECT 
          l.*,
          cat.name AS category_name,
          owner_prof.full_name AS owner_name
        FROM rental_listings l
        LEFT JOIN rental_categories cat ON l.category_id = cat.id
        LEFT JOIN user_profiles owner_prof ON l.owner_id = owner_prof.user_id
        WHERE l.id = ? 
           OR l.id LIKE ?
      `, [code, `%${cleanListId}%`]);

      if (listing) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          found: true,
          type: 'rental_listing',
          trackingCode: `LEND-VIT-${listing.id.slice(-6).toUpperCase()}`,
          id: listing.id,
          title: listing.title,
          category: listing.category_name,
          dailyPrice: listing.daily_price,
          securityDeposit: listing.security_deposit,
          declaredValue: listing.declared_value,
          status: listing.is_active ? 'Active' : 'Inactive',
          handoverLocation: listing.handover_location,
          isUserOwner: listing.owner_id === req.user.id,
          createdAt: listing.created_at
        }));
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `No campus request found matching tracking code "${code}". Please check the code and try again.` }));
    });
  });
}

module.exports = { registerActivityRoutes };
