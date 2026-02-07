// TradingView Observer
class TradingViewObserver {
    constructor() {
        this.lastTrade = null;
        this.observer = null;
        this.init();
    }

    init() {
        console.log('🏦 ZenTrade: Initializing TradingView Observer...');
        // this.showToast("ZenTrade Protocol Active 🟢"); // Might be hidden
        this.startObserving();
        this.startPolling();
        this.createDebugButton();
        this.processedTexts = new Set();

        // Explicit log to console
        console.log("%c 🏦 ZenTrade Protocol LOADED ", "background: #2ed573; color: white; font-size: 14px; padding: 4px;");
    }

    startPolling() {
        // Polling fallback: Scans visible text every 2 seconds
        setInterval(() => {
            const bodyText = document.body.innerText;
            // Look for keywords
            if (bodyText.includes("Order filled") || bodyText.includes("Position opened")) {
                // Find the specific line
                const lines = bodyText.split('\n');
                for (const line of lines) {
                    if ((line.includes("Order filled") || line.includes("Position opened")) &&
                        !this.processedTexts.has(line)) {

                        console.log("🏦 ZenTrade Polling: Found new notification:", line);
                        this.handleTradeEvent({ innerText: line });
                        this.processedTexts.add(line);

                        // Clear cache periodically to prevent memory leak
                        if (this.processedTexts.size > 100) this.processedTexts.clear();
                    }
                }
            }
        }, 2000);
    }

    showToast(message, color = '#2ed573') {
        const toast = document.createElement('div');
        toast.innerText = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 2147483647; /* Max Z-Index */
            background: ${color};
            color: white;
            padding: 12px 24px;
            border-radius: 30px;
            font-family: system-ui, sans-serif;
            font-size: 16px;
            font-weight: bold;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
            border: 2px solid white;
        `;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.style.opacity = 1);
        setTimeout(() => {
            toast.style.opacity = 0;
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    createDebugButton() {
        const btn = document.createElement('button');
        btn.innerHTML = "🐞 TEST ZenTrade";
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 2147483647; /* Max Z-Index */
            background: #2962ff;
            color: white;
            border: 2px solid white;
            padding: 12px 16px;
            border-radius: 8px;
            font-family: system-ui, sans-serif;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 5px 20px rgba(0,0,0,0.4);
            transition: transform 0.1s;
        `;

        btn.onmouseover = () => btn.style.transform = "scale(1.05)";
        btn.onmouseout = () => btn.style.transform = "scale(1)";

        btn.onclick = () => {
            // alert("ZenTrade: Simulating Trade..."); // Undeniable feedback
            this.showToast("🚀 Sending Simulated Trade...");

            const mockText = `Order filled: Buy ${Math.floor(Math.random() * 10)} BTCUSD at ${50000 + Math.random() * 100}`;
            this.handleTradeEvent({ innerText: mockText }, true);
        };

        document.body.appendChild(btn);
    }

    startObserving() {
        // Observer for notifications/toasts
        this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                // Handle added nodes
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        this.checkNotification(node);
                    }
                });

                // Handle text changes (characterData)
                if (mutation.type === 'characterData') {
                    this.checkNotification(mutation.target.parentElement);
                }
            });
        });

        // Monitor body for everything
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        console.log('🏦 ZenTrade: Listening for Paper Trading events...');
    }

    checkNotification(node) {
        const text = node.innerText || "";

        // TradingView "Order filled" or "Position opened"
        if (text.includes("Order filled") || text.includes("Position opened") || text.includes("Buy") || text.includes("Sell")) {
            // We need to be careful not to trigger on every "Buy" text in the UI
            // But for Paper Trading notifications, they are usually distinct.
            // Let's check if it looks like a notification toast.
            // Often they have high z-index or fixed position, but tough to check in a mutation observer quickly.

            // Stricter check:
            if (text.includes("Order filled") || (text.includes("Position") && (text.includes("long") || text.includes("short")))) {
                console.log("🏦 ZenTrade: Potential Notification Detected:", text);
                this.handleTradeEvent(node);
            }
        }
    }

    async handleTradeEvent(node, isDebug = false) {
        const text = isDebug ? node.innerText : node.innerText;
        console.log("🏦 ZenTrade: Processing Event Text:", text);

        let action = "buy";
        if (text.toLowerCase().includes("sell") || text.toLowerCase().includes("sold") || text.toLowerCase().includes("short")) {
            action = "sell";
        }

        // Asset matching
        const assetMatch = text.match(/\b[A-Z0-9]{3,}\b/);
        // Exclude common words like "BUY", "SELL", "FILLED", "ORDER"
        const ignored = ["BUY", "SELL", "FILLED", "ORDER", "POSITION", "OPENED", "MARKET", "LIMIT"];
        let asset = "Unknown";

        if (assetMatch) {
            const potential = assetMatch[0];
            if (!ignored.includes(potential)) {
                asset = potential;
            }
        }

        // Price matching
        const priceMatch = text.match(/@\s*([\d,.]+)/);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;

        const tradeData = {
            action: action,
            asset: asset,
            price: price,
            timestamp: new Date().toISOString(),
            platform: "TradingView"
        };

        console.log("🏦 ZenTrade: Parsed Trade Data:", tradeData);
        await this.sendToBackend(tradeData);
    }

    async sendToBackend(tradeData) {
        try {
            // We need to fetch history first to send a complete context?
            // For now, let's send just this trade and let backend handle history retrieval if connected to DB,
            // or we mock history on the client side if we store it.
            // app.js handles history. Here we are in content script.
            // We can retrieve history from chrome.storage.local

            const storage = await chrome.storage.local.get(['tradeHistory', 'session_human_tax']);
            const history = storage.tradeHistory || [];

            const payload = {
                ...tradeData,
                history: history
            };

            const response = await fetch('http://127.0.0.1:5001/api/realtime', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.bias_detected) {
                this.showIntervention(result);
            }

            // Handle Human Tax Impact
            if (result.human_tax_impact && result.human_tax_impact > 0) {
                const storageData = await chrome.storage.local.get(['session_human_tax', 'session_tax_breakdown']);
                const currentTax = storageData.session_human_tax || 0;
                const breakdown = storageData.session_tax_breakdown || {};

                const newTax = currentTax + result.human_tax_impact;

                // Update breakdown
                const biasType = result.bias_type || 'Unknown';
                breakdown[biasType] = (breakdown[biasType] || 0) + result.human_tax_impact;

                console.log(`🏦 ZenTrade: Adding Human Tax: +$${result.human_tax_impact} (${biasType}). New Total: $${newTax}`);

                await chrome.storage.local.set({
                    session_human_tax: newTax,
                    session_tax_breakdown: breakdown
                });
            }

            // Save this new trade to local history
            history.push({
                'Timestamp': tradeData.timestamp,
                'Buy/sell': tradeData.action,
                'Asset': tradeData.asset,
                'P/L': 0 // Paper trading fill doesn't have P/L yet
            });
            await chrome.storage.local.set({ tradeHistory: history });

        } catch (error) {
            console.error('🏦 ZenTrade: Error sending trade to backend:', error);
        }
    }

    showIntervention(result) {
        // Create a custom overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 99999;
            background: linear-gradient(135deg, #ff4757, #ff6b81);
            color: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            font-family: -apple-system, system-ui, sans-serif;
            max-width: 350px;
            animation: slideIn 0.5s ease-out;
        `;

        overlay.innerHTML = `
            <h3 style="margin: 0 0 10px 0; font-size: 18px; font-weight: bold;">⚠️ ZenTrade Intervention</h3>
            <div style="background: rgba(255,255,255,0.2); padding: 5px 10px; border-radius: 6px; font-size: 12px; margin-bottom: 10px; display: inline-block;">
                ${result.bias_type} Detected (Severity: ${result.severity}/10)
            </div>
            <p style="margin: 0; font-size: 14px; line-height: 1.4;">
                ${result.intervention_message}
            </p>
            <button id="zen-dismiss" style="margin-top: 15px; background: white; color: #ff4757; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%;">
                Pause Trading
            </button>
        `;

        document.body.appendChild(overlay);

        document.getElementById('zen-dismiss').addEventListener('click', () => {
            overlay.remove();
        });

        // Auto remove after 10 seconds? No, intervention requires action.
    }
}

// Initialize only if on TradingView
if (window.location.hostname.includes('tradingview.com')) {
    new TradingViewObserver();
}
