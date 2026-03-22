#!/usr/bin/env node
/**
 * Copy a full API response (revampOiGainersLosersResponseDao) into the dashboard.
 * Usage: node scripts/import-stock-options-oi.mjs /path/to/response.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/import-stock-options-oi.mjs <path-to-api-response.json>');
  console.error('   or: cat response.json | node scripts/import-stock-options-oi.mjs -');
  process.exit(1);
}
const raw = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
const data = JSON.parse(raw);
if (!data?.data?.ceQt || !Array.isArray(data.data.ceQt)) {
  console.error('Expected JSON with data.ceQt array');
  process.exit(1);
}
if (!data?.data?.peQt || !Array.isArray(data.data.peQt)) {
  console.error('Expected JSON with data.peQt array');
  process.exit(1);
}
const dest = path.join(__dirname, '../finance-dashboard/src/data/stockOptionsOiLive.json');
fs.writeFileSync(dest, JSON.stringify(data, null, 2));
console.log('Wrote', dest, `(${data.data.ceQt.length} CE, ${data.data.peQt.length} PE)`);
