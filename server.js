const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Upstash Redis import (for Vercel deployment)
let redis = null;
try {
    const { Redis } = require('@upstash/redis');
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        redis = Redis.fromEnv();
        console.log('🔴 Running with Upstash Redis storage');
    }
} catch (e) {
    console.log('📁 Running in local mode (filesystem storage)');
}

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const SNAPSHOT_DIR = path.join(__dirname, 'snapshot');
const PORTFOLIO_FILE = path.join(DATA_DIR, 'portfolio.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

// Check if we're running on Vercel with Redis configured
const isVercelKV = () => redis && process.env.UPSTASH_REDIS_REST_URL;

// ============================================
// Storage Abstraction Layer
// ============================================

async function getData(key, defaultValue = null) {
    if (isVercelKV()) {
        const data = await redis.get(key);
        // Upstash returns parsed JSON automatically for objects, but strings need parsing
        if (data !== null) {
            return typeof data === 'string' ? JSON.parse(data) : data;
        }
        return defaultValue;
    } else {
        // Filesystem fallback for local development
        const filePath = getFilePath(key);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
        return defaultValue;
    }
}

async function setData(key, value) {
    if (isVercelKV()) {
        await redis.set(key, JSON.stringify(value));
    } else {
        // Filesystem fallback for local development
        const filePath = getFilePath(key);
        fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    }
}

function getFilePath(key) {
    switch (key) {
        case 'portfolio': return PORTFOLIO_FILE;
        case 'transactions': return TRANSACTIONS_FILE;
        case 'projects': return PROJECTS_FILE;
        default:
            if (key.startsWith('snapshot:')) {
                const snapshotId = key.replace('snapshot:', '');
                return path.join(SNAPSHOT_DIR, `${snapshotId}.json`);
            }
            return path.join(DATA_DIR, `${key}.json`);
    }
}

// Get all snapshot keys
async function getAllSnapshotKeys() {
    if (isVercelKV()) {
        // Get all keys matching snapshot:* pattern
        const keys = await redis.keys('snapshot:*');
        return keys;
    } else {
        // Filesystem fallback
        if (!fs.existsSync(SNAPSHOT_DIR)) return [];
        const files = fs.readdirSync(SNAPSHOT_DIR).filter(f => f.endsWith('.json'));
        return files.map(f => `snapshot:${f.replace('.json', '')}`);
    }
}

// Get all snapshots
async function getAllSnapshots() {
    const keys = await getAllSnapshotKeys();
    const snapshots = [];
    
    for (const key of keys) {
        const snapshot = await getData(key);
        if (snapshot) {
            snapshots.push(snapshot);
        }
    }
    
    return snapshots;
}

// Save a snapshot
async function saveSnapshot(snapshot) {
    const key = `snapshot:snapshot-${snapshot.id}-${new Date(snapshot.timestamp).toISOString().replace(/[:.]/g, '-')}`;
    await setData(key, snapshot);
}

// Password Protection Middleware
const SITE_PASSWORD = process.env.SITE_PASSWORD || '19900830';

function basicAuth(req, res, next) {
    // Skip auth if no password is set
    if (!SITE_PASSWORD) {
        return next();
    }
    
    // Allow static assets without authentication
    const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot'];
    if (staticExtensions.some(ext => req.path.endsWith(ext))) {
        return next();
    }
    
    const expectedToken = Buffer.from(SITE_PASSWORD).toString('base64');
    
    // Check for auth token in query string
    if (req.query.auth === expectedToken) {
        return next();
    }
    
    // Check for auth token in header (sent from localStorage)
    const authToken = req.headers['x-auth-token'];
    if (authToken === expectedToken) {
        return next();
    }
    
    // Check for Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token === expectedToken) {
            return next();
        }
    }
    
    // Show login page for HTML requests
    if (req.accepts('html') && !req.path.startsWith('/api/')) {
        return res.send(getLoginPage());
    }
    
    // Return 401 for API requests
    res.status(401).json({ error: 'Authentication required' });
}

