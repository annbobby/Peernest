// ============================================================================
// PEERNEST - Comprehensive System Test Suite & Continuous Validation Harness
// Designed for VIT Vellore Campus Convenience Platform
// ============================================================================

const assert = require('node:assert');
const { Readable, Writable } = require('node:stream');
const { server } = require('../server/index');

// High-speed in-process HTTP dispatcher
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const method = options.method || 'GET';
    const bodyStr = options.body ? JSON.stringify(options.body) : '';

    const req = new Readable({
      read() {
        if (bodyStr) this.push(bodyStr);
        this.push(null);
      }
    });

    req.url = path;
    req.method = method;
    req.headers = {
      'content-type': 'application/json',
      'host': 'localhost',
      ...(options.headers || {})
    };
    req.socket = { remoteAddress: '127.0.0.1' };

    let responseBody = '';
    const res = new Writable({
      write(chunk, encoding, callback) {
        responseBody += chunk.toString();
        callback();
      }
    });

    res.statusCode = 200;
    res._headers = {};
    res.setHeader = function (k, v) { res._headers[k.toLowerCase()] = v; };
    res.getHeader = function (k) { return res._headers[k.toLowerCase()]; };
    res.writeHead = function (code, headers) {
      res.statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      }
      return res;
    };

    res.on('finish', () => {
      let data = responseBody;
      try { data = JSON.parse(responseBody); } catch (e) {}
      resolve({ status: res.statusCode, headers: res._headers, data });
    });

    res.on('error', reject);
    server.emit('request', req, res);
  });
}

