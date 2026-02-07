// Load saved preference
chrome.storage.local.get(['enableOnAllSites', 'tradeHistory'], (result) => {
    if (result.enableOnAllSites) {
        document.getElementById('enableAllSites').checked = true;
    }
    if (result.tradeHistory) {
        displayLiveTrades(result.tradeHistory);
    }
});

// Listen for storage changes to update live trades in real-time
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.tradeHistory) {
        displayLiveTrades(changes.tradeHistory.newValue);
    }
});

document.getElementById('enableAllSites').addEventListener('change', (e) => {
    chrome.storage.local.set({ enableOnAllSites: e.target.checked });

    // Notify content script to show/hide panel
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'togglePanel',
                enabled: e.target.checked
            });
        }
    });
});

document.getElementById('openTradingSite').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.tradingview.com' });
});

document.getElementById('uploadCSV').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

document.getElementById('clearHistory').addEventListener('click', () => {
    chrome.storage.local.set({ tradeHistory: [] });
    // UI update handled by storage listener
});

document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const csv = event.target.result;
            const trades = parseCSV(csv);

            chrome.storage.local.set({ trades: trades }, () => {
                fetchRecommendations(trades);
            });
        };
        reader.readAsText(file);
    }
});

function displayLiveTrades(trades) {
    const container = document.getElementById('tradeList');
    if (!trades || trades.length === 0) {
        container.innerHTML = '<p style="color: #787b86; font-style: italic;">Waiting for live trades...</p>';
        return;
    }

    // Sort by timestamp descending (newest first)
    // Assuming Timestamp is ISO string
    const sortedTrades = [...trades].sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

    let html = '';
    sortedTrades.forEach(trade => {
        const actionColor = trade['Buy/sell'].toLowerCase() === 'buy' ? '#2ed573' : '#ff4757';
        const date = new Date(trade.Timestamp).toLocaleTimeString();

        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div>
                    <span style="font-weight: bold; color: ${actionColor}; margin-right: 5px;">${trade['Buy/sell'].toUpperCase()}</span>
                    <span style="color: #fff;">${trade.Asset}</span>
                </div>
                <div style="font-size: 11px; color: #787b86;">${date}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function parseCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const timestampIdx = headers.findIndex(h => h.includes('timestamp'));
    const actionIdx = headers.findIndex(h => h.includes('buy') || h.includes('sell') || h.includes('action'));
    const assetIdx = headers.findIndex(h => h.includes('asset') || h.includes('symbol'));
    const plIdx = headers.findIndex(h => h.includes('p/l') || h.includes('pnl') || h.includes('profit'));

    if (timestampIdx === -1 || actionIdx === -1 || assetIdx === -1 || plIdx === -1) {
        alert('CSV must contain: Timestamp, Buy/sell, Asset, P/L');
        return [];
    }

    const trades = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length > Math.max(timestampIdx, actionIdx, assetIdx, plIdx)) {
            trades.push({
                'Timestamp': values[timestampIdx],
                'Buy/sell': values[actionIdx],
                'Asset': values[assetIdx],
                'P/L': parseFloat(values[plIdx]) || 0
            });
        }
    }

    return trades;
}

async function fetchRecommendations(trades) {
    const contentDiv = document.getElementById('recommendationsContent');
    const container = document.getElementById('recommendations');

    container.style.display = 'block';
    contentDiv.innerHTML = '<p style="color: #787b86;">Asking Gemini for advice...</p>';

    try {
        console.log('Fetching recommendations for', trades.length, 'trades...');
        // Correct endpoint is /api/analyze-csv
        const response = await fetch('http://127.0.0.1:5001/api/analyze-csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trades: trades })
        });

        const data = await response.json();

        if (data.error) {
            console.error('Gemini API Error:', data.error);
            contentDiv.innerHTML = `<p style="color: #ff4757;">AI Coach Error: ${data.error}</p>`;
            return;
        }

        // Save analysis to storage for background.js to use (Discipline Score)
        chrome.storage.local.set({ geminiAnalysis: data });

        // Handle new response format (coaching_insight vs recommendations)
        if (data.coaching_insight) {
            // Convert single insight to recommendations format for display
            const recs = [{
                priority: 'High',
                bias: data.primary_bias || 'General Insight',
                recommendation: data.coaching_insight
            }];
            displayRecommendations(recs);
        } else if (data.recommendations && data.recommendations.length > 0) {
            displayRecommendations(data.recommendations);
        } else {
            contentDiv.innerHTML = '<p>No specific recommendations found.</p>';
        }
    } catch (error) {
        console.error('Error fetching recommendations:', error);
        contentDiv.innerHTML = '<p style="color: #ff4757;">Error connecting to AI Coach. Ensure Flask app is running.</p>';
    }
}

function displayRecommendations(recs) {
    const container = document.getElementById('recommendationsContent');
    let html = '';

    recs.forEach(rec => {
        const color = rec.priority === 'High' ? '#ff4757' : rec.priority === 'Medium' ? '#ffa502' : '#2ed573';
        html += `
            <div style="margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px; border-left: 3px solid ${color};">
                <div style="font-weight: bold; color: ${color}; margin-bottom: 4px; font-size: 12px; display: flex; justify-content: space-between;">
                    <span>${rec.bias} (${rec.priority})</span>
                    <span style="font-size: 10px; opacity: 0.7;">✨ Gemini AI</span>
                </div>
                <div style="line-height: 1.4;">${rec.recommendation}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}