function getLoginPage() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login – Profolio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'DM Sans', system-ui, sans-serif;
            background: linear-gradient(135deg, #0a0e17 0%, #111827 50%, #1a2332 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #f1f5f9;
        }
        .login-container {
            background: rgba(17, 24, 39, 0.8);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(56, 189, 248, 0.1);
            border-radius: 24px;
            padding: 48px;
            width: 100%;
            max-width: 400px;
            text-align: center;
        }
        .logo {
            font-family: 'JetBrains Mono', monospace;
            font-size: 2rem;
            font-weight: 700;
            color: #38bdf8;
            margin-bottom: 8px;
        }
        .subtitle {
            color: #64748b;
            margin-bottom: 32px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-input {
            width: 100%;
            padding: 14px 18px;
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 12px;
            color: #f1f5f9;
            font-size: 1rem;
            font-family: inherit;
            transition: all 0.2s;
        }
        .form-input:focus {
            outline: none;
            border-color: #38bdf8;
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
        }
        .submit-btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #38bdf8, #0ea5e9);
            border: none;
            border-radius: 12px;
            color: #0a0e17;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .submit-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(56, 189, 248, 0.4);
        }
        .error {
            color: #f43f5e;
            font-size: 0.875rem;
            margin-top: 16px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">🔐 Profolio</div>
        <p class="subtitle">Enter password to access</p>
        <form id="loginForm" method="POST" action="/login">
            <div class="form-group">
                <input type="password" name="password" class="form-input" placeholder="Password" required autofocus>
            </div>
            <button type="submit" class="submit-btn">Unlock</button>
            <p class="error" id="error">Invalid password</p>
        </form>
    </div>
    <script>
        const form = document.getElementById('loginForm');
        const error = document.getElementById('error');
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = form.password.value;
            
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            
            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('profolio_auth', data.token);
                window.location.href = '/?auth=' + data.token;
            } else {
                error.style.display = 'block';
                form.password.value = '';
            }
        });
        
        // Check if already authenticated
        const token = localStorage.getItem('profolio_auth');
        if (token) {
            window.location.href = '/?auth=' + token;
        }
    </script>
</body>
</html>`;
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Login endpoint (before auth middleware)
app.post('/login', (req, res) => {
    const { password } = req.body;
    
    if (password === SITE_PASSWORD) {
        // Return auth token for localStorage
        const authToken = Buffer.from(SITE_PASSWORD).toString('base64');
        res.json({ success: true, token: authToken });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// Logout endpoint
app.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'profolio_auth=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    res.json({ success: true });
});

// Apply auth middleware
app.use(basicAuth);

// Serve static files (after auth)
app.use(express.static(__dirname));

// Ensure data and snapshot directories exist (for local development)
if (!isVercelKV()) {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SNAPSHOT_DIR)) {
        fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    }
}

// ============================================
// API Routes
// ============================================

// Portfolio routes
app.get('/api/portfolio', async (req, res) => {
    try {
        const portfolio = await getData('portfolio', []);
        res.json(portfolio);
    } catch (error) {
        console.error('Error reading portfolio:', error);
        res.status(500).json({ error: 'Failed to read portfolio data' });
    }
});

app.post('/api/portfolio', async (req, res) => {
    try {
        const portfolio = req.body;
        await setData('portfolio', portfolio);
        res.json({ success: true, message: 'Portfolio saved successfully' });
    } catch (error) {
        console.error('Error saving portfolio:', error);
        res.status(500).json({ error: 'Failed to save portfolio data' });
    }
});

app.get('/api/export', async (req, res) => {
    try {
        const portfolio = await getData('portfolio', []);
        const exportData = {
            portfolio: portfolio,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="crypto-portfolio-${new Date().toISOString().split('T')[0]}.json"`);
        res.json(exportData);
    } catch (error) {
        console.error('Error exporting portfolio:', error);
        res.status(500).json({ error: 'Failed to export portfolio data' });
    }
});

