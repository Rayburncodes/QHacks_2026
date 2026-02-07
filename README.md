# National Bank Bias Detector Challenge

## 🚀 Now Available as TradingView Extension!

This project now includes a **browser extension** that integrates directly with TradingView! See the [`extension/`](./extension/) folder for details.

## Web Application Version

A prototype tool that analyzes trading data to detect harmful psychological patterns and behavioral biases in retail trading.

## Features

### Bias Detection
The tool identifies three key behavioral biases:

1. **Overtrading**: Detects excessive trading frequency, rapid-fire trades, and strategy-less trading patterns
2. **Loss Aversion**: Identifies patterns of cutting winners short while holding losers, poor risk-reward ratios
3. **Revenge Trading**: Detects emotional trading immediately after losses, increased position sizes after losses

### Analysis & Feedback
- **Comprehensive Statistics**: Total trades, P&L, win rate, and trading patterns
- **Severity Scoring**: Each bias is scored 0-100 with severity levels (Low/Moderate/High)
- **Personalized Recommendations**: Actionable suggestions such as:
  - Daily trade limits
  - Stop-loss and take-profit discipline
  - Mandatory cooldown periods after losses
  - Position size management
- **Visual Insights**: Interactive charts showing:
  - P/L over time
  - Bias detection scores
  - Win/loss distribution

## Installation

1. Create a virtual environment (recommended):
```bash
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# OR on Windows: venv\Scripts\activate
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
# OR install directly:
pip install flask pandas numpy plotly werkzeug
```

## Usage

1. Activate the virtual environment (if you created one):
```bash
source venv/bin/activate  # On macOS/Linux
# OR on Windows: venv\Scripts\activate
```

2. Start the Flask server:
```bash
python3 app.py
```

2. Open your browser and navigate to `http://localhost:5001`

**Note:** Port 5000 is often used by Apple's AirPlay service on macOS, so the app runs on port 5001 by default to avoid conflicts.

3. Either:
   - Upload a CSV file with trading data (columns: Timestamp, Buy/sell, Asset, P/L)
   - Click "Use Mock Data" to test with generated sample data

## Data Format

Your CSV file should contain the following columns:
- **Timestamp**: Date/time of the trade (ISO format or standard date format)
- **Buy/sell**: Trade direction (Buy or Sell)
- **Asset**: Asset symbol (e.g., AAPL, TSLA, BTC)
- **P/L**: Profit/Loss amount (positive for profits, negative for losses)

Example:
```csv
Timestamp,Buy/sell,Asset,P/L
2024-01-15T10:30:00,Buy,AAPL,45.50
2024-01-15T14:20:00,Sell,AAPL,-23.00
```

## Project Structure

```
QHACKS/
├── app.py                 # Flask application and API endpoints
├── bias_detector.py       # Core bias detection algorithms
├── mock_data_generator.py # Mock data generator for testing
├── requirements.txt       # Python dependencies
├── templates/
│   └── index.html        # Main UI template
└── static/
    ├── css/
    │   └── style.css     # Styling
    └── js/
        └── app.js        # Frontend logic and visualizations
```

## How It Works

### Overtrading Detection
- Analyzes trades per day (threshold: >10 average, >20 max)
- Detects rapid-fire trading (trades within 5 minutes)
- Calculates average time between trades
- Scores based on frequency and pattern consistency

### Loss Aversion Detection
- Calculates risk-reward ratio (avg win / avg loss)
- Analyzes win rate vs. average win size
- Compares largest win vs. largest loss
- Identifies patterns of cutting winners short

### Revenge Trading Detection
- Measures time between trades after losses vs. after wins
- Detects rapid trading after losses (<30 minutes)
- Analyzes position size changes (via P/L magnitude)
- Calculates win rate after losses

## Recommendations

The system provides personalized recommendations based on detected biases:
- **High Priority**: Critical issues requiring immediate attention
- **Medium Priority**: Important improvements to consider
- **Low Priority**: General best practices

## Technologies Used

- **Backend**: Flask (Python)
- **Data Analysis**: Pandas, NumPy
- **Visualization**: Plotly.js
- **Frontend**: HTML5, CSS3, JavaScript

## Future Enhancements

- Additional bias detection (FOMO, Confirmation Bias, etc.)
- Machine learning models for pattern recognition
- Historical comparison and trend analysis
- Export reports (PDF/CSV)
- User accounts and data persistence
- Real-time trading integration
