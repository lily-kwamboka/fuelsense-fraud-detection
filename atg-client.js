/**
 * FuelSense - ATG Client
 * Phase 2, Step 2
 *
 * Connects to an ATG console (or simulator) over TCP,
 * sends Veeder-Root TLS commands, and returns structured responses.
 *
 * Usage (standalone test):
 *   node atg-client.js
 *
 * Usage (as a module):
 *   const { getInventory, getDeliveryReport, getStatusReport } = require('./atg-client');
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// In production these will come from your database (per station/gateway).
// For now they point at the local simulator.
// ---------------------------------------------------------------------------
const ATG_CONFIG = {
    host: '127.0.0.1',
    port: 10001,
    timeoutMs: 5000,       // max ms to wait for a response before giving up
    logRawResponses: true, // set false in production if logs get too large
    rawLogFile: path.join(__dirname, 'atg-raw.log'),
};

// TLS command codes
const COMMANDS = {
    INVENTORY: '\x01i10100FF',
    DELIVERY: '\x01i20100FF',
    STATUS: '\x01i30100FF',
};

// ---------------------------------------------------------------------------
// Raw response logger
// Writes every raw ATG response to atg-raw.log with a timestamp.
// Critical for debugging when you connect real hardware - the real console
// response format may differ from the simulator.
// ---------------------------------------------------------------------------
function logRaw(direction, data) {
    if (!ATG_CONFIG.logRawResponses) return;

    const entry = [
        new Date().toISOString(),
        direction,
        JSON.stringify(data.toString('ascii')),
        '',
    ].join(' | ') + '\n';

    fs.appendFile(ATG_CONFIG.rawLogFile, entry, (err) => {
        if (err) console.error('[atg-client] Failed to write raw log:', err.message);
    });
}

// ---------------------------------------------------------------------------
// Core TCP send/receive
// Opens a connection, sends one command, waits for ETX terminator, closes.
// Each call is a fresh connection - ATG consoles are not persistent session.
// ---------------------------------------------------------------------------
function sendCommand(command) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        let buffer = Buffer.alloc(0);
        let settled = false;

        // Guard: only resolve/reject once
        function finish(err, data) {
            if (settled) return;
            settled = true;
            socket.destroy();
            if (err) reject(err);
            else resolve(data);
        }

        // Timeout guard
        const timer = setTimeout(() => {
            finish(new Error(
                'ATG response timeout after ' + ATG_CONFIG.timeoutMs + 'ms ' +
                '(host: ' + ATG_CONFIG.host + ':' + ATG_CONFIG.port + ')'
            ));
        }, ATG_CONFIG.timeoutMs);

        socket.connect(ATG_CONFIG.port, ATG_CONFIG.host, () => {
            const cmdBuf = Buffer.from(command, 'ascii');
            logRaw('SENT', cmdBuf);
            socket.write(cmdBuf);
        });

        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);

            // TLS responses end with ETX (0x03)
            if (buffer.includes(0x03)) {
                clearTimeout(timer);
                logRaw('RECV', buffer);
                finish(null, buffer.toString('ascii'));
            }
        });

        socket.on('error', (err) => {
            clearTimeout(timer);
            finish(new Error('ATG connection error: ' + err.message));
        });

        socket.on('close', () => {
            clearTimeout(timer);
            // If we close without having seen ETX, treat as error
            if (!settled) {
                finish(new Error('ATG socket closed before ETX received'));
            }
        });
    });
}

// ---------------------------------------------------------------------------
// TLS Response Parser
// Parses the raw ASCII response string into a structured JS object.
//
// Raw inventory line format (from our simulator):
//   TANK01PETROL  001450000228000000720018.51000012
//   ^^^^ field positions are fixed-width - see offsets below
//
// NOTE: When you connect real hardware for the first time, check atg-raw.log
// and compare the actual field positions against these offsets. Adjust if
// needed - different ATG firmware versions vary slightly.
// ---------------------------------------------------------------------------

/**
 * Parse an i101 Inventory Report response.
 * Returns an array of tank reading objects.
 */
