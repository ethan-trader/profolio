#!/usr/bin/env node
/**
 * Migration Script: Upload local JSON data to Vercel KV
 * 
 * Usage:
 * 1. First deploy to Vercel and set up KV storage
 * 2. Run: node migrate-to-kv.js <your-vercel-url>
 * 
 * Example:
 *   node migrate-to-kv.js https://profolio.vercel.app
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SNAPSHOT_DIR = path.join(__dirname, 'snapshot');
const BACKUP_DIR = path.join(__dirname, 'backup');

async function migrate() {
    const vercelUrl = process.argv[2];
    const authPassword = process.argv[3] || '19900830';
    
    if (!vercelUrl) {
        console.log('Usage: node migrate-to-kv.js <vercel-url> [password]');
        console.log('Example: node migrate-to-kv.js https://profolio.vercel.app');
        process.exit(1);
    }
    
    console.log('🚀 Starting migration to Vercel KV...');
    console.log(`📍 Target: ${vercelUrl}`);
    console.log('');
    
    // Load local data
    const portfolio = loadJson(path.join(DATA_DIR, 'portfolio.json'), []);
    const transactions = loadJson(path.join(DATA_DIR, 'transactions.json'), []);
    const projects = loadJson(path.join(DATA_DIR, 'projects.json'), { projects: [], customTags: [] });
    
    // Load snapshots
    const snapshots = [];
    if (fs.existsSync(SNAPSHOT_DIR)) {
        const files = fs.readdirSync(SNAPSHOT_DIR).filter(f => f.endsWith('.json'));
        console.log(`📸 Found ${files.length} snapshot files`);
        
        for (const file of files) {
            if (file.startsWith('snapshot-') && !file.startsWith('snapshots-')) {
                const snapshot = loadJson(path.join(SNAPSHOT_DIR, file));
                if (snapshot) {
                    snapshots.push(snapshot);
                }
            }
        }
    }
    
    console.log(`📊 Data to migrate:`);
    console.log(`   - Portfolio: ${portfolio.length} assets`);
    console.log(`   - Transactions: ${transactions.length} records`);
    console.log(`   - Projects: ${projects.projects?.length || 0} projects`);
    console.log(`   - Snapshots: ${snapshots.length} snapshots`);
    console.log('');
    
    // Generate auth token
    const authToken = Buffer.from(authPassword).toString('base64');
    
    // Send to Vercel
    console.log('📤 Uploading to Vercel KV...');
    
    try {
        const response = await fetch(`${vercelUrl}/api/migrate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Auth-Token': authToken
            },
            body: JSON.stringify({
                portfolio,
                transactions,
                projects,
                snapshots
            })
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HTTP ${response.status}: ${error}`);
        }
        
        const result = await response.json();
        
        console.log('');
        console.log('✅ Migration successful!');
        console.log('📦 Migrated:', result.migrated.join(', '));
        console.log('');
        console.log('🎉 Your data is now stored in Vercel KV!');
        console.log(`🔗 Visit ${vercelUrl} to verify`);
        
    } catch (error) {
        console.error('');
        console.error('❌ Migration failed:', error.message);
        console.error('');
        console.error('Troubleshooting:');
        console.error('1. Make sure the app is deployed to Vercel');
        console.error('2. Make sure Vercel KV is configured');
        console.error('3. Check the password is correct');
        process.exit(1);
    }
}

function loadJson(filePath, defaultValue = null) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Warning: Failed to load ${filePath}:`, error.message);
    }
    return defaultValue;
}

migrate();
