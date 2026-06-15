// server.js - Runs BOTH ATG Simulator AND FuelSense API
const { exec } = require('child_process');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CORS CONFIGURATION - Allow Vercel frontend
// ============================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(cors());
app.use(express.json());

console.log('[SERVER] Starting FuelSense Unified Server...');
console.log('[SERVER] Node version:', process.version);
console.log('[SERVER] Environment:', process.env.NODE_ENV || 'development');
console.log('[SERVER] Current directory:', __dirname);

// ============================================
// PART 1: ATG SIMULATOR (generates tank readings)
// ============================================
let simulator = null;
let restartCount = 0;

function startSimulator() {
    console.log('[SIMULATOR] Starting ATG Simulator...');
    simulator = exec('node backend/src/atg-simulator.js');
    
    simulator.stdout.on('data', (data) => {
        console.log(`[SIMULATOR] ${data.trim()}`);
    });
    
    simulator.stderr.on('data', (data) => {
        console.error(`[SIMULATOR ERROR] ${data.trim()}`);
    });
    
    simulator.on('close', (code) => {
        console.log(`[SIMULATOR] Process exited with code ${code}`);
        restartCount++;
        if (restartCount < 5) {
            console.log('[SERVER] Restarting simulator in 10 seconds...');
            setTimeout(startSimulator, 10000);
        }
    });
}

startSimulator();

// ============================================
// PART 2: FUELSENSE API (serves frontend requests)
// ============================================

// Helper function to check if file exists
function fileExists(filePath) {
    try {
        return fs.existsSync(path.join(__dirname, filePath));
    } catch (err) {
        return false;
    }
}

// Try multiple possible paths for api.js
const possiblePaths = [
    './backend/src/api.js',
    './src/api.js',
    './api.js'
];

let apiLoaded = false;

for (const apiPath of possiblePaths) {
    const fullPath = path.join(__dirname, apiPath);
    console.log(`[API] Checking path: ${fullPath}`);
    
    if (fileExists(apiPath)) {
        console.log(`[API] Found API at: ${apiPath}`);
        try {
            const api = require(apiPath);
            app.use(api);
            console.log(`[API] ✅ FuelSense API routes mounted successfully from ${apiPath}`);
            apiLoaded = true;
            break;
        } catch (err) {
            console.error(`[API] ❌ Failed to load API from ${apiPath}:`, err.message);
        }
    } else {
        console.log(`[API] File not found at: ${apiPath}`);
    }
}

if (!apiLoaded) {
    console.error('[API] ⚠️ Could not load API from any path. Running in FALLBACK mode.');
    
    // Create comprehensive fallback API endpoints
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString(), message: 'API running in fallback mode' });
    });
    
    app.get('/api/user-profile', (req, res) => {
        const { uid } = req.query;
        res.json({ role: 'attendant', station_id: null, uid: uid, message: 'Fallback API - full API not loaded' });
    });
    
    app.get('/api/stations', (req, res) => {
        res.json([]);
    });
    
    app.get('/api/audit-log', (req, res) => {
        res.json([]);
    });
    
    app.post('/api/audit-log', (req, res) => {
        console.log('[API] Fallback audit-log POST:', req.body);
        res.json({ ok: true, message: 'Fallback mode - audit log not saved' });
    });
    
    app.get('/api/tanks', (req, res) => {
        res.json([]);
    });
    
    app.get('/api/deliveries', (req, res) => {
        res.json([]);
    });
    
    app.get('/api/alerts', (req, res) => {
        res.json([]);
    });
    
    app.get('/api/shifts', (req, res) => {
        res.json([]);
    });
    
    app.get('/api/reconciliation', (req, res) => {
        res.json([]);
    });
    
    app.get('/api/cors-test', (req, res) => {
        res.json({ 
            cors_working: true, 
            message: 'CORS is working (fallback mode)',
            api_loaded: false,
            paths_checked: possiblePaths
        });
    });
}

// ============================================
// HEALTH CHECK ENDPOINTS
// ============================================

// Root health check (for Render)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'running', 
        timestamp: new Date().toISOString(),
        simulator: simulator ? 'running' : 'stopped',
        restarts: restartCount,
        api_loaded: apiLoaded,
        uptime: process.uptime()
    });
});

app.get('/ping', (req, res) => {
    res.send('pong');
});

// Simple status endpoint
app.get('/status', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        api_loaded: apiLoaded,
        simulator_running: simulator !== null
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`[SERVER] ========================================`);
    console.log(`[SERVER] FuelSense Unified Server running on port ${PORT}`);
    console.log(`[SERVER] ========================================`);
    console.log(`[SERVER] Health check: https://fuelsense-fraud-detection.onrender.com/health`);
    console.log(`[SERVER] API base: https://fuelsense-fraud-detection.onrender.com/api`);
    console.log(`[SERVER] API health: https://fuelsense-fraud-detection.onrender.com/api/health`);
    console.log(`[SERVER] Simulator status: ${simulator ? 'running' : 'starting'}`);
    console.log(`[SERVER] API loaded: ${apiLoaded ? 'YES ✅' : 'NO ⚠️'}`);
    console.log(`[SERVER] ========================================`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[SERVER] SIGTERM received, shutting down...');
    if (simulator) simulator.kill();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[SERVER] SIGINT received, shutting down...');
    if (simulator) simulator.kill();
    process.exit(0);
});