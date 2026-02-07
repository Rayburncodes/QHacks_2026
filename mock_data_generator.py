import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random

class MockDataGenerator:
    def __init__(self, num_trades=50, start_date=None):
        self.num_trades = num_trades
        self.start_date = start_date or datetime.now() - timedelta(days=30)
        self.assets = ['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'BTC', 'ETH']
        
    def generate(self):
        """Generate mock trading data with realistic bias patterns"""
        trades = []
        current_time = self.start_date
        previous_pl = 0
        
        for i in range(self.num_trades):
            # Simulate different bias patterns
            bias_type = random.choice(['overtrading', 'loss_aversion', 'revenge', 'normal'])
            
            # Determine time gap based on bias
            if bias_type == 'revenge' and previous_pl < 0:
                # Revenge trading: trade quickly after loss
                minutes_gap = random.randint(5, 30)
            elif bias_type == 'overtrading':
                # Overtrading: frequent trades
                minutes_gap = random.randint(10, 60)
            else:
                # Normal: 1-4 hours
                minutes_gap = random.randint(60, 240)
            
            current_time += timedelta(minutes=minutes_gap)
            
            # Determine buy/sell
            action = random.choice(['Buy', 'Sell'])
            
            # Determine asset
            asset = random.choice(self.assets)
            
            # Determine P/L based on bias
            if bias_type == 'loss_aversion':
                # Loss aversion: small wins, large losses
                if random.random() > 0.4:  # 60% win rate but small wins
                    pl = random.uniform(10, 50)
                else:
                    pl = random.uniform(-100, -30)  # Larger losses
            elif bias_type == 'revenge' and previous_pl < 0:
                # Revenge trading: often loses more after a loss
                pl = random.uniform(-80, 20)  # More likely to lose
            else:
                # Normal or overtrading: more balanced
                if random.random() > 0.45:
                    pl = random.uniform(20, 100)
                else:
                    pl = random.uniform(-60, -10)
            
            previous_pl = pl
            
            trades.append({
                'Timestamp': current_time.isoformat(),
                'Buy/sell': action,
                'Asset': asset,
                'P/L': round(pl, 2)
            })
        
        return trades
