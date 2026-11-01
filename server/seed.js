// ============================================================================
// PEERNEST - VIT VELLORE FULL-STACK CAMPUS CONVENIENCE PLATFORM
// Database Seeder (VIT Vellore Locations, Hostels, Categories, Demo Accounts)
// ============================================================================

const crypto = require('node:crypto');
const { execute, queryOne, transaction } = require('./db');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'peernest_salt_2026').digest('hex');
}

function seed() {
  transaction(() => {
    // 1. Campus Locations
    const campusLocations = [
      { id: 'loc-parcel-main', name: 'Campus Central Parcel Centre (Post Office)', code: 'PARCEL_MAIN', type: 'parcel_centre', lat: 12.971900, lng: 79.159400, desc: 'Main campus courier & speed post collection hub near Gate 2 / Foodys' },
      { id: 'loc-parcel-sjt', name: 'SJT Courier Pickup Counter', code: 'PARCEL_SJT', type: 'parcel_centre', lat: 12.971200, lng: 79.163600, desc: 'Silver Jubilee Tower Ground Floor express delivery kiosk' },
      { id: 'loc-acad-tt', name: 'Technology Tower (TT)', code: 'ACAD_TT', type: 'academic_building', lat: 12.970100, lng: 79.159700, desc: 'Main administrative & engineering departments tower' },
      { id: 'loc-acad-sjt', name: 'Silver Jubilee Tower (SJT)', code: 'ACAD_SJT', type: 'academic_building', lat: 12.971200, lng: 79.163600, desc: 'Academic complex, labs and faculty offices' },
      { id: 'loc-acad-mb', name: 'Dr. MGR Block (MB)', code: 'ACAD_MB', type: 'academic_building', lat: 12.969200, lng: 79.157800, desc: 'Central administrative block' },
      { id: 'loc-gate-1', name: 'Main Gate 1 (Katpadi Road)', code: 'GATE_1', type: 'gate', lat: 12.969300, lng: 79.155900, desc: 'Primary campus entrance opposite Katpadi railway road' },
      { id: 'loc-gate-2', name: 'Main Gate 2 (All Mart Entrance)', code: 'GATE_2', type: 'gate', lat: 12.971500, lng: 79.157800, desc: 'Delivery gate adjacent to Foodys and shopping square' },
      { id: 'loc-gate-3', name: 'Main Gate 3 (Back Gate)', code: 'GATE_3', type: 'gate', lat: 12.973500, lng: 79.164500, desc: 'Eastern gate connecting to outer road' }
    ];

    for (const loc of campusLocations) {
      execute(`
        INSERT OR IGNORE INTO campus_locations (id, name, code, type, latitude, longitude, description, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `, [loc.id, loc.name, loc.code, loc.type, loc.lat, loc.lng, loc.desc]);
    }

    // 2. Hostel Locations (VIT Vellore MH and LH)
    const hostels = [
      { id: 'hostel-mh-a', name: "Men's Hostel - Block A", code: 'MH_A', gender: 'M', lat: 12.969800, lng: 79.156500 },
      { id: 'hostel-mh-b', name: "Men's Hostel - Block B", code: 'MH_B', gender: 'M', lat: 12.970200, lng: 79.156800 },
      { id: 'hostel-mh-c', name: "Men's Hostel - Block C", code: 'MH_C', gender: 'M', lat: 12.970600, lng: 79.157100 },
      { id: 'hostel-mh-d', name: "Men's Hostel - Block D", code: 'MH_D', gender: 'M', lat: 12.971000, lng: 79.157400 },
      { id: 'hostel-mh-e', name: "Men's Hostel - Block E", code: 'MH_E', gender: 'M', lat: 12.971500, lng: 79.157600 },
      { id: 'hostel-mh-f', name: "Men's Hostel - Block F", code: 'MH_F', gender: 'M', lat: 12.972000, lng: 79.157800 },
      { id: 'hostel-mh-g', name: "Men's Hostel - Block G", code: 'MH_G', gender: 'M', lat: 12.972400, lng: 79.158200 },
      { id: 'hostel-mh-h', name: "Men's Hostel - Block H", code: 'MH_H', gender: 'M', lat: 12.972900, lng: 79.158500 },
      { id: 'hostel-mh-j', name: "Men's Hostel - Block J", code: 'MH_J', gender: 'M', lat: 12.973400, lng: 79.159000 },
      { id: 'hostel-mh-k', name: "Men's Hostel - Block K", code: 'MH_K', gender: 'M', lat: 12.973800, lng: 79.159500 },
      { id: 'hostel-mh-l', name: "Men's Hostel - Block L", code: 'MH_L', gender: 'M', lat: 12.974200, lng: 79.160100 },
      { id: 'hostel-mh-m', name: "Men's Hostel - Block M", code: 'MH_M', gender: 'M', lat: 12.974600, lng: 79.160700 },
      { id: 'hostel-mh-n', name: "Men's Hostel - Block N", code: 'MH_N', gender: 'M', lat: 12.975000, lng: 79.161300 },
      { id: 'hostel-mh-p', name: "Men's Hostel - Block P", code: 'MH_P', gender: 'M', lat: 12.975400, lng: 79.161900 },
      { id: 'hostel-mh-q', name: "Men's Hostel - Block Q", code: 'MH_Q', gender: 'M', lat: 12.975800, lng: 79.162500 },
      { id: 'hostel-mh-r', name: "Men's Hostel - Block R", code: 'MH_R', gender: 'M', lat: 12.976200, lng: 79.163100 },
      { id: 'hostel-mh-s', name: "Men's Hostel - Block S", code: 'MH_S', gender: 'M', lat: 12.976600, lng: 79.163700 },
      { id: 'hostel-mh-t', name: "Men's Hostel - Block T", code: 'MH_T', gender: 'M', lat: 12.977000, lng: 79.164300 },
      { id: 'hostel-lh-a', name: "Ladies' Hostel - Block A", code: 'LH_A', gender: 'F', lat: 12.968200, lng: 79.159000 },
      { id: 'hostel-lh-b', name: "Ladies' Hostel - Block B", code: 'LH_B', gender: 'F', lat: 12.968500, lng: 79.159500 },
      { id: 'hostel-lh-c', name: "Ladies' Hostel - Block C", code: 'LH_C', gender: 'F', lat: 12.968800, lng: 79.160000 },
      { id: 'hostel-lh-d', name: "Ladies' Hostel - Block D", code: 'LH_D', gender: 'F', lat: 12.969100, lng: 79.160500 },
      { id: 'hostel-lh-e', name: "Ladies' Hostel - Block E", code: 'LH_E', gender: 'F', lat: 12.969400, lng: 79.161000 },
      { id: 'hostel-lh-f', name: "Ladies' Hostel - Block F", code: 'LH_F', gender: 'F', lat: 12.969700, lng: 79.161500 },
      { id: 'hostel-lh-g', name: "Ladies' Hostel - Block G", code: 'LH_G', gender: 'F', lat: 12.970000, lng: 79.162000 },
      { id: 'hostel-lh-h', name: "Ladies' Hostel - Block H", code: 'LH_H', gender: 'F', lat: 12.970300, lng: 79.162500 }
    ];

    for (const h of hostels) {
      execute(`
        INSERT OR IGNORE INTO hostel_locations (id, name, code, gender, latitude, longitude, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `, [h.id, h.name, h.code, h.gender, h.lat, h.lng]);
    }

    // 3. Rental Categories
    const categories = [
      { id: 'cat-textbooks', name: 'Textbooks & Academic Books', slug: 'textbooks', desc: 'Core engineering, CS, math & science references', icon: 'book-open' },
      { id: 'cat-calculators', name: 'Scientific Calculators', slug: 'calculators', desc: 'Casio fx-991EX, fx-991CW, fx-991MS scientific calculators', icon: 'calculator' },
      { id: 'cat-lab-coats', name: 'Lab Coats & Safety Gear', slug: 'lab-coats', desc: 'White lab coats, dissection boxes, protective safety goggles', icon: 'shield' },
      { id: 'cat-equipment', name: 'Lab & Electronics Hardware', slug: 'lab-equipment', desc: 'Digital multimeters, Arduino, ESP32, Raspberry Pi kits', icon: 'cpu' },
      { id: 'cat-sports', name: 'Sports & Fitness Equipment', slug: 'sports-equipment', desc: 'Badminton racquets, football, basketball, yoga mats', icon: 'activity' },
      { id: 'cat-event-wear', name: 'Formal & Event Attire', slug: 'event-wear', desc: 'Suits, blazers, Riviera ethnic wear, convocation attire', icon: 'award' },
      { id: 'cat-essentials', name: 'Hostel & Room Essentials', slug: 'essentials', desc: 'Desk study lamps, iron boxes, kettles, extension cords', icon: 'home' }
    ];

    for (const cat of categories) {
      execute(`
        INSERT OR IGNORE INTO rental_categories (id, name, slug, description, icon, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `, [cat.id, cat.name, cat.slug, cat.desc, cat.icon]);
    }

    // 4. Platform Settings
    const settings = [
      ['base_delivery_fee', '8.00', 'pricing', 'Base booking fee for campus parcel pickup in INR'],
      ['price_per_km', '5.00', 'pricing', 'Rate per kilometre of calculated route in INR'],
      ['min_delivery_fee', '10.00', 'pricing', 'Minimum delivery charge payable by requester'],
      ['max_delivery_fee', '120.00', 'pricing', 'Maximum delivery charge cap for campus deliveries'],
      ['fallback_delivery_fee', '20.00', 'pricing', 'Fixed fee when GPS is unavailable or declined'],
      ['parcel_commission_percent', '15.00', 'commission', 'PeerNest platform cut on parcel delivery (percent)'],
      ['rental_commission_percent', '10.00', 'commission', 'PeerNest platform commission on rental charges (percent)'],
      ['max_active_deliveries_per_partner', '3', 'operations', 'Maximum simultaneous active deliveries a delivery partner can claim'],
      ['max_declared_parcel_value', '10000.00', 'protection', 'Maximum declared parcel value eligible for campus transit'],
      ['max_parcel_compensation', '5000.00', 'protection', 'Maximum compensation claim payout per parcel incident'],
      ['rental_inspection_window_hours', '24', 'rentals', 'Hours after return for owner to inspect and file damage report'],
      ['institutional_email_domain', 'vitstudent.ac.in', 'auth', 'Allowed student institutional email domain for registration']
    ];

    for (const [key, val, cat, desc] of settings) {
      execute(`
        INSERT OR REPLACE INTO platform_settings (key, value, category, description, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `, [key, val, cat, desc]);
    }

    // 5. Seed Users & Demo Profiles
    const defaultPassword = hashPassword('campus123');

    const demoUsers = [
      {
        id: 'usr-admin-1',
        email: 'admin.peernest@vitstudent.ac.in',
        fullName: 'Prof. Ramesh Kumar',
        regNo: 'ADMIN001',
        phone: '+91 98401 23456',
        hostel: 'Faculty Block B',
        room: 'F-201',
        isAdmin: 1,
        activities: ['request_parcel', 'deliver_parcels', 'lend_items', 'borrow_items']
      },
      {
        id: 'usr-student-aarav',
        email: 'aarav.sharma2023@vitstudent.ac.in',
        fullName: 'Aarav Sharma',
        regNo: '23BCE1042',
        phone: '+91 98765 43210',
        hostel: "Men's Hostel - Block D",
        room: 'D-412',
        isAdmin: 0,
        activities: ['request_parcel', 'borrow_items']
      },
      {
        id: 'usr-student-priya',
        email: 'priya.nair2022@vitstudent.ac.in',
        fullName: 'Priya Nair',
        regNo: '22BEE0819',
        phone: '+91 91234 56789',
        hostel: "Ladies' Hostel - Block B",
        room: 'LH-B-305',
        isAdmin: 0,
        activities: ['deliver_parcels', 'lend_items']
      },
      {
        id: 'usr-student-rohit',
        email: 'rohit.verma2024@vitstudent.ac.in',
        fullName: 'Rohit Verma',
        regNo: '24BME0512',
        phone: '+91 99887 76655',
        hostel: "Men's Hostel - Block L",
        room: 'L-608',
        isAdmin: 0,
        activities: ['deliver_parcels', 'borrow_items']
      }
    ];

    for (const u of demoUsers) {
      execute(`
        INSERT OR IGNORE INTO users (id, email, password_hash, is_verified, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
      `, [u.id, u.email, defaultPassword]);

      execute(`
        INSERT OR REPLACE INTO user_profiles (
          id, user_id, full_name, registration_number, phone_number,
          campus, hostel_block, room_number, student_verified, is_admin,
          selected_activities
        )
        VALUES (?, ?, ?, ?, ?, 'Vellore', ?, ?, 1, ?, ?)
      `, [
        'prof-' + u.id,
        u.id,
        u.fullName,
        u.regNo,
        u.phone,
        u.hostel,
        u.room,
        u.isAdmin,
        JSON.stringify(u.activities)
      ]);
    }

    // 6. Seed Sample Rental Listings (Owned by Priya and Rohit)
    const sampleListings = [
      {
        id: 'list-calc-casio',
        ownerId: 'usr-student-priya',
        title: 'Casio fx-991EX ClassWiz Scientific Calculator',
        categoryId: 'cat-calculators',
        desc: 'Original Casio fx-991EX ClassWiz. Allowed for all engineering exams (FAT/CAT) at VIT Vellore. High resolution LCD screen, QR code function, 552 functions with fresh battery.',
        condition: 'like_new',
        dailyPrice: 25.0,
        securityDeposit: 600.0,
        declaredValue: 1800.0,
        minDays: 1,
        maxDays: 14,
        handoverLocation: 'Foodys or LH-B Gate',
        terms: 'Return with intact display screen and case. Avoid moisture.',
        latePolicy: '₹30 per extra day if not extended with mutual agreement.',
        photos: JSON.stringify(['https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=600&auto=format&fit=crop&q=80'])
      },
      {
        id: 'list-book-cormen',
        ownerId: 'usr-student-priya',
        title: 'Introduction to Algorithms (CLRS 3rd Edition)',
        categoryId: 'cat-textbooks',
        desc: 'Comprehensive standard textbook for Design and Analysis of Algorithms (DAA) and Data Structures. Excellent condition, no pencil marks, with clear protective cover.',
        condition: 'good',
        dailyPrice: 20.0,
        securityDeposit: 500.0,
        declaredValue: 1400.0,
        minDays: 2,
        maxDays: 30,
        handoverLocation: 'SJT Ground Floor Gazebo',
        terms: 'Please do not highlight or mark with ink pens.',
        latePolicy: '₹20 per day overdue.',
        photos: JSON.stringify(['https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'])
      },
      {
        id: 'list-lab-coat',
        ownerId: 'usr-student-rohit',
        title: 'Pure Cotton Lab Coat (Size 40 - Large) + Safety Goggles',
        categoryId: 'cat-lab-coats',
        desc: 'Freshly washed 100% thick white cotton lab coat with VIT approved knee-length fit. Includes UV-protected safety glasses for Chemistry and Physics lab experiments.',
        condition: 'like_new',
        dailyPrice: 15.0,
        securityDeposit: 300.0,
        declaredValue: 750.0,
        minDays: 1,
        maxDays: 7,
        handoverLocation: 'TT Entrance / Men Block D',
        terms: 'Hand back clean and folded.',
        latePolicy: '₹25 per day overdue.',
        photos: JSON.stringify(['https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=600&auto=format&fit=crop&q=80'])
      },
      {
        id: 'list-badminton-kit',
        ownerId: 'usr-student-rohit',
        title: 'Yonex Astrox 77 Badminton Racket with Full Cover',
        categoryId: 'cat-sports',
        desc: 'Yonex Astrox graphite frame, pre-strung at 26 lbs with BG65 titanium string. Great for indoor stadium practice. Grip is brand new.',
        condition: 'good',
        dailyPrice: 35.0,
        securityDeposit: 750.0,
        declaredValue: 2400.0,
        minDays: 1,
        maxDays: 5,
        handoverLocation: 'Outdoor Sports Complex / Gate 2',
        terms: 'Use only with proper non-marking shoes inside court.',
        latePolicy: '₹40 per day overdue.',
        photos: JSON.stringify(['https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=600&auto=format&fit=crop&q=80'])
      }
    ];

    for (const item of sampleListings) {
      execute(`
        INSERT OR IGNORE INTO rental_listings (
          id, owner_id, title, category_id, description, condition,
          daily_price, security_deposit, declared_value, min_duration_days,
          max_duration_days, handover_location, terms, late_policy, photos,
          is_active, is_paused, views_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 12)
      `, [
        item.id, item.ownerId, item.title, item.categoryId, item.desc,
        item.condition, item.dailyPrice, item.securityDeposit, item.declaredValue,
        item.minDays, item.maxDays, item.handoverLocation, item.terms,
        item.latePolicy, item.photos
      ]);
    }

    // 7. Seed Sample Parcel Request (Waiting for partner)
    const sampleParcel = {
      id: 'req-sample-par-1',
      code: 'PN-PAR-202611-0042',
      requesterId: 'usr-student-aarav',
      reference: 'Amazon BlueDart AWB #9482910382',
      centreId: 'loc-parcel-main',
      hostelId: 'hostel-mh-d',
      location: 'MH-D Block Entrance Lobby',
      pickupTime: '2026-11-01 17:30',
      instructions: 'Medium cardboard box with electronics. Please handle with care.',
      declaredVal: 1500.0,
      distKm: 1.4,
      baseFee: 8.0,
      kmFee: 7.0,
      totalFee: 15.0,
      partnerEarn: 12.0,
      commission: 3.0,
      status: 'waiting_for_partner'
    };

    execute(`
      INSERT OR IGNORE INTO parcel_requests (
        id, parcel_code, requester_id, parcel_reference, collection_centre_id,
        destination_hostel_id, designated_location, preferred_pickup_time,
        instructions, declared_value, distance_km, base_fee, km_fee,
        total_fee, partner_earnings, platform_commission, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      sampleParcel.id, sampleParcel.code, sampleParcel.requesterId, sampleParcel.reference,
      sampleParcel.centreId, sampleParcel.hostelId, sampleParcel.location, sampleParcel.pickupTime,
      sampleParcel.instructions, sampleParcel.declaredVal, sampleParcel.distKm,
      sampleParcel.baseFee, sampleParcel.kmFee, sampleParcel.totalFee,
      sampleParcel.partnerEarn, sampleParcel.commission, sampleParcel.status
    ]);

    // Record initial status history
    execute(`
      INSERT OR IGNORE INTO parcel_status_history (id, parcel_request_id, status, changed_by_user_id, notes)
      VALUES (?, ?, 'submitted', ?, 'Parcel pickup request submitted by student.')
    `, ['hist-1', sampleParcel.id, sampleParcel.requesterId]);

    // Initial protection reserve balance entry
    execute(`
      INSERT OR IGNORE INTO protection_reserve_transactions (id, type, amount, reference_type, balance_after, notes)
      VALUES ('res-init-1', 'contribution', 10000.00, 'platform_seed', 10000.00, 'Initial platform protection reserve allocation')
    `);
  });

  console.log('[PeerNest] Database successfully seeded with VIT Vellore data & demo accounts.');
}

module.exports = { seed };

if (require.main === module) {
  const { initDatabase } = require('./db');
  initDatabase();
  seed();
}