function parseInventoryResponse(raw) {
    const readings = [];

    // Strip SOH, ETX, and the header line (&i10100)
    const lines = raw
        .replace(/\x01/g, '')
        .replace(/\x03/g, '')
        .split('\r\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('TANK'));

    for (const line of lines) {
        //  TANK01  PETROL    001450  00022800  00007200   18.51  000012
        //  0    4  6     13  14  19  20    27  28    35   36  41  42  47

        const tankNumber = parseInt(line.slice(4, 6), 10);
        const product = line.slice(6, 14).trim();
        const innageMm = parseFloat(line.slice(14, 20));
        const volumeL = parseFloat(line.slice(20, 28));
        const ullageL = parseFloat(line.slice(28, 36));
        const tempC = parseFloat(line.slice(36, 42));
        const waterMm = parseFloat(line.slice(42, 48));

        // Basic sanity checks - log warnings but don't throw
        if (isNaN(innageMm) || isNaN(tempC)) {
            console.warn('[atg-client] Warning: could not parse line:', JSON.stringify(line));
            continue;
        }

        readings.push({
            tankNumber,
            product,
            innageMm,
            volumeL,      // console's own volume estimate - cross-check only
            ullageL,
            tempC,
            waterMm,
            receivedAt: new Date().toISOString(),
        });
    }

    return readings;
}

/**
 * Parse an i201 Delivery Report response.
 */
function parseDeliveryResponse(raw) {
    const deliveries = [];

    const lines = raw
        .replace(/\x01/g, '')
        .replace(/\x03/g, '')
        .split('\r\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('TANK'));

    for (const line of lines) {
        const tankNumber = parseInt(line.slice(4, 6), 10);
        const startLevel = parseFloat(line.slice(14, 20));
        const endLevel = parseFloat(line.slice(28, 34));
        const volume = parseFloat(line.slice(42, 50));

        deliveries.push({
            tankNumber,
            startLevelMm: startLevel,
            endLevelMm: endLevel,
            volumeL: volume,
            receivedAt: new Date().toISOString(),
        });
    }

    return deliveries;
}

/**
 * Parse an i301 Status / Alarm Report response.
 */
function parseStatusResponse(raw) {
    const statuses = [];

    const lines = raw
        .replace(/\x01/g, '')
        .replace(/\x03/g, '')
        .split('\r\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('TANK'));

    for (const line of lines) {
        const tankNumber = parseInt(line.slice(4, 6), 10);
        const status = line.slice(14).trim();

        statuses.push({
            tankNumber,
            status,
            hasAlarm: status !== 'NORMAL',
            receivedAt: new Date().toISOString(),
        });
    }

    return statuses;
}

// ---------------------------------------------------------------------------
// Public API
// These are the three functions the ingestion scheduler (Step 4) will call.
// ---------------------------------------------------------------------------

/**
 * Fetch live inventory readings from all tanks.
 * Returns an array of tank reading objects.
 */
async function getInventory() {
    const raw = await sendCommand(COMMANDS.INVENTORY);
    return parseInventoryResponse(raw);
}

/**
 * Fetch the delivery report from the ATG console.
 * Returns an array of recent delivery records.
 */
async function getDeliveryReport() {
    const raw = await sendCommand(COMMANDS.DELIVERY);
    return parseDeliveryResponse(raw);
}

/**
 * Fetch the status / alarm report.
 * Returns an array of tank status objects.
 */
async function getStatusReport() {
    const raw = await sendCommand(COMMANDS.STATUS);
    return parseStatusResponse(raw);
}

// ---------------------------------------------------------------------------
// Export for use as a module
// ---------------------------------------------------------------------------
module.exports = { getInventory, getDeliveryReport, getStatusReport, ATG_CONFIG };

// ---------------------------------------------------------------------------
// Standalone test - runs when called directly: node atg-client.js
// ---------------------------------------------------------------------------
if (require.main === module) {
    (async () => {
        console.log('[atg-client] Running standalone test...');
        console.log('[atg-client] Connecting to ' + ATG_CONFIG.host + ':' + ATG_CONFIG.port);
        console.log('');

        try {
            // --- Inventory ---
            console.log('--- INVENTORY REPORT ---');
            const inventory = await getInventory();
            for (const tank of inventory) {
                console.log(
                    'Tank ' + tank.tankNumber + ' (' + tank.product + ')' +
                    '  innage: ' + tank.innageMm + 'mm' +
                    '  temp: ' + tank.tempC + 'C' +
                    '  water: ' + tank.waterMm + 'mm' +
                    '  volume: ' + tank.volumeL + 'L' +
                    '  ullage: ' + tank.ullageL + 'L'
                );
            }
            console.log('');

            // --- Status ---
            console.log('--- STATUS REPORT ---');
            const statuses = await getStatusReport();
            for (const s of statuses) {
                console.log(
                    'Tank ' + s.tankNumber +
                    '  status: ' + s.status +
                    (s.hasAlarm ? '  *** ALARM ***' : '')
                );
            }
            console.log('');

            // --- Delivery ---
            console.log('--- DELIVERY REPORT ---');
            const deliveries = await getDeliveryReport();
            for (const d of deliveries) {
                console.log(
                    'Tank ' + d.tankNumber +
                    '  start: ' + d.startLevelMm + 'mm' +
                    '  end: ' + d.endLevelMm + 'mm' +
                    '  vol: ' + d.volumeL + 'L'
                );
            }
            console.log('');

            console.log('[atg-client] All tests passed.');
            console.log('[atg-client] Raw responses logged to: atg-raw.log');

        } catch (err) {
            console.error('[atg-client] ERROR:', err.message);
            console.error('Make sure atg-simulator.js is running in another terminal.');
            process.exit(1);
        }
    })();
}