app.post('/api/import', async (req, res) => {
    try {
        const { portfolio } = req.body;
        if (!Array.isArray(portfolio)) {
            return res.status(400).json({ error: 'Invalid portfolio data format' });
        }
        
        await setData('portfolio', portfolio);
        res.json({ success: true, message: 'Portfolio imported successfully' });
    } catch (error) {
        console.error('Error importing portfolio:', error);
        res.status(500).json({ error: 'Failed to import portfolio data' });
    }
});

// Snapshot routes
app.post('/api/snapshots', async (req, res) => {
    try {
        const snapshots = req.body;
        
        for (const snapshot of snapshots) {
            await saveSnapshot(snapshot);
        }
        
        console.log(`Saved ${snapshots.length} snapshots`);
        res.json({ success: true, message: 'Snapshots saved successfully' });
    } catch (error) {
        console.error('Error saving snapshots:', error);
        res.status(500).json({ error: 'Failed to save snapshots' });
    }
});

app.get('/api/snapshots', async (req, res) => {
    try {
        const snapshots = await getAllSnapshots();
        res.json(snapshots);
    } catch (error) {
        console.error('Error loading snapshots:', error);
        res.status(500).json({ error: 'Failed to load snapshots' });
    }
});

// Get latest snapshot's totalCost
app.get('/api/latest-totalcost', async (req, res) => {
    try {
        const snapshots = await getAllSnapshots();
        
        if (snapshots.length === 0) {
            return res.json({ totalCost: null });
        }
        
        // Find the latest snapshot
        let latestSnapshot = snapshots[0];
        let latestTimestamp = new Date(latestSnapshot.timestamp).getTime();
        
        for (const snapshot of snapshots) {
            const timestamp = new Date(snapshot.timestamp).getTime();
            if (timestamp > latestTimestamp) {
                latestTimestamp = timestamp;
                latestSnapshot = snapshot;
            }
        }
        
        if (latestSnapshot && latestSnapshot.totalCost !== undefined) {
            res.json({ totalCost: latestSnapshot.totalCost });
        } else {
            res.json({ totalCost: null });
        }
    } catch (error) {
        console.error('Error loading latest totalCost:', error);
        res.status(500).json({ error: 'Failed to load latest totalCost' });
    }
});

// Transaction routes
app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await getData('transactions', []);
        res.json(transactions);
    } catch (error) {
        console.error('Error reading transactions:', error);
        res.status(500).json({ error: 'Failed to read transactions data' });
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const transaction = req.body;
        
        // Validate transaction data
        if (!transaction.symbol || !transaction.amount || transaction.purchasePrice === undefined) {
            return res.status(400).json({ error: 'Invalid transaction data' });
        }
        
        // Load existing transactions
        let transactions = await getData('transactions', []);
        
        // Add new transaction
        transactions.push({
            id: transaction.id || Date.now().toString(),
            timestamp: transaction.timestamp || new Date().toISOString(),
            symbol: transaction.symbol,
            amount: transaction.amount,
            purchasePrice: transaction.purchasePrice,
            totalCost: transaction.totalCost || (transaction.amount * transaction.purchasePrice),
            note: transaction.note || '',
            type: transaction.type || 'buy'
        });
        
        // Save transactions
        await setData('transactions', transactions);
        res.json({ success: true, message: 'Transaction recorded successfully' });
    } catch (error) {
        console.error('Error saving transaction:', error);
        res.status(500).json({ error: 'Failed to save transaction data' });
    }
});

