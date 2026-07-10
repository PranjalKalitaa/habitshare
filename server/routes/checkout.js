// ============================================================
//  server/routes/checkout.js
//  Razorpay Payment Integration Router
// ============================================================

const express = require('express');
const router  = express.Router();
const Razorpay = require('razorpay');
const crypto   = require('crypto');
const admin    = require('../firebase-admin');

// Initialize Razorpay SDK with environment credentials
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// POST /checkout/razorpay-order
// Creates a Razorpay Order and returns it to the client
router.post('/razorpay-order', async (req, res) => {
  const { priceType, uid, email } = req.body;

  if (!uid) {
    return res.status(400).json({ error: 'Missing required field: uid' });
  }

  // Determine amount in paise (minimum 100 paise)
  // Monthly = ₹89 (8900 paise)
  // Yearly = ₹1,001 (100100 paise)
  const amount = priceType === 'yearly' ? 100100 : 8900;

  try {
    const options = {
      amount:      amount,
      currency:    'INR',
      receipt:     `rcpt_${uid.substring(0, 10)}_${Date.now()}`,
      notes: {
        uid:       uid,
        priceType: priceType || 'monthly',
        email:     email || ''
      }
    };

    const order = await razorpay.orders.create(options);
    console.log(`[HabitShare] ✅ Razorpay Order created: ${order.id} for uid=${uid}`);

    res.json({
      orderId:   order.id,
      amount:    order.amount,
      currency:  order.currency,
      keyId:     process.env.RAZORPAY_KEY_ID,
      uid:       uid,
      priceType: priceType || 'monthly'
    });

  } catch (err) {
    console.error('[HabitShare] ❌ Razorpay Order creation failed:', err);
    const errMsg = err.error?.description || err.message || 'Razorpay order creation failed';
    res.status(500).json({ error: errMsg });
  }
});

// POST /checkout/razorpay-verify
// Verifies signature returned from Checkout Standard Web flow and marks user as Premium
router.post('/razorpay-verify', async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, uid, priceType } = req.body;

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !uid) {
    return res.status(400).json({ error: 'Missing required payment verification fields' });
  }

  try {
    // Generate signature signature verification check
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      console.error('[HabitShare] ❌ Razorpay signature mismatch!');
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    // Signature match successful! Update user's Premium status in Firebase Firestore
    const db = admin.firestore();
    await db.collection('users').doc(uid).set({
      isPremium:         true,
      premiumType:       priceType || 'monthly',
      premiumSince:      new Date().toISOString(),
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId:   razorpay_order_id
    }, { merge: true });

    console.log(`[HabitShare] ✅ User ${uid} upgraded to Premium via Razorpay Order ${razorpay_order_id}`);
    res.json({ success: true });

  } catch (err) {
    console.error('[HabitShare] ❌ Payment verification Firestore update failed:', err.message);
    res.status(500).json({ error: 'Failed to update premium credentials' });
  }
});

module.exports = router;
