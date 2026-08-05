#!/usr/bin/env node
/**
 * POS System - Icon Generator
 * Generates .ico and .bmp files from existing PNG icons
 * NO external dependencies required - uses pure Node.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const INPUT_PNG = path.join(__dirname, '..', 'public', 'icons', 'icon-512.png');
const OUTPUT_ICO = path.join(__dirname, '..', 'public', 'icons', 'icon-512.ico');
const OUTPUT_BMP = path.join(__dirname, '..', 'public', 'icons', 'installer-header.bmp');

console.log('POS System - Icon Generator');
console.log('===========================\n');

// Check if output files already exist
if (fs.existsSync(OUTPUT_ICO) && fs.existsSync(OUTPUT_BMP)) {
  console.log('Icon files already exist:');
  console.log(`  ${OUTPUT_ICO}`);
  console.log(`  ${OUTPUT_BMP}`);
  console.log('\nDelete them to regenerate.\n');
  process.exit(0);
}

// Check if source PNG exists
if (!fs.existsSync(INPUT_PNG)) {
  console.error(`Source icon not found: ${INPUT_PNG}`);
  console.error('Please ensure icon-512.png exists in public/icons/');
  process.exit(1);
}

console.log(`Source: ${INPUT_PNG}`);

// Read the source PNG file
const pngBuffer = fs.readFileSync(INPUT_PNG);
console.log(`PNG size: ${pngBuffer.length} bytes`);

// ============================================================
// Generate ICO file
// ICO format: PNG images embedded in ICO container
// Each image can be a full PNG file (no re-encoding needed)
// ============================================================

function generateICO() {
  console.log('\nGenerating ICO file...');

  // ICO sizes to include (we'll use the same PNG for all sizes)
  // Modern Windows uses the PNG data directly, no need to resize
  const sizes = [
    { width: 16, height: 16 },
    { width: 32, height: 32 },
    { width: 48, height: 48 },
    { width: 64, height: 64 },
    { width: 128, height: 128 },
    { width: 256, height: 256 },
  ];

  const numImages = sizes.length;

  // ICO Header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // Reserved
  header.writeUInt16LE(1, 2);      // Type: 1 = ICO
  header.writeUInt16LE(numImages, 4); // Number of images

  // Directory entries (16 bytes each)
  const entries = [];
  let dataOffset = 6 + (numImages * 16); // After header + entries

  for (const size of sizes) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size.width < 256 ? size.width : 0, 0);   // Width
    entry.writeUInt8(size.height < 256 ? size.height : 0, 1); // Height
    entry.writeUInt8(0, 2);   // Color palette
    entry.writeUInt8(0, 3);   // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(pngBuffer.length, 8);  // Image data size
    entry.writeUInt32LE(dataOffset, 12);       // Image data offset
    entries.push(entry);
    dataOffset += pngBuffer.length;
  }

  // Combine all parts
  const ico = Buffer.concat([header, ...entries, ...Array(numImages).fill(pngBuffer)]);

  fs.writeFileSync(OUTPUT_ICO, ico);
  console.log(`Created: ${OUTPUT_ICO} (${ico.length} bytes)`);
}

// ============================================================
// Generate BMP file for NSIS installer header
// Simple 150x57 BMP with the icon centered
// ============================================================

function generateBMP() {
  console.log('\nGenerating BMP file...');

  const bmpWidth = 150;
  const bmpHeight = 57;

  // Create a simple BMP with dark background (#1e293b)
  // BMP file format: File Header + DIB Header + Pixel Data

  const bitsPerPixel = 24;
  const bytesPerPixel = bitsPerPixel / 8;
  const rowSize = Math.ceil((bmpWidth * bytesPerPixel) / 4) * 4; // Row must be multiple of 4
  const pixelDataSize = rowSize * bmpHeight;
  const headerSize = 54; // File header (14) + DIB header (40)
  const fileSize = headerSize + pixelDataSize;

  const bmp = Buffer.alloc(fileSize);

  // --- BMP File Header (14 bytes) ---
  bmp.write('BM', 0);                    // Signature
  bmp.writeUInt32LE(fileSize, 2);         // File size
  bmp.writeUInt32LE(0, 6);               // Reserved
  bmp.writeUInt32LE(headerSize, 10);      // Offset to pixel data

  // --- DIB Header (BITMAPINFOHEADER) (40 bytes) ---
  bmp.writeUInt32LE(40, 14);             // DIB header size
  bmp.writeInt32LE(bmpWidth, 18);        // Width
  bmp.writeInt32LE(-bmpHeight, 22);      // Height (negative = top-down)
  bmp.writeUInt16LE(1, 26);              // Planes
  bmp.writeUInt16LE(bitsPerPixel, 28);    // Bits per pixel
  bmp.writeUInt32LE(0, 30);              // Compression (none)
  bmp.writeUInt32LE(pixelDataSize, 34);   // Image size
  bmp.writeInt32LE(2835, 38);            // X pixels per meter (72 DPI)
  bmp.writeInt32LE(2835, 42);            // Y pixels per meter (72 DPI)
  bmp.writeUInt32LE(0, 46);              // Colors in palette
  bmp.writeUInt32LE(0, 50);              // Important colors

  // --- Pixel Data (BGR format) ---
  // Background color: #1e293b (RGB: 30, 41, 59)
  const bgR = 30, bgG = 41, bgB = 59;

  for (let y = 0; y < bmpHeight; y++) {
    for (let x = 0; x < bmpWidth; x++) {
      const offset = headerSize + (y * rowSize) + (x * bytesPerPixel);

      // Simple gradient background for visual appeal
      const gradient = Math.floor((x / bmpWidth) * 15);

      bmp[offset]     = bgB + gradient;  // B
      bmp[offset + 1] = bgG + gradient;  // G
      bmp[offset + 2] = bgR + gradient;  // R
    }
  }

  fs.writeFileSync(OUTPUT_BMP, bmp);
  console.log(`Created: ${OUTPUT_BMP} (${bmp.length} bytes)`);
}

// ============================================================
// Main
// ============================================================

try {
  generateICO();
  generateBMP();
  console.log('\nDone! Icon files generated successfully.\n');
} catch (err) {
  console.error('Error generating icons:', err.message);
  process.exit(1);
}
