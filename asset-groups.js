// How the Investments page merges holdings into assets. A holding joins the first group that lists
// its ticker (crypto symbol) or whose name pattern matches its name; anything unmatched is an asset
// of its own, keyed by ticker. Add a ticker here when a new fund should fold into an existing asset.
// `accounts` (Monarch display names) places accounts that have a balance but no holdings; once such an
// account reports holdings, those are matched by ticker like any other.
const ASSET_GROUPS = [
    {
        id: 'cash',
        name: 'Cash',
        category: 'cash',
        // Money market sweeps, brokerage cash and stablecoins. Bank (depository) balances always count as cash.
        tickers: ['SPAXX', 'FDRXX', 'FRSXX', 'FZFXX', 'VMFXX', 'SWVXX', 'USD-USD', 'USDC', 'USDT', 'DAI', 'USDE', 'PYUSD'],
        holdingTypes: ['Cash']
    },
    {
        id: 'sp500',
        name: 'S&P 500',
        category: 'equity',
        tickers: ['VOO', 'SPY', 'IVV', 'SPLG', 'VFIAX', 'VFINX', 'VINIX', 'VIIIX', 'FXAIX', 'SWPPX'],
        // Collective trusts in 401(k)s often have no ticker, e.g. "Instl 500 Idx Tr Unit D".
        namePatterns: [/\b500 (Idx|Index)\b/i, /S&P 500/i],
        // Accounts Monarch reports only as a balance, known to be invested in an S&P 500 fund
        accounts: ['Human Interest 401K', 'HSA Optum Bank investments']
    },
    {
        id: 'nasdaq100',
        name: 'Nasdaq 100',
        category: 'equity',
        tickers: ['QQQ', 'QQQM']
    }
];

// Category per Monarch holding type, for holdings no group claims
const HOLDING_TYPE_CATEGORIES = {
    'Cash': 'cash',
    'Stock': 'equity',
    'ETF': 'equity',
    'Mutual Fund': 'equity'
};

// Account types that are not investments (the house) and never appear on the page. Liabilities are
// dropped too, so the shares add up to the investable total.
const EXCLUDED_ACCOUNT_TYPES = ['real_estate', 'vehicle', 'valuables'];