async function runAllTests() {
  const startTime = Date.now();
  console.log('\n================================================================');
  console.log('🧪 PEERNEST FULL-STACK VERIFICATION & COMPREHENSIVE TEST SUITE');
  console.log('🏛️  Target: VIT Vellore Campus Platform');
  console.log('⏱️  Execution Time: ' + new Date().toISOString());
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const testResults = [];

  async function test(category, name, fn) {
    const t0 = Date.now();
    try {
      await fn();
      const elapsed = Date.now() - t0;
      console.log(`  ✅ [${category}] ${name} (${elapsed}ms)`);
      passed++;
      testResults.push({ category, name, status: 'PASSED', duration: elapsed });
    } catch (err) {
      const elapsed = Date.now() - t0;
      console.error(`  ❌ [${category}] ${name} (${elapsed}ms)`);
      console.error(`     Error: ${err.message}`);
      if (err.stack) console.error(err.stack.split('\n').slice(1, 3).join('\n'));
      failed++;
      testResults.push({ category, name, status: 'FAILED', duration: elapsed, error: err.message });
    }
  }

  // Tokens shared across modules
  let tokenAarav = '';
  let tokenPriya = '';
  let tokenRohit = '';
  let tokenAdmin = '';

  // --------------------------------------------------------------------------
  // MODULE 1: AUTHENTICATION, VIT DOMAIN RESTRICTION & USER MANAGEMENT
  // --------------------------------------------------------------------------
  console.log('\n--- MODULE 1: AUTHENTICATION & VIT STUDENT VERIFICATION ---');

  await test('AUTH', 'Reject registration with non-VIT personal email (@gmail.com)', async () => {
    const res = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'random.student@gmail.com',
        password: 'campus123',
        fullName: 'Non VIT User',
        registrationNumber: '22BCE9999',
        phoneNumber: '+91 99999 88888',
        hostelBlock: "Men's Hostel - Block A"
      }
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('strictly restricted to VIT Vellore students'));
  });

  await test('AUTH', 'Reject registration with invalid registration number format', async () => {
    const res = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'test.badreg@vitstudent.ac.in',
        password: 'campus123',
        fullName: 'Bad Reg Student',
        registrationNumber: 'INVALID_REG_123',
        phoneNumber: '+91 99999 88888',
        hostelBlock: "Men's Hostel - Block A"
      }
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('Invalid VIT registration number format'));
  });

  await test('AUTH', 'Register and verify new student with @vitstudent.ac.in and OTP', async () => {
    const regNo = `24BCE${Math.floor(1000 + Math.random() * 9000)}`;
    const email = `newstudent.${regNo.toLowerCase()}@vitstudent.ac.in`;

    const regRes = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email,
        password: 'campus123',
        fullName: 'Sneha Patel',
        registrationNumber: regNo,
        phoneNumber: '+91 98765 11223',
        hostelBlock: "Ladies' Hostel - Block C",
        roomNumber: 'LH-C-402'
      }
    });
    assert.strictEqual(regRes.status, 201);
    assert.ok(regRes.data.demoVerificationOtp);

    // Verify Email with OTP
    const verifyRes = await makeRequest('/api/auth/verify-email', {
      method: 'POST',
      body: { email, otp: regRes.data.demoVerificationOtp }
    });
    assert.strictEqual(verifyRes.status, 200);
    assert.ok(verifyRes.data.token);
  });

  await test('AUTH', 'Login with Aarav Sharma (password: campus123)', async () => {
    const res = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'aarav.sharma2023@vitstudent.ac.in', password: 'campus123' }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.token);
    assert.ok(res.data.profile.full_name.includes('Aarav'));
    tokenAarav = res.data.token;
  });

  await test('AUTH', 'Login with Priya Nair (password: campus123)', async () => {
    const res = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'priya.nair2022@vitstudent.ac.in', password: 'campus123' }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.token);
    tokenPriya = res.data.token;
  });

  await test('AUTH', 'Login with Rohit Verma (password: campus123)', async () => {
    const res = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'rohit.verma2024@vitstudent.ac.in', password: 'campus123' }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.token);
    tokenRohit = res.data.token;
  });

  await test('AUTH', 'Login with Campus Administrator (password: campus123)', async () => {
    const res = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin.peernest@vitstudent.ac.in', password: 'campus123' }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.token);
    assert.strictEqual(res.data.profile.is_admin, true);
    tokenAdmin = res.data.token;
  });

  await test('AUTH', 'Fetch dynamic dropdown users list for login modal', async () => {
    const res = await makeRequest('/api/auth/users-list');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.users));
    assert.ok(res.data.users.length >= 4);
    assert.ok(res.data.users.some(u => u.email === 'aarav.sharma2023@vitstudent.ac.in'));
  });

  await test('AUTH', 'Retrieve authenticated student profile (/api/auth/me)', async () => {
    const res = await makeRequest('/api/auth/me', {
      headers: { authorization: `Bearer ${tokenAarav}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.profile.registrationNumber);
    assert.ok(res.data.profile.full_name);
  });

  await test('AUTH', 'Update student multi-activity preference', async () => {
    const res = await makeRequest('/api/auth/activities', {
      method: 'PUT',
      headers: { authorization: `Bearer ${tokenAarav}` },
      body: { activities: ['deliver_parcels', 'request_parcel', 'borrow_items', 'lend_items'] }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.selectedActivities.length, 4);
  });

  // --------------------------------------------------------------------------
  // MODULE 2: GPS ROUTING & PARCEL DELIVERY
  // --------------------------------------------------------------------------
  console.log('\n--- MODULE 2: GPS ROUTING & PARCEL PICKUP/DELIVERY ---');

  let testParcelId = '';
  let testDeliveryOtp = '';

  await test('PARCEL', 'Verify VIT Vellore campus locations and hostel coordinates database', async () => {
    const locRes = await makeRequest('/api/gps/locations');
    const hostelRes = await makeRequest('/api/gps/hostels');
    assert.strictEqual(locRes.status, 200);
    assert.strictEqual(hostelRes.status, 200);
    assert.ok(locRes.data.locations.some(l => l.code === 'PARCEL_MAIN'));
    assert.ok(hostelRes.data.hostels.some(h => h.code === 'MH_D'));
    assert.ok(hostelRes.data.hostels.some(h => h.code === 'LH_B'));
  });

  await test('PARCEL', 'Calculate accurate GPS route distance and transparent fare breakdown', async () => {
    const res = await makeRequest('/api/gps/estimate', {
      method: 'POST',
      body: {
        collectionCentreId: 'loc-parcel-main',
        destinationHostelId: 'hostel-mh-d',
        partnerLat: 12.9715,
        partnerLng: 79.158
      }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.distanceKm > 0);
    assert.ok(res.data.totalFee >= 10);
    assert.strictEqual(res.data.totalFee, res.data.partnerEarnings + res.data.platformCommission);
  });

  await test('PARCEL', 'Create parcel request by Requester (Aarav)', async () => {
    const res = await makeRequest('/api/parcels/request', {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenAarav}` },
      body: {
        parcelReference: 'Amazon Delivery Package AWB-9281923',
        collectionCentreId: 'loc-parcel-main',
        destinationHostelId: 'hostel-mh-d',
        designatedLocation: 'MH-D Block Security Desk',
        declaredValue: 1500,
        preferredPickupTime: 'Today 5:00 PM',
        instructions: 'Handle with care - study material'
      }
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.data.parcelId);
    assert.ok(res.data.parcelCode.startsWith('PN-PAR-'));
    testParcelId = res.data.parcelId;
  });

  await test('PARCEL', 'Enforce anti-self delivery (Requester cannot accept own parcel)', async () => {
    const res = await makeRequest(`/api/parcels/${testParcelId}/accept`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenAarav}` }
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('cannot accept your own parcel'));
  });

  await test('PARCEL', 'Atomic Parcel Acceptance by Delivery Partner (Priya)', async () => {
    const res = await makeRequest(`/api/parcels/${testParcelId}/accept`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenPriya}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.conversationId);
  });

  await test('PARCEL', 'Concurrency Guard: Prevent duplicate acceptance by another partner', async () => {
    const res = await makeRequest(`/api/parcels/${testParcelId}/accept`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenRohit}` }
    });
    assert.strictEqual(res.status, 409);
    assert.ok(res.data.error.includes('no longer available'));
  });

  await test('PARCEL', 'Stage 1 Verification: Partner confirms collection & generates 6-digit delivery OTP', async () => {
    const res = await makeRequest(`/api/parcels/${testParcelId}/collect`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenPriya}` },
      body: {
        collectionPhotoUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c',
        conditionNotes: 'Collected intact from Central Parcel Counter.'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.demoDeliveryOtp);
    assert.strictEqual(res.data.demoDeliveryOtp.length, 6);
    testDeliveryOtp = res.data.demoDeliveryOtp;
  });

  await test('PARCEL', 'Security Guard: Reject delivery verification with incorrect OTP', async () => {
    const res = await makeRequest(`/api/parcels/${testParcelId}/verify-delivery`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenPriya}` },
      body: { otp: '999999' }
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('Invalid delivery OTP'));
  });

  await test('PARCEL', 'Stage 2 Verification: Delivery completed via valid OTP & partner payout credited', async () => {
    const res = await makeRequest(`/api/parcels/${testParcelId}/verify-delivery`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenPriya}` },
      body: { otp: testDeliveryOtp }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.earnings > 0);
  });

  // --------------------------------------------------------------------------
  // MODULE 3: STUDENT-TO-STUDENT RENTAL MARKETPLACE
  // --------------------------------------------------------------------------
  console.log('\n--- MODULE 3: STUDENT-TO-STUDENT RENTAL MARKETPLACE ---');

  let testListingId = '';
  let testBookingId = '';

  await test('RENTAL', 'Browse rental categories and active listings catalog', async () => {
    const catRes = await makeRequest('/api/rentals/categories');
    const listRes = await makeRequest('/api/rentals/listings');
    assert.strictEqual(catRes.status, 200);
    assert.strictEqual(listRes.status, 200);
    assert.ok(catRes.data.categories.length >= 5);
    assert.ok(listRes.data.listings.length >= 1);
  });

  await test('RENTAL', 'Create new listing with 3 separate values (Rent, Deposit, Declared)', async () => {
    const res = await makeRequest('/api/rentals/listings', {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenPriya}` },
      body: {
        title: 'Casio fx-991EX ClassWiz for FAT Exam',
        categoryId: 'cat-calculators',
        condition: 'like_new',
        dailyPrice: 25,
        securityDeposit: 500,
        declaredValue: 1800,
        minDurationDays: 1,
        maxDurationDays: 10,
        handoverLocation: 'LH-B Gate or Foodys',
        description: 'Allowed for all VIT CAT/FAT exams. Fresh battery.'
      }
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.data.listingId);
    testListingId = res.data.listingId;
  });

  await test('RENTAL', 'Enforce anti-self rental (Owner cannot rent own item)', async () => {
    const res = await makeRequest('/api/rentals/book', {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenPriya}` },
      body: {
        listingId: testListingId,
        startDate: '2026-11-10',
        endDate: '2026-11-12'
      }
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('cannot rent your own item'));
  });

  await test('RENTAL', 'Submit booking request by Borrower (Aarav)', async () => {
    const res = await makeRequest('/api/rentals/book', {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenAarav}` },
      body: {
        listingId: testListingId,
        startDate: '2026-11-10',
        endDate: '2026-11-12'
      }
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.data.bookingId);
    testBookingId = res.data.bookingId;
  });

  await test('RENTAL', 'Owner (Priya) accepts rental booking request', async () => {
    const res = await makeRequest(`/api/rentals/bookings/${testBookingId}/respond`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenPriya}` },
      body: { action: 'accept' }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'accepted');
  });

  await test('RENTAL', 'Concurrency Guard: Prevent double-booking for overlapping dates', async () => {
    const res = await makeRequest('/api/rentals/book', {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenRohit}` },
      body: {
        listingId: testListingId,
        startDate: '2026-11-11',
        endDate: '2026-11-13'
      }
    });
    assert.strictEqual(res.status, 409);
    assert.ok(res.data.error.includes('already booked for the selected date range'));
  });

  await test('RENTAL', 'Borrower completes payment with refundable security deposit', async () => {
    const res = await makeRequest(`/api/rentals/bookings/${testBookingId}/pay`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenAarav}` },
      body: { paymentMethod: 'upi_gpay' }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.amountPaid > 0);
  });

  await test('RENTAL', 'Record pre-handover condition report with checklist & photo evidence', async () => {
    const res = await makeRequest(`/api/rentals/bookings/${testBookingId}/handover`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenAarav}` },
      body: {
        conditionRating: 'like_new',
        defectsNotes: 'Display screen is flawless, all keys click properly.',
        checklist: { functional: true, clean: true, coverIncluded: true }
      }
    });
    assert.strictEqual(res.status, 200);
  });

  await test('RENTAL', 'Return inspection: Safe return releases 100% deposit refund to borrower', async () => {
    const res = await makeRequest(`/api/rentals/bookings/${testBookingId}/return`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenPriya}` },
      body: { defectsFound: false }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'completed');
    assert.strictEqual(res.data.depositRefunded, 500);
    assert.ok(res.data.ownerEarnings > 0);
  });

  // --------------------------------------------------------------------------
  // MODULE 4: PRIVATE TRANSACTION-BASED CHAT & NOTIFICATIONS
  // --------------------------------------------------------------------------
  console.log('\n--- MODULE 4: TRANSACTION CHAT & NOTIFICATIONS ---');

  let activeConvId = '';

  await test('CHAT', 'Load conversations scoped strictly to authorized transaction participants', async () => {
    const res = await makeRequest('/api/chat/conversations', {
      headers: { authorization: `Bearer ${tokenAarav}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.conversations.length > 0);
    activeConvId = res.data.conversations[0].id;
  });

  await test('CHAT', 'Send message in private transaction chat', async () => {
    const res = await makeRequest(`/api/chat/conversations/${activeConvId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenAarav}` },
      body: { content: 'I have arrived at the designated hostel entrance.' }
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.data.messageData.id);
  });

  await test('NOTIF', 'Fetch in-app notifications and mark as read', async () => {
    const res = await makeRequest('/api/notifications', {
      headers: { authorization: `Bearer ${tokenAarav}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.notifications));

    const readAllRes = await makeRequest('/api/notifications/read-all', {
      method: 'PUT',
      headers: { authorization: `Bearer ${tokenAarav}` }
    });
    assert.strictEqual(readAllRes.status, 200);
  });

  // --------------------------------------------------------------------------
  // MODULE 5: ADMINISTRATIVE DASHBOARD & FINANCIAL RECONCILIATION
  // --------------------------------------------------------------------------
  console.log('\n--- MODULE 5: ADMINISTRATOR CONSOLE & FINANCIAL AUDIT ---');

  await test('ADMIN', 'Verify admin overview metrics and financial balance ledger', async () => {
    const res = await makeRequest('/api/admin/overview', {
      headers: { authorization: `Bearer ${tokenAdmin}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.metrics.totalStudents >= 4);
    assert.ok(res.data.financials.protectionReserveBalance >= 10000);
  });

  await test('ADMIN', 'Retrieve all registered students with suspension control', async () => {
    const res = await makeRequest('/api/admin/users', {
      headers: { authorization: `Bearer ${tokenAdmin}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.users.length >= 4);
  });

  await test('ADMIN', 'Update platform pricing configuration (Base fee & rate per km)', async () => {
    const res = await makeRequest('/api/admin/settings', {
      method: 'PUT',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      body: {
        settings: [
          { key: 'base_delivery_fee', value: '8.00' },
          { key: 'price_per_km', value: '5.00' }
        ]
      }
    });
    assert.strictEqual(res.status, 200);
  });

  // Summary
  const totalElapsed = Date.now() - startTime;
  console.log('\n================================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log(`⏱️ Total Time: ${totalElapsed}ms`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests();
