// server.js - Web server wrapper for your simulator
const { exec } = require('child_process');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

console.log('[CLOUD] Starting FuelSense Simulator Service...');
console.log('[CLOUD] Node version:', process.version);
console.log('[CLOUD] Environment:', process.env.NODE_ENV || 'development');

// Run your existing simulator - FIXED PATH
const simulator = exec('node backend/src/simulator.js');

simulator.stdout.on('data', (data) => {
  console.log(`[SIMULATOR] ${data.trim()}`);
});

simulator.stderr.on('data', (data) => {
  console.error(`[SIMULATOR ERROR] ${data.trim()}`);
});

simulator.on('close', (code) => {
  console.log(`[SIMULATOR] Process exited with code ${code}`);
  if (code !== 0) {
    console.log('[CLOUD] Restarting simulator in 5 seconds...');
    setTimeout(() => {
      const restart = exec('node backend/src/simulator.js');
      restart.stdout.pipe(process.stdout);
      restart.stderr.pipe(process.stderr);
    }, 5000);
  }
});

// Health check endpoint for Render.com
app.get('/health', (req, res) => {
  res.json({ 
    status: 'running', 
    timestamp: new Date().toISOString(),
    service: 'fuelsense-simulator',
    uptime: process.uptime()
  });
});

app.get('/ping', (req, res) => {
  res.send('pong');
});

app.listen(PORT, () => {
  console.log(`[CLOUD] Health check endpoint running on port ${PORT}`);
  console.log(`[CLOUD] Health check URL: http://localhost:${PORT}/health`);
  console.log('[CLOUD] Simulator is active and sending tank readings...');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[CLOUD] SIGTERM received, shutting down...');
  simulator.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[CLOUD] SIGINT received, shutting down...');
  simulator.kill();
  process.exit(0);
});