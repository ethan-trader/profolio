#!/usr/bin/env node
/**
 * Redis CLI Helper - View and edit your Upstash Redis data
 * 
 * Usage:
 *   node redis-cli.js list                    # List all keys
 *   node redis-cli.js get portfolio           # Get portfolio data
 *   node redis-cli.js get transactions        # Get transactions
 *   node redis-cli.js get projects            # Get projects
 *   node redis-cli.js set portfolio <file>    # Set portfolio from JSON file
 * 
 * Requires .env.local file with KV_REST_API_URL and KV_REST_API_TOKEN
 * Run: vercel env pull .env.local
 */

const fs = require('fs');
const path = require('path');

// Load .env.local
function loadEnv() {
    const envPath = path.join(__dirname, '.env.local');
    if (!fs.existsSync(envPath)) {
        console.error('❌ .env.local not found!');
        console.error('Run: vercel login && vercel link && vercel env pull .env.local');
        process.exit(1);
    }
    
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length) {
            process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        }
    });
}

async function main() {
    loadEnv();
    
    const { Redis } = require('@upstash/redis');
    const redis = new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });
    
    const [command, key, value] = process.argv.slice(2);
    
    if (!command) {
        console.log('Usage:');
        console.log('  node redis-cli.js list              # List all keys');
        console.log('  node redis-cli.js get <key>         # Get data for key');
        console.log('  node redis-cli.js set <key> <file>  # Set data from JSON file');
        console.log('  node redis-cli.js delete <key>      # Delete a key');
        console.log('');
        console.log('Common keys: portfolio, transactions, projects');
        return;
    }
    
    switch (command) {
        case 'list':
            const keys = await redis.keys('*');
            console.log('📋 Keys in Redis:');
            keys.forEach(k => console.log(`  - ${k}`));
            console.log(`\nTotal: ${keys.length} keys`);
            break;
            
        case 'get':
            if (!key) {
                console.error('Usage: node redis-cli.js get <key>');
                return;
            }
            const data = await redis.get(key);
            if (data) {
                console.log(JSON.stringify(data, null, 2));
            } else {
                console.log(`Key "${key}" not found`);
            }
            break;
            
        case 'set':
            if (!key || !value) {
                console.error('Usage: node redis-cli.js set <key> <json-file>');
                return;
            }
            const fileContent = fs.readFileSync(value, 'utf8');
            const jsonData = JSON.parse(fileContent);
            await redis.set(key, JSON.stringify(jsonData));
            console.log(`✅ Set "${key}" from ${value}`);
            break;
            
        case 'delete':
            if (!key) {
                console.error('Usage: node redis-cli.js delete <key>');
                return;
            }
            await redis.del(key);
            console.log(`✅ Deleted "${key}"`);
            break;
            
        default:
            console.error(`Unknown command: ${command}`);
    }
}

main().catch(console.error);
