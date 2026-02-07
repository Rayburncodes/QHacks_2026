# Quick Test Guide

## Testing the Chrome Extension

### Step 1: Verify Extension is Loaded

1. **Open Chrome**
2. **Go to:** `chrome://extensions/`
3. **Check:**
   - ✅ "National Bank Bias Detector" appears in the list
   - ✅ Extension is **enabled** (toggle switch is ON)
   - ✅ No errors shown (red text)

### Step 2: Test on TradingView

1. **Go to TradingView:**
   - Open a new tab
   - Visit: https://www.tradingview.com
   - Wait for page to load

2. **Look for the Panel:**
   - Check the **RIGHT side** of the page
   - You should see a panel labeled **"🏦 Bias Detector"**
   - If you don't see it, refresh the page (F5 or Cmd+R)

3. **Test CSV Upload:**
   - Click **"Upload CSV"** button in the panel
   - Navigate to: `/Users/rayburn/QHACKS/sample_data.csv`
   - Select the file
   - Results should appear automatically!

### Step 3: Verify Results

You should see:
- ✅ **Trading Summary** (total trades, P&L, win rate)
- ✅ **Bias Detection Cards:**
  - Overtrading (with severity score)
  - Loss Aversion (with severity score)
  - Revenge Trading (with severity score)
- ✅ **Recommendations** (personalized suggestions)
- ✅ **Charts** (if available)

---

## Testing the Web Application

### Step 1: Start the Server

```bash
cd /Users/rayburn/QHACKS
source venv/bin/activate
python3 app.py
```

You should see:
```
 * Running on http://127.0.0.1:5001
 * Debug mode: on
```

### Step 2: Open in Browser

1. **Open Chrome**
2. **Go to:** http://localhost:5001

### Step 3: Test with Mock Data

1. Click **"Use Mock Data"** button
2. Wait a few seconds
3. Results should appear!

### Step 4: Test with CSV Upload

1. Click **"Choose File"** or drag and drop
2. Select: `/Users/rayburn/QHACKS/sample_data.csv`
3. Results should appear automatically!

---

## What to Look For

### ✅ Success Indicators:

**Extension:**
- Panel appears on TradingView
- CSV uploads successfully
- Bias scores are calculated
- Recommendations are shown

**Web App:**
- Page loads without errors
- Mock data generates results
- CSV upload works
- Charts display correctly

### ❌ Common Issues:

**Extension panel doesn't appear:**
- Refresh the page (F5)
- Check extension is enabled in `chrome://extensions/`
- Open browser console (F12) to check for errors

**CSV upload fails:**
- Make sure CSV has columns: `Timestamp`, `Buy/sell`, `Asset`, `P/L`
- Check file format is correct CSV

**Web app won't start:**
- Make sure virtual environment is activated: `source venv/bin/activate`
- Check if port 5001 is available
- Install dependencies: `pip install -r requirements.txt`

---

## Quick Test Checklist

- [ ] Extension loads in Chrome
- [ ] Extension panel appears on TradingView
- [ ] CSV upload works
- [ ] Bias detection results show
- [ ] Web app starts successfully
- [ ] Web app mock data works
- [ ] Web app CSV upload works

---

## Sample Data Location

Your test CSV file is at:
```
/Users/rayburn/QHACKS/sample_data.csv
```

This file contains 30 sample trades you can use for testing!
