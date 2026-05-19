'use strict';

const net  = require('net');
const PORT = parseInt(process.env.ATG_SIM_PORT || '10001', 10);

const tanks = [
  {
    number: 1, product: 'PETROL',
    innage_mm: 1450.0, water_mm: 12.0, temp_c: 22.4,
    capacity_mm: 2000, delivering: false,
    delivery_target_mm: 0, delivery_rate_mm: 0,
  },
  {
    number: 2, product: 'DIESEL',
    innage_mm: 980.0, water_mm: 8.0, temp_c: 21.8,
    capacity_mm: 2000, delivering: false,
    delivery_target_mm: 0, delivery_rate_mm: 0,
  },
];

setInterval(() => {
  for (const t of tanks) {
    if (!t.delivering) {
      t.innage_mm = Math.max(50, t.innage_mm - 0.3);
    } else {
      const step = Math.min(t.delivery_rate_mm, t.delivery_target_mm - t.innage_mm);
      t.innage_mm += step;
      if (t.innage_mm >= t.delivery_target_mm) {
        t.innage_mm  = t.delivery_target_mm;
        t.delivering = false;
        console.log(`[SIM] Tank ${t.number} delivery complete. Innage: ${t.innage_mm.toFixed(1)}mm`);
      }
    }
    t.temp_c += (28.0 - t.temp_c) * 0.02;
    t.temp_c += (Math.random() - 0.5) * 0.1;
    t.temp_c  = +t.temp_c.toFixed(2);
  }
}, 30_000);

function buildInventoryResponse () {
  const now  = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const datStr = `${pad2(now.getDate())}${pad2(now.getMonth()+1)}${String(now.getFullYear()).slice(-2)}`;
  const timStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  let body = `&i10100FF\n${datStr} ${timStr}\n`;
  body += 'TANK   PRODUCT    VOLUME    TC VOLUME  ULLAGE    HEIGHT   WATER    TEMP\n';

  for (const t of tanks) {
    const R = 1000, Lm = 2500;
    const d     = t.innage_mm;
    const ratio = Math.max(-1, Math.min(1, (R - d) / R));
    const vol   = (Lm * (R*R*Math.acos(ratio) - (R-d)*Math.sqrt(Math.max(0,2*R*d-d*d))) / 1_000_000).toFixed(1);
    const vcf   = 1 - 0.00065 * (t.temp_c - 15);
    const tcVol = (parseFloat(vol) * vcf).toFixed(1);
    const ullage= (15707.963 - parseFloat(vol)).toFixed(1);

    body += ` ${String(t.number).padStart(3,'0')}   ${t.product.padEnd(10)}${vol.padStart(9)}  ${tcVol.padStart(9)} ${ullage.padStart(9)} ${t.innage_mm.toFixed(1).padStart(8)} ${t.water_mm.toFixed(1).padStart(7)} ${t.temp_c.toFixed(1).padStart(7)}\n`;
  }
  return '\x01' + body + '\x03\r';
}

const server = net.createServer(socket => {
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[SIM] Client connected: ${remote}`);
  let buffer = '';

  socket.on('data', data => {
    buffer += data.toString('binary');
    while (buffer.includes('\x01')) {
      const start = buffer.indexOf('\x01');
      if (buffer.length < start + 2) break;
      const cmd = buffer.slice(start + 1, start + 10).trim();
      buffer    = buffer.slice(start + 10);
      console.log(`[SIM] Command: ${JSON.stringify(cmd)}`);
      const response = cmd.startsWith('i101')
        ? buildInventoryResponse()
        : '\x01&' + cmd + '\nUNKNOWN\n\x03\r';
      socket.write(Buffer.from(response, 'binary'));
    }
  });

  socket.on('end',   () => console.log(`[SIM] Client disconnected: ${remote}`));
  socket.on('error', err => console.error(`[SIM] Error: ${err.message}`));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SIM] ATG Simulator listening on port ${PORT}`);
  console.log(`[SIM] Tank 1 (PETROL) @ ${tanks[0].innage_mm}mm`);
  console.log(`[SIM] Tank 2 (DIESEL) @ ${tanks[1].innage_mm}mm`);
});

const http = require('http');
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/inject-delivery') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { tankNumber, addMm } = JSON.parse(body);
        const tank = tanks.find(t => t.number === tankNumber);
        if (!tank) { res.writeHead(404); res.end(JSON.stringify({ error: 'Tank not found' })); return; }
        if (tank.delivering) { res.writeHead(409); res.end(JSON.stringify({ error: 'Already delivering' })); return; }
        tank.delivery_target_mm = Math.min(tank.innage_mm + addMm, tank.capacity_mm - 10);
        tank.delivery_rate_mm   = addMm / 10;
        tank.delivering         = true;
        console.log(`[SIM] Delivery injected on tank ${tankNumber}: +${addMm}mm`);
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
  } else if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tanks.map(t => ({
      number: t.number, product: t.product,
      innage_mm: +t.innage_mm.toFixed(1), water_mm: t.water_mm,
      temp_c: t.temp_c, delivering: t.delivering,
    }))));
  } else { res.writeHead(404); res.end('Not found'); }
}).listen(10002, () => console.log('[SIM] Injection API on port 10002'));