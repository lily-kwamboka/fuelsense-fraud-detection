'use strict';

function parseTLSInventory (raw) {
  const parsedAt = new Date();
  const readings = [];

  const cleaned = raw.replace(/[\x01\x03\r]/g, '').trim();
  const lines   = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  const headerIdx = lines.findIndex(l =>
    l.toUpperCase().includes('TANK') && l.toUpperCase().includes('PRODUCT')
  );

  if (headerIdx === -1) {
    console.warn('[PARSER] Could not find header line. Raw:\n', raw);
    return { readings, raw, parsedAt };
  }

  const dataLines = lines.slice(headerIdx + 1);

  for (const line of dataLines) {
    if (!line || line.startsWith('&') || line.startsWith('NO ')) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;

    const tankNumber = parseInt(parts[0].replace(/\D/g, ''), 10);
    if (isNaN(tankNumber) || tankNumber < 1) continue;

    const product = parts[1].toUpperCase();
    const nums    = [];
    for (let i = 2; i < parts.length; i++) {
      const n = parseFloat(parts[i]);
      if (!isNaN(n)) nums.push(n);
    }

    if (nums.length < 5) continue;

    const innage_mm     = nums[3];
    const water_mm      = nums[4] !== undefined ? nums[4] : 0;
    const temperature_c = nums[5] !== undefined ? nums[5] : null;

    if (temperature_c === null) continue;
    if (innage_mm < 0 || innage_mm > 5000) continue;
    if (temperature_c < -10 || temperature_c > 80) continue;

    readings.push({
      tankNumber,
      product,
      innage_mm:    Math.max(0, innage_mm),
      water_mm:     Math.max(0, Math.min(water_mm, innage_mm)),
      temperature_c,
    });
  }

  return { readings, raw, parsedAt };
}

function _selfTest () {
  const sample = [
    '\x01',
    '&i10100FF',
    '150526 14:32',
    'TANK   PRODUCT    VOLUME    TC VOLUME  ULLAGE    HEIGHT   WATER    TEMP',
    ' 001   PETROL      7853.9    7803.1    7854.0  1450.0   12.0  22.4',
    ' 002   DIESEL      5298.1    5270.4   10409.9   980.0    8.0  21.8',
    '\x03\r',
  ].join('\n');

  const result = parseTLSInventory(sample);
  console.log('[PARSER TEST] Readings extracted:', result.readings.length);
  for (const r of result.readings) {
    console.log(`  Tank ${r.tankNumber} (${r.product}): innage=${r.innage_mm}mm  water=${r.water_mm}mm  temp=${r.temperature_c}°C`);
  }
  if (result.readings.length === 2) {
    console.log('[PARSER TEST] PASS ✅');
  } else {
    console.log('[PARSER TEST] FAIL ❌');
  }
}

module.exports = { parseTLSInventory };

if (require.main === module) _selfTest();