import os
import google.generativeai as genai
import json

class GeminiCoach:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel('gemini-pro')
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
