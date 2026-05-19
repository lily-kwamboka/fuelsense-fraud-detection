/**
 * FuelSense - ATG Simulator
 * Phase 2, Step 1
 *
 * Simulates a Veeder-Root TLS ATG console over TCP.
 * Listens on port 10001. Responds to TLS inventory commands
 * with realistic, slightly-varying readings for 2 tanks.
 *
 * Usage:
 *   node atg-simulator.js
 */

const net = require('net');

const PORT = 10001;

// ---------------------------------------------------------------------------
// Tank state
// Tweak these to simulate different conditions (low stock, delivery, water)
// ---------------------------------------------------------------------------
const tanks = [
    {
        number: 1,
        product: 'PETROL',
        referenceHeight: 2000,
        innage: 1450,
        waterLevel: 12,
        temperature: 18.5,
        capacity: 30000,
        volume: 22800,
    },
    {
        number: 2,
        product: 'DIESEL',
        referenceHeight: 2000,
        innage: 980,
        waterLevel: 8,
        temperature: 19.2,
        capacity: 30000,
        volume: 14200,
    },
];

// ---------------------------------------------------------------------------
// Delivery simulation
// Call simulateDelivery(tankNumber, litresAdded) to trigger a level rise
// ---------------------------------------------------------------------------
function simulateDelivery(tankNumber, litresAdded = 8000) {
    const tank = tanks.find(t => t.number === tankNumber);
    if (!tank) return;
    const mmPerLitre = tank.referenceHeight / tank.capacity;
    tank.innage = Math.min(
        tank.referenceHeight,
        tank.innage + Math.round(litresAdded * mmPerLitre)
    );
    tank.volume = Math.round(tank.volume + litresAdded);
    console.log('[simulator] Delivery applied to tank ' + tankNumber + ': innage now ' + tank.innage + 'mm');
}

process.simulateDelivery = simulateDelivery;

// ---------------------------------------------------------------------------
// Add small random jitter so readings look live
// ---------------------------------------------------------------------------
function jitter(value, maxDelta) {
    return +(value + (Math.random() - 0.5) * 2 * maxDelta).toFixed(2);
}

// ---------------------------------------------------------------------------
// TLS response builders
// ---------------------------------------------------------------------------
function buildInventoryResponse() {
    const lines = [];

    for (const t of tanks) {
        const innage = jitter(t.innage, 0.5);
        const waterLevel = jitter(t.waterLevel, 0.1);
        const temp = jitter(t.temperature, 0.05);
        const ullage = t.capacity - t.volume;

        lines.push(
            'TANK' + String(t.number).padStart(2, '0') +
            t.product.padEnd(8) +
            String(Math.round(innage)).padStart(6, '0') +
            String(t.volume).padStart(8, '0') +
            String(Math.max(0, ullage)).padStart(8, '0') +
            temp.toFixed(2).padStart(6) +
            String(Math.round(waterLevel)).padStart(6, '0')
        );
    }

    const body = '&i10100\r\n' + lines.join('\r\n') + '\r\n';
    return Buffer.from('\x01' + body + '\x03');
}

function buildDeliveryResponse() {
    const lines = [];

    for (const t of tanks) {
        lines.push(
            'TANK' + String(t.number).padStart(2, '0') +
            'STARTLVL' + String(Math.max(0, t.innage - 500)).padStart(6, '0') +
            'ENDLVL  ' + String(t.innage).padStart(6, '0') +
            'VOLUME  ' + String(Math.round(t.volume * 0.3)).padStart(8, '0')
        );
    }

    const body = '&i20100\r\n' + lines.join('\r\n') + '\r\n';
    return Buffer.from('\x01' + body + '\x03');
}

function buildStatusResponse() {
    const lines = [];

    for (const t of tanks) {
        const waterAlarm = t.waterLevel > 50 ? 'HIGH_WATER' : 'NORMAL    ';
        lines.push(
            'TANK' + String(t.number).padStart(2, '0') +
            'STATUS  ' + waterAlarm
        );
    }

    const body = '&i30100\r\n' + lines.join('\r\n') + '\r\n';
    return Buffer.from('\x01' + body + '\x03');
}

function handleCommand(data) {
    const raw = data.toString('ascii').trim();

    if (!raw.startsWith('\x01')) {
        console.warn('[simulator] Received non-TLS data:', JSON.stringify(raw));
        return Buffer.from('\x01ERR INVALID COMMAND\x03');
    }

    const code = raw.slice(1, 4);

    switch (code) {
        case 'i10':
            console.log('[simulator] -> Inventory command received');
            return buildInventoryResponse();

        case 'i20':
            console.log('[simulator] -> Delivery report command received');
            return buildDeliveryResponse();

        case 'i30':
            console.log('[simulator] -> Status report command received');
            return buildStatusResponse();

        default:
            console.warn('[simulator] Unknown function code:', code);
            return Buffer.from('\x01ERR UNKNOWN FUNCTION ' + code + '\x03');
    }
}

// ---------------------------------------------------------------------------
// TCP Server
// ---------------------------------------------------------------------------
const server = net.createServer((socket) => {
    const clientAddr = socket.remoteAddress + ':' + socket.remotePort;
    console.log('[simulator] Client connected: ' + clientAddr);

    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        clearTimeout(socket._flushTimer);
        socket._flushTimer = setTimeout(() => {
            if (buffer.length === 0) return;

            console.log('[simulator] Raw received:', JSON.stringify(buffer.toString('ascii')));

            const response = handleCommand(buffer);
            socket.write(response);

            console.log('[simulator] Raw sent:', JSON.stringify(response.toString('ascii')));
            buffer = Buffer.alloc(0);
        }, 50);
    });

    socket.on('end', () => {
        console.log('[simulator] Client disconnected: ' + clientAddr);
    });

    socket.on('error', (err) => {
        console.error('[simulator] Socket error (' + clientAddr + '):', err.message);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('================================================');
    console.log('  FuelSense ATG Simulator  v1.0');
    console.log('  Listening on TCP port ' + PORT);
    console.log('------------------------------------------------');
    console.log('  Tank 1 - PETROL   1450mm  18.5C  12mm water');
    console.log('  Tank 2 - DIESEL    980mm  19.2C   8mm water');
    console.log('------------------------------------------------');
    console.log('  Commands:');
    console.log('    \\x01i10100FF  ->  Inventory report');
    console.log('    \\x01i20100FF  ->  Delivery report');
    console.log('    \\x01i30100FF  ->  Status report');
    console.log('================================================');
    console.log('');
});

server.on('error', (err) => {
    console.error('[simulator] Server error:', err.message);
    process.exit(1);
});