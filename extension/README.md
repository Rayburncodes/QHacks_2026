# Universal Trading Bias Detector Extension

A Chrome/Edge browser extension that works on **any trading platform** to detect behavioral biases in your trading.

## Installation

1. **Open Chrome/Edge Extensions Page**
   - Chrome: Go to `chrome://extensions/`
   - Edge: Go to `edge://extensions/`

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right

3. **Load the Extension**
   - Click "Load unpacked"
   - Select the `extension` folder from this project

4. **Visit Any Trading Platform**
   - Go to any trading website (TradingView, Binance, Coinbase, Robinhood, eToro, etc.)
   - The extension will automatically detect trading sites and show the panel
   - Or enable "Enable on all websites" in the extension popup to use it anywhere

## Usage

### Option 1: Upload CSV File
1. Click the extension icon in your browser toolbar
2. Click "Upload CSV File"
3. Select a CSV file with columns: Timestamp, Buy/sell, Asset, P/L
4. The extension will analyze your trades

### Option 2: Use Panel on Any Trading Site
1. Navigate to any trading platform (TradingView, Binance, Coinbase, Robinhood, etc.)
2. Look for the "Bias Detector" panel on the right side
3. Click "Analyze Trades" to auto-detect trades from tables, or "Upload CSV"
4. View your bias detection results

### Option 3: Enable on All Websites
1. Click the extension icon in your browser toolbar
2. Check "Enable on all websites"
3. The panel will appear on any website you visit

## Features

- **Overtrading Detection**: Identifies excessive trading frequency
- **Loss Aversion Detection**: Finds patterns of cutting winners short
- **Revenge Trading Detection**: Detects emotional trading after losses
- **Personalized Recommendations**: Actionable suggestions to improve trading discipline
- **Visual Insights**: Charts and metrics showing your trading patterns

## CSV Format

Your CSV file should have these columns:
- `Timestamp`: Date/time of trade (ISO format)
- `Buy/sell`: Trade direction (Buy or Sell)
- `Asset`: Asset symbol (e.g., AAPL, BTC)
- `P/L`: Profit/Loss amount (positive for profits, negative for losses)

Example:
```csv
Timestamp,Buy/sell,Asset,P/L
2024-01-15T10:30:00,Buy,AAPL,45.50
2024-01-15T14:20:00,Sell,AAPL,-23.00
```

## Development

The extension consists of:
- `manifest.json`: Extension configuration
- `content/content.js`: Script injected into TradingView pages
- `content/styles.css`: Panel styling
- `lib/bias-detector.js`: Core bias detection algorithms
- `popup/popup.html`: Extension popup UI
- `background/background.js`: Background service worker

## Supported Platforms

The extension works on:
- **TradingView** - Charting and analysis platform
- **Binance** - Cryptocurrency exchange
- **Coinbase** - Cryptocurrency exchange
- **Robinhood** - Stock trading app
- **eToro** - Social trading platform
- **Interactive Brokers** - Professional trading platform
- **TD Ameritrade / Schwab** - Stock brokers
- **MetaTrader 4/5** - Forex trading platforms
- **Any trading site** - When "Enable on all websites" is checked

## Notes

- The extension works alongside trading platforms but doesn't modify their functionality
- Trade data is stored locally in your browser
- No data is sent to external servers
- Automatically detects trading-related websites
- Can extract trade data from tables on trading platforms
