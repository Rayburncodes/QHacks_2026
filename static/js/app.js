let tradingData = [];

document.getElementById('fileInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const csv = event.target.result;
            parseCSV(csv);
        };
        reader.readAsText(file);
    }
});

function parseCSV(csv) {
    const lines = csv.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    // Find column indices
    const timestampIdx = headers.findIndex(h => h.toLowerCase().includes('timestamp'));
    const actionIdx = headers.findIndex(h => h.toLowerCase().includes('buy') || h.toLowerCase().includes('sell') || h.toLowerCase().includes('action'));
    const assetIdx = headers.findIndex(h => h.toLowerCase().includes('asset') || h.toLowerCase().includes('symbol'));
    const plIdx = headers.findIndex(h => h.toLowerCase().includes('p/l') || h.toLowerCase().includes('pnl') || h.toLowerCase().includes('profit'));

    if (timestampIdx === -1 || actionIdx === -1 || assetIdx === -1 || plIdx === -1) {
        alert('CSV must contain columns: Timestamp, Buy/sell (or Action), Asset (or Symbol), P/L (or PnL or Profit)');
        return;
    }

    tradingData = [];
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            const values = lines[i].split(',').map(v => v.trim());
            tradingData.push({
                'Timestamp': values[timestampIdx],
                'Buy/sell': values[actionIdx],
                'Asset': values[assetIdx],
                'P/L': parseFloat(values[plIdx]) || 0
            });
        }
    }

    if (tradingData.length > 0) {
        analyzeData();
    }
}

async function loadMockData() {
    showLoading();
    try {
        const response = await fetch('/api/mock-data');
        const data = await response.json();
        tradingData = data.trades;
        analyzeData();
    } catch (error) {
        console.error('Error loading mock data:', error);
        alert('Error loading mock data');
        hideLoading();
    }
}

async function analyzeData() {
    showLoading();
    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ trades: tradingData })
        });

        const results = await response.json();

        if (results.error) {
            alert('Error: ' + results.error);
            hideLoading();
            return;
        }

        displayResults(results);
        hideLoading();
    } catch (error) {
        console.error('Error analyzing data:', error);
        alert('Error analyzing data: ' + error.message);
        hideLoading();
    }
}

function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.classList.remove('hidden');
    resultsDiv.classList.add('animate-fade-in');

    // Display summary
    displaySummary(results.summary, results.statistics);

    // Display biases
    displayBias('overtradingCard', results.overtrading, 'Overtrading');
    displayBias('lossAversionCard', results.loss_aversion, 'Loss Aversion');
    displayBias('revengeTradingCard', results.revenge_trading, 'Revenge Trading');

    // Display recommendations
    displayRecommendations(results.recommendations);

    // Display charts
    displayCharts(results);
}

