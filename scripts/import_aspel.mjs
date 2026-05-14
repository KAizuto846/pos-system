/**
 * Import Aspel CAJA 5.0 data into clean Prisma database.
 * Usage: node scripts/import_aspel.mjs
 */
import { openSync, readFileSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import Papa from 'papaparse';

const prisma = new PrismaClient();
const now = new Date().toISOString();

async function importDepartments() {
  console.log('\n📦 Importing departments from lineas_aspel.csv...');
  const text = readFileSync('lineas_aspel.csv', 'utf8');
  const result = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: '|' });
  
  const codeMap = new Map();
  let created = 0;
  
  for (const row of result.data) {
    const code = String(row.codigo || '').trim();
    const name = String(row.nombre || '').trim();
    if (!name) continue;
    codeMap.set(code, name);
    
    // Check if exists
    const existing = await prisma.department.findFirst({ where: { name } });
    if (!existing) {
      await prisma.department.create({
        data: { name, description: `Linea ${code}`, active: true }
      });
      created++;
    }
  }
  
  console.log(`  ✓ ${created} new departments created (${result.data.length - created} skipped)`);
  return codeMap;
}

async function importSuppliers() {
  console.log('\n🚚 Importing suppliers from departamentos_aspel.csv...');
  const text = readFileSync('departamentos_aspel.csv', 'utf8');
  const result = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: '|' });
  
  const codeMap = new Map();
  let created = 0;
  
  for (const row of result.data) {
    const code = String(row.codigo || '').trim();
    const name = String(row.nombre || '').trim();
    if (!name) continue;
    codeMap.set(code, name);
    
    const existing = await prisma.supplier.findFirst({ where: { name } });
    if (!existing) {
      await prisma.supplier.create({
        data: { name, contact: '', phone: '', email: '', address: '', active: true }
      });
      created++;
    }
  }
  
  console.log(`  ✓ ${created} new suppliers created (${result.data.length - created} skipped)`);
  return codeMap;
}

async function sanitizeBarcode(barcode) {
  if (!barcode || typeof barcode !== 'string') return '';
  let clean = barcode.trim();
  // Remove non-printable characters
  clean = clean.replace(/[^\x20-\x7E]/g, '').trim();
  // If looks like a name (letters/spaces, too long, has accents or ñ), discard
  if (clean.length > 25 || /^[A-Za-zÁÉÍÓÚÑáéíóúñ\s\.]+$/.test(clean)) {
    return '';
  }
  // Must be mostly digits or typical barcode pattern
  if (clean.length > 0 && clean.replace(/\d/g, '').length > clean.length * 0.5) {
    return ''; // More non-digit than digit, likely garbage
  }
  return clean;
}

async function importProducts(deptCodeMap, suppCodeMap) {
  console.log('\n📋 Importing products from productos_aspel.csv...');
  const text = readFileSync('productos_aspel.csv', 'utf8');
  const result = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: '|' });
  
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const BATCH_SIZE = 100;
  
  // Pre-fetch all departments and suppliers by name
  const allDepts = await prisma.department.findMany();
  const allSupps = await prisma.supplier.findMany();
  const deptByName = new Map(allDepts.map(d => [d.name, d.id]));
  const suppByName = new Map(allSupps.map(s => [s.name, s.id]));
  
  // Build code→id maps for departments and suppliers
  const deptByCode = new Map();
  for (const [code, name] of deptCodeMap) {
    const id = deptByName.get(name);
    if (id) deptByCode.set(code, id);
  }
  const suppByCode = new Map();
  for (const [code, name] of suppCodeMap) {
    const id = suppByName.get(name);
    if (id) suppByCode.set(code, id);
  }
  
  console.log(`  Total rows: ${result.data.length}`);
  console.log(`  Department codes mapped: ${deptByCode.size}`);
  console.log(`  Supplier codes mapped: ${suppByCode.size}`);
  
  // Process in batches
  for (let i = 0; i < result.data.length; i += BATCH_SIZE) {
    const batch = result.data.slice(i, i + BATCH_SIZE);
    
    await prisma.$transaction(async (tx) => {
      for (const row of batch) {
        const rowNum = i + 1 + batch.indexOf(row) + 2;
        
        try {
          const name = String(row.nombre || '').trim();
          if (!name) { skipped++; continue; }
          
          const rawBarcode = String(row.codigo_barras || '').trim();
          const barcode = await sanitizeBarcode(rawBarcode);
          
          // Resolve department by code
          const deptCode = String(row.departamento || '').trim();
          const departmentId = deptByCode.get(deptCode) || null;
          
          // Resolve supplier by code (using 'linea' as supplier code)
          const suppCode = String(row.linea || '').trim();
          const supplierId = suppByCode.get(suppCode) || null;
          
          const price = parseFloat(String(row.precio ?? 0)) || 0;
          const cost = parseFloat(String(row.costo ?? 0)) || 0;
          const stock = parseInt(String(row.existencia ?? 0), 10) || 0;
          const minStock = parseInt(String(row.stock_minimo ?? 5), 10) || 5;
          
          // Check if product already exists by barcode
          let existingProduct = null;
          if (barcode) {
            existingProduct = await tx.product.findFirst({ where: { barcode } });
          }
          if (!existingProduct) {
            existingProduct = await tx.product.findFirst({ where: { name } });
          }
          
          if (!existingProduct) {
            await tx.product.create({
              data: { name, barcode, price, cost, stock, minStock, departmentId, supplierId, active: true }
            });
            imported++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors++;
          if (errors <= 5) {
            console.error(`  Error row ${rowNum}: ${err.message?.slice(0, 100)}`);
          }
        }
      }
    });
    
    if ((i / BATCH_SIZE) % 5 === 0) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, result.data.length)}/${result.data.length} rows...`);
    }
  }
  
  console.log(`\n  ✅ Imported: ${imported}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  ❌ Errors: ${errors}`);
}

async function main() {
  console.log('🚀 ASPEL CAJA 5.0 Import Script');
  console.log('================================');
  
  try {
    // Step 1: Import departments from lineas
    const deptCodeMap = await importDepartments();
    
    // Step 2: Import suppliers from departamentos
    const suppCodeMap = await importSuppliers();
    
    // Step 3: Import products
    await importProducts(deptCodeMap, suppCodeMap);
    
    // Summary
    const pc = await prisma.product.count();
    const dc = await prisma.department.count();
    const sc = await prisma.supplier.count();
    console.log('\n🎉 IMPORT COMPLETE!');
    console.log(`  Products: ${pc}`);
    console.log(`  Departments: ${dc}`);
    console.log(`  Suppliers: ${sc}`);
    
  } catch (err) {
    console.error('\n❌ FATAL ERROR:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
