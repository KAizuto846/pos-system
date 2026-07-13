#!/usr/bin/env node
/**
 * Script to create Windows icon (.ico) from PNG
 * Uses sharp if available, otherwise provides manual instructions
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'public', 'icons', 'icon-512.png');
const OUTPUT_ICO = path.join(__dirname, '..', 'public', 'icons', 'icon-512.ico');
const OUTPUT_BMP = path.join(__dirname, '..', 'public', 'icons', 'installer-header.bmp');

console.log('Icon generation script');
console.log('=====================\n');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
  console.log('Using sharp for image conversion\n');
} catch (e) {
  console.log('sharp not installed. Using fallback method.\n');
}

async function generateWithSharp() {
  // Generate ICO file
  // ICO format: header + directory entries + image data
  const sizes = [16, 32, 48, 64, 128, 256];
  const images = [];

  for (const size of sizes) {
    const buffer = await sharp(INPUT)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    images.push({ size, buffer });
  }

  // Create ICO file
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Type: ICO
  icoHeader.writeUInt16LE(images.length, 4); // Number of images

  let dataOffset = 6 + (images.length * 16); // Header + directory entries
  const directoryEntries = [];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size < 256 ? img.size : 0, 0); // Width
    entry.writeUInt8(img.size < 256 ? img.size : 0, 1); // Height
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // Image size
    entry.writeUInt32LE(dataOffset, 12); // Image offset
    directoryEntries.push(entry);
    dataOffset += img.buffer.length;
  }

  const ico = Buffer.concat([icoHeader, ...directoryEntries, ...images.map(i => i.buffer)]);
  fs.writeFileSync(OUTPUT_ICO, ico);
  console.log(`Created: ${OUTPUT_ICO}`);

  // Generate BMP header for NSIS installer (150x57 pixels)
  const bmpWidth = 150;
  const bmpHeight = 57;
  const bmpBuffer = await sharp(INPUT)
    .resize(bmpWidth, bmpHeight, { fit: 'contain', background: { r: 30, g: 41, b: 59 }) // #1e293b
    )
    .raw()
    .toBuffer();

  // BMP file format
  const bmpHeaderSize = 54;
  const rowSize = Math.ceil((bmpWidth * 3) / 4) * 4; // Row size must be multiple of 4
  const pixelDataSize = rowSize * bmpHeight;
  const fileSize = bmpHeaderSize + pixelDataSize;

  const bmpFile = Buffer.alloc(fileSize);

  // BMP file header (14 bytes)
  bmpFile.write('BM', 0);
  bmpFile.writeUInt32LE(fileSize, 2);
  bmpFile.writeUInt32LE(0, 6);
  bmpFile.writeUInt32LE(bmpHeaderSize, 10);

  // DIB header (40 bytes)
  bmpFile.writeUInt32LE(40, 14);
  bmpFile.writeInt32LE(bmpWidth, 18);
  bmpFile.writeInt32LE(-bmpHeight, 22); // Negative height = top-down
  bmpFile.writeUInt16LE(1, 26); // Planes
  bmpFile.writeUInt16LE(24, 28); // Bits per pixel
  bmpFile.writeUInt32LE(0, 30); // Compression
  bmpFile.writeUInt32LE(pixelDataSize, 34);

  // Pixel data (BGR format)
  for (let y = 0; y < bmpHeight; y++) {
    for (let x = 0; x < bmpWidth; x++) {
      const srcIdx = (y * bmpWidth + x) * 3;
      const dstIdx = bmpHeaderSize + (y * rowSize) + (x * 3);
      bmpFile[dstIdx] = bmpBuffer[srcIdx + 2]; // B
      bmpFile[dstIdx + 1] = bmpBuffer[srcIdx + 1]; // G
      bmpFile[dstIdx + 2] = bmpBuffer[srcIdx]; // R
    }
  }

  fs.writeFileSync(OUTPUT_BMP, bmpFile);
  console.log(`Created: ${OUTPUT_BMP}`);
}

async function generateFallback() {
  // Create a simple 1x1 ICO file as placeholder
  console.log('Creating placeholder ICO file...');
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(16, 0);
  entry.writeUInt8(16, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(0, 8);
  entry.writeUInt32LE(22, 12);

  // Create a simple 16x16 RGBA image (all green pixels)
  const pixelData = Buffer.alloc(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i++) {
    pixelData[i * 4] = 34;     // R
    pixelData[i * 4 + 1] = 197; // G
    pixelData[i * 4 + 2] = 94;  // B
    pixelData[i * 4 + 3] = 255; // A
  }

  const ico = Buffer.concat([icoHeader, entry, pixelData]);
  fs.writeFileSync(OUTPUT_ICO, ico);
  console.log(`Created placeholder: ${OUTPUT_ICO}`);

  console.log('\nFor production, install sharp and run again:');
  console.log('  npm install sharp');
  console.log('  node scripts/create-icon.js');
}

// Run
(async () => {
  if (fs.existsSync(OUTPUT_ICO) && fs.existsSync(OUTPUT_BMP)) {
    console.log('Icon files already exist. Delete them to regenerate.\n');
    console.log(`  ${OUTPUT_ICO}`);
    console.log(`  ${OUTPUT_BMP}`);
    return;
  }

  if (!fs.existsSync(INPUT)) {
    console.error(`Source icon not found: ${INPUT}`);
    process.exit(1);
  }

  if (sharp) {
    await generateWithSharp();
  } else {
    await generateFallback();
  }

  console.log('\nDone!');
})();
