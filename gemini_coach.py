import os
import google.generativeai as genai
import json

class GeminiCoach:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)
            # Use gemini-2.5-flash (other models quota exceeded)
            self.model = genai.GenerativeModel('gemini-2.5-flash')
        else:
            self.model = None

    def generate_recommendations(self, bias_analysis):
        """
        Generate personalized trading recommendations based on detected biases using Gemini.
        
        Args:
            bias_analysis (dict): Dictionary containing analysis results from BiasDetector
            
        Returns:
            list: List of recommendation dictionaries
        """
        if not self.model:
            return []

        # Extract relevant information for the prompt
        summary = bias_analysis.get('summary', {})
        overtrading = bias_analysis.get('overtrading', {})
        loss_aversion = bias_analysis.get('loss_aversion', {})
        revenge_trading = bias_analysis.get('revenge_trading', {})
        
        # specific metrics to include in prompt
        metrics_summary = {
            "win_rate": summary.get('win_rate'),
            "total_trades": summary.get('total_trades'),
            "biases_detected": summary.get('biases_detected', []),
            "overtrading_detected": overtrading.get('detected'),
            "loss_aversion_detected": loss_aversion.get('detected'),
            "revenge_trading_detected": revenge_trading.get('detected')
        }
        
        if overtrading.get('detected'):
            metrics_summary['overtrading_metrics'] = overtrading.get('metrics')
            
        if loss_aversion.get('detected'):
            metrics_summary['loss_aversion_metrics'] = loss_aversion.get('metrics')
            
        if revenge_trading.get('detected'):
            metrics_summary['revenge_trading_metrics'] = revenge_trading.get('metrics')

        prompt = f"""
        You are an expert trading psychology coach. Analyze the following trading behavior data and provide personalized, actionable recommendations to improve the trader's performance and mindset.
        
        The system has detected the following patterns:
        {json.dumps(metrics_summary, indent=2)}
        
        Please provide 3-5 specific recommendations. Each recommendation should address a specific detected bias or general trading improvement if no strong biases are detected.
        
        Format your response as a JSON array of objects with the following structure:
        [
            {{
                "bias": "Name of bias (e.g., Overtrading, Loss Aversion, General)",
                "recommendation": "Specific, actionable advice (1-2 sentences)",
                "priority": "High, Medium, or Low"
            }}
        ]
        
        Return ONLY the JSON.
        """
        
        try:
            print("✨ Requesting recommendations from Gemini...")
            response = self.model.generate_content(prompt)
            # Clean up the response to ensure it's valid JSON
            text = response.text.strip()
            if text.startswith('```json'):
                text = text[7:]
            if text.endswith('```'):
                text = text[:-3]
            
            recommendations = json.loads(text.strip())
            print(f"✅ Gemini returned {len(recommendations)} recommendations.")
            return recommendations
            
        except Exception as e:
            print(f"❌ Error generating recommendations with Gemini: {e}")
            return []

    def generate_intervention(self, bias_type, severity, trade_data):
        """
        Generate a real-time intervention message using Affective Labeling.
        
        Args:
            bias_type (str): Type of bias detected (e.g., "Revenge Trading")
            severity (int): Severity level (1-10)
            trade_data (dict): Details of the trade attempt
            
        Returns:
            str: The intervention message
        """
        if not self.model:
            return "⚠️ Bias detected. Please pause and review your strategy."

        prompt = f"""
        You are the ZenTrade Protocol AI, a high-performance behavioral risk coach.
        
        A trader is about to make a trade, but we detected a high risk of {bias_type} (Severity: {severity}/10).
        Trade Context: {json.dumps(trade_data, indent=2)}
        
        Your Goal: Stop the impulsive action using "Affective Labeling".
        
        Guidelines:
        1. Access the user's emotion directly (e.g., "You seem frustrated," "You're chasing losses").
        2. Ask a disrupting question (e.g., "Is this a strategy or a reaction?").
        3. Be concise (max 2 sentences).
        4. Tone: Firm, calm, and professional.
        
        Draft the intervention message now.
        """
        
        try:
            print(f"✨ Requesting intervention for {bias_type}...")
            response = self.model.generate_content(prompt)
            message = response.text.strip()
            # Remove quotes if present
            if message.startswith('"') and message.endswith('"'):
                message = message[1:-1]
            return message
            
        except Exception as e:
            print(f"❌ Error generating intervention: {e}")
            return f"⚠️ High risk of {bias_type} detected. Pause and reset."
    def analyze_trade_data(self, trade_data_sample):
        """
        Analyze a trading log for behavioral biases using Gemini REST API.
        
        Args:
            trade_data_sample (list): List of trade dictionaries
            
        Returns:
            dict: Analysis results with bias scores and insights
        """
        import requests
        
        if not self.api_key:
            return {"error": "Gemini API key not configured"}

        prompt = f"""
        Analyze this trading log for 13 specific behavioral biases. 
        Return a JSON object where each key is the bias name and the value is a score from 0-100 based on frequency and severity.

        Biases to analyze:
        1. Loss Aversion (Holding losers too long)
        2. Confirmation Bias (Only trading one asset despite losses)
        3. Revenge Trading (Increasing size after a loss)
        4. Herd Mentality (Trading only popular tickers: TSLA, NVDA, AAPL)
        5. Sunk Cost Fallacy (Averaging down on a failing trade)
        6. Overconfidence (Spiking risk after a win streak)
        7. Availability Bias (Trading what's in the news)
        8. Recency Bias (Overweighting the last 3 trades)
        9. Anchoring Bias (Fixating on a previous price level)
        10. Gambler's Fallacy (Predicting a reversal just because of a streak)
        11. Mental Accounting (Taking high risk with 'house money')
        12. Disposition Effect (Selling winners too early)
        13. Clean Trades (Trades that follow discipline)

        Data to analyze:
        {json.dumps(trade_data_sample, indent=2)}

        Response Format:
        {{
          "biases": {{ "Loss Aversion": 85, ... }},
          "primary_bias": "string",
          "discipline_score": number,
          "human_tax_estimate": number,
          "coaching_insight": "string"
        }}
        
        Return ONLY the JSON.
        """
        
        try:
            print(f"✨ Requesting comprehensive bias analysis for {len(trade_data_sample)} trades...")
            
            # Use gemini-2.0-flash (valid model, quota exceeded)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={self.api_key}"
            
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt}
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.5, # Lower temperature for more deterministic JSON
                    "maxOutputTokens": 2048
                }
            }
            
            response = requests.post(url, json=payload, timeout=120)  # Extended for thinking models
            response.raise_for_status()
            
            result = response.json()
            
            # Extract text from response
            try:
                # Check if candidates exist
                if "candidates" not in result or not result["candidates"]:
                    print(f"❌ No candidates in response: {result}")
                    return {"error": "No response candidates from Gemini"}
                    
                text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
                print(f"📄 Raw Gemini Response: {text[:500]}...") # Print first 500 chars for debug
                
                # Clean up markdown code blocks if present
                if text.startswith('```json'):
                    text = text[7:]
                if text.startswith('```'):
                    text = text[3:]
                if text.endswith('```'):
                    text = text[:-3]
                
                text = text.strip()
                analysis = json.loads(text)
                print("✅ Gemini analysis complete.")
                return analysis
            except Exception as parse_err:
                print(f"❌ JSON Parse Error: {parse_err}")
                print(f"❌ Problematic Text: {text}")
                return {"error": f"Failed to parse Gemini response: {parse_err}"}
            
        except requests.exceptions.HTTPError as e:
            error_msg = str(e)
            try:
                error_detail = e.response.json()
                error_msg = error_detail.get("error", {}).get("message", str(e))
            except:
                pass
            print(f"❌ HTTP Error: {error_msg}")
            return {"error": error_msg}
        except Exception as e:
            print(f"❌ Error analyzing trades with Gemini: {e}")
            return {"error": str(e)}
