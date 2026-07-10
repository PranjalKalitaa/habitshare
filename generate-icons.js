// generate-icons.js — creates icon-192.png and icon-512.png from SVG using node-canvas
// Run once: node generate-icons.js

const fs   = require('fs');
const path = require('path');

// We'll use the Canvas API via the 'canvas' package if available,
// or fall back to writing pure SVG files that browsers handle fine.

const svgContent = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#15132B"/>
  <!-- Flame shape -->
  <g transform="translate(${size/2}, ${size/2})">
    <path
      d="M0 ${-size*0.3} C${size*0.05} ${-size*0.15} ${-size*0.15} ${-size*0.08} ${-size*0.12} ${size*0.04} C${-size*0.12} ${size*0.12} ${-size*0.2} ${size*0.16} ${-size*0.12} ${size*0.22} A${size*0.17} ${size*0.17} 0 0 0 ${size*0.12} ${size*0.22} C${size*0.2} ${size*0.16} ${size*0.12} ${size*0.12} ${size*0.12} ${size*0.04} C${size*0.15} ${-size*0.08} ${-size*0.05} ${-size*0.15} 0 ${-size*0.3}Z"
      fill="#FBBF24"
    />
    <!-- Inner flame -->
    <path
      d="M0 ${-size*0.12} C${size*0.02} ${-size*0.04} ${-size*0.06} 0 ${-size*0.04} ${size*0.08} C${-size*0.04} ${size*0.14} ${size*0.04} ${size*0.16} ${size*0.04} ${size*0.08} C${size*0.06} 0 ${-size*0.02} ${-size*0.04} 0 ${-size*0.12}Z"
      fill="#FDE68A" opacity="0.8"
    />
  </g>
</svg>`;

// Write SVG files that can be used as icons
const sizes = [192, 512];
sizes.forEach(size => {
  const svgPath = path.join(__dirname, 'icons', `icon-${size}.svg`);
  fs.writeFileSync(svgPath, svgContent(size));
  console.log(`Created: icons/icon-${size}.svg`);
});

// Also create a simple PNG using built-in approach
// Since we can't install canvas easily, let's use SVG as PNG with data URL approach
console.log('\nNote: SVG icons created. For proper PNG icons, convert using:');
console.log('  npx svg2png icons/icon-192.svg -o icons/icon-192.png -w 192 -h 192');
console.log('  npx svg2png icons/icon-512.svg -o icons/icon-512.png -w 512 -h 512');
console.log('\nOr the browser will use the SVG manifest icons directly.');
