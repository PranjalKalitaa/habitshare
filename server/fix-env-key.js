// final-fix.js — removes the trailing comma from FIREBASE_PRIVATE_KEY line
const fs = require('fs');
const envPath = 'f:/2026/habitshare/server/.env';
let content = fs.readFileSync(envPath, 'utf8');

// The line ends with: -----END PRIVATE KEY-----\n",
// It should end with: -----END PRIVATE KEY-----\n"
// Remove the trailing comma after the last quote on the PRIVATE_KEY line
content = content.replace(/-----END PRIVATE KEY-----\\n",(\s)/, '-----END PRIVATE KEY-----\\n"$1');

fs.writeFileSync(envPath, content);
console.log('Saved. Verifying...');

// Test
delete require.cache[require.resolve('dotenv')];
require('dotenv').config({ path: envPath });
const pk = process.env.FIREBASE_PRIVATE_KEY;
console.log('First char code:', pk?.charCodeAt(0), '(45=dash, 34=quote)');
console.log('Starts with -----BEGIN:', pk?.startsWith('-----BEGIN'));
console.log('Length:', pk?.length);