function displaySummary(summary, stats) {
    // Check if new metrics exist (fallback to 0 if not yet implemented/returned)
    const humanTax = stats.human_tax !== undefined ? stats.human_tax : 0;
    const propsperityProj = stats.prosperity_projection !== undefined ? stats.prosperity_projection : 0;

    const summaryHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-gray-50 p-4 rounded-xl text-center hover:bg-gray-100 transition">
                <div class="text-3xl font-bold text-primary">${stats.total_trades}</div>
                <div class="text-gray-500 text-sm mt-1">Total Trades</div>
            </div>
            <div class="bg-gray-50 p-4 rounded-xl text-center hover:bg-gray-100 transition">
                <div class="text-3xl font-bold text-primary">$${stats.total_pnl.toFixed(2)}</div>
                <div class="text-gray-500 text-sm mt-1">Total P&L</div>
            </div>
             <div class="bg-gray-50 p-4 rounded-xl text-center hover:bg-gray-100 transition">
                <div class="text-3xl font-bold text-danger">$${humanTax.toFixed(2)}</div>
                <div class="text-gray-500 text-sm mt-1">Human Tax (Cost of Bias)</div>
            </div>
            <div class="bg-gray-50 p-4 rounded-xl text-center hover:bg-gray-100 transition">
                <div class="text-3xl font-bold text-success">$${propsperityProj.toFixed(2)}</div>
                <div class="text-gray-500 text-sm mt-1">10yr Prosperity Project</div>
            </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
             <div class="bg-gray-50 p-4 rounded-xl text-center hover:bg-gray-100 transition">
                <div class="text-2xl font-bold text-gray-700">${stats.win_rate}%</div>
                <div class="text-gray-500 text-sm mt-1">Win Rate</div>
            </div>
            <div class="bg-gray-50 p-4 rounded-xl text-center hover:bg-gray-100 transition">
                <div class="text-2xl font-bold text-gray-700">${summary.bias_count}</div>
                <div class="text-gray-500 text-sm mt-1">Biases Detected</div>
            </div>
        </div>

        ${summary.biases_detected.length > 0 ?
            `<div class="mt-6 p-4 bg-red-50 rounded-lg border border-red-100">
                <p class="text-danger font-bold flex items-center">
                    <span class="mr-2">⚠️</span> Detected Biases: ${summary.biases_detected.join(', ')}
                </p>
            </div>` :
            `<div class="mt-6 p-4 bg-green-50 rounded-lg border border-green-100">
                <p class="text-success font-bold flex items-center">
                    <span class="mr-2">✓</span> No significant biases detected
                </p>
            </div>`
        }
    `;
    document.getElementById('summaryContent').innerHTML = summaryHTML;
}

function displayBias(cardId, bias, title) {
    const card = document.getElementById(cardId);
    const content = card.querySelector('.bias-content');

    if (!bias.detected) {
        content.innerHTML = `
            <span class="inline-block px-3 py-1 rounded-full text-sm font-bold mb-4 bg-green-100 text-success">Not Detected</span>
            <p class="text-gray-500 mt-2 text-sm">${bias.description || 'No significant patterns detected.'}</p>
        `;
        return;
    }

    let severityClass = '';
    let scoreColorClass = '';

    switch (bias.severity.toLowerCase()) {
        case 'high':
            severityClass = 'bg-red-100 text-danger';
            scoreColorClass = 'bg-gradient-to-r from-danger to-red-400';
            break;
        case 'moderate':
            severityClass = 'bg-orange-100 text-warning';
            scoreColorClass = 'bg-gradient-to-r from-warning to-orange-400';
            break;
        case 'low':
            severityClass = 'bg-green-100 text-success';
            scoreColorClass = 'bg-gradient-to-r from-success to-green-400';
            break;
    }

    let metricsHTML = '';
    if (bias.metrics) {
        metricsHTML = '<ul class="mt-4 space-y-2">';
        for (const [key, value] of Object.entries(bias.metrics)) {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            metricsHTML += `<li class="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                <span class="text-gray-600">${label}:</span> 
                <strong class="text-gray-800">${value}</strong>
            </li>`;
        }
        metricsHTML += '</ul>';
    }

    content.innerHTML = `
        <span class="inline-block px-3 py-1 rounded-full text-sm font-bold mb-4 ${severityClass}">${bias.severity} Severity</span>
        <div class="w-full h-4 bg-gray-200 rounded-full overflow-hidden mb-4">
            <div class="h-full rounded-full transition-all duration-500 ${scoreColorClass}" style="width: ${bias.score}%"></div>
        </div>
        <p class="text-gray-600 mb-4 text-sm leading-relaxed">${bias.description}</p>
        ${metricsHTML}
    `;
}

function displayRecommendations(recommendations) {
    const container = document.getElementById('recommendationsContent');

    if (recommendations.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic">No specific recommendations at this time. Keep up the good trading discipline!</p>';
        return;
    }

    let html = '';
    recommendations.forEach(rec => {
        let borderClass = '';
        let bgClass = '';

        switch (rec.priority.toLowerCase()) {
            case 'high':
                borderClass = 'border-l-danger';
                bgClass = 'bg-red-50';
                break;
            case 'medium':
                borderClass = 'border-l-warning';
                bgClass = 'bg-orange-50';
                break;
            case 'low':
                borderClass = 'border-l-success';
                bgClass = 'bg-green-50';
                break;
            default:
                borderClass = 'border-l-primary';
                bgClass = 'bg-gray-50';
        }

        html += `
            <div class="p-4 rounded-r-lg mb-4 border-l-4 ${borderClass} ${bgClass} shadow-sm hover:shadow-md transition">
                <h4 class="text-primary font-bold mb-1">${rec.bias} - ${rec.priority} Priority</h4>
                <p class="text-gray-700">${rec.recommendation}</p>
            </div>
        `;
    });

    container.innerHTML = html;
}

function displayCharts(results) {
    const container = document.getElementById('chartsContainer');

    // P/L Over Time Chart
    const plTrace = {
        x: Array.from({ length: tradingData.length }, (_, i) => i + 1),
        y: tradingData.map(t => t['P/L']),
        type: 'scatter',
        mode: 'lines+markers',
        name: 'P/L',
        marker: {
            color: tradingData.map(t => t['P/L'] >= 0 ? '#2ed573' : '#ff4757'),
            size: 8
        },
        line: { color: '#667eea', width: 2 }
    };

    const plLayout = {
        title: 'P/L Over Time',
        xaxis: { title: 'Trade Number' },
        yaxis: { title: 'Profit/Loss ($)' },
        hovermode: 'closest',
        plot_bgcolor: 'rgba(0,0,0,0)',
        paper_bgcolor: 'rgba(0,0,0,0)',
        font: { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
    };

    Plotly.newPlot('plChart', [plTrace], plLayout, { responsive: true });

    // Bias Scores Chart
    const biasScores = [
        { name: 'Overtrading', score: results.overtrading.score },
        { name: 'Loss Aversion', score: results.loss_aversion.score },
        { name: 'Revenge Trading', score: results.revenge_trading.score }
    ];

    const biasTrace = {
        x: biasScores.map(b => b.name),
        y: biasScores.map(b => b.score),
        type: 'bar',
        marker: {
            color: biasScores.map(b => {
                if (b.score < 30) return '#2ed573';
                if (b.score < 60) return '#ffa502';
                return '#ff4757';
            })
        }
    };

    const biasLayout = {
        title: 'Bias Detection Scores',
        xaxis: { title: 'Bias Type' },
        yaxis: { title: 'Severity Score (0-100)', range: [0, 100] },
        plot_bgcolor: 'rgba(0,0,0,0)',
        paper_bgcolor: 'rgba(0,0,0,0)',
        font: { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
    };

    Plotly.newPlot('biasChart', [biasTrace], biasLayout, { responsive: true });

    // Win/Loss Distribution
    const winLossData = {
        x: ['Wins', 'Losses'],
        y: [results.statistics.winning_trades, results.statistics.losing_trades],
        type: 'bar',
        marker: {
            color: ['#2ed573', '#ff4757']
        }
    };

    const winLossLayout = {
        title: 'Win/Loss Distribution',
        xaxis: { title: 'Trade Outcome' },
        yaxis: { title: 'Number of Trades' },
        plot_bgcolor: 'rgba(0,0,0,0)',
        paper_bgcolor: 'rgba(0,0,0,0)',
        font: { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
    };

    Plotly.newPlot('winLossChart', [winLossData], winLossLayout, { responsive: true });

    container.innerHTML = `
        <div class="mb-8 p-4 bg-gray-50 rounded-xl" id="plChart"></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="p-4 bg-gray-50 rounded-xl" id="biasChart"></div>
            <div class="p-4 bg-gray-50 rounded-xl" id="winLossChart"></div>
        </div>
    `;
}

function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('results').classList.add('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

// Tab Switching Logic
function switchTab(tabName) {
    const vaultView = document.getElementById('viewVault');
    const liveView = document.getElementById('viewLive');
    const tabVault = document.getElementById('tabVault');
    const tabLive = document.getElementById('tabLive');

    if (tabName === 'vault') {
        vaultView.classList.remove('hidden');
        liveView.classList.add('hidden');

        tabVault.classList.add('bg-gray-100', 'text-primary'); // Active style
        tabVault.classList.remove('text-gray-500');

        tabLive.classList.remove('bg-gray-100', 'text-primary');
        tabLive.classList.add('text-gray-500');
    } else {
        vaultView.classList.add('hidden');
        liveView.classList.remove('hidden');

        tabLive.classList.add('bg-gray-100', 'text-primary'); // Active style
        tabLive.classList.remove('text-gray-500');

        tabVault.classList.remove('bg-gray-100', 'text-primary');
        tabVault.classList.add('text-gray-500');
    }
}
