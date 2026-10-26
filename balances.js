// Traditional assets panel: renders the latest balances pushed by the NAS sync
// (monarch_money/profolio_sync.py -> POST /api/balances). Loaded after script.js,
// whose fetch wrapper adds the auth token.

(function initTraditionalAssets() {
    // A linked account not refreshed by its provider for this long gets a warning.
    const STALE_ACCOUNT_DAYS = 3;
    // The NAS pushes daily; no push for this long means the sync itself is down.
    const STALE_PUSH_HOURS = 36;

    let balances = null;
    let cryptoTotal = null;

    const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
    const qty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function ageDays(iso) {
        return iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity;
    }

    function formatAge(iso) {
        if (!iso) return 'never';
        const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
        if (hours < 1) return 'just now';
        if (hours < 48) return `${Math.floor(hours)}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }

    // Manual accounts (house value, projected mortgage) have no provider, so age is not a warning sign.
    function isStale(account) {
        return !account.isManual && (account.needsReconnect || ageDays(account.lastSyncedAt) > STALE_ACCOUNT_DAYS);
    }

    // Gain over the holdings whose cost basis is known; `missing` counts the ones left out.
    function gainOf(account) {
        const known = (account.holdings || []).filter(h => h.basis != null);
        if (known.length === 0) return null;
        const basis = known.reduce((sum, h) => sum + h.basis, 0);
        const value = known.reduce((sum, h) => sum + h.value, 0);
        return {
            gain: value - basis,
            percent: basis > 0 ? ((value - basis) / basis) * 100 : null,
            missing: account.holdings.length - known.length
        };
    }

    function pnlBadge(gain, percent) {
        const cls = gain > 0 ? 'positive' : gain < 0 ? 'negative' : 'neutral';
        const pct = percent == null ? '' : ` (${gain >= 0 ? '+' : ''}${percent.toFixed(1)}%)`;
        return `<span class="pnl ${cls}">${gain >= 0 ? '+' : ''}${money.format(gain)}${pct}</span>`;
    }

    function renderSummary() {
        const el = document.getElementById('traditionalSummary');
        if (!balances) { el.innerHTML = ''; return; }

        let assets = 0, liabilities = 0;
        balances.accounts.forEach(a => { if (a.balance >= 0) assets += a.balance; else liabilities -= a.balance; });
        const net = assets - liabilities;
        const tiles = [
            ['Assets', money.format(assets), ''],
            ['Liabilities', money.format(liabilities), liabilities > 0 ? 'negative' : ''],
            ['Net', money.format(net), ''],
            ['Net Worth incl. Crypto', cryptoTotal == null ? '…' : money.format(net + cryptoTotal), 'accent']
        ];
        el.innerHTML = tiles.map(([label, value, cls]) => `
            <div class="traditional-tile">
                <span class="total-label">${label}</span>
                <span class="traditional-tile-value ${cls}">${value}</span>
            </div>`).join('');
    }

    function holdingRows(account) {
        return (account.holdings || [])
            .slice()
            .sort((a, b) => b.value - a.value)
            .map(h => {
                const gain = h.basis == null ? null : h.value - h.basis;
                const detail = [h.quantity != null ? qty.format(h.quantity) : null, h.price != null ? `@ ${price.format(h.price)}` : null]
                    .filter(Boolean).join(' ');
                return `
                <tr class="traditional-holding" data-account="${escapeHtml(account.id)}" hidden>
                    <td data-label="Holding"><span class="holding-ticker">${escapeHtml(h.ticker || '—')}</span> <span class="coin-name">${escapeHtml(h.name)}</span></td>
                    <td data-label="Quantity" class="coin-name">${escapeHtml(detail)}</td>
                    <td data-label="Value">${money.format(h.value)}</td>
                    <td data-label="Gain/Loss">${gain == null ? '<span class="coin-name">no basis</span>' : pnlBadge(gain, h.basis > 0 ? (gain / h.basis) * 100 : null)}</td>
                    <td></td>
                </tr>`;
            }).join('');
    }

    function renderTable() {
        const body = document.getElementById('traditionalBody');
        if (!balances) {
            body.innerHTML = '<tr><td colspan="5" class="traditional-empty">No balances yet — waiting for the first NAS sync.</td></tr>';
            return;
        }

        const accounts = balances.accounts.slice().sort((a, b) => b.balance - a.balance);
        body.innerHTML = accounts.map(a => {
            const g = gainOf(a);
            const expandable = (a.holdings || []).length > 0;
            const stale = isStale(a);
            return `
            <tr class="traditional-account${expandable ? ' expandable' : ''}" data-id="${escapeHtml(a.id)}">
                <td data-label="Account">
                    <div class="coin-info">
                        <span class="coin-symbol">${expandable ? '<i class="fas fa-chevron-right traditional-chevron"></i> ' : ''}${escapeHtml(a.name)}</span>
                        <span class="coin-name">${escapeHtml(a.institution || (a.isManual ? 'Manual' : ''))}</span>
                    </div>
                </td>
                <td data-label="Type" class="coin-name">${escapeHtml(a.subtype || a.type || '')}</td>
                <td data-label="Balance" class="${a.balance < 0 ? 'traditional-liability' : ''}">${money.format(a.balance)}</td>
                <td data-label="Gain/Loss" title="${g && g.missing ? `Excludes ${g.missing} holding(s) with no cost basis` : ''}">${g ? pnlBadge(g.gain, g.percent) + (g.missing ? ' <span class="coin-name">*</span>' : '') : ''}</td>
                <td data-label="Last Synced" class="${stale ? 'traditional-stale' : 'coin-name'}" title="${escapeHtml(a.lastSyncedAt || '')}">
                    ${stale ? '<i class="fas fa-exclamation-triangle"></i> ' : ''}${formatAge(a.lastSyncedAt)}
                </td>
            </tr>${holdingRows(a)}`;
        }).join('');

        body.querySelectorAll('tr.expandable').forEach(row => {
            row.addEventListener('click', () => {
                const open = row.classList.toggle('open');
                body.querySelectorAll(`tr.traditional-holding[data-account="${CSS.escape(row.dataset.id)}"]`)
                    .forEach(h => { h.hidden = !open; });
            });
        });
    }

    function renderAlert() {
        const el = document.getElementById('traditionalAlert');
        const messages = [];
        if (balances) {
            const pushAge = (Date.now() - new Date(balances.receivedAt || balances.asOf).getTime()) / 3600000;
            if (pushAge > STALE_PUSH_HOURS) {
                messages.push(`No update from the NAS sync for ${formatAge(balances.receivedAt || balances.asOf).replace(' ago', '')} — check the profolio-sync container.`);
            }
            const stale = balances.accounts.filter(isStale);
            if (stale.length > 0) {
                messages.push(`${stale.length} account${stale.length > 1 ? 's need' : ' needs'} attention (disconnected or not synced in over ${STALE_ACCOUNT_DAYS} days): ${stale.map(a => escapeHtml(a.name)).join(', ')}. Reconnect in Monarch.`);
            }
        }
        el.hidden = messages.length === 0;
        el.innerHTML = messages.map(m => `<div><i class="fas fa-exclamation-triangle"></i> ${m}</div>`).join('');
    }

    function render() {
        renderSummary();
        renderTable();
        renderAlert();
    }

    document.addEventListener('crypto-total', event => {
        cryptoTotal = event.detail;
        renderSummary();
    });

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            const response = await fetch('/api/balances');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            balances = await response.json();
        } catch (error) {
            console.error('Could not load traditional balances:', error);
        }
        render();
    });
})();
