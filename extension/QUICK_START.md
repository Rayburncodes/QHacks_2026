# Quick Start Guide - Install the Extension

## Step 1: Create Icons (Required)

First, you need to create the icon files. Here's the easiest way:

### Method 1: Use the HTML Generator (Easiest)
1. Open the file `create-icons.html` in your web browser
   - Right-click `create-icons.html` → "Open With" → Your browser
   - OR drag and drop the file into your browser window
2. The browser will automatically download 3 icon files
3. Move those downloaded files to the `icons/` folder:
   - `icon16.png` → `extension/icons/icon16.png`
   - `icon48.png` → `extension/icons/icon48.png`
   - `icon128.png` → `extension/icons/icon128.png`

### Method 2: Create Simple Icons Manually
Create three PNG images (16x16, 48x48, 128x128 pixels) with:
- Blue background (#2962ff)
- White letter "B" in the center
- Save them as `icon16.png`, `icon48.png`, `icon128.png` in the `icons/` folder

## Step 2: Load Extension in Chrome/Edge

1. **Open Chrome or Edge Browser**

2. **Go to Extensions Page**
   - **Chrome**: Type `chrome://extensions/` in the address bar and press Enter
   - **Edge**: Type `edge://extensions/` in the address bar and press Enter

3. **Enable Developer Mode**
   - Look for a toggle switch labeled "Developer mode" in the top-right corner
   - Turn it ON (it should be blue/highlighted)

4. **Load the Extension**
   - Click the "Load unpacked" button (usually in the top-left)
   - Navigate to your project folder: `/Users/rayburn/QHACKS/`
   - Select the `extension` folder (NOT the QHACKS folder, but the extension folder inside it)
   - Click "Select" or "Open"

5. **Verify Installation**
   - You should see "National Bank Bias Detector" in your extensions list
   - Make sure it's enabled (toggle switch should be ON)
   - You should see the extension icon in your browser toolbar

## Step 3: Use on TradingView

1. **Go to TradingView**
   - Open a new tab
   - Navigate to: https://www.tradingview.com
   - Log in if needed

2. **Find the Bias Detector Panel**
   - Look on the RIGHT side of the TradingView page
   - You should see a panel labeled "🏦 Bias Detector"
   - If you don't see it, refresh the page (F5 or Cmd+R)

3. **Upload Your Trading Data**
   - Click "Upload CSV" button in the panel
   - Select a CSV file with your trades (columns: Timestamp, Buy/sell, Asset, P/L)
   - OR click "Analyze Trades" if you've already uploaded data

4. **View Results**
   - The panel will show:
     - Trading summary statistics
     - Detected biases (Overtrading, Loss Aversion, Revenge Trading)
     - Personalized recommendations
     - Visual charts and metrics

## Troubleshooting

**Problem: "Icons missing" error**
- Solution: Make sure you created the icon files in `extension/icons/` folder
- Use the `create-icons.html` file to generate them automatically

**Problem: Panel doesn't appear on TradingView**
- Solution: Refresh the TradingView page (F5)
- Make sure the extension is enabled in `chrome://extensions/`
- Check browser console for errors (F12 → Console tab)

**Problem: "Load unpacked" button is grayed out**
- Solution: Make sure "Developer mode" is turned ON

**Problem: CSV upload not working**
- Solution: Make sure your CSV has these exact column names (case doesn't matter):
  - Timestamp
  - Buy/sell (or Action)
  - Asset (or Symbol)
  - P/L (or PnL or Profit)

## Need Help?

Check the full documentation in `extension/README.md` for more details.
