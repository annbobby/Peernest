// ============================================================================
// PEERNEST - Payment Gateway (Razorpay Integration & Test Mode Engine)
// ============================================================================

const crypto = require('node:crypto');
const { queryAll, queryOne, execute, transaction } = require('../db');
const { requireAuth } = require('../middleware/auth');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const IS_LIVE_GATEWAY = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);

function verifyRazorpaySignature(orderId, paymentId, signature) {
  if (!IS_LIVE_GATEWAY) {
    // In Test/Demo mode: verify using test signature pattern
    return signature && signature.startsWith('sig_');
  }
  const hmac = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET);
  hmac.update(`${orderId}|${paymentId}`);
  const generatedSignature = hmac.digest('hex');
  return generatedSignature === signature;
}

function registerPaymentRoutes(router) {
  // 1. GET PAYMENT GATEWAY STATUS & CONFIG
  router.get('/api/payments/config', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      mode: IS_LIVE_GATEWAY ? 'live' : 'test_mode',
      gatewayName: 'Razorpay (India)',
      keyId: IS_LIVE_GATEWAY ? RAZORPAY_KEY_ID : 'rzp_test_peernest_vit_demo',
      supportedMethods: ['UPI (GPay, PhonePe, Paytm)', 'Debit Cards', 'NetBanking'],
      currency: 'INR'
    }));
  });

  // 2. INITIATE PAYMENT / CREATE ORDER
  router.post('/api/payments/create-order', (req, res) => {
    requireAuth(req, res, () => {
      const { transactionType, transactionId, amount } = req.body || {};

      if (!transactionType || !transactionId || !amount) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Transaction type, transaction ID, and amount are required.' }));
      }

      const numAmount = parseFloat(amount);
      const orderId = `order_${crypto.randomBytes(8).toString('hex')}`;
      const paymentId = 'pay-' + crypto.randomUUID();

      let feeBreakdown = {};

      if (transactionType === 'parcel') {
        const parcel = queryOne('SELECT total_fee, platform_commission, partner_earnings FROM parcel_requests WHERE id = ?', [transactionId]);
        if (parcel) {
          feeBreakdown = {
            deliveryFee: parcel.total_fee,
            platformCommission: parcel.platform_commission,
            partnerEarnings: parcel.partner_earnings
          };
        }
      } else if (transactionType === 'rental') {
        const booking = queryOne('SELECT total_rental_charge, platform_commission, security_deposit, total_payable FROM rental_bookings WHERE id = ?', [transactionId]);
        if (booking) {
          feeBreakdown = {
            rentalCharge: booking.total_rental_charge,
            platformCommission: booking.platform_commission,
            refundableSecurityDeposit: booking.security_deposit,
            totalPayable: booking.total_payable
          };
        }
      }

      execute(`
        INSERT INTO payments (
          id, order_id, transaction_type, transaction_id, payer_id,
          amount, currency, gateway, status, fee_breakdown_json,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'INR', ?, 'created', ?, datetime('now'), datetime('now'))
      `, [
        paymentId,
        orderId,
        transactionType,
        transactionId,
        req.user.id,
        numAmount,
        IS_LIVE_GATEWAY ? 'razorpay' : 'razorpay_test_mode',
        JSON.stringify(feeBreakdown)
      ]);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        orderId,
        paymentId,
        amount: numAmount,
        currency: 'INR',
        keyId: IS_LIVE_GATEWAY ? RAZORPAY_KEY_ID : 'rzp_test_peernest_vit_demo',
        isTestMode: !IS_LIVE_GATEWAY,
        feeBreakdown
      }));
    });
  });

  // 3. SERVER-SIDE PAYMENT SIGNATURE VERIFICATION
  router.post('/api/payments/verify', (req, res) => {
    requireAuth(req, res, () => {
      const { orderId, paymentId, signature } = req.body || {};

      if (!orderId || !paymentId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Order ID and payment ID are required.' }));
      }

      const payment = queryOne('SELECT * FROM payments WHERE order_id = ?', [orderId]);
      if (!payment) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Payment order record not found.' }));
      }

      const isValid = verifyRazorpaySignature(orderId, paymentId, signature || 'sig_test_valid');
      if (!isValid) {
        execute("UPDATE payments SET status = 'failed', updated_at = datetime('now') WHERE id = ?", [payment.id]);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Payment signature verification failed. Untrusted payment payload.' }));
      }

      // Mark payment as captured
      execute(`
        UPDATE payments
        SET status = 'captured',
            gateway_payment_id = ?,
            gateway_signature = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `, [paymentId, signature || 'sig_verified', payment.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Payment verified and captured successfully!',
        orderId,
        gatewayPaymentId: paymentId,
        status: 'captured'
      }));
    });
  });

  // 4. USER TRANSACTION & PAYMENT HISTORY
  router.get('/api/payments/history', (req, res) => {
    requireAuth(req, res, () => {
      const payments = queryAll(`
        SELECT 
          p.*,
          r.id AS refund_id, r.amount AS refund_amount, r.status AS refund_status
        FROM payments p
        LEFT JOIN refunds r ON p.id = r.payment_id
        WHERE p.payer_id = ?
        ORDER BY p.created_at DESC
      `, [req.user.id]).map(p => ({
        ...p,
        feeBreakdown: JSON.parse(p.fee_breakdown_json || '{}')
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ payments }));
    });
  });

  // 5. USER PAYOUTS (Earnings balance from deliveries and rentals)
  router.get('/api/payments/payouts', (req, res) => {
    requireAuth(req, res, () => {
      const payouts = queryAll(`
        SELECT * FROM payouts 
        WHERE user_id = ?
        ORDER BY created_at DESC
      `, [req.user.id]);

      const totalEarned = payouts.reduce((sum, p) => sum + p.amount, 0);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        payouts,
        totalEarned: Math.round(totalEarned * 100) / 100
      }));
    });
  });
}

module.exports = { registerPaymentRoutes };
