// Crypto Portfolio Tracker JavaScript

// Auth handling - check for token in URL and store it
(function initAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth');
    if (authToken) {
        localStorage.setItem('profolio_auth', authToken);
        // Clean URL by removing auth param
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Override fetch to include auth token in all requests
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        const token = localStorage.getItem('profolio_auth');
        if (token) {
            options.headers = options.headers || {};
            options.headers['X-Auth-Token'] = token;
        }
        return originalFetch(url, options);
    };
    
    // Update all navigation links to include auth token
    const token = localStorage.getItem('profolio_auth');
    if (token) {
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('a.nav-link, .nav-links a').forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('http') && !href.includes('auth=')) {
                    const separator = href.includes('?') ? '&' : '?';
                    link.setAttribute('href', href + separator + 'auth=' + token);
                }
            });
        });
    }
})();

// Theme Toggle - runs immediately
(function initTheme() {
    // Load saved theme or default to dark
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Initialize toggle button when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', function() {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
            });
        }
    });
})();

class CryptoPortfolio {
    constructor() {
        this.portfolio = [];
        this.portfolioHistory = [];
        this.portfolioSnapshots = [];
        this.snapshotHistory = [];
        this.cryptoData = {};
        this.charts = {};
        this.sortColumn = null;
        this.sortOrder = 'asc';
        this.useSnapshotData = true; // Default to using snapshot data
        
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
            this.init();
        }, 100);
    }

    async init() {
        console.log('Initializing portfolio tracker...');
        this.bindEvents();
        console.log('Events bound');
        
        // Load portfolio directly (bypass snapshot loading for now)
        console.log('About to load portfolio...');
        await this.loadPortfolio();
        console.log('Portfolio loaded, length:', this.portfolio.length);
        
        // Load latest totalCost from snapshot
        await this.loadLatestTotalCost();
        
        this.loadPortfolioHistory();
        await this.loadPortfolioSnapshots();
        console.log('Portfolio loaded:', this.portfolio);
        console.log('Portfolio length:', this.portfolio.length);
        
        // Check if DOM elements exist
        const tbody = document.getElementById('portfolioBody');
        console.log('portfolioBody element found:', tbody);
        
        this.initCharts();
        this.loadCryptoPrices();
        
        console.log('About to render portfolio...');
        this.renderPortfolio();
        console.log('Portfolio rendered');
        
        // Set default sort to current value (descending)
        this.sortPortfolio('currentValue', 'desc');
        
        this.updateTotalValue();
        console.log('Portfolio tracker initialized');
        
        // Auto-refresh prices every 5 minutes
        setInterval(() => {
            this.loadCryptoPrices();
        }, 300000);
        
        // Create snapshot on page load/refresh (only if we have portfolio data)
        // Wait 5 seconds to allow crypto prices to load first
        // Only create automatic snapshot if last snapshot was more than 1 hour ago
        if (this.portfolio.length > 0) {
            setTimeout(async () => {
                const shouldCreateSnapshot = await this.shouldCreateAutoSnapshot();
                if (shouldCreateSnapshot) {
                    this.createSnapshot('Page Refresh');
                } else {
                    console.log('Skipping automatic snapshot - last snapshot was less than 1 hour ago');
                }
            }, 5000);
        }
        
        // Ensure we have at least one history entry for the chart
        this.ensureHistoryEntry();
        
        // Update charts after everything is loaded
        this.updateCharts();
    }

    bindEvents() {
        // Add coin form
        const form = document.getElementById('addCoinForm');
        console.log('Form element found:', form);
        
        if (form) {
            form.addEventListener('submit', (e) => {
                console.log('Form submitted');
                e.preventDefault();
                this.addCoin();
            });
        } else {
            console.error('Form element not found!');
        }

        // Refresh prices button
        document.getElementById('refreshPrices').addEventListener('click', () => {
            this.showMessage('Refreshing prices...', 'success');
            this.loadCryptoPrices();
        });

        // Add history entry button
        document.getElementById('addHistoryEntry').addEventListener('click', () => {
            this.updateTotalValue();
            this.showMessage('History point added!', 'success');
        });

        // Clear portfolio button
        document.getElementById('clearPortfolio').addEventListener('click', () => {
            this.clearPortfolio();
        });

        // Set total cost button
        document.getElementById('setTotalCost').addEventListener('click', async () => {
            const newTotalCost = parseFloat(document.getElementById('newTotalCost').value);
            if (isNaN(newTotalCost)) {
                this.showMessage('Please enter a valid total cost amount', 'error');
                return;
            }
            await this.setTotalCost(newTotalCost);
            document.getElementById('newTotalCost').value = ''; // Clear the input
        });

        // Reset total cost button
        document.getElementById('resetTotalCost').addEventListener('click', async () => {
            await this.resetTotalCost();
        });

        // Export data button
        document.getElementById('exportData').addEventListener('click', () => {
            this.exportData();
        });

        // Import data button
        document.getElementById('importData').addEventListener('change', (e) => {
            this.importData(e);
        });

        // Snapshot buttons
        document.getElementById('createSnapshot').addEventListener('click', async () => {
            await this.createSnapshot();
        });

        document.getElementById('viewSnapshots').addEventListener('click', () => {
            this.showSnapshotsModal();
        });

        document.getElementById('portfolioHistory').addEventListener('click', () => {
            window.open('/portfolio-history.html', '_blank');
        });

        document.getElementById('loadLatestSnapshot').addEventListener('click', async () => {
            const loaded = await this.loadLatestSnapshot();
            if (loaded) {
                this.renderPortfolio();
                // Apply default sort to current value (descending) after loading snapshot
                this.sortPortfolio('currentValue', 'desc');
                this.updateTotalValue();
                this.updateCharts();
            }
        });

        // Sort buttons
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const column = e.target.getAttribute('data-column');
                const order = e.target.getAttribute('data-order');
                this.sortPortfolio(column, order);
            });
        });

        // Chart control buttons
        const useSnapshotDataBtn = document.getElementById('useSnapshotData');
        const useRealtimeDataBtn = document.getElementById('useRealtimeData');
        
        // Chart control buttons removed - only pie chart is used
    }

    async loadCryptoPrices() {
        const symbols = [...new Set(this.portfolio.map(coin => coin.symbol))];
        if (symbols.length === 0) return;

        try {
            // Convert symbol to CoinGecko ID mapping
            const symbolToId = {
                'BTC': 'bitcoin',
                'ETH': 'ethereum',
                'ADA': 'cardano',
                'DOT': 'polkadot',
                'LINK': 'chainlink',
                'LTC': 'litecoin',
                'BCH': 'bitcoin-cash',
                'XRP': 'ripple',
                'DOGE': 'dogecoin',
                'SHIB': 'shiba-inu',
                'MATIC': 'matic-network',
                'AVAX': 'avalanche-2',
                'SOL': 'solana',
                'ATOM': 'cosmos',
                'ALGO': 'algorand',
                'ASTER': 'aster-2',
                'VET': 'vechain',
                'FIL': 'filecoin',
                'TRX': 'tron',
                'EOS': 'eos',
                'XLM': 'stellar',
                'HUMA': 'huma-finance',
                'S': 'sonic-3',
                'ENA': 'ethena',
                'HYPE': 'hyperliquid',
                'USDC': 'usd-coin',
                'USDT': 'tether',
                'BNB': 'binancecoin',
                'ARB': 'arbitrum',
                'OP': 'optimism',
                'UNI': 'uniswap',
                'AAVE': 'aave',
                'COMP': 'compound-governance-token',
                'MKR': 'maker',
                'CRV': 'curve-dao-token',
                'SUSHI': 'sushi',
                '1INCH': '1inch',
                'YFI': 'yearn-finance',
                'SNX': 'havven',
                'BAL': 'balancer',
                'LDO': 'lido-dao',
                'RPL': 'rocket-pool',
                'FXS': 'frax-share',
                'FRAX': 'frax',
                'LQTY': 'liquity',
                'CVX': 'convex-finance',
                'CRV': 'curve-dao-token',
                'PENDLE': 'pendle',
                'GMX': 'gmx',
                'MAGIC': 'magic',
                'RDNT': 'radiant-capital',
                'GRAIL': 'camelot-token',
                'JONES': 'jones-dao',
                'DPX': 'dopex',
                'PLS': 'plutusdao',
                'UMAMI': 'umami-finance',
                'Y2K': 'y2k',
                'GMD': 'gmd-protocol',
                'DOPEX': 'dopex',
                'RND': 'random',
                'VSTA': 'vesta-finance',
                'HOP': 'hop-protocol',
                'VELO': 'velodrome-finance',
                'BEETS': 'beethoven-x',
                'SPIRIT': 'spiritswap',
                'BOO': 'spookyswap',
                'TOMB': 'tomb',
                'SPELL': 'spell-token',
                'MIM': 'magic-internet-money',
                'FTM': 'fantom',
                'NEAR': 'near',
                'FTT': 'ftx-token',
                'LUNA': 'terra-luna',
                'UST': 'terrausd',
                'LUNC': 'terra-luna-classic',
                'USTC': 'terrausd-classic',
                'APT': 'aptos',
                'SUI': 'sui',
                'SEI': 'sei-network',
                'TIA': 'celestia',
                'INJ': 'injective-protocol',
                'OSMO': 'osmosis',
                'JUNO': 'juno-network',
                'SCRT': 'secret',
                'AKT': 'akash-network',
                'REGEN': 'regen',
                'IOV': 'starname',
                'NGM': 'e-money',
                'BAND': 'band-protocol',
                'KAVA': 'kava',
                'HARD': 'hard-protocol',
                'SWP': 'kava-swap',
                'XPRT': 'persistence',
                'PSTAKE': 'pstake-finance',
                'STKATOM': 'stkatom',
                'STKOSMO': 'stkosmo',
                'STKJUNO': 'stkjuno',
                'STKSCRT': 'stksecret',
                'STKREGEN': 'stkregen',
                'STKIOV': 'stkiov',
                'STKNGM': 'stkngm',
                'STKBAND': 'stkband',
                'STKKAVA': 'stkkava',
                'STKHARD': 'stkhard',
                'STKSWP': 'stkswp',
                'STKXPRT': 'stkxprt',
                'STKPSTAKE': 'stkpstake',
                'FORM': 'four',
                'SYRUP': 'syrup',
                'FF': 'falcon-finance-ff'
            };

            // Get the CoinGecko IDs for the symbols in our portfolio
            const coinIds = symbols.map(symbol => symbolToId[symbol]).filter(id => id);
            
            if (coinIds.length === 0) {
                console.log('No valid coin IDs found for symbols:', symbols);
                return;
            }

            console.log('Fetching prices for:', coinIds);
            const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('API Response:', data);

            this.cryptoData = {};
            for (const [symbol, id] of Object.entries(symbolToId)) {
                if (data[id] && symbols.includes(symbol)) {
                    this.cryptoData[symbol] = {
                        price: data[id].usd,
                        change24h: data[id].usd_24h_change || 0
                    };
                    console.log(`Loaded price for ${symbol}: $${data[id].usd}`);
                }
            }

            console.log('Final crypto data:', this.cryptoData);
            this.renderPortfolio();
            // Apply default sort to current value (descending) after prices are loaded
            this.sortPortfolio('currentValue', 'desc');
            this.updateTotalValue();
            this.updateCharts();
        } catch (error) {
            console.error('Error loading crypto prices:', error);
            this.showMessage(`Error loading cryptocurrency prices: ${error.message}. Please try again.`, 'error');
        }
    }

    async addCoin() {
        console.log('addCoin function called');
        const symbol = document.getElementById('coinSymbol').value.toUpperCase();
        const amount = parseFloat(document.getElementById('coinAmount').value);
        const purchasePrice = parseFloat(document.getElementById('purchasePrice').value);
        const note = document.getElementById('note').value.trim();

        console.log('Form values:', { symbol, amount, purchasePrice, note });

        if (!symbol || !amount || purchasePrice === undefined || purchasePrice === null || purchasePrice === '') {
            this.showMessage('Please fill in all required fields.', 'error');
            return;
        }

        if (amount <= 0 || purchasePrice < 0) {
            this.showMessage('Amount must be positive and purchase price cannot be negative.', 'error');
            return;
        }

        // Create unique identifier based on symbol and note
        const uniqueId = `${symbol}_${note || 'default'}`;
        
        // Check if coin with same symbol and note already exists
        const existingCoin = this.portfolio.find(coin => 
            coin.symbol === symbol && coin.note === (note || '')
        );
        
        if (existingCoin) {
            // Update existing coin with same symbol and note
            existingCoin.amount += amount;
            existingCoin.totalCost += amount * purchasePrice;
            existingCoin.averagePrice = existingCoin.totalCost / existingCoin.amount;
            // Update purchasePrice to reflect the average purchase price
            existingCoin.purchasePrice = existingCoin.averagePrice;
        } else {
            // Add new coin entry (even if symbol exists with different note)
            this.portfolio.push({
                id: uniqueId,
                symbol: symbol,
                amount: amount,
                purchasePrice: purchasePrice,
                totalCost: amount * purchasePrice,
                averagePrice: purchasePrice,
                note: note || ''
            });
        }

        // Record transaction
        await this.saveTransaction({
            symbol: symbol,
            amount: amount,
            purchasePrice: purchasePrice,
            totalCost: amount * purchasePrice,
            note: note || '',
            type: 'buy'
        });

        await this.savePortfolio();
        this.renderPortfolio();
        // Apply default sort to current value (descending) after adding coin
        this.sortPortfolio('currentValue', 'desc');
        this.updateTotalValue();
        this.updateCharts();
        this.clearForm();
        this.showMessage(`${symbol} added to portfolio successfully!`, 'success');
        
        // Load prices after adding coin
        this.loadCryptoPrices();
    }

    async removeCoin(symbol, note = '') {
        // Find the coin being removed to record transaction
        const coinToRemove = this.portfolio.find(coin => 
            coin.symbol === symbol && coin.note === note
        );
        
        // Record sell transaction if coin exists
        if (coinToRemove) {
            const currentPrice = this.cryptoData[symbol]?.price || coinToRemove.averagePrice;
            await this.saveTransaction({
                symbol: symbol,
                amount: coinToRemove.amount,
                purchasePrice: currentPrice,
                totalCost: coinToRemove.amount * currentPrice,
                note: note || '',
                type: 'sell'
            });
        }
        
        this.portfolio = this.portfolio.filter(coin => 
            !(coin.symbol === symbol && coin.note === note)
        );
        await this.savePortfolio();
        this.renderPortfolio();
        // Apply default sort to current value (descending) after removing coin
        this.sortPortfolio('currentValue', 'desc');
        this.updateTotalValue();
        this.updateCharts();
        this.showMessage(`${symbol}${note ? ` (${note})` : ''} removed from portfolio.`, 'success');
    }

    async clearPortfolio() {
        if (confirm('Are you sure you want to clear your entire portfolio? This action cannot be undone.')) {
            this.portfolio = [];
            await this.savePortfolio();
            this.renderPortfolio();
            // Apply default sort to current value (descending) after clearing portfolio
            this.sortPortfolio('currentValue', 'desc');
            this.updateTotalValue();
            this.updateCharts();
            this.showMessage('Portfolio cleared successfully.', 'success');
        }
    }

    sortPortfolio(column, order) {
        this.sortColumn = column;
        this.sortOrder = order;
        
        // Update active sort button
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-column="${column}"][data-order="${order}"]`).classList.add('active');
        
        // Sort the portfolio
        this.portfolio.sort((a, b) => {
            let aValue, bValue;
            
            switch (column) {
                case 'symbol':
                    aValue = a.symbol;
                    bValue = b.symbol;
                    break;
                case 'amount':
                    aValue = a.amount;
                    bValue = b.amount;
                    break;
                case 'currentPrice':
                    aValue = this.cryptoData[a.symbol]?.price || 0;
                    bValue = this.cryptoData[b.symbol]?.price || 0;
                    break;
                case 'purchasePrice':
                    aValue = a.averagePrice;
                    bValue = b.averagePrice;
                    break;
                case 'currentValue':
                    aValue = a.amount * (this.cryptoData[a.symbol]?.price || 0);
                    bValue = b.amount * (this.cryptoData[b.symbol]?.price || 0);
                    break;
                case 'valuePercent':
                    const aValueAmount = a.amount * (this.cryptoData[a.symbol]?.price || 0);
                    const bValueAmount = b.amount * (this.cryptoData[b.symbol]?.price || 0);
                    const totalValue = this.portfolio.reduce((total, coin) => {
                        const currentPrice = this.cryptoData[coin.symbol]?.price || 0;
                        return total + (coin.amount * currentPrice);
                    }, 0);
                    aValue = totalValue > 0 ? (aValueAmount / totalValue) * 100 : 0;
                    bValue = totalValue > 0 ? (bValueAmount / totalValue) * 100 : 0;
                    break;
                case 'pnl':
                    const aCurrentValue = a.amount * (this.cryptoData[a.symbol]?.price || 0);
                    const bCurrentValue = b.amount * (this.cryptoData[b.symbol]?.price || 0);
                    aValue = aCurrentValue - a.totalCost;
                    bValue = bCurrentValue - b.totalCost;
                    break;
                case 'pnlPercent':
                    const aCurrentVal = a.amount * (this.cryptoData[a.symbol]?.price || 0);
                    const bCurrentVal = b.amount * (this.cryptoData[b.symbol]?.price || 0);
                    const aPnlPercent = this.calculatePnlPercent(aCurrentVal, a.totalCost);
                    const bPnlPercent = this.calculatePnlPercent(bCurrentVal, b.totalCost);
                    aValue = aPnlPercent === 'N/A' ? 0 : aPnlPercent;
                    bValue = bPnlPercent === 'N/A' ? 0 : bPnlPercent;
                    break;
                default:
                    return 0;
            }
            
            if (column === 'symbol') {
                return order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
            } else {
                return order === 'asc' ? aValue - bValue : bValue - aValue;
            }
        });
        
        this.renderPortfolio();
    }

    renderPortfolio() {
        console.log('renderPortfolio called with portfolio:', this.portfolio);
        console.log('Portfolio length:', this.portfolio.length);
        
        const tbody = document.getElementById('portfolioBody');
        
        if (this.portfolio.length === 0) {
            console.log('Portfolio is empty, showing empty message');
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="empty-portfolio">
                        <i class="fas fa-coins"></i>
                        <h3>No coins in portfolio</h3>
                        <p>Add your first cryptocurrency to get started!</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        console.log('Rendering portfolio with', this.portfolio.length, 'coins');

        // Calculate total portfolio value for percentage calculations
        const totalPortfolioValue = this.portfolio.reduce((total, coin) => {
            const currentPrice = this.cryptoData[coin.symbol]?.price || 0;
            return total + (coin.amount * currentPrice);
        }, 0);

        tbody.innerHTML = this.portfolio.map(coin => {
            const currentPrice = this.cryptoData[coin.symbol]?.price || 0;
            const currentValue = coin.amount * currentPrice;
            const pnl = currentValue - coin.totalCost;
            const pnlPercent = this.calculatePnlPercent(currentValue, coin.totalCost);
            const valuePercent = totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0;
            const change24h = this.cryptoData[coin.symbol]?.change24h || 0;

            return `
                <tr>
                    <td>
                        <div class="coin-info">
                            <div>
                                <div class="coin-symbol">${coin.symbol}</div>
                                <div class="coin-name">${this.getCoinName(coin.symbol)}</div>
                            </div>
                        </div>
                    </td>
                    <td>${this.formatAmount(coin.amount)}</td>
                    <td>
                        <div class="price-value">${this.formatPrice(currentPrice)}</div>
                        <div class="price-change ${change24h >= 0 ? 'positive' : 'negative'}">
                            ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%
                        </div>
                    </td>
                    <td>${this.formatPrice(coin.averagePrice)}</td>
                    <td class="price-value">${this.formatPrice(currentValue)}</td>
                    <td>
                        <div class="value-percent">
                            ${valuePercent.toFixed(2)}%
                        </div>
                    </td>
                    <td>
                        <div class="pnl ${pnl >= 0 ? 'positive' : 'negative'}">
                            ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}
                        </div>
                    </td>
                    <td>
                        <div class="pnl ${pnlPercent === 'N/A' ? 'neutral' : (pnlPercent >= 0 ? 'positive' : 'negative')}">
                            ${pnlPercent === 'N/A' ? 'N/A' : (pnlPercent >= 0 ? '+' : '') + pnlPercent.toFixed(2) + '%'}
                        </div>
                    </td>
                    <td class="note-cell">
                        <span class="note-text" title="${coin.note || ''}">${coin.note || '-'}</span>
                    </td>
                    <td>
                        <button class="btn btn-danger btn-sm" onclick="portfolio.removeCoin('${coin.symbol}', '${coin.note || ''}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('') + this.renderSummaryRow(totalPortfolioValue);
    }

    renderSummaryRow(totalPortfolioValue) {
        let totalCost = 0;
        let totalPnl = 0;
        let totalPnlPercent = 0;

        this.portfolio.forEach(coin => {
            totalCost += coin.totalCost;
        });

        totalPnl = totalPortfolioValue - totalCost;
        totalPnlPercent = this.calculatePnlPercent(totalPortfolioValue, totalCost);

        return `
            <tr class="summary-row">
                <td><strong>Total</strong></td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td class="price-value"><strong>${this.formatPrice(totalPortfolioValue)}</strong></td>
                <td><strong>100.00%</strong></td>
                <td>
                    <div class="pnl ${totalPnl >= 0 ? 'positive' : 'negative'}">
                        <strong>${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}</strong>
                    </div>
                </td>
                <td>
                    <div class="pnl ${totalPnlPercent === 'N/A' ? 'neutral' : (totalPnlPercent >= 0 ? 'positive' : 'negative')}">
                        <strong>${totalPnlPercent === 'N/A' ? 'N/A' : (totalPnlPercent >= 0 ? '+' : '') + totalPnlPercent.toFixed(2) + '%'}</strong>
                    </div>
                </td>
                <td>-</td>
                <td>-</td>
            </tr>
        `;
    }

    updateTotalValue() {
        let totalValue = 0;

        this.portfolio.forEach(coin => {
            const currentPrice = this.cryptoData[coin.symbol]?.price || 0;
            totalValue += coin.amount * currentPrice;
        });

        const totalCost = this.calculateTotalCost();
        const totalPnl = totalValue - totalCost;
        const totalPnlPercent = this.calculatePnlPercent(totalValue, totalCost);

        document.getElementById('totalValue').textContent = this.formatPrice(totalValue);
        
        const changeElement = document.getElementById('totalChange');
        if (totalPnlPercent === 'N/A') {
            changeElement.textContent = 'N/A';
            changeElement.className = 'total-change neutral';
        } else {
            changeElement.textContent = `${totalPnl >= 0 ? '+' : ''}${totalPnlPercent.toFixed(2)}%`;
            changeElement.className = `total-change ${totalPnl >= 0 ? 'positive' : 'negative'}`;
        }

        // Update total cost display
        document.getElementById('totalCost').textContent = this.formatPrice(totalCost);

        // Update total gain display
        document.getElementById('totalGain').textContent = this.formatPrice(totalPnl);
        
        const gainPercentElement = document.getElementById('totalGainPercent');
        if (totalPnlPercent === 'N/A') {
            gainPercentElement.textContent = 'N/A';
            gainPercentElement.className = 'total-change neutral';
        } else {
            gainPercentElement.textContent = `${totalPnl >= 0 ? '+' : ''}${totalPnlPercent.toFixed(2)}%`;
            gainPercentElement.className = `total-change ${totalPnl >= 0 ? 'positive' : 'negative'}`;
        }

        // Save portfolio history
        this.savePortfolioHistory(totalValue, totalCost, totalPnl, totalPnlPercent);
    }

    savePortfolioHistory(totalValue, totalCost, totalPnl, totalPnlPercent) {
        const historyEntry = {
            timestamp: new Date().toISOString(),
            totalValue: totalValue,
            totalCost: totalCost,
            totalPnl: totalPnl,
            totalPnlPercent: totalPnlPercent,
            portfolio: [...this.portfolio] // Deep copy of current portfolio
        };

        this.portfolioHistory.push(historyEntry);
        
        console.log('Saved portfolio history entry:', historyEntry);
        console.log('Total history entries:', this.portfolioHistory.length);
        
        // Keep only last 100 entries to prevent data bloat
        if (this.portfolioHistory.length > 100) {
            this.portfolioHistory = this.portfolioHistory.slice(-100);
        }

        // Save to localStorage
        localStorage.setItem('cryptoPortfolioHistory', JSON.stringify(this.portfolioHistory));
        
        // History chart removed - only pie chart is used
    }

    loadPortfolioHistory() {
        try {
            const saved = localStorage.getItem('cryptoPortfolioHistory');
            this.portfolioHistory = saved ? JSON.parse(saved) : [];
            console.log('Portfolio history loaded:', this.portfolioHistory.length, 'entries');
            
            // If no history exists, create a sample entry for testing
            if (this.portfolioHistory.length === 0 && this.portfolio.length > 0) {
                console.log('No history found, creating sample entry for testing');
                const now = new Date();
                const sampleEntry = {
                    timestamp: now.toISOString(),
                    totalValue: 1000,
                    totalCost: 800,
                    totalPnl: 200,
                    totalPnlPercent: 25,
                    portfolio: [...this.portfolio]
                };
                this.portfolioHistory.push(sampleEntry);
                localStorage.setItem('cryptoPortfolioHistory', JSON.stringify(this.portfolioHistory));
            }
        } catch (error) {
            console.error('Error loading portfolio history:', error);
            this.portfolioHistory = [];
        }
    }

    initCharts() {
        this.initPieChart();
    }

    initPieChart() {
        const ctx = document.getElementById('pieChart').getContext('2d');
        
        // Dark mode color palette - cyber/neon aesthetic
        const chartColors = [
            '#38bdf8', // cyan
            '#10b981', // emerald
            '#8b5cf6', // violet
            '#f43f5e', // rose
            '#fbbf24', // amber
            '#22d3ee', // teal
            '#a855f7', // purple
            '#f97316', // orange
            '#06b6d4', // sky
            '#84cc16', // lime
            '#ec4899', // pink
            '#14b8a6', // teal
            '#6366f1', // indigo
            '#eab308', // yellow
            '#0ea5e9', // light blue
        ];
        
        this.charts.pie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: chartColors,
                    borderWidth: 2,
                    borderColor: '#111827',
                    hoverBorderColor: '#f1f5f9',
                    hoverBorderWidth: 3,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '55%',
                plugins: {
                    legend: {
                        display: false
                    },
                    legendHidden: {
                        position: 'right',
                        labels: {
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: {
                                family: "'JetBrains Mono', monospace",
                                size: 11,
                                weight: 500
                            },
                            color: '#94a3b8'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(56, 189, 248, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        titleFont: {
                            family: "'JetBrains Mono', monospace",
                            size: 13,
                            weight: 700
                        },
                        bodyFont: {
                            family: "'JetBrains Mono', monospace",
                            size: 12
                        },
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return ` ${label}: $${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${percentage}%)`;
                            }
                        }
                    }
                },
                animation: {
                    animateRotate: true,
                    animateScale: true,
                    duration: 800,
                    easing: 'easeOutQuart'
                }
            }
        });
    }

    initDistributionChart() {
        const ctx = document.getElementById('distributionChart').getContext('2d');
        this.charts.distribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#667eea', '#764ba2', '#f093fb', '#f5576c',
                        '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
                        '#ffecd2', '#fcb69f', '#a8edea', '#fed6e3'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }

    initPnlChart() {
        const ctx = document.getElementById('pnlChart').getContext('2d');
        this.charts.pnl = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'P&L (%)',
                    data: [],
                    backgroundColor: function(context) {
                        const value = context.parsed.y;
                        return value >= 0 ? '#27ae60' : '#e74c3c';
                    },
                    borderWidth: 0,
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#f8f9fa'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    updateCharts() {
        // Check if pie chart is initialized before updating
        if (!this.charts.pie) {
            console.log('Pie chart not yet initialized, skipping update');
            return;
        }

        if (this.portfolio.length === 0) {
            this.charts.pie.data.labels = [];
            this.charts.pie.data.datasets[0].data = [];
            this.updateTopHoldings([]);
        } else {
            // Group portfolio entries by symbol and sum their values
            const symbolGroups = {};
            
            this.portfolio.forEach(coin => {
                const currentPrice = this.cryptoData[coin.symbol]?.price || 0;
                const currentValue = coin.amount * currentPrice;
                
                if (currentValue > 0) {
                    if (symbolGroups[coin.symbol]) {
                        symbolGroups[coin.symbol] += currentValue;
                    } else {
                        symbolGroups[coin.symbol] = currentValue;
                    }
                }
            });

            // Convert grouped data to arrays for the chart and sort by value
            const pieData = Object.entries(symbolGroups).map(([symbol, value]) => ({
                label: symbol,
                value: value
            })).sort((a, b) => b.value - a.value);

            // Calculate total for percentages
            const totalValue = pieData.reduce((sum, item) => sum + item.value, 0);

            this.charts.pie.data.labels = pieData.map(item => item.label);
            this.charts.pie.data.datasets[0].data = pieData.map(item => item.value);
            
            // Update top 5 holdings display
            this.updateTopHoldings(pieData.slice(0, 5), totalValue);
        }

        this.charts.pie.update();
    }

    updateTopHoldings(holdings, totalValue = 0) {
        const container = document.getElementById('topHoldings');
        if (!container) return;

        // Chart colors matching the pie chart
        const chartColors = [
            '#38bdf8', '#10b981', '#8b5cf6', '#f43f5e', '#fbbf24',
            '#22d3ee', '#a855f7', '#f97316', '#06b6d4', '#84cc16'
        ];

        if (holdings.length === 0) {
            container.innerHTML = '<div style="color: var(--text-tertiary); font-size: 0.75rem;">No holdings</div>';
            return;
        }

        container.innerHTML = holdings.map((holding, index) => {
            const percent = totalValue > 0 ? ((holding.value / totalValue) * 100).toFixed(1) : 0;
            return `
                <div class="holding-item">
                    <div class="holding-color" style="background: ${chartColors[index]}"></div>
                    <div class="holding-info">
                        <span class="holding-symbol">${holding.label}</span>
                        <span class="holding-percent">${percent}%</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    initHistoryChart() {
        const ctx = document.getElementById('historyChart');
        if (!ctx) {
            console.log('History chart canvas not found');
            return;
        }
        
        console.log('Initializing history chart...');
        console.log('Snapshot history available:', this.snapshotHistory ? this.snapshotHistory.length : 0, 'entries');
        
        this.charts.history = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Portfolio Value',
                    data: [],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Total Cost',
                    data: [],
                    borderColor: '#764ba2',
                    backgroundColor: 'rgba(118, 75, 162, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        },
                        ticks: {
                            maxTicksLimit: 10
                        }
                    },
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: 'Value (USD)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed.y;
                                return context.dataset.label + ': $' + value.toLocaleString();
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
        
        console.log('History chart initialized');
        
        // Test the chart with some sample data
        setTimeout(() => {
            console.log('Testing chart with sample data...');
            if (this.charts.history) {
                this.charts.history.data.labels = ['Test 1', 'Test 2', 'Test 3'];
                this.charts.history.data.datasets[0].data = [100, 200, 150];
                this.charts.history.data.datasets[1].data = [80, 180, 120];
                this.charts.history.update();
                console.log('Test data applied to chart');
            }
        }, 1000);
    }

    updateChartControlButtons() {
        const useSnapshotDataBtn = document.getElementById('useSnapshotData');
        const useRealtimeDataBtn = document.getElementById('useRealtimeData');
        
        if (useSnapshotDataBtn && useRealtimeDataBtn) {
            if (this.useSnapshotData) {
                useSnapshotDataBtn.classList.add('active');
                useRealtimeDataBtn.classList.remove('active');
            } else {
                useSnapshotDataBtn.classList.remove('active');
                useRealtimeDataBtn.classList.add('active');
            }
        }
    }

    updateHistoryChart() {
        if (!this.charts.history) {
            console.log('History chart not initialized');
            return;
        }
        
        // Use snapshot data if preferred and available
        if (this.useSnapshotData && this.snapshotHistory && this.snapshotHistory.length > 0) {
            console.log('Using snapshot data for history chart');
            this.updateHistoryChartWithSnapshots();
            return;
        }
        
        if (this.portfolioHistory.length === 0) {
            console.log('No portfolio history data, creating initial entry');
            // Create an initial history entry if we have portfolio data
            if (this.portfolio.length > 0) {
                this.ensureHistoryEntry();
            } else {
                // Clear the chart if no data
                this.charts.history.data.labels = [];
                this.charts.history.data.datasets[0].data = [];
                this.charts.history.data.datasets[1].data = [];
                this.charts.history.update();
                return;
            }
        }

        console.log('Updating history chart with portfolio history:', this.portfolioHistory.length, 'entries');

        const labels = this.portfolioHistory.map(entry => {
            const date = new Date(entry.timestamp);
            return date.toLocaleString();
        });
        const portfolioValues = this.portfolioHistory.map(entry => entry.totalValue);
        const totalCosts = this.portfolioHistory.map(entry => entry.totalCost);

        this.charts.history.data.labels = labels;
        this.charts.history.data.datasets[0].data = portfolioValues;
        this.charts.history.data.datasets[1].data = totalCosts;
        this.charts.history.update();
        
        console.log('History chart updated');
    }

    updateHistoryChartWithSnapshots() {
        if (!this.charts.history) {
            console.log('History chart not initialized');
            return;
        }
        
        if (!this.snapshotHistory || this.snapshotHistory.length === 0) {
            console.log('No snapshot history data available');
            return;
        }

        console.log('Updating history chart with snapshot data:', this.snapshotHistory.length, 'entries');
        console.log('First few snapshot entries:', this.snapshotHistory.slice(0, 3));

        const labels = this.snapshotHistory.map(entry => {
            const date = new Date(entry.timestamp);
            return date.toLocaleString();
        });
        const portfolioValues = this.snapshotHistory.map(entry => entry.totalValue);
        const totalCosts = this.snapshotHistory.map(entry => entry.totalCost);

        this.charts.history.data.labels = labels;
        this.charts.history.data.datasets[0].data = portfolioValues;
        this.charts.history.data.datasets[1].data = totalCosts;
        this.charts.history.update();
        
        console.log('History chart updated with snapshot data');
    }

    formatPrice(price) {
        if (price === 0) return '$0.00';
        
        // For very small prices (< $0.01), show more decimal places
        if (price < 0.01) {
            return '$' + price.toFixed(6);
        }
        
        // For small prices (< $1), show 4 decimal places
        if (price < 1) {
            return '$' + price.toFixed(4);
        }
        
        // For medium prices (< $100), show 3 decimal places
        if (price < 100) {
            return '$' + price.toFixed(3);
        }
        
        // For larger prices, show 2 decimal places
        return '$' + price.toFixed(2);
    }

    calculatePnlPercent(currentValue, totalCost) {
        if (totalCost > 0) {
            return ((currentValue - totalCost) / totalCost) * 100;
        } else {
            // Free coins (totalCost = 0) - P&L % is not applicable
            return 'N/A';
        }
    }

    formatAmount(amount) {
        // If the amount is a whole number, don't show decimal places
        if (amount % 1 === 0) {
            return amount.toString();
        }
        // Otherwise, show up to 8 decimal places, removing trailing zeros
        return amount.toFixed(8).replace(/\.?0+$/, '');
    }

    getCoinName(symbol) {
        const coinNames = {
            'BTC': 'Bitcoin',
            'ETH': 'Ethereum',
            'ADA': 'Cardano',
            'DOT': 'Polkadot',
            'LINK': 'Chainlink',
            'LTC': 'Litecoin',
            'BCH': 'Bitcoin Cash',
            'XRP': 'Ripple',
            'DOGE': 'Dogecoin',
            'SHIB': 'Shiba Inu',
            'MATIC': 'Polygon',
            'AVAX': 'Avalanche',
            'SOL': 'Solana',
            'ATOM': 'Cosmos',
            'ALGO': 'Algorand',
            'VET': 'VeChain',
            'FIL': 'Filecoin',
            'TRX': 'TRON',
            'EOS': 'EOS',
            'XLM': 'Stellar',
            'HUMA': 'Huma Finance',
            'S': 'Sonic',
            'ENA': 'Ethena',
            'HYPE': 'Hyperliquid'
        };
        return coinNames[symbol] || symbol;
    }

    clearForm() {
        document.getElementById('addCoinForm').reset();
    }

    showMessage(text, type) {
        // Remove existing messages
        const existingMessage = document.querySelector('.message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create new message
        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            ${text}
        `;

        // Insert at the top of main content
        const mainContent = document.querySelector('.main-content');
        mainContent.insertBefore(message, mainContent.firstChild);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, 5000);
    }

    async loadPortfolio() {
        try {
            console.log('Fetching portfolio from /api/portfolio...');
            const response = await fetch('/api/portfolio');
            console.log('Response status:', response.status);
            
            if (response.ok) {
                this.portfolio = await response.json();
                console.log('Portfolio data received:', this.portfolio);
                console.log('Portfolio length:', this.portfolio.length);
            } else {
                console.error('Failed to load portfolio:', response.statusText);
                this.portfolio = [];
            }
        } catch (error) {
            console.error('Error loading portfolio:', error);
            this.portfolio = [];
        }
    }

    async loadLatestTotalCost() {
        try {
            console.log('Fetching latest totalCost from snapshot...');
            const response = await fetch('/api/latest-totalcost');
            
            if (response.ok) {
                const data = await response.json();
                if (data.totalCost !== null && data.totalCost !== undefined) {
                    this.portfolioTotalCost = data.totalCost;
                    console.log('Latest totalCost loaded from snapshot:', this.portfolioTotalCost);
                } else {
                    console.log('No totalCost found in snapshots, using individual coin costs');
                    this.portfolioTotalCost = undefined;
                }
            } else {
                console.error('Failed to load latest totalCost:', response.statusText);
                this.portfolioTotalCost = undefined;
            }
        } catch (error) {
            console.error('Error loading latest totalCost:', error);
            this.portfolioTotalCost = undefined;
        }
    }

    async savePortfolio() {
        try {
            console.log('Saving portfolio:', this.portfolio);
            const response = await fetch('/api/portfolio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.portfolio)
            });
            
            console.log('Save response status:', response.status);
            const responseData = await response.json();
            console.log('Save response data:', responseData);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            console.log('Portfolio saved successfully');
        } catch (error) {
            console.error('Error saving portfolio:', error);
            this.showMessage('Error saving portfolio data. Please try again.', 'error');
        }
    }

    async saveTransaction(transactionData) {
        try {
            const transaction = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                symbol: transactionData.symbol,
                amount: transactionData.amount,
                purchasePrice: transactionData.purchasePrice,
                totalCost: transactionData.totalCost,
                note: transactionData.note || '',
                type: transactionData.type || 'buy'
            };

            console.log('Recording transaction:', transaction);
            
            const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(transaction)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            console.log('Transaction recorded successfully');
        } catch (error) {
            console.error('Error saving transaction:', error);
            // Don't show error message to user as it's not critical for portfolio functionality
        }
    }

    async exportData() {
        try {
            const response = await fetch('/api/export');
            if (response.ok) {
                const data = await response.json();
                const dataStr = JSON.stringify(data, null, 2);
                const dataBlob = new Blob([dataStr], {type: 'application/json'});
                
                const link = document.createElement('a');
                link.href = URL.createObjectURL(dataBlob);
                link.download = `crypto-portfolio-${new Date().toISOString().split('T')[0]}.json`;
                link.click();
                
                this.showMessage('Portfolio data exported successfully!', 'success');
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error exporting portfolio:', error);
            this.showMessage('Error exporting portfolio data. Please try again.', 'error');
        }
    }

    async importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (data.portfolio && Array.isArray(data.portfolio)) {
                    this.portfolio = data.portfolio;
                    await this.savePortfolio();
                    this.renderPortfolio();
                    this.updateTotalValue();
                    this.updateCharts();
                    this.loadCryptoPrices();
                    this.showMessage('Portfolio data imported successfully!', 'success');
                } else {
                    this.showMessage('Invalid portfolio file format.', 'error');
                }
            } catch (error) {
                this.showMessage('Error reading portfolio file. Please check the file format.', 'error');
            }
        };
        reader.readAsText(file);
        
        // Reset the file input
        event.target.value = '';
    }

    // Snapshot functionality
    async createSnapshot(description = 'Manual Snapshot') {
        if (this.portfolio.length === 0) {
            this.showMessage('Cannot create snapshot: Portfolio is empty', 'error');
            return;
        }

        // Fetch projects data to include in snapshot
        let projectsData = { projects: [] };
        try {
            const response = await fetch('/api/projects');
            if (response.ok) {
                projectsData = await response.json();
            }
        } catch (error) {
            console.warn('Could not fetch projects for snapshot:', error);
        }

        const snapshot = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            description: description,
            portfolio: JSON.parse(JSON.stringify(this.portfolio)), // Deep copy
            cryptoData: JSON.parse(JSON.stringify(this.cryptoData)), // Deep copy
            projects: projectsData.projects || [], // Include projects data
            totalValue: this.calculateTotalValue(),
            totalCost: this.calculateTotalCost(),
            totalPnl: this.calculateTotalPnl(),
            totalPnlPercent: this.calculateTotalPnlPercent()
        };

        this.portfolioSnapshots.unshift(snapshot); // Add to beginning
        
        // Keep only last 50 snapshots to prevent data bloat
        if (this.portfolioSnapshots.length > 50) {
            this.portfolioSnapshots = this.portfolioSnapshots.slice(0, 50);
        }

        this.savePortfolioSnapshots();
        this.showMessage(`Snapshot "${description}" created successfully!`, 'success');
        console.log('Snapshot created:', snapshot);
    }

    async shouldCreateAutoSnapshot() {
        try {
            const response = await fetch('/api/snapshots');
            if (!response.ok) {
                return true; // If can't fetch snapshots, allow creation
            }
            
            const snapshots = await response.json();
            if (!snapshots || snapshots.length === 0) {
                return true; // No snapshots exist, allow creation
            }
            
            // Find the most recent snapshot by timestamp
            const latestSnapshot = snapshots.reduce((latest, current) => {
                return new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest;
            });
            
            const lastSnapshotTime = new Date(latestSnapshot.timestamp).getTime();
            const now = Date.now();
            const oneHourMs = 60 * 60 * 1000; // 1 hour in milliseconds
            
            // Only allow automatic snapshot if more than 1 hour has passed
            return (now - lastSnapshotTime) > oneHourMs;
        } catch (error) {
            console.error('Error checking last snapshot time:', error);
            return true; // If error, allow creation
        }
    }

    async loadPortfolioSnapshots() {
        try {
            // Load from localStorage first
            const saved = localStorage.getItem('cryptoPortfolioSnapshots');
            this.portfolioSnapshots = saved ? JSON.parse(saved) : [];
            console.log('Portfolio snapshots loaded from localStorage:', this.portfolioSnapshots.length, 'snapshots');
            
            // Also load from server for history chart
            try {
                const response = await fetch('/api/snapshots');
                
                if (response.ok) {
                    const serverSnapshots = await response.json();
                    
                    if (serverSnapshots && serverSnapshots.length > 0) {
                        // Sort snapshots by timestamp
                        serverSnapshots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                        
                        // Create portfolio value history from snapshots
                        this.snapshotHistory = serverSnapshots.map(snapshot => ({
                            timestamp: snapshot.timestamp,
                            totalValue: snapshot.totalValue || 0,
                            totalCost: snapshot.totalCost || 0,
                            totalPnl: snapshot.totalPnl || 0,
                            totalPnlPercent: snapshot.totalPnlPercent || 0,
                            description: snapshot.description || 'Snapshot'
                        }));
                        
                        console.log('Snapshot history loaded from server:', this.snapshotHistory.length, 'entries');
                        
                        // Update the history chart with snapshot data
                        this.updateHistoryChartWithSnapshots();
                    }
                }
            } catch (serverError) {
                console.log('Could not load snapshots from server:', serverError);
            }
            
        } catch (error) {
            console.error('Error loading portfolio snapshots:', error);
            this.portfolioSnapshots = [];
        }
    }

    async savePortfolioSnapshots() {
        try {
            // Save to localStorage
            localStorage.setItem('cryptoPortfolioSnapshots', JSON.stringify(this.portfolioSnapshots));
            console.log('Portfolio snapshots saved to localStorage');
            
            // Also save to server/snapshot folder
            await this.saveSnapshotsToServer();
        } catch (error) {
            console.error('Error saving portfolio snapshots:', error);
        }
    }

    async saveSnapshotsToServer() {
        try {
            // Only send the latest snapshot to avoid duplicates
            const latestSnapshot = this.portfolioSnapshots[0]; // First item is the newest
            
            if (!latestSnapshot) {
                console.log('No snapshots to save');
                return;
            }
            
            const response = await fetch('/api/snapshots', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify([latestSnapshot]) // Send only the latest snapshot as an array
            });
            
            if (response.ok) {
                console.log('Latest snapshot saved to server');
            } else {
                console.error('Failed to save snapshot to server:', response.statusText);
            }
        } catch (error) {
            console.error('Error saving snapshot to server:', error);
        }
    }

    async loadLatestSnapshot() {
        try {
            console.log('Attempting to load latest snapshot...');
            const response = await fetch('/api/snapshots');
            
            if (!response.ok) {
                console.log('No snapshots available on server');
                return false;
            }
            
            const snapshots = await response.json();
            
            if (!snapshots || snapshots.length === 0) {
                console.log('No snapshots found');
                return false;
            }
            
            // Find the most recent snapshot by timestamp
            const latestSnapshot = snapshots.reduce((latest, current) => {
                return new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest;
            });
            
            console.log('Latest snapshot found:', latestSnapshot.description, 'from', latestSnapshot.timestamp);
            
            // Load the snapshot data
            this.portfolio = JSON.parse(JSON.stringify(latestSnapshot.portfolio));
            this.cryptoData = JSON.parse(JSON.stringify(latestSnapshot.cryptoData || {}));
            
            console.log('Portfolio loaded from snapshot:', this.portfolio);
            console.log('Portfolio length after snapshot load:', this.portfolio.length);
            console.log('About to save portfolio...');
            
            // Create a history entry from the snapshot data
            const currentTotalValue = this.calculateTotalValue();
            const currentTotalCost = this.calculateTotalCost();
            const currentTotalPnl = this.calculateTotalPnl();
            const currentTotalPnlPercent = this.calculateTotalPnlPercent();
            
            // Add the snapshot data as a history entry
            const historyEntry = {
                timestamp: latestSnapshot.timestamp,
                totalValue: latestSnapshot.totalValue || currentTotalValue,
                totalCost: latestSnapshot.totalCost || currentTotalCost,
                totalPnl: latestSnapshot.totalPnl || currentTotalPnl,
                totalPnlPercent: latestSnapshot.totalPnlPercent || currentTotalPnlPercent,
                portfolio: [...this.portfolio]
            };
            
            // Add to portfolio history
            this.portfolioHistory = [historyEntry];
            localStorage.setItem('cryptoPortfolioHistory', JSON.stringify(this.portfolioHistory));
            console.log('Portfolio history created from snapshot');
            
            // Save the loaded portfolio to the main portfolio file
            await this.savePortfolio();
            
            console.log('Portfolio save completed');
            
            console.log('Latest snapshot loaded successfully with history data');
            this.showMessage(`Loaded latest snapshot: "${latestSnapshot.description}"`, 'success');
            
            return true;
        } catch (error) {
            console.error('Error loading latest snapshot:', error);
            return false;
        }
    }

    calculateTotalValue() {
        return this.portfolio.reduce((total, coin) => {
            const currentPrice = this.cryptoData[coin.symbol]?.price || 0;
            return total + (coin.amount * currentPrice);
        }, 0);
    }

    calculateTotalCost() {
        // If portfolioTotalCost is set, use that; otherwise calculate from individual coins
        if (this.portfolioTotalCost !== undefined) {
            return this.portfolioTotalCost;
        }
        return this.portfolio.reduce((total, coin) => total + coin.totalCost, 0);
    }

    calculateTotalPnl() {
        return this.calculateTotalValue() - this.calculateTotalCost();
    }

    calculateTotalPnlPercent() {
        const totalCost = this.calculateTotalCost();
        return totalCost > 0 ? (this.calculateTotalPnl() / totalCost) * 100 : 0;
    }

    async setTotalCost(newTotalCost) {
        if (this.portfolio.length === 0) {
            this.showMessage('Cannot set total cost: Portfolio is empty', 'error');
            return;
        }

        if (newTotalCost < 0) {
            this.showMessage('Total cost cannot be negative', 'error');
            return;
        }

        // Store the new total cost as a portfolio property (not individual coin totalCost)
        this.portfolioTotalCost = newTotalCost;

        // Create a snapshot with the new total cost
        const snapshot = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            description: `Total Cost Set to ${this.formatPrice(newTotalCost)}`,
            portfolio: JSON.parse(JSON.stringify(this.portfolio)), // Deep copy - keep individual totalCost values unchanged
            cryptoData: JSON.parse(JSON.stringify(this.cryptoData)), // Deep copy
            totalValue: this.calculateTotalValue(),
            totalCost: newTotalCost, // Use the new total cost
            totalPnl: this.calculateTotalValue() - newTotalCost,
            totalPnlPercent: newTotalCost > 0 ? ((this.calculateTotalValue() - newTotalCost) / newTotalCost) * 100 : 0
        };

        // Add to snapshots
        this.portfolioSnapshots.unshift(snapshot);
        
        // Keep only last 50 snapshots to prevent data bloat
        if (this.portfolioSnapshots.length > 50) {
            this.portfolioSnapshots = this.portfolioSnapshots.slice(0, 50);
        }

        // Save snapshots to server
        await this.savePortfolioSnapshots();

        // Update display
        this.renderPortfolio();
        this.updateTotalValue();
        this.updateCharts();
        
        this.showMessage(`Total cost set to ${this.formatPrice(newTotalCost)} and snapshot saved`, 'success');
    }

    async resetTotalCost() {
        if (this.portfolio.length === 0) {
            this.showMessage('Cannot reset total cost: Portfolio is empty', 'error');
            return;
        }

        // Clear the portfolioTotalCost property to use individual coin totalCost values
        this.portfolioTotalCost = undefined;

        // Create a snapshot showing the reset
        const snapshot = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            description: 'Total Cost Reset to Individual Coin Values',
            portfolio: JSON.parse(JSON.stringify(this.portfolio)), // Deep copy
            cryptoData: JSON.parse(JSON.stringify(this.cryptoData)), // Deep copy
            totalValue: this.calculateTotalValue(),
            totalCost: this.portfolio.reduce((total, coin) => total + coin.totalCost, 0),
            totalPnl: this.calculateTotalPnl(),
            totalPnlPercent: this.calculateTotalPnlPercent()
        };

        // Add to snapshots
        this.portfolioSnapshots.unshift(snapshot);
        
        // Keep only last 50 snapshots to prevent data bloat
        if (this.portfolioSnapshots.length > 50) {
            this.portfolioSnapshots = this.portfolioSnapshots.slice(0, 50);
        }

        // Save snapshots to server
        await this.savePortfolioSnapshots();

        // Update display
        this.renderPortfolio();
        this.updateTotalValue();
        this.updateCharts();
        
        this.showMessage('Total cost reset to individual coin values and snapshot saved', 'success');
    }

    ensureHistoryEntry() {
        // If we have portfolio data but no history, create a history entry
        if (this.portfolio.length > 0 && this.portfolioHistory.length === 0) {
            console.log('Creating initial history entry for portfolio chart');
            const currentTotalValue = this.calculateTotalValue();
            const currentTotalCost = this.calculateTotalCost();
            const currentTotalPnl = this.calculateTotalPnl();
            const currentTotalPnlPercent = this.calculateTotalPnlPercent();
            
            this.savePortfolioHistory(currentTotalValue, currentTotalCost, currentTotalPnl, currentTotalPnlPercent);
        }
    }

    showSnapshotsModal() {
        // Create modal if it doesn't exist
        let modal = document.getElementById('snapshotsModal');
        if (!modal) {
            modal = this.createSnapshotsModal();
        }

        this.updateSnapshotsModal();
        modal.style.display = 'block';
    }

    createSnapshotsModal() {
        const modal = document.createElement('div');
        modal.id = 'snapshotsModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-camera"></i> Portfolio Snapshots</h2>
                    <span class="close" onclick="this.closest('.modal').style.display='none'">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="snapshots-controls">
                        <button id="createNewSnapshot" class="btn btn-primary">
                            <i class="fas fa-plus"></i> Create New Snapshot
                        </button>
                        <button id="exportSnapshots" class="btn btn-secondary">
                            <i class="fas fa-download"></i> Export Snapshots
                        </button>
                        <button id="clearSnapshots" class="btn btn-danger">
                            <i class="fas fa-trash"></i> Clear All Snapshots
                        </button>
                    </div>
                    <div class="snapshots-list" id="snapshotsList">
                        <!-- Snapshots will be listed here -->
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Bind modal events
        document.getElementById('createNewSnapshot').addEventListener('click', async () => {
            const description = prompt('Enter snapshot description:', 'Manual Snapshot');
            if (description) {
                await this.createSnapshot(description);
                this.updateSnapshotsModal();
            }
        });

        document.getElementById('exportSnapshots').addEventListener('click', () => {
            this.exportSnapshots();
        });

        document.getElementById('clearSnapshots').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all snapshots? This action cannot be undone.')) {
                this.portfolioSnapshots = [];
                this.savePortfolioSnapshots();
                this.updateSnapshotsModal();
                this.showMessage('All snapshots cleared', 'success');
            }
        });

        return modal;
    }

    updateSnapshotsModal() {
        const snapshotsList = document.getElementById('snapshotsList');
        if (!snapshotsList) return;

        if (this.portfolioSnapshots.length === 0) {
            snapshotsList.innerHTML = `
                <div class="empty-snapshots">
                    <i class="fas fa-camera"></i>
                    <h3>No Snapshots Yet</h3>
                    <p>Create your first snapshot to capture your portfolio state!</p>
                </div>
            `;
            return;
        }

        snapshotsList.innerHTML = this.portfolioSnapshots.map(snapshot => {
            const date = new Date(snapshot.timestamp);
            const timeAgo = this.getTimeAgo(date);
            
            return `
                <div class="snapshot-item">
                    <div class="snapshot-header">
                        <div class="snapshot-info">
                            <h4>${snapshot.description}</h4>
                            <span class="snapshot-time">${date.toLocaleString()} (${timeAgo})</span>
                        </div>
                        <div class="snapshot-actions">
                            <button class="btn btn-sm btn-primary" onclick="portfolio.restoreSnapshot('${snapshot.id}')">
                                <i class="fas fa-undo"></i> Restore
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="portfolio.compareSnapshot('${snapshot.id}')">
                                <i class="fas fa-balance-scale"></i> Compare
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="portfolio.deleteSnapshot('${snapshot.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="snapshot-summary">
                        <div class="summary-item">
                            <span class="label">Total Value:</span>
                            <span class="value">${this.formatPrice(snapshot.totalValue)}</span>
                        </div>
                        <div class="summary-item">
                            <span class="label">Total Cost:</span>
                            <span class="value">${this.formatPrice(snapshot.totalCost)}</span>
                        </div>
                        <div class="summary-item">
                            <span class="label">P&L:</span>
                            <span class="value ${snapshot.totalPnl >= 0 ? 'positive' : 'negative'}">
                                ${snapshot.totalPnl >= 0 ? '+' : ''}$${snapshot.totalPnl.toFixed(2)}
                            </span>
                        </div>
                        <div class="summary-item">
                            <span class="label">P&L %:</span>
                            <span class="value ${snapshot.totalPnlPercent >= 0 ? 'positive' : 'negative'}">
                                ${snapshot.totalPnlPercent >= 0 ? '+' : ''}${snapshot.totalPnlPercent.toFixed(2)}%
                            </span>
                        </div>
                        <div class="summary-item">
                            <span class="label">Coins:</span>
                            <span class="value">${snapshot.portfolio.length}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    restoreSnapshot(snapshotId) {
        const snapshot = this.portfolioSnapshots.find(s => s.id === snapshotId);
        if (!snapshot) {
            this.showMessage('Snapshot not found', 'error');
            return;
        }

        if (confirm(`Are you sure you want to restore snapshot "${snapshot.description}"? This will replace your current portfolio.`)) {
            this.portfolio = JSON.parse(JSON.stringify(snapshot.portfolio));
            this.cryptoData = JSON.parse(JSON.stringify(snapshot.cryptoData));
            
            this.savePortfolio();
            this.renderPortfolio();
            // Apply default sort to current value (descending) after restoring snapshot
            this.sortPortfolio('currentValue', 'desc');
            this.updateTotalValue();
            this.updateCharts();
            this.showMessage(`Portfolio restored from snapshot "${snapshot.description}"`, 'success');
            
            // Close modal
            document.getElementById('snapshotsModal').style.display = 'none';
        }
    }

    compareSnapshot(snapshotId) {
        const snapshot = this.portfolioSnapshots.find(s => s.id === snapshotId);
        if (!snapshot) {
            this.showMessage('Snapshot not found', 'error');
            return;
        }

        this.showComparisonModal(snapshot);
    }

    showComparisonModal(snapshot) {
        // Create comparison modal
        let modal = document.getElementById('comparisonModal');
        if (!modal) {
            modal = this.createComparisonModal();
        }

        this.updateComparisonModal(snapshot);
        modal.style.display = 'block';
    }

    createComparisonModal() {
        const modal = document.createElement('div');
        modal.id = 'comparisonModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content comparison-modal">
                <div class="modal-header">
                    <h2><i class="fas fa-balance-scale"></i> Portfolio Comparison</h2>
                    <span class="close" onclick="this.closest('.modal').style.display='none'">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="comparison-content" id="comparisonContent">
                        <!-- Comparison will be shown here -->
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        return modal;
    }

    updateComparisonModal(snapshot) {
        const comparisonContent = document.getElementById('comparisonContent');
        if (!comparisonContent) return;

        const currentTotalValue = this.calculateTotalValue();
        const currentTotalCost = this.calculateTotalCost();
        const currentTotalPnl = this.calculateTotalPnl();
        const currentTotalPnlPercent = this.calculateTotalPnlPercent();

        const valueChange = currentTotalValue - snapshot.totalValue;
        const costChange = currentTotalCost - snapshot.totalCost;
        const pnlChange = currentTotalPnl - snapshot.totalPnl;
        const pnlPercentChange = currentTotalPnlPercent - snapshot.totalPnlPercent;

        comparisonContent.innerHTML = `
            <div class="comparison-summary">
                <div class="comparison-item">
                    <h3>Total Value</h3>
                    <div class="comparison-values">
                        <div class="value-item">
                            <span class="label">Snapshot:</span>
                            <span class="value">${this.formatPrice(snapshot.totalValue)}</span>
                        </div>
                        <div class="value-item">
                            <span class="label">Current:</span>
                            <span class="value">${this.formatPrice(currentTotalValue)}</span>
                        </div>
                        <div class="value-item change">
                            <span class="label">Change:</span>
                            <span class="value ${valueChange >= 0 ? 'positive' : 'negative'}">
                                ${valueChange >= 0 ? '+' : ''}${this.formatPrice(valueChange).substring(1)}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="comparison-item">
                    <h3>Total Cost</h3>
                    <div class="comparison-values">
                        <div class="value-item">
                            <span class="label">Snapshot:</span>
                            <span class="value">${this.formatPrice(snapshot.totalCost)}</span>
                        </div>
                        <div class="value-item">
                            <span class="label">Current:</span>
                            <span class="value">${this.formatPrice(currentTotalCost)}</span>
                        </div>
                        <div class="value-item change">
                            <span class="label">Change:</span>
                            <span class="value ${costChange >= 0 ? 'positive' : 'negative'}">
                                ${costChange >= 0 ? '+' : ''}${this.formatPrice(costChange).substring(1)}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="comparison-item">
                    <h3>P&L</h3>
                    <div class="comparison-values">
                        <div class="value-item">
                            <span class="label">Snapshot:</span>
                            <span class="value ${snapshot.totalPnl >= 0 ? 'positive' : 'negative'}">
                                ${snapshot.totalPnl >= 0 ? '+' : ''}$${snapshot.totalPnl.toFixed(2)}
                            </span>
                        </div>
                        <div class="value-item">
                            <span class="label">Current:</span>
                            <span class="value ${currentTotalPnl >= 0 ? 'positive' : 'negative'}">
                                ${currentTotalPnl >= 0 ? '+' : ''}$${currentTotalPnl.toFixed(2)}
                            </span>
                        </div>
                        <div class="value-item change">
                            <span class="label">Change:</span>
                            <span class="value ${pnlChange >= 0 ? 'positive' : 'negative'}">
                                ${pnlChange >= 0 ? '+' : ''}$${pnlChange.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="comparison-item">
                    <h3>P&L %</h3>
                    <div class="comparison-values">
                        <div class="value-item">
                            <span class="label">Snapshot:</span>
                            <span class="value ${snapshot.totalPnlPercent >= 0 ? 'positive' : 'negative'}">
                                ${snapshot.totalPnlPercent >= 0 ? '+' : ''}${snapshot.totalPnlPercent.toFixed(2)}%
                            </span>
                        </div>
                        <div class="value-item">
                            <span class="label">Current:</span>
                            <span class="value ${currentTotalPnlPercent >= 0 ? 'positive' : 'negative'}">
                                ${currentTotalPnlPercent >= 0 ? '+' : ''}${currentTotalPnlPercent.toFixed(2)}%
                            </span>
                        </div>
                        <div class="value-item change">
                            <span class="label">Change:</span>
                            <span class="value ${pnlPercentChange >= 0 ? 'positive' : 'negative'}">
                                ${pnlPercentChange >= 0 ? '+' : ''}${pnlPercentChange.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    deleteSnapshot(snapshotId) {
        if (confirm('Are you sure you want to delete this snapshot?')) {
            this.portfolioSnapshots = this.portfolioSnapshots.filter(s => s.id !== snapshotId);
            this.savePortfolioSnapshots();
            this.updateSnapshotsModal();
            this.showMessage('Snapshot deleted', 'success');
        }
    }

    exportSnapshots() {
        try {
            const dataStr = JSON.stringify(this.portfolioSnapshots, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `portfolio-snapshots-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            
            this.showMessage('Snapshots exported successfully!', 'success');
        } catch (error) {
            console.error('Error exporting snapshots:', error);
            this.showMessage('Error exporting snapshots. Please try again.', 'error');
        }
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
        return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
    }
}

// Initialize the portfolio tracker when the page loads
let portfolio;
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    portfolio = new CryptoPortfolio();
    console.log('Portfolio instance created:', portfolio);
    
    // Test if we can access the portfolio data after a delay
    setTimeout(() => {
        console.log('=== DEBUG TEST ===');
        console.log('Portfolio instance:', portfolio);
        console.log('Portfolio data:', portfolio.portfolio);
        console.log('Portfolio length:', portfolio.portfolio ? portfolio.portfolio.length : 'undefined');
        
        const tbody = document.getElementById('portfolioBody');
        console.log('portfolioBody element:', tbody);
        
        if (portfolio.portfolio && portfolio.portfolio.length > 0) {
            console.log('Portfolio has data, manually calling renderPortfolio...');
            portfolio.renderPortfolio();
        } else {
            console.log('Portfolio is empty or undefined');
        }
        console.log('=== END DEBUG TEST ===');
    }, 2000);
});
