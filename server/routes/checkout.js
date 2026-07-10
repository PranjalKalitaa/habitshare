// ============================================================
//  server/routes/checkout.js
//  POST /checkout/session
//
//  Creates a Stripe Checkout session and returns the hosted
//  payment URL. The frontend redirects the user there.
//
//  Request body:
//    { priceId, priceType, uid, email }
//
//  Response:
//    { url }  — Stripe hosted checkout page URL
// ============================================================

const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// POST /checkout/session
router.post('/session', async (req, res) => {
  const { priceId, priceType, uid, email } = req.body;

  // Basic validation
  if (!priceId || !uid) {
    return res.status(400).json({ error: 'Missing required fields: priceId, uid' });
  }
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_PASTE')) {
    return res.status(500).json({ error: 'Stripe secret key not configured in .env' });
  }

  try {
    // Dynamically detect frontend URL from Referer header, falling back to FRONTEND_URL
    let frontendUrl = process.env.FRONTEND_URL || 'https://habit-share-app.web.app';
    if (req.headers.referer) {
      try {
        const parsedUrl = new URL(req.headers.referer);
        frontendUrl = parsedUrl.origin;
      } catch (e) {
        // Fallback if parsing fails
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',           // recurring billing
      payment_method_types: ['card'],

      // Pre-fill email if we have it
      customer_email: email || undefined,

      line_items: [{ price: priceId, quantity: 1 }],

      // Store Firebase UID + plan type in metadata so the webhook
      // knows which Firestore user to mark as Premium
      metadata: {
        uid,
        priceType: priceType || 'monthly',
      },

      // Subscription metadata (also attached to subscription object)
      subscription_data: {
        metadata: { uid, priceType: priceType || 'monthly' },
      },

      // Where Stripe redirects after checkout
      success_url: `${frontendUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${frontendUrl}?payment=cancel`,
    });

    console.log(`[HabitShare] ✅ Checkout session created for uid=${uid} plan=${priceType}`);
    res.json({ url: session.url });

  } catch (err) {
    console.error('[HabitShare] ❌ Stripe session creation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
