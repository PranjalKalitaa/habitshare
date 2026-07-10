// ============================================================
//  server/index.js
//  HabitShare Express server — entry point
//
//  Runs on PORT 4000 (separate from the frontend serve on 3000)
//
//  Routes:
//    GET  /health                → health check
//    POST /checkout/session      → create Stripe Checkout session
//    POST /webhook               → Stripe webhook (payment events)
// ============================================================

require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const checkoutRouter = require('./routes/checkout');
const webhookRouter  = require('./routes/webhook');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── CORS: allow all origins ──────────────────────────────────
// Security is enforced by Firebase Auth tokens (on checkout)
// and Stripe webhook signatures — not by origin headers.
// This allows localtunnel, Firebase Hosting, and any future domains.
app.use(cors({ origin: true, credentials: true }));

// ── IMPORTANT: Webhook route MUST receive the raw body ────────
// Stripe uses the raw bytes to verify the signature.
// This route must be mounted BEFORE express.json() middleware.
app.use(
  '/webhook',
  express.raw({ type: 'application/json' }),
  webhookRouter
);
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────
app.use('/checkout', checkoutRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'HabitShare API', timestamp: new Date().toISOString() });
});

// ── 404 fallback ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[HabitShare] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  🔥 HabitShare API server running');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Health: http://localhost:${PORT}/health`);
  console.log('');
  console.log('  To test Stripe webhooks locally:');
  console.log('  stripe listen --forward-to localhost:' + PORT + '/webhook');
  console.log('');
});
