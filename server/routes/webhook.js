// ============================================================
//  server/routes/webhook.js
//  POST /webhook
//
//  Stripe calls this endpoint after payment events.
//  We verify the Stripe signature then update Firestore.
//
//  Events handled:
//    checkout.session.completed      → mark user as Premium ✅
//    customer.subscription.deleted   → remove Premium status ❌
//    invoice.payment_failed          → notify user (optional)
// ============================================================

const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');
const admin   = require('../firebase-admin');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// POST /webhook  (raw body — set up in index.js)
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('[HabitShare] Webhook received without Stripe-Signature header');
    return res.status(400).send('Missing Stripe-Signature header');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_PASTE')) {
    console.error('[HabitShare] STRIPE_WEBHOOK_SECRET not configured in .env');
    return res.status(500).send('Webhook secret not configured');
  }

  // Verify the event came from Stripe (prevents spoofed events)
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[HabitShare] ❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[HabitShare] 📩 Webhook received: ${event.type}`);

  const db = admin.firestore();

  // ── checkout.session.completed ───────────────────────────────
  // Fired when a user successfully pays on Stripe's hosted page.
  // We mark them as Premium in Firestore.
  if (event.type === 'checkout.session.completed') {
    const session   = event.data.object;
    const uid       = session.metadata?.uid;
    const priceType = session.metadata?.priceType || 'monthly';

    if (!uid) {
      console.error('[HabitShare] ⚠️  Webhook: uid missing from session metadata');
      return res.json({ received: true });
    }

    try {
      // 1. Update user document → isPremium = true
      await db.collection('users').doc(uid).set({
        isPremium:            true,
        premiumType:          priceType,
        premiumSince:         new Date().toISOString(),
        stripeCustomerId:     session.customer,
        stripeSubscriptionId: session.subscription,
      }, { merge: true });

      // 2. Store customer ID → UID mapping so we can find the user
      //    when their subscription is cancelled later
      if (session.customer) {
        await db.collection('stripe_customers').doc(session.customer).set({
          uid,
          email: session.customer_email || '',
        });
      }

      console.log(`[HabitShare] ✅ User ${uid} → Premium (${priceType})`);
    } catch (err) {
      console.error('[HabitShare] ❌ Firestore update failed:', err.message);
      return res.status(500).send('Firestore error');
    }
  }

  // ── customer.subscription.deleted ───────────────────────────
  // Fired when a subscription is cancelled or payment repeatedly fails.
  // We remove Premium status from the user.
  else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const customerId   = subscription.customer;

    try {
      // Look up the Firebase UID from our stripe_customers collection
      const customerSnap = await db.collection('stripe_customers').doc(customerId).get();

      if (customerSnap.exists) {
        const { uid } = customerSnap.data();
        await db.collection('users').doc(uid).set({
          isPremium:            false,
          premiumType:          null,
          stripeSubscriptionId: null,
        }, { merge: true });

        console.log(`[HabitShare] ℹ️  User ${uid} → Premium removed (subscription cancelled)`);
      } else {
        console.warn('[HabitShare] ⚠️  Subscription deleted but no matching uid found for customer:', customerId);
      }
    } catch (err) {
      console.error('[HabitShare] ❌ Firestore update failed on cancel:', err.message);
      return res.status(500).send('Firestore error');
    }
  }

  // ── invoice.payment_failed ───────────────────────────────────
  // Fired when a recurring payment fails (card expired, insufficient funds, etc.)
  // Log it — in Phase 3 we can send a push notification here.
  else if (event.type === 'invoice.payment_failed') {
    const invoice    = event.data.object;
    const customerId = invoice.customer;
    console.log(`[HabitShare] ⚠️  Payment failed for customer ${customerId} — invoice ${invoice.id}`);
    // TODO Phase 3: send push notification to user's device via FCM
  }

  // Always return 200 quickly so Stripe doesn't retry
  res.json({ received: true });
});

module.exports = router;
