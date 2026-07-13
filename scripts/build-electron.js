#!/usr/bin/env node
/**
 * POS System - Electron Build Script
 * Builds the Next.js standalone output and packages with electron-builder
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const platform = args.includes('--win') ? 'win' : args.includes('--linux') ? 'linux' : args.includes('--all') ? 'all' : 'win';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  POS System - Electron Build Script                         ║');
console.log('║  Platform:', platform.padEnd(48), '║');
console.log('╚══════════════════════════════════════════════════════════════╝');

function run(cmd, args, options = {}) {
  console.log(`\n▶ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { 
    ...options, 
    stdio: 'inherit', 
    shell: true,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    console.error(`\n✖ Error: ${cmd} exited with code ${result.status}`);
    process.exit(result.status || 1);
  }
  console.log(`✓ ${cmd} completed`);
  return result;
}

// Step 0: Generate icon files if needed
console.log('\n📦 Paso 0: Generating icon files...');
const icoPath = path.join(__dirname, '..', 'public', 'icons', 'icon-512.ico');
if (!fs.existsSync(icoPath)) {
  run('node', ['scripts/create-icon.js']);
} else {
  console.log('✓ Icon files already exist, skipping generation');
}

// Step 1: Build Next.js standalone
console.log('\n📦 Paso 1: Building Next.js standalone...');
run('npm', ['run', 'build']);

// Step 2: Copy prisma and .env to standalone
console.log('\n📦 Paso 2: Copying resources to standalone...');
const standaloneDir = path.join(__dirname, '..', '.next', 'standalone');
const prismaSrc = path.join(__dirname, '..', 'prisma');
const prismaDest = path.join(standaloneDir, 'prisma');
const envSrc = path.join(__dirname, '..', '.env');
const envDest = path.join(standaloneDir, '.env');

if (fs.existsSync(prismaSrc)) {
  if (fs.existsSync(prismaDest)) fs.rmSync(prismaDest, { recursive: true, force: true });
  fs.cpSync(prismaSrc, prismaDest, { recursive: true });
  console.log('✓ Prisma schema copied');
}

if (fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, envDest);
  console.log('✓ .env copied');
}

// Copy .next/static into standalone (required for CSS/JS/assets)
const staticSrc = path.join(__dirname, '..', '.next', 'static');
const staticDest = path.join(standaloneDir, '.next', 'static');
if (fs.existsSync(staticSrc)) {
  if (fs.existsSync(staticDest)) fs.rmSync(staticDest, { recursive: true, force: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true });
  console.log('✓ .next/static copied');
}

// Copy public into standalone (required for images/icons)
const publicSrc = path.join(__dirname, '..', 'public');
const publicDest = path.join(standaloneDir, 'public');
if (fs.existsSync(publicSrc)) {
  if (fs.existsSync(publicDest)) fs.rmSync(publicDest, { recursive: true, force: true });
  fs.cpSync(publicSrc, publicDest, { recursive: true });
  console.log('✓ public/ copied');
}

// Step 3: Build with electron-builder
console.log('\n📦 Paso 3: Building with electron-builder...');

const builderArgs = ['electron-builder'];
if (platform === 'win' || platform === 'all') {
  builderArgs.push('--win', '--x64');
}
if (platform === 'linux' || platform === 'all') {
  builderArgs.push('--linux');
}
if (platform === 'all') {
  // Build for both platforms
}

run('npx', builderArgs);

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  ✅ Build completed successfully!                           ║');
console.log('║  Output: dist-electron/                                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
