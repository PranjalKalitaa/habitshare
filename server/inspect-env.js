const fs = require('fs');
const content = fs.readFileSync('f:/2026/habitshare/server/.env', 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);
lines.forEach((l, i) => {
  if (l.includes('PRIVATE_KEY') || l.includes('BEGIN') || l.includes('END') || l.includes('MIIE')) {
    console.log(i, JSON.stringify(l.slice(0, 80)));
  }
});
