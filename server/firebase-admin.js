// ============================================================
//  server/firebase-admin.js
//  Firebase Admin SDK — used by the server to read/write
//  Firestore after Stripe payment events (webhooks).
//
//  Credentials come from the .env file.
//  Get them: Firebase Console → ⚙️ Project Settings →
//            Service accounts → Generate new private key
// ============================================================

const admin = require('firebase-admin');

if (!admin.apps.length) {
  // The private key in .env has literal \n strings — convert them to real newlines
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    console.error(
      '[HabitShare] ❌ Firebase Admin credentials missing in .env\n' +
      '   Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY'
    );
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });

  console.log('[HabitShare] ✅ Firebase Admin initialised →', process.env.FIREBASE_PROJECT_ID);
}

module.exports = admin;
