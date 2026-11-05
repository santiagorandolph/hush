const sharp = require('sharp');
const fs = require('node:fs');
fs.mkdirSync('build', { recursive: true });
sharp('favicon.svg', { density: 2304 }).resize(1024, 1024).png().toFile('build/icon.png');
