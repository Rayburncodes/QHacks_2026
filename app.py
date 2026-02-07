from flask import Flask, render_template, request, jsonify
from flask.json.provider import DefaultJSONProvider
from dotenv import load_dotenv
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import os
from bias_detector import BiasDetector
from mock_data_generator import MockDataGenerator
from gemini_coach import GeminiCoach

# Load environment variables
load_dotenv()

class CustomJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

app = Flask(__name__)
from flask_cors import CORS
CORS(app) # Enable CORS for all routes (allows extension to call API)
app.json = CustomJSONProvider(app)

# Initialize Gemini Coach
gemini_coach = GeminiCoach()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/analyze', methods=['POST'])
def analyze():
    try:
        data = request.json
        trades = data.get('trades', [])
        
        if not trades:
            return jsonify({'error': 'No trading data provided'}), 400
        
        # Convert to DataFrame
        df = pd.DataFrame(trades)
        
        # Ensure required columns exist
        required_cols = ['Timestamp', 'Buy/sell', 'Asset', 'P/L']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            return jsonify({'error': f'Missing required columns: {missing_cols}'}), 400
        
        # Initialize bias detector
        detector = BiasDetector(df)
        
        # Detect all biases first to pass to Gemini
        overtrading = detector.detect_overtrading()
        loss_aversion = detector.detect_loss_aversion()
        revenge_trading = detector.detect_revenge_trading()
        summary = detector.generate_summary()
        
        # Determine recommendations source
        if gemini_coach.model:
            # Prepare analysis data for Gemini
            bias_analysis = {
                'overtrading': overtrading,
                'loss_aversion': loss_aversion,
                'revenge_trading': revenge_trading,
                'summary': summary
            }
            try:
                recommendations = gemini_coach.generate_recommendations(bias_analysis)
                if not recommendations: # Fallback if Gemini returns empty list
                     print("⚠️ Gemini returned no recommendations. Using fallback.")
                     recommendations = detector.generate_recommendations()
            except Exception as e:
                print(f"❌ Gemini generation failed, falling back: {e}")
                recommendations = detector.generate_recommendations()
        else:
            print("ℹ️ Gemini not configured (no API key). Using standard recommendations.")
            recommendations = detector.generate_recommendations()

        results = {
            'overtrading': overtrading,
            'loss_aversion': loss_aversion,
            'revenge_trading': revenge_trading,
            'summary': summary,
            'recommendations': recommendations,
            'statistics': detector.get_statistics()
        }
        
        return jsonify(results)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze-csv', methods=['POST'])
def analyze_csv():
    """
    Full CSV analysis via Gemini (replaces local bias detection for reports).
    Input: { "trades": [...] }
    """
    print("🚀 Received request at /api/analyze-csv")
    try:
        data = request.json
        trades = data.get('trades', [])
        
        if not trades:
            return jsonify({'error': 'No trading data provided'}), 400
            
        # Limit to last 100 trades to fit in context window and keep costs down
        # Sort by timestamp? Assuming they come sorted or we sort them.
        # But for "behavior", recency matters most.
        sample_size = 100
        if len(trades) > sample_size:
            # Take the last N trades
            trades_sample = trades[-sample_size:]
        else:
            trades_sample = trades
            
        print(f"📊 Analyzing CSV with Gemini ({len(trades_sample)} trades)...")
        analysis = gemini_coach.analyze_trade_data(trades_sample)
        
        return jsonify(analysis)
        
    except Exception as e:
        print(f"❌ Error in /api/analyze-csv: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/mock-data', methods=['GET'])
def mock_data():
    """Generate mock trading data for testing"""
    generator = MockDataGenerator()
    mock_trades = generator.generate()
    return jsonify({'trades': mock_trades})

@app.route('/api/realtime', methods=['POST'])
def realtime_intervention():
    """
    Real-time intervention for a single trade attempt.
    Input: {
        "action": "buy",
        "asset": "BTC",
        "price": 50000,
        "history": [...] # Recent trades
    }
    """
    try:
        data = request.json
        # Check logic here...
        # For MVP, we can just check the last few trades in 'history'
        
        history = data.get('history', [])
        if not history:
             return jsonify({'bias_detected': False, 'message': 'No history provided for analysis'}), 200

        # Create DataFrame from history
        df = pd.DataFrame(history)
        
        # Append the CURRENT trade attempt to the DataFrame to analyze its impact
        # We need to normalize the current trade to match the DataFrame structure
        current_trade = {
            'Timestamp': datetime.now().isoformat(),
            'Buy/sell': data.get('action', 'buy'),
            'Asset': data.get('asset', 'Unknown'),
            'P/L': 0 # Dummy P/L for the current open attempt
        }
        df_current = pd.DataFrame([current_trade])
        df = pd.concat([df, df_current], ignore_index=True)

        detector = BiasDetector(df)
        
        # Check for immediate red flags
        # We specifically want to know if the *latest* trade (the attempt) triggers these
        revenge = detector.detect_revenge_trading()
        overtrading = detector.detect_overtrading()
        
        bias_detected = False
        bias_type = ""
        severity = 0
        
        if revenge['detected']:
            bias_detected = True
            bias_type = "Revenge Trading"
            severity = 8 if revenge['severity'] == 'High' else 5
        elif overtrading['detected']:
            bias_detected = True
            bias_type = "Overtrading"
            severity = 6 if overtrading['severity'] == 'High' else 4
            
        if bias_detected:
            # Generate affective message via Gemini
            message = gemini_coach.generate_intervention(bias_type, severity, data)
            
            # Calculate Human Tax Impact
            human_tax_impact = 0.0
            if severity >= 6: # High severity (8 for revenge, 6 for overtrading)
                human_tax_impact = 500.00
            elif severity >= 5: # Medium severity (5 for revenge)
                human_tax_impact = 150.00
            else: # Low severity (4 for overtrading)
                human_tax_impact = 50.00

            return jsonify({
                'bias_detected': True,
                'bias_type': bias_type,
                'severity': severity,
                'intervention_message': message,
                'human_tax_impact': human_tax_impact
            })
        else:
            return jsonify({'bias_detected': False, 'human_tax_impact': 0.0})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
