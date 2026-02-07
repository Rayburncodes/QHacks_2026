# Quick Installation Guide

## Step 1: Create Icons (Optional but Recommended)

The extension needs icon files. You have two options:

### Option A: Use Simple Placeholder Icons
Create three PNG files in the `icons/` folder:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)  
- `icon128.png` (128x128 pixels)

You can use any image editor or online tool to create simple icons with a bank/bias detector theme.

### Option B: Use the HTML Generator
1. Open `create-icons.html` in your browser
2. It will automatically download the icon files
3. Move them to the `icons/` folder

## Step 2: Load Extension in Chrome/Edge

1. **Open Extensions Page**
   - Chrome: Type `chrome://extensions/` in address bar
   - Edge: Type `edge://extensions/` in address bar

2. **Enable Developer Mode**
   - Toggle the switch in the top-right corner

3. **Load Unpacked**
   - Click "Load unpacked" button
   - Navigate to and select the `extension` folder
   - Click "Select Folder"

4. **Verify Installation**
   - You should see "National Bank Bias Detector" in your extensions list
   - The extension icon should appear in your toolbar

## Step 3: Use on TradingView

1. Go to https://www.tradingview.com
2. Look for the "Bias Detector" panel on the right side of the page
3. Click "Upload CSV" or "Analyze Trades"

## Troubleshooting

- **Icons missing error**: Create the icon files as described above
- **Panel not appearing**: Refresh the TradingView page
- **CSV upload not working**: Make sure your CSV has the correct column names (case-insensitive)