// Export portfolio history with date range and daily aggregation (CSV format)
app.get('/api/export-history', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        // Parse date parameters
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        
        // If end date is provided, set it to end of day
        if (end) {
            end.setHours(23, 59, 59, 999);
        }
        
        // Get all snapshots
        const allSnapshots = await getAllSnapshots();
        
        // Sort by timestamp
        allSnapshots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Filter by date range
        let filteredSnapshots = allSnapshots.filter(snapshot => {
            const snapshotDate = new Date(snapshot.timestamp);
            if (start && snapshotDate < start) return false;
            if (end && snapshotDate > end) return false;
            return true;
        });
        
        // Aggregate to one data point per day (use the last snapshot of each day)
        const dailySnapshots = {};
        filteredSnapshots.forEach(snapshot => {
            const dateKey = new Date(snapshot.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
            // Keep the latest snapshot for each day
            if (!dailySnapshots[dateKey] || new Date(snapshot.timestamp) > new Date(dailySnapshots[dateKey].timestamp)) {
                dailySnapshots[dateKey] = snapshot;
            }
        });
        
        // Convert to array and sort by date
        const dailyData = Object.entries(dailySnapshots)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, snapshot]) => ({
                date: date,
                portfolio: snapshot.totalValue
            }));
        
        // Generate CSV content
        const csvHeader = 'date,portfolio';
        const csvRows = dailyData.map(row => `${row.date},${row.portfolio.toFixed(2)}`);
        const csvContent = [csvHeader, ...csvRows].join('\n');
        
        // Generate filename
        const startStr = start ? start.toISOString().split('T')[0] : dailyData[0]?.date || 'all';
        const endStr = end ? end.toISOString().split('T')[0] : dailyData[dailyData.length - 1]?.date || 'all';
        const filename = `portfolio-history-${startStr}-to-${endStr}.csv`;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting portfolio history:', error);
        res.status(500).json({ error: 'Failed to export portfolio history' });
    }
});

// Project routes
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await getData('projects', { projects: [], customTags: [] });
        res.json(projects);
    } catch (error) {
        console.error('Error reading projects:', error);
        res.status(500).json({ error: 'Failed to read projects data' });
    }
});

