# Chrome Extension Installation Guide

## Step-by-Step: Install the Bias Detector Chrome Extension

### Step 1: Create Extension Icons (Required)

The extension needs icon files. Here's the easiest way:

1. **Open the icon generator:**
   - Navigate to `/Users/rayburn/QHACKS/extension/`
   - Double-click `create-icons.html` (or right-click → Open With → Chrome)

2. **Icons will download automatically:**
   - The browser will download 3 files: `icon16.png`, `icon48.png`, `icon128.png`

3. **Move icons to the extension folder:**
   ```bash
   # Open Terminal and run:
   cd ~/Downloads
   mv icon16.png icon48.png icon128.png /Users/rayburn/QHACKS/extension/icons/
   ```
   
   Or manually drag the downloaded files from your Downloads folder to:
   `/Users/rayburn/QHACKS/extension/icons/`

### Step 2: Load Extension in Chrome

1. **Open Chrome Browser**

2. **Go to Extensions Page:**
   - Type `chrome://extensions/` in the address bar
   - Press Enter

3. **Enable Developer Mode:**
   - Look for a toggle switch labeled **"Developer mode"** in the top-right corner
   - Turn it **ON** (it should turn blue/highlighted)

4. **Load the Extension:**
   - Click the **"Load unpacked"** button (usually in the top-left)
   - Navigate to: `/Users/rayburn/QHACKS/extension`
   - **Important:** Select the `extension` folder itself (not the QHACKS folder)
   - Click **"Select"** or **"Open"**

5. **Verify Installation:**
   - You should see **"National Bank Bias Detector"** in your extensions list
   - Make sure it's **enabled** (toggle switch should be ON)
   - You should see the extension icon in your Chrome toolbar (top-right)

### Step 3: Use the Extension

#### Option A: On Trading Platforms (Automatic)

1. **Visit any trading platform:**
   - Go to https://www.tradingview.com
   - Or visit Binance, Coinbase, Robinhood, etc.

2. **Look for the Bias Detector Panel:**
   - A panel should appear on the **right side** of the page
   - It says "🏦 Bias Detector" at the top

3. **Upload Your Trading Data:**
   - Click **"Upload CSV"** button
   - Select your CSV file (like `sample_data.csv`)
   - Results will appear automatically

#### Option B: On Any Website (Manual Enable)

1. **Click the extension icon** in your Chrome toolbar

2. **Check "Enable on all websites"** checkbox

3. **Visit any website** - the panel will appear

4. **Upload CSV** or click "Analyze Trades"

### Step 4: Test the Extension

1. **Go to TradingView:**
   ```
   https://www.tradingview.com
   ```

2. **Upload sample data:**
   - Click "Upload CSV" in the Bias Detector panel
   - Select `/Users/rayburn/QHACKS/sample_data.csv`
   - Or click "Analyze Trades" to test

3. **Verify results:**
   - You should see trading summary
   - Bias detection scores
   - Recommendations
   - Charts and visualizations

---

## Troubleshooting

### Problem: "Icons missing" error

**Solution:**
```bash
# Make sure icons exist:
ls /Users/rayburn/QHACKS/extension/icons/

# Should show:
# icon16.png
# icon48.png  
# icon128.png
```

If missing, use the `create-icons.html` file to generate them.

### Problem: "Load unpacked" button is grayed out

**Solution:**
- Make sure **"Developer mode"** is turned ON
- It's a toggle switch in the top-right of `chrome://extensions/`

### Problem: Panel doesn't appear on websites

**Solution:**
1. Refresh the webpage (F5 or Cmd+R)
2. Check if extension is enabled in `chrome://extensions/`
3. Open browser console (F12 → Console tab) to check for errors
4. Try clicking the extension icon and enabling "Enable on all websites"

### Problem: CSV upload not working

**Solution:**
- Make sure CSV has these columns: `Timestamp`, `Buy/sell`, `Asset`, `P/L`
- Column names are case-insensitive
- Check browser console (F12) for error messages

### Problem: Extension icon not visible

**Solution:**
1. Go to `chrome://extensions/`
2. Click the puzzle piece icon (Extensions) in Chrome toolbar
3. Find "National Bank Bias Detector"
4. Click the pin icon to pin it to toolbar

---

## Extension Features

Once installed, the extension provides:

✅ **Automatic Detection** - Works on trading platforms automatically  
✅ **CSV Upload** - Upload your trading data for analysis  
✅ **Bias Detection** - Detects Overtrading, Loss Aversion, Revenge Trading  
✅ **Visual Insights** - Charts and metrics  
✅ **Recommendations** - Personalized trading advice  
✅ **Universal** - Works on any website when enabled  

---

## File Structure

Your extension is located at:
```
/Users/rayburn/QHACKS/extension/
├── manifest.json          # Extension configuration
├── content/
│   ├── content.js        # Main extension logic
│   └── styles.css        # Panel styling
├── lib/
│   └── bias-detector.js  # Bias detection algorithms
├── popup/
│   ├── popup.html        # Extension popup UI
│   └── popup.js          # Popup logic
├── background/
│   └── background.js     # Background service worker
└── icons/
    ├── icon16.png        # Extension icons (create these)
    ├── icon48.png
    └── icon128.png
```

---

## Quick Reference

**Extensions Page:** `chrome://extensions/`  
**Extension Folder:** `/Users/rayburn/QHACKS/extension`  
**Sample Data:** `/Users/rayburn/QHACKS/sample_data.csv`  
**Icon Generator:** `/Users/rayburn/QHACKS/extension/create-icons.html`

---

## Need More Help?

Check these files:
- `extension/README.md` - Full extension documentation
- `extension/INSTALL.md` - Detailed installation guide
- `TESTING.md` - Testing instructions
