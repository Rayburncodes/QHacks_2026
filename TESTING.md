# Testing Guide - National Bank Bias Detector

## Testing the Web Application

### Step 1: Set Up the Environment

1. **Navigate to the project directory:**
   ```bash
   cd /Users/rayburn/QHACKS
   ```

2. **Activate the virtual environment:**
   ```bash
   source venv/bin/activate
   ```
   You should see `(venv)` in your terminal prompt.

3. **Install dependencies (if not already installed):**
   ```bash
   pip install -r requirements.txt
   ```

### Step 2: Start the Flask Server

```bash
python3 app.py
```

You should see output like:
```
 * Running on http://127.0.0.1:5001
 * Debug mode: on
```

### Step 3: Test the Web Application

1. **Open your browser** and go to: `http://localhost:5001`

2. **Test Option 1: Use Mock Data**
   - Click the "Use Mock Data" button
   - The app will generate sample trading data with bias patterns
   - You should see:
     - Trading summary statistics
     - Bias detection results (Overtrading, Loss Aversion, Revenge Trading)
     - Personalized recommendations
     - Visual charts

3. **Test Option 2: Upload CSV File**
   - Click "Choose File" or drag and drop `sample_data.csv`
   - The app will analyze the uploaded data
   - Review the bias detection results

### Step 4: Verify Bias Detection

Check that the following are detected:

**Overtrading:**
- High number of trades per day
- Rapid-fire trades (within 5 minutes)
- Transaction costs relative to returns

**Loss Aversion:**
- Small average wins vs large average losses
- Poor risk-reward ratio
- Loss escalation patterns

**Revenge Trading:**
- Rapid trading after losses
- Same asset re-entry after losses
- Escalating position sizes

---

## Testing the Browser Extension

### Step 1: Create Extension Icons

1. **Open `extension/create-icons.html` in your browser**
   - Right-click the file → "Open With" → Your browser
   - The browser will download 3 icon files automatically

2. **Move icons to the correct folder:**
   ```bash
   # Move downloaded files to:
   mv ~/Downloads/icon16.png extension/icons/
   mv ~/Downloads/icon48.png extension/icons/
   mv ~/Downloads/icon128.png extension/icons/
   ```

### Step 2: Load Extension in Chrome/Edge

1. **Open Chrome or Edge**

2. **Go to Extensions Page:**
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

3. **Enable Developer Mode:**
   - Toggle switch in top-right corner

4. **Load the Extension:**
   - Click "Load unpacked"
   - Navigate to `/Users/rayburn/QHACKS/extension`
   - Select the `extension` folder
   - Click "Select"

5. **Verify Installation:**
   - You should see "National Bank Bias Detector" in your extensions list
   - Extension icon should appear in toolbar

### Step 3: Test on Trading Platforms

1. **Test on TradingView:**
   - Go to https://www.tradingview.com
   - Look for the "Bias Detector" panel on the right side
   - Click "Upload CSV" and select `sample_data.csv`
   - Review the analysis results

2. **Test on Any Website:**
   - Click the extension icon in your toolbar
   - Check "Enable on all websites"
   - Visit any website
   - The panel should appear on the right side

3. **Test CSV Upload:**
   - Click "Upload CSV" in the panel
   - Select `sample_data.csv` from the project folder
   - Verify that trades are analyzed and biases are detected

---

## Testing with Sample Data

### Using the Provided Sample Data

The project includes `sample_data.csv` with sample trades. This file contains:
- 30 trades across 2 days
- Mix of wins and losses
- Various assets (AAPL, TSLA, MSFT, etc.)
- Different P/L amounts

### Creating Your Own Test Data

Create a CSV file with this format:

```csv
Timestamp,Buy/sell,Asset,P/L
2024-01-15T09:30:00,Buy,AAPL,45.50
2024-01-15T09:45:00,Sell,TSLA,-23.00
2024-01-15T10:15:00,Buy,MSFT,67.25
```

**Required Columns:**
- `Timestamp` - Date/time (ISO format preferred)
- `Buy/sell` - Trade direction
- `Asset` - Asset symbol
- `P/L` - Profit/Loss (positive for wins, negative for losses)

---

## Expected Test Results

### With Mock Data (Overtrading Pattern)

You should see:
- **Overtrading Detected**: High severity
  - High average trades per day (>15)
  - High percentage of rapid trades
  - Elevated transaction costs

### With Mock Data (Loss Aversion Pattern)

You should see:
- **Loss Aversion Detected**: Moderate to High severity
  - Poor risk-reward ratio (<1.0)
  - Small wins, large losses
  - Loss escalation

### With Mock Data (Revenge Trading Pattern)

You should see:
- **Revenge Trading Detected**: High severity
  - Rapid trading after losses (<15 minutes)
  - Same asset re-entry
  - Escalating position sizes

---

## Troubleshooting

### Web App Issues

**Problem: Port 5001 already in use**
```bash
# Find and kill the process
lsof -ti:5001 | xargs kill -9
# Or change port in app.py
```

**Problem: Module not found errors**
```bash
# Make sure virtual environment is activated
source venv/bin/activate
# Reinstall dependencies
pip install -r requirements.txt
```

**Problem: CSV upload not working**
- Check CSV format matches required columns
- Ensure column names are exactly: `Timestamp`, `Buy/sell`, `Asset`, `P/L`
- Check browser console for errors (F12)

### Extension Issues

**Problem: Icons missing error**
- Make sure icon files exist in `extension/icons/` folder
- Files should be: `icon16.png`, `icon48.png`, `icon128.png`

**Problem: Panel doesn't appear**
- Refresh the webpage (F5)
- Check if extension is enabled in `chrome://extensions/`
- Open browser console (F12) and check for errors

**Problem: CSV upload fails**
- Check CSV has correct column names (case-insensitive)
- Ensure file is a valid CSV format
- Check browser console for error messages

---

## Quick Test Checklist

- [ ] Web app starts on http://localhost:5001
- [ ] Mock data generates and displays results
- [ ] CSV upload works with sample_data.csv
- [ ] All three biases are detected (Overtrading, Loss Aversion, Revenge Trading)
- [ ] Recommendations are displayed
- [ ] Charts render correctly
- [ ] Extension loads in Chrome/Edge
- [ ] Extension panel appears on TradingView
- [ ] Extension CSV upload works
- [ ] Bias detection works in extension

---

## Advanced Testing

### Test Specific Bias Patterns

**Test Overtrading:**
- Create CSV with >20 trades per day
- Include many trades within 5 minutes of each other
- Should detect high overtrading score

**Test Loss Aversion:**
- Create CSV with small wins ($10-50) and large losses ($100-200)
- Should detect poor risk-reward ratio
- Should show loss aversion pattern

**Test Revenge Trading:**
- Create CSV with trades immediately after losses (<15 minutes)
- Include same asset re-entry after losses
- Should detect revenge trading pattern

### Test Edge Cases

- Empty CSV file
- CSV with only wins
- CSV with only losses
- CSV with invalid timestamps
- CSV with missing columns
- Very large CSV files (1000+ trades)

---

## Need Help?

If you encounter issues:
1. Check the browser console (F12 → Console tab)
2. Check terminal output for Flask errors
3. Verify all dependencies are installed
4. Ensure virtual environment is activated
5. Check file permissions
