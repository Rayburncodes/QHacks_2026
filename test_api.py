import requests
import json
from datetime import datetime

# Mock data based on sample_data.csv structure
mock_trades = [
    {"Timestamp": "2023-01-01 10:00:00", "Buy/sell": "Buy", "Asset": "BTC", "P/L": 100},
    {"Timestamp": "2023-01-01 10:05:00", "Buy/sell": "Sell", "Asset": "BTC", "P/L": -50},
    {"Timestamp": "2023-01-01 10:10:00", "Buy/sell": "Buy", "Asset": "BTC", "P/L": -50},
    {"Timestamp": "2023-01-01 10:15:00", "Buy/sell": "Sell", "Asset": "BTC", "P/L": -50},
    # Simulate overtrading and rapid losses
    {"Timestamp": "2023-01-01 10:16:00", "Buy/sell": "Buy", "Asset": "BTC", "P/L": -50},
    {"Timestamp": "2023-01-01 10:17:00", "Buy/sell": "Buy", "Asset": "BTC", "P/L": -50},
]

url = 'http://127.0.0.1:5001/api/analyze'
headers = {'Content-Type': 'application/json'}
data = {'trades': mock_trades}

try:
    response = requests.post(url, headers=headers, json=data)
    if response.status_code == 200:
        results = response.json()
        print("Analysis successful!")
        print("-" * 30)
        print("Recommendations:")
        print(json.dumps(results.get('recommendations', []), indent=2))
        
        # Check if we can identify if it came from Gemini or Fallback
        # Gemini recommendations usually have a specific structure, but the fallback ones do too.
        # We can imply it from the logs or if the content is "dynamic" vs hardcoded strings.
    else:
        print(f"Error: {response.status_code}")
        print(response.text)
except Exception as e:
    print(f"Request failed: {e}")
