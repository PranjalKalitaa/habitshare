// ============================================================
//  js/firebase-init.js
//  ─────────────────────────────────────────────────────────
//  HOW TO FILL IN YOUR CONFIG (takes ~5 minutes):
//
//  1. Go to https://console.firebase.google.com
//  2. Open your project → click ⚙️ (top-left) → Project Settings
//  3. Scroll to "Your apps" → click your Web app
//     (If none exists: click </> icon → register app → skip hosting)
//  4. Copy each value from the firebaseConfig object shown there
//     and paste below, replacing the PASTE_YOUR_... placeholders
// ============================================================

const firebaseConfig = {
  apiKey:            "AIzaSyCrmhUBKCFlhw_NVAyZPF_bl6gGy0MVgkw",
  authDomain:        "habit-share-app.firebaseapp.com",
  projectId:         "habit-share-app",
  storageBucket:     "habit-share-app.firebasestorage.app",
  messagingSenderId: "679989905652",
  appId:             "1:679989905652:web:b802efd3e9693e5a32f6a1",
  measurementId:     "G-GTNL7GH3LZ"   // optional — only needed if you use Firebase Analytics
};

// Initialize Firebase (compat SDK loaded via CDN in index.html)
firebase.initializeApp(firebaseConfig);

// Make auth and Firestore globally available to auth.js and app.js
window.fbAuth = firebase.auth();
window.db     = firebase.firestore();

// Enable offline persistence — great for a mobile PWA
// Lets the app work even if the user temporarily loses connection
window.db.enablePersistence({ synchronizeTabs: true })
  .catch(err => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open — offline persistence only works in one tab at a time.
      // This is fine for a mobile app where typically one tab is open.
      console.warn('[HabitShare] Firestore offline persistence disabled: multiple tabs open.');
    } else if (err.code === 'unimplemented') {
      console.warn('[HabitShare] Firestore offline persistence not supported in this browser.');
    }
  });
