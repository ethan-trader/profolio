# Crypto Portfolio Tracker

A modern, responsive web application for tracking your cryptocurrency investments with real-time price updates and portfolio analytics.

## Features

### 🚀 Core Functionality
- **Add/Remove Coins**: Easily add cryptocurrencies to your portfolio with purchase details
- **Real-time Prices**: Live price updates from CoinGecko API
- **Portfolio Management**: Track multiple cryptocurrencies with detailed P&L calculations
- **Local Storage**: Your portfolio data is saved locally in your browser

### 📊 Analytics & Visualization
- **Total Portfolio Value**: Real-time calculation of your total portfolio worth
- **P&L Tracking**: Individual and total profit/loss calculations with percentages
- **Portfolio Distribution Chart**: Visual breakdown of your holdings
- **P&L Overview Chart**: Bar chart showing performance of each coin

### 🎨 Modern UI/UX
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Beautiful Interface**: Modern gradient design with glassmorphism effects
- **Interactive Elements**: Smooth animations and hover effects
- **Color-coded P&L**: Green for profits, red for losses

## How to Use

### Getting Started
1. **Install Node.js** (if not already installed):
   - Visit [nodejs.org](https://nodejs.org/) and download the latest version
   - Or install via package manager: `brew install node` (Mac) or `sudo apt install nodejs npm` (Linux)

2. **Start the application**:
   ```bash
   # Option 1: Use the startup script (recommended)
   ./start.sh
   
   # Option 2: Manual start
   npm install
   node server.js
   ```

3. **Open your browser** and go to: `http://localhost:3000`
4. The application will load with an empty portfolio

### Adding Coins
1. Enter the coin symbol (e.g., BTC, ETH, ADA)
2. Enter the amount you own
3. Enter the purchase price per coin
4. Click "Add Coin"

### Managing Your Portfolio
- **View Details**: See current prices, P&L, and percentages for each coin
- **Remove Coins**: Click the trash icon to remove a coin from your portfolio
- **Refresh Prices**: Click "Refresh Prices" to update all current prices
- **Clear Portfolio**: Click "Clear Portfolio" to remove all coins (with confirmation)

### Supported Cryptocurrencies
The tracker supports major cryptocurrencies including:
- Bitcoin (BTC)
- Ethereum (ETH)
- Cardano (ADA)
- Polkadot (DOT)
- Chainlink (LINK)
- Litecoin (LTC)
- Bitcoin Cash (BCH)
- Ripple (XRP)
- Dogecoin (DOGE)
- Shiba Inu (SHIB)
- Polygon (MATIC)
- Avalanche (AVAX)
- Solana (SOL)
- Cosmos (ATOM)
- Algorand (ALGO)
- VeChain (VET)
- Filecoin (FIL)
- TRON (TRX)
- EOS (EOS)
- Stellar (XLM)

## Technical Details

### Built With
- **HTML5**: Semantic markup structure
- **CSS3**: Modern styling with Flexbox and Grid
- **JavaScript (ES6+)**: Object-oriented programming with classes
- **Node.js**: Backend server for file operations
- **Express.js**: Web server framework
- **Chart.js**: Interactive charts and visualizations
- **Font Awesome**: Icons and visual elements
- **CoinGecko API**: Real-time cryptocurrency price data

### Key Features
- **Auto-refresh**: Prices update automatically every 5 minutes
- **File-based Storage**: Portfolio data saved to local `data/portfolio.json` file
- **Server API**: RESTful API for data operations
- **Error Handling**: Graceful error handling for API failures
- **Responsive Design**: Mobile-first approach with breakpoints
- **Performance**: Optimized for fast loading and smooth interactions

### Browser Compatibility
- Chrome (recommended)
- Firefox
- Safari
- Edge
- Mobile browsers (iOS Safari, Chrome Mobile)

## File Structure
```
profolio/
├── index.html          # Main HTML file
├── styles.css          # CSS styling
├── script.js           # JavaScript functionality
├── server.js           # Node.js server
├── package.json        # Node.js dependencies
├── start.sh            # Startup script
├── data/               # Data storage directory
│   └── portfolio.json  # Portfolio data file
└── README.md           # This file
```

## Privacy & Security
- **No Data Collection**: All data is stored locally in your `data/` folder
- **No Account Required**: No registration or login needed
- **API Usage**: Only fetches public price data from CoinGecko
- **Local File Storage**: Your portfolio data is saved to `data/portfolio.json`
- **Server Runs Locally**: No external servers or cloud services

## Future Enhancements
Potential features for future versions:
- Historical price charts
- Price alerts and notifications
- Export portfolio data
- Multiple portfolio support
- Advanced analytics and insights
- Dark mode toggle
- Custom coin support

## Troubleshooting

### Common Issues
1. **Prices not updating**: Check your internet connection and try refreshing
2. **Coin not found**: Make sure you're using the correct symbol (e.g., BTC not Bitcoin)
3. **Data not saving**: Ensure your browser allows local storage
4. **Charts not displaying**: Make sure JavaScript is enabled in your browser

### Getting Help
If you encounter any issues:
1. Check the browser console for error messages
2. Try refreshing the page
3. Clear your browser's local storage and start fresh
4. Ensure you have a stable internet connection

## License
This project is open source and available under the MIT License.

---

**Happy Trading! 📈💰**
