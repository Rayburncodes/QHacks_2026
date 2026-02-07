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

@app.route('/api/mock-data', methods=['GET'])
def mock_data():
    """Generate mock trading data for testing"""
    generator = MockDataGenerator()
    mock_trades = generator.generate()
    return jsonify({'trades': mock_trades})

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5001)
