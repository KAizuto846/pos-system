import { readFileSync } from 'fs';
import Papa from 'papaparse';

const csvPath = process.argv[2] || process.argv[1].replace('scripts/diagnose_csv.mjs', 'productos_aspel.csv');
const text = readFileSync(csvPath, 'utf8');

// Try auto-detect
const autoResult = Papa.parse(text, { header: true, skipEmptyLines: true });
console.log('=== AUTO-DETECT DELIMITER ===');
console.log('Delimiter (auto):', JSON.stringify(autoResult.meta.delimiter));
console.log('Columns:', autoResult.meta.fields);
console.log('Rows:', autoResult.data.length);
console.log('Errors:', autoResult.errors.length);

// Now try explicit pipe
const pipeResult = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: '|' });
console.log('\n=== PIPE DELIMITER ===');
console.log('Columns:', pipeResult.meta.fields);
console.log('Rows:', pipeResult.data.length);
console.log('Errors:', pipeResult.errors.length);

// Check the first 10 rows
console.log('\n=== FIRST 10 ROWS (pipe) ===');
for (let i = 0; i < Math.min(10, pipeResult.data.length); i++) {
  console.log(`Row ${i+2}:`, JSON.stringify(pipeResult.data[i]).slice(0, 200));
}

// Check for invalid characters in each field
console.log('\n=== INVALID CHARACTER CHECK ===');
let invalidCount = 0;
for (let i = 0; i < pipeResult.data.length; i++) {
  const row = pipeResult.data[i];
  for (const [key, val] of Object.entries(row)) {
    if (typeof val === 'string') {
      // Check for invalid UTF-8 sequences or control chars
      for (let j = 0; j < val.length; j++) {
        const code = val.charCodeAt(j);
        // Check for problematic chars: 0x00-0x08, 0x0B-0x0C, 0x0E-0x1F (control chars except tab, newline)
        if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) {
          console.log(`Row ${i+2}, Col ${key}: char 0x${code.toString(16)} at pos ${j} in ${JSON.stringify(val.slice(0, 50))}`);
          invalidCount++;
        }
        // Characters in the surrogate range (0xD800-0xDFFF) that are unpaired
        if (code >= 0xD800 && code <= 0xDBFF) {
          const next = val.charCodeAt(j + 1);
          if (next < 0xDC00 || next > 0xDFFF) {
            console.log(`Row ${i+2}, Col ${key}: unpaired high surrogate 0x${code.toString(16)} at pos ${j}`);
            invalidCount++;
          }
        }
      }
    }
  }
}

if (invalidCount === 0) {
  console.log('No invalid characters found - all clean!');
}

// Check department codes
console.log('\n=== DEPARTMENT CODES ===');
const deptCodes = new Set();
for (const row of pipeResult.data) {
  const dept = row['departamento'];
  if (dept !== undefined && dept !== '') {
    deptCodes.add(String(dept).trim());
  }
}
console.log('Unique department codes:', [...deptCodes].sort().join(', '));

// Check barcode anomalies
console.log('\n=== BARCODE ANOMALIES ===');
let barcodeIssues = 0;
for (let i = 0; i < pipeResult.data.length; i++) {
  const row = pipeResult.data[i];
  const barcode = String(row['codigo_barras'] || '').trim();
  const name = String(row['nombre'] || '').trim();
  // Check if barcode looks like a name
  if (barcode && barcode.length > 15 && /[A-Za-z]/.test(barcode) && !/^\d+$/.test(barcode)) {
    console.log(`  Row ${i+2}: barcode="${barcode}" maybe-name="${name}"`);
    barcodeIssues++;
  }
}
console.log(`Total barcode anomalies: ${barcodeIssues}`);
