#!/bin/bash

echo "🚀 Starting Crypto Portfolio Tracker..."
echo "📁 Data will be stored in: $(pwd)/data/"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the server
echo "🌐 Starting server on http://localhost:3000"
echo "💾 Portfolio data will be saved to: $(pwd)/data/portfolio.json"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

node server.js
