require('dotenv').config({ path: 'f:/2026/habitshare/server/.env' });
const pk = process.env.FIREBASE_PRIVATE_KEY;
console.log('Raw length:', pk?.length);
console.log('Has literal \\n:', pk?.includes('\\n'));
console.log('Has real newline:', pk?.includes('\n'));
console.log('First 80 chars:', JSON.stringify(pk?.slice(0, 80)));

// Test the replacement
const fixed = pk?.replace(/\\n/g, '\n');
console.log('\nAfter replace:');
console.log('Has real newline:', fixed?.includes('\n'));
console.log('First 80 chars:', JSON.stringify(fixed?.slice(0, 80)));

// Test creating admin credentials
const admin = require('firebase-admin');
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  fixed,
      }),
    });
    console.log('\n✅ Firebase Admin initialized successfully!');
    // Test a Firestore query
    admin.firestore().collection('test').limit(1).get()
      .then(() => console.log('✅ Firestore connection works!'))
      .catch(e => console.log('❌ Firestore error:', e.message));
  } catch(e) {
    console.log('❌ Init error:', e.message);
  }
}