app.post('/api/projects', async (req, res) => {
    try {
        const project = req.body;
        
        // Validate required fields (tags is now an array)
        if (!project.name || project.invested === undefined) {
            return res.status(400).json({ error: 'Missing required fields: name, invested' });
        }
        
        // Load existing projects
        let data = await getData('projects', { projects: [], customTags: [] });
        if (!data.customTags) data.customTags = [];
        
        // Handle tags - convert single tag to array for backward compatibility
        let tags = project.tags || [];
        if (project.tag && !Array.isArray(project.tags)) {
            tags = [project.tag];
        }
        
        // Create new project with ID
        const newProject = {
            id: Date.now().toString(),
            name: project.name,
            tags: tags,
            invested: parseFloat(project.invested) || 0,
            projectLink: project.projectLink || '',
            notionLink: project.notionLink || '',
            // Optional fields
            description: project.description || '',
            status: project.status || 'active',
            startDate: project.startDate || new Date().toISOString().split('T')[0],
            currentValue: parseFloat(project.currentValue) || null,
            notes: project.notes || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        data.projects.push(newProject);
        await setData('projects', data);
        
        res.json({ success: true, project: newProject });
    } catch (error) {
        console.error('Error adding project:', error);
        res.status(500).json({ error: 'Failed to add project' });
    }
});

app.put('/api/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Load existing projects
        const data = await getData('projects', { projects: [], customTags: [] });
        if (!data.customTags) data.customTags = [];
        
        const projectIndex = data.projects.findIndex(p => p.id === id);
        if (projectIndex === -1) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // Handle backward compatibility: convert tag to tags array
        if (updates.tag && !updates.tags) {
            updates.tags = [updates.tag];
            delete updates.tag;
        }
        
        // Update project
        data.projects[projectIndex] = {
            ...data.projects[projectIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        // Remove old 'tag' field if present and replace with 'tags'
        if (data.projects[projectIndex].tag && data.projects[projectIndex].tags) {
            delete data.projects[projectIndex].tag;
        }
        
        await setData('projects', data);
        res.json({ success: true, project: data.projects[projectIndex] });
    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Load existing projects
        const data = await getData('projects', { projects: [], customTags: [] });
        
        const projectIndex = data.projects.findIndex(p => p.id === id);
        if (projectIndex === -1) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // Remove project
        data.projects.splice(projectIndex, 1);
        await setData('projects', data);
        
        res.json({ success: true, message: 'Project deleted' });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// Custom tags management
app.post('/api/projects/tags', async (req, res) => {
    try {
        const { tag } = req.body;
        
        if (!tag || typeof tag !== 'string' || tag.trim().length === 0) {
            return res.status(400).json({ error: 'Invalid tag name' });
        }
        
        const normalizedTag = tag.trim().toLowerCase();
        
        // Load existing data
        let data = await getData('projects', { projects: [], customTags: [] });
        if (!data.customTags) data.customTags = [];
        
        // Check if tag already exists
        if (data.customTags.includes(normalizedTag)) {
            return res.status(400).json({ error: 'Tag already exists' });
        }
        
        // Add new tag
        data.customTags.push(normalizedTag);
        await setData('projects', data);
        
        res.json({ success: true, tag: normalizedTag, allTags: data.customTags });
    } catch (error) {
        console.error('Error adding tag:', error);
        res.status(500).json({ error: 'Failed to add tag' });
    }
});

app.delete('/api/projects/tags/:tag', async (req, res) => {
    try {
        const { tag } = req.params;
        
        // Load existing data
        const data = await getData('projects', { projects: [], customTags: [] });
        
        if (!data.customTags) {
            return res.status(404).json({ error: 'Tag not found' });
        }
        
        const tagIndex = data.customTags.indexOf(tag);
        if (tagIndex === -1) {
            return res.status(404).json({ error: 'Tag not found' });
        }
        
        // Remove tag from customTags
        data.customTags.splice(tagIndex, 1);
        await setData('projects', data);
        
        res.json({ success: true, message: 'Tag deleted', allTags: data.customTags });
    } catch (error) {
        console.error('Error deleting tag:', error);
        res.status(500).json({ error: 'Failed to delete tag' });
    }
});

// ============================================
// Migration endpoint (for uploading local data to KV)
// ============================================
app.post('/api/migrate', async (req, res) => {
    try {
        const { portfolio, transactions, projects, snapshots } = req.body;
        
        if (!isVercelKV()) {
            return res.status(400).json({ error: 'Migration only works on Vercel with KV configured' });
        }
        
        let migrated = [];
        
        if (portfolio) {
            await setData('portfolio', portfolio);
            migrated.push(`portfolio (${portfolio.length} items)`);
        }
        
        if (transactions) {
            await setData('transactions', transactions);
            migrated.push(`transactions (${transactions.length} items)`);
        }
        
        if (projects) {
            await setData('projects', projects);
            migrated.push(`projects (${projects.projects?.length || 0} items)`);
        }
        
        if (snapshots && Array.isArray(snapshots)) {
            for (const snapshot of snapshots) {
                await saveSnapshot(snapshot);
            }
            migrated.push(`snapshots (${snapshots.length} items)`);
        }
        
        res.json({ success: true, migrated });
    } catch (error) {
        console.error('Error during migration:', error);
        res.status(500).json({ error: 'Migration failed: ' + error.message });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Only start the server if not running on Vercel
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Crypto Portfolio Tracker running at http://localhost:${PORT}`);
        console.log(`📁 Data stored in: ${DATA_DIR}`);
        console.log(`📸 Snapshots stored in: ${SNAPSHOT_DIR}`);
        console.log(`💾 Portfolio file: ${PORTFOLIO_FILE}`);
        console.log(`📝 Transactions file: ${TRANSACTIONS_FILE}`);
        console.log(`🔧 Storage mode: ${isVercelKV() ? 'Vercel KV' : 'Local Filesystem'}`);
    });
}

// Export for Vercel
module.exports = app;
