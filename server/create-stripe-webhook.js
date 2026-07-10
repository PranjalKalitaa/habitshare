// create-stripe-webhook.js
// Creates a Stripe webhook endpoint pointing to the Render backend
require('dotenv').config({ path: 'f:/2026/habitshare/server/.env' });
const https = require('https');
const querystring = require('querystring');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const RENDER_WEBHOOK_URL = 'https://habitshare-backend.onrender.com/webhook';

const events = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
];

const postData = querystring.stringify({
  url: RENDER_WEBHOOK_URL,
  ...Object.fromEntries(events.map((e, i) => [`enabled_events[${i}]`, e])),
  description: 'HabitShare Render production webhook',
});

const options = {
  hostname: 'api.stripe.com',
  path: '/v1/webhook_endpoints',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${STRIPE_SECRET}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
  },
};

console.log('Creating Stripe webhook for:', RENDER_WEBHOOK_URL);

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const parsed = JSON.parse(data);
    if (parsed.secret) {
      console.log('\n✅ Webhook created successfully!');
      console.log('Webhook ID:     ', parsed.id);
      console.log('Webhook URL:    ', parsed.url);
      console.log('\n🔑 SIGNING SECRET (copy this into Render env vars):');
      console.log('STRIPE_WEBHOOK_SECRET=' + parsed.secret);
    } else if (parsed.error) {
      console.error('\n❌ Error:', parsed.error.message);
      if (parsed.error.message.includes('already')) {
        console.log('A webhook for this URL already exists. Go to Stripe Dashboard → Developers → Webhooks to find its signing secret.');
      }
    } else {
      console.log('\nResponse:', JSON.stringify(parsed, null, 2));
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.write(postData);
req.end();
