// Investments page: every investable position (bank cash, brokerage/retirement holdings, crypto)
// merged into assets by asset-groups.js, with each asset's share and the accounts holding it.

// Auth handling (same as the other pages): keep the token from ?auth= and send it on every fetch
(function initAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth');
    if (authToken) {
        localStorage.setItem('profolio_auth', authToken);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        const token = localStorage.getItem('profolio_auth');
        if (token) {
            options.headers = options.headers || {};
            options.headers['X-Auth-Token'] = token;
        }
        return originalFetch(url, options);
    };

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

// Theme Toggle
(function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

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

(function initInvestments() {
    // Fixed order: the allocation bar stacks in this order and each category keeps its color.
    const CATEGORIES = [
        { id: 'equity', name: 'Stocks & Funds' },
        { id: 'crypto', name: 'Crypto' },
        { id: 'cash', name: 'Cash' },
        { id: 'other', name: 'Other' }
    ];

    const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const qty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
    const pct = value => `${value.toFixed(1)}%`;

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    // Positions: one per holding per account, in a single shape for traditional and crypto sources.
    function traditionalPositions(balances) {
        const positions = [];
        for (const a of balances.accounts) {
            if (!a.isAsset || a.balance <= 0 || EXCLUDED_ACCOUNT_TYPES.includes(a.type)) continue;
            const account = { account: a.name, institution: a.institution || (a.isManual ? 'Manual' : '') };
            if ((a.holdings || []).length > 0) {
                a.holdings.forEach(h => positions.push({ ...account, ticker: h.ticker, name: h.name, type: h.type, quantity: h.quantity, value: h.value }));
            } else if (a.type === 'depository') {
                positions.push({ ...account, ticker: null, name: a.subtype || 'Bank balance', type: 'Cash', quantity: null, value: a.balance });
            } else {
                // An investment account Monarch reports only as a balance (e.g. an HSA with no holdings feed)
                positions.push({ ...account, ticker: null, name: a.subtype || 'Account balance', type: null, quantity: null, value: a.balance, unitemized: true });
            }
        }
        return positions;
    }

    function cryptoPositions(portfolio, prices) {
        return portfolio
            .filter(h => prices[h.symbol])
            .map(h => ({
                account: h.note ? `Crypto · ${h.note}` : 'Crypto',
                institution: 'Profolio',
                ticker: h.symbol,
                name: h.symbol,
                type: 'Crypto',
                quantity: h.amount,
                value: h.amount * prices[h.symbol].price
            }));
    }

    function matchGroup(position) {
        const ticker = (position.ticker || '').toUpperCase();
        return ASSET_GROUPS.find(g =>
            (g.tickers || []).includes(ticker) ||
            (g.holdingTypes || []).includes(position.type) ||
            (g.namePatterns || []).some(re => re.test(position.name || ''))
        );
    }

    function assetOf(position) {
        const group = matchGroup(position);
        if (group) return { key: `group:${group.id}`, name: group.name, category: group.category, grouped: true };
        if (position.unitemized) return { key: 'unitemized', name: 'Not itemized', category: 'other', grouped: true };
        if (position.type === 'Crypto') return { key: `crypto:${position.ticker}`, name: position.ticker, category: 'crypto' };
        const id = position.ticker || position.name;
        return { key: `ticker:${id}`, name: id, category: HOLDING_TYPE_CATEGORIES[position.type] || 'other' };
    }

    // Within an asset, one entry per account: an account holding two members of a group (SPAXX and
    // FRSXX, say) shows once with both tickers. Quantity only makes sense for a single ticker.
    function mergeByAccount(positions) {
        const byAccount = new Map();
        for (const p of positions) {
            const key = `${p.institution}|${p.account}`;
            const merged = byAccount.get(key);
            if (!merged) {
                byAccount.set(key, { ...p, tickers: p.ticker ? [p.ticker] : [] });
                continue;
            }
            merged.value += p.value;
            if (p.ticker && !merged.tickers.includes(p.ticker)) merged.tickers.push(p.ticker);
            merged.quantity = merged.tickers.length === 1 && p.quantity != null && merged.quantity != null
                ? merged.quantity + p.quantity
                : null;
        }
        return [...byAccount.values()];
    }

    // Dust (zero-balance savings, a few cents of sweep fund) would only pad the account lists.
    const MIN_POSITION_VALUE = 1;

    function buildAssets(positions) {
        const assets = new Map();
        for (const p of positions.filter(p => p.value >= MIN_POSITION_VALUE)) {
            const info = assetOf(p);
            if (!assets.has(info.key)) assets.set(info.key, { ...info, value: 0, positions: [] });
            const asset = assets.get(info.key);
            asset.value += p.value;
            asset.positions.push(p);
        }
        return [...assets.values()]
            .map(a => ({ ...a, positions: mergeByAccount(a.positions).sort((x, y) => y.value - x.value) }))
            .sort((a, b) => b.value - a.value);
    }

    // Under the asset name: the member tickers for a group, the security name for a single holding.
    function subtitleOf(asset) {
        if (!asset.grouped) {
            const name = asset.positions[0].name;
            return name && name !== asset.name ? name : '';
        }
        const labels = [...new Set(asset.positions.flatMap(p => (p.tickers.length > 0 ? p.tickers : [p.name])))];
        return labels.length > 5 ? `${labels.slice(0, 5).join(', ')} +${labels.length - 5}` : labels.join(', ');
    }

    function renderSummary(assets, total) {
        const largest = assets[0];
        const tiles = [
            ['Investable Assets', money.format(total), 'accent'],
            ['Assets', String(assets.length), ''],
            ['Largest', largest ? `${largest.name} · ${pct((largest.value / total) * 100)}` : '—', '']
        ];
        document.getElementById('investmentsSummary').innerHTML = tiles.map(([label, value, cls]) => `
            <div class="traditional-tile">
                <span class="total-label">${label}</span>
                <span class="traditional-tile-value ${cls}">${escapeHtml(value)}</span>
            </div>`).join('');
    }

    // Two-ring donut: categories inside, their assets outside in steps of the category's hue.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const DONUT_CENTER = 120;
    const RINGS = { inner: 70, outer: 97 };
    const SEGMENT_GAP = 2;
    // Assets below this share fold into one slice per category, so the outer ring has no slivers.
    const MIN_SLICE_SHARE = 0.01;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const compactMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });

    function categoryTotals(assets) {
        return CATEGORIES
            .map(c => ({ ...c, value: assets.filter(a => a.category === c.id).reduce((sum, a) => sum + a.value, 0) }))
            .filter(c => c.value > 0);
    }

    // Outer slices in category order, largest first within each; the smallest fold into "N smaller".
    function outerSlices(assets, byCategory, total) {
        return byCategory.flatMap(c => {
            const members = assets.map((a, index) => ({ ...a, index })).filter(a => a.category === c.id);
            const shown = members.filter(a => a.value / total >= MIN_SLICE_SHARE);
            const folded = members.filter(a => a.value / total < MIN_SLICE_SHARE);
            const slices = shown.map(a => ({ name: a.name, value: a.value, category: c.id, index: a.index }));
            if (folded.length === 1) slices.push({ name: folded[0].name, value: folded[0].value, category: c.id, index: folded[0].index });
            if (folded.length > 1) slices.push({ name: `${folded.length} smaller`, value: folded.reduce((s, a) => s + a.value, 0), category: c.id, folded: true });
            return slices.map((s, rank) => ({ ...s, rank, of: slices.length }));
        });
    }

    // Lighter steps of the category hue toward the surface, so the outer ring reads as part of its category.
    function outerColor(slice) {
        const strength = slice.folded ? 40 : 100 - (slice.of > 1 ? (slice.rank / (slice.of - 1)) * 45 : 0);
        return `color-mix(in oklab, var(--cat-${slice.category}) ${strength}%, var(--bg-secondary))`;
    }

    function arcSegment(radius, start, fraction, color) {
        const circumference = 2 * Math.PI * radius;
        const length = Math.max(fraction * circumference - SEGMENT_GAP, 0.5);
        const el = document.createElementNS(SVG_NS, 'circle');
        el.setAttribute('cx', DONUT_CENTER);
        el.setAttribute('cy', DONUT_CENTER);
        el.setAttribute('r', radius);
        el.setAttribute('transform', `rotate(-90 ${DONUT_CENTER} ${DONUT_CENTER})`);
        el.setAttribute('class', 'donut-segment');
        el.style.color = color;
        el.style.strokeDashoffset = -(start * circumference + SEGMENT_GAP / 2);
        el.dataset.dash = `${length} ${circumference}`;
        el.style.strokeDasharray = reducedMotion ? el.dataset.dash : `0 ${circumference}`;
        return el;
    }

    function renderAllocation(assets, total) {
        const byCategory = categoryTotals(assets);
        const svg = document.getElementById('allocationDonut');
        const center = document.getElementById('donutCenter');
        const legend = document.getElementById('allocationLegend');
        svg.innerHTML = '';

        const segments = [];
        const addRing = (radius, items, colorOf) => {
            let start = 0;
            for (const item of items) {
                const fraction = item.value / total;
                const el = arcSegment(radius, start, fraction, colorOf(item));
                const title = document.createElementNS(SVG_NS, 'title');
                title.textContent = `${item.name}: ${money.format(item.value)} (${pct(fraction * 100)})`;
                el.appendChild(title);
                svg.appendChild(el);
                segments.push({ el, item, ring: radius });
                start += fraction;
            }
        };
        addRing(RINGS.inner, byCategory.map(c => ({ ...c, category: c.id })), c => `var(--cat-${c.id})`);
        addRing(RINGS.outer, outerSlices(assets, byCategory, total), outerColor);

        const showCenter = (label, value, sub) => {
            center.innerHTML = `
                <span class="donut-center-label">${escapeHtml(label)}</span>
                <span class="donut-center-value">${escapeHtml(value)}</span>
                <span class="donut-center-sub">${escapeHtml(sub)}</span>`;
        };
        const showTotal = () => showCenter('Investable', compactMoney.format(total), `${assets.length} assets`);

        const focus = match => {
            svg.classList.add('has-focus');
            segments.forEach(s => s.el.classList.toggle('focus', match(s)));
        };
        const clearFocus = () => {
            svg.classList.remove('has-focus');
            segments.forEach(s => s.el.classList.remove('focus'));
            showTotal();
        };
        const focusCategory = id => {
            const c = byCategory.find(x => x.id === id);
            focus(s => s.item.category === id);
            showCenter(c.name, money.format(c.value), `${pct((c.value / total) * 100)} of investable`);
        };

        segments.forEach(s => {
            const isCategory = s.ring === RINGS.inner;
            s.el.addEventListener('pointerenter', () => {
                if (isCategory) return focusCategory(s.item.id);
                focus(o => o === s || (o.ring === RINGS.inner && o.item.id === s.item.category));
                showCenter(s.item.name, money.format(s.item.value), `${pct((s.item.value / total) * 100)} of investable`);
            });
            s.el.addEventListener('pointerleave', clearFocus);
            if (!isCategory && s.item.index !== undefined) {
                s.el.classList.add('clickable');
                s.el.addEventListener('click', () => openAsset(s.item.index));
            }
        });

        legend.innerHTML = byCategory.map(c => `
            <div class="allocation-legend-item" data-category="${c.id}">
                <span class="allocation-swatch cat-${c.id}"></span>
                <span class="allocation-legend-name">${escapeHtml(c.name)}</span>
                <span class="allocation-legend-value">${money.format(c.value)} · ${pct((c.value / total) * 100)}</span>
            </div>`).join('');
        legend.querySelectorAll('.allocation-legend-item').forEach(item => {
            item.addEventListener('pointerenter', () => focusCategory(item.dataset.category));
            item.addEventListener('pointerleave', clearFocus);
        });

        showTotal();
        if (!reducedMotion) {
            // Sweep the slices in one after another once the empty rings have painted.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                segments.forEach((s, i) => {
                    s.el.style.transitionDelay = `${i * 30}ms`;
                    s.el.style.strokeDasharray = s.el.dataset.dash;
                    // The stagger is only for the entrance; hover feedback must be immediate.
                    s.el.addEventListener('transitionend', e => {
                        if (e.propertyName === 'stroke-dasharray') s.el.style.transitionDelay = '';
                    });
                });
            }));
        }
    }

    function openAsset(index) {
        const row = document.querySelector(`tr.investment-asset[data-index="${index}"]`);
        if (!row) return;
        if (!row.classList.contains('open')) row.click();
        row.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
        row.classList.remove('flash');
        void row.offsetWidth;
        row.classList.add('flash');
    }

    function positionRows(asset, index) {
        return asset.positions.map(p => {
            const tickers = p.tickers.filter(t => t !== asset.name).join(', ');
            const detail = [tickers, p.quantity != null ? qty.format(p.quantity) : null].filter(Boolean).join(' · ');
            return `
            <tr class="investment-position" data-asset="${index}" hidden>
                <td data-label="Account">
                    <div class="coin-info">
                        <span class="coin-symbol">${escapeHtml(p.account)}</span>
                        <span class="coin-name">${escapeHtml(p.institution)}</span>
                    </div>
                </td>
                <td data-label="Value">${money.format(p.value)}</td>
                <td data-label="Of Asset" class="coin-name">${pct((p.value / asset.value) * 100)}</td>
                <td data-label="Holding" class="coin-name">${escapeHtml(detail)}</td>
            </tr>`;
        }).join('');
    }

    function renderTable(assets, total) {
        const body = document.getElementById('investmentsBody');
        if (assets.length === 0) {
            body.innerHTML = '<tr><td colspan="4" class="traditional-empty">No investments to show.</td></tr>';
            return;
        }

        // Bars are scaled to the largest asset so small shares stay visible; the label carries the true share.
        const maxShare = assets[0].value / total;
        body.innerHTML = assets.map((asset, index) => {
            const share = asset.value / total;
            const accounts = asset.positions.length;
            return `
            <tr class="investment-asset expandable" data-index="${index}">
                <td data-label="Asset">
                    <div class="coin-info">
                        <span class="coin-symbol"><i class="fas fa-chevron-right traditional-chevron"></i> ${escapeHtml(asset.name)}</span>
                        <span class="coin-name">${escapeHtml(subtitleOf(asset))}</span>
                    </div>
                </td>
                <td data-label="Value">${money.format(asset.value)}</td>
                <td data-label="Share">
                    <div class="share-cell">
                        <div class="share-track"><div class="share-fill cat-${asset.category}" style="width: ${(share / maxShare) * 100}%"></div></div>
                        <span class="share-label">${pct(share * 100)}</span>
                    </div>
                </td>
                <td data-label="Accounts" class="coin-name">${accounts} account${accounts > 1 ? 's' : ''}</td>
            </tr>${positionRows(asset, index)}`;
        }).join('');

        body.querySelectorAll('tr.investment-asset').forEach(row => {
            row.addEventListener('click', () => {
                const open = row.classList.toggle('open');
                body.querySelectorAll(`tr.investment-position[data-asset="${row.dataset.index}"]`)
                    .forEach(r => { r.hidden = !open; });
            });
        });
    }

    function renderNotices(notices) {
        const el = document.getElementById('investmentsAlert');
        el.hidden = notices.length === 0;
        el.innerHTML = notices.map(m => `<div><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(m)}</div>`).join('');
    }

    async function getJson(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        return response.json();
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const [balances, portfolio, prices] = await Promise.allSettled([
            getJson('/api/balances'),
            getJson('/api/portfolio'),
            getJson('/api/crypto-prices')
        ]);

        const notices = [];
        let positions = [];
        if (balances.status === 'fulfilled' && balances.value) {
            positions = positions.concat(traditionalPositions(balances.value));
        } else {
            notices.push('Traditional balances are unavailable, so only crypto is shown.');
        }
        if (portfolio.status === 'fulfilled' && prices.status === 'fulfilled') {
            positions = positions.concat(cryptoPositions(portfolio.value, prices.value));
            const unpriced = [...new Set(portfolio.value.filter(h => !prices.value[h.symbol]).map(h => h.symbol))];
            if (unpriced.length > 0) notices.push(`No price for ${unpriced.join(', ')}; left out of the totals.`);
        } else {
            notices.push('Crypto prices could not be loaded, so crypto is left out of the totals.');
        }

        const assets = buildAssets(positions);
        const total = assets.reduce((sum, a) => sum + a.value, 0);
        renderNotices(notices);
        renderSummary(assets, total);
        renderAllocation(assets, total);
        renderTable(assets, total);
    });
})();
