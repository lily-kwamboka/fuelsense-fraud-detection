'use strict';

const net = require('net');
const { parseTLSInventory } = require('./tls-parser');

const ATG_HOST       = process.env.ATG_HOST       || '127.0.0.1';
const ATG_PORT       = parseInt(process.env.ATG_PORT || '10001', 10);
const ATG_TIMEOUT_MS = parseInt(process.env.ATG_TIMEOUT_MS || '5000', 10);

const CMD_INVENTORY = Buffer.from('\x01i10100FF', 'binary');
const ETX           = 0x03;

function fetchInventory () {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const chunks = [];
    let timer    = null;
    let settled  = false;

    function settle (fn, val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn(val);
    }

    timer = setTimeout(() => {
      settle(reject, new Error(`ATG timeout after ${ATG_TIMEOUT_MS}ms`));
    }, ATG_TIMEOUT_MS);

    socket.on('error', err => {
      settle(reject, new Error(`ATG connection error: ${err.message}`));
    });

    socket.connect(ATG_PORT, ATG_HOST, () => {
      socket.write(CMD_INVENTORY);
    });

    socket.on('data', chunk => {
      chunks.push(chunk);
      const combined = Buffer.concat(chunks);
      if (combined.includes(ETX)) {
        const raw    = combined.toString('binary');
        const result = parseTLSInventory(raw);
        settle(resolve, result);
      }
    });

    socket.on('end', () => {
      if (!settled) {
        const raw    = Buffer.concat(chunks).toString('binary');
        const result = parseTLSInventory(raw);
        if (result.readings.length > 0) {
          settle(resolve, result);
        } else {
          settle(reject, new Error('Connection closed before complete response'));
        }
      }
    });
  });
}

function ping () {
  return new Promise(resolve => {
    const socket = new net.Socket();
    const timer  = setTimeout(() => { socket.destroy(); resolve(false); }, 3000);
    socket.on('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.on('error',   () => { clearTimeout(timer); resolve(false); });
    socket.connect(ATG_PORT, ATG_HOST);
  });
}

async function _integrationTest () {
  console.log(`[CLIENT TEST] Connecting to ATG at ${ATG_HOST}:${ATG_PORT} ...`);

  const reachable = await ping();
  if (!reachable) {
    console.error('[CLIENT TEST] FAIL ❌ — ATG not reachable. Is the simulator running?');
    process.exit(1);
  }
  console.log('[CLIENT TEST] Ping OK ✅');

  const result = await fetchInventory();
  console.log(`[CLIENT TEST] Readings received: ${result.readings.length}`);

  for (const r of result.readings) {
    console.log(`  Tank ${r.tankNumber} (${r.product})`);
    console.log(`    Innage:      ${r.innage_mm}mm`);
    console.log(`    Water:       ${r.water_mm}mm`);
    console.log(`    Temperature: ${r.temperature_c}°C`);
  }
  console.log('[CLIENT TEST] PASS ✅');
}

module.exports = { fetchInventory, ping };

if (require.main === module) {
  _integrationTest().catch(err => {
    console.error('[CLIENT TEST] ERROR:', err.message);
    process.exit(1);
  });
}