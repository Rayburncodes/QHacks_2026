


import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from collections import defaultdict

class BiasDetector:
    def __init__(self, df):
        """
        Initialize the Bias Detector with trading data.
        
        Args:
            df: DataFrame with columns: Timestamp, Buy/sell, Asset, P/L
        """
        self.df = df.copy()
        self.df['Timestamp'] = pd.to_datetime(self.df['Timestamp'])
        self.df['P/L'] = pd.to_numeric(self.df['P/L'], errors='coerce')
        
        # Remove rows with invalid data
        self.df = self.df.dropna(subset=['Timestamp', 'P/L'])
        
        if len(self.df) == 0:
            raise ValueError("No valid trading data found after processing")
        
        self.df = self.df.sort_values('Timestamp')
        self.df['Date'] = self.df['Timestamp'].dt.date
        
        # Calculate additional metrics
        self.df['Is_Loss'] = self.df['P/L'] < 0
        self.df['Is_Win'] = self.df['P/L'] > 0
        
    def detect_overtrading(self):
        """
        Detect overtrading bias based on harmful patterns:
        - Excessively high number of trades per day compared to account size
        - Multiple trades placed within very short time intervals (impulsive rapid-fire trades)
        - Increasing trade frequency after small gains or minor losses
        - High transaction costs relative to net returns
        """
        trades_per_day = self.df.groupby('Date').size()
        avg_trades_per_day = trades_per_day.mean()
        max_trades_per_day = trades_per_day.max()
        
        # Calculate trading frequency
        time_diffs = self.df['Timestamp'].diff().dt.total_seconds() / 60  # minutes
        avg_time_between_trades = time_diffs[time_diffs > 0].mean()
        
        # Detect rapid-fire trading (trades within very short intervals - 1 minute)
        rapid_trades = (time_diffs < 1).sum()
        rapid_trade_pct = (rapid_trades / len(self.df)) * 100
        
        # Pattern: Increasing trade frequency after small gains or minor losses
        # Check if trade frequency increases after small P/L moves
        self.df['Prev_PL'] = self.df['P/L'].shift(1)
        self.df['Time_Since_Prev'] = time_diffs
        
        # Small gains/losses: between -2% and +2% of average trade size
        avg_trade_size = abs(self.df['P/L']).mean()
        small_move_threshold = avg_trade_size * 0.02
        
        small_moves = self.df[
            (self.df['Prev_PL'].abs() <= small_move_threshold) & 
            (self.df['Prev_PL'].notna())
        ]
        
        if len(small_moves) > 0:
            avg_time_after_small_move = small_moves['Time_Since_Prev'].mean()
            # Compare to overall average - if much shorter, indicates increasing frequency
            frequency_increase_ratio = avg_time_between_trades / avg_time_after_small_move if avg_time_after_small_move > 0 else 1
        else:
            frequency_increase_ratio = 1
        
        # High transaction costs relative to net returns
        # Estimate transaction costs (assuming ~0.1% per trade, adjust based on platform)
        estimated_cost_per_trade = abs(self.df['P/L']).mean() * 0.001  # Conservative estimate
        total_estimated_costs = len(self.df) * estimated_cost_per_trade
        total_net_return = self.df['P/L'].sum()
        cost_to_return_ratio = abs(total_estimated_costs / total_net_return) if total_net_return != 0 else 0
        
        # Score calculation based on harmful patterns
        score = 0
        
        # Pattern 1: Excessively high trades per day (threshold: >10/day average or >25/day max for manual traders)
        if avg_trades_per_day > 10:
            score += min(25, (avg_trades_per_day / 10) * 10)
        if max_trades_per_day > 25:
            score += min(20, (max_trades_per_day / 25) * 10)
        
        # Pattern 2: Rapid-fire trades (>20% within 1 minute)
        if rapid_trade_pct > 20:
            score += min(25, (rapid_trade_pct / 20) * 10)
        elif rapid_trade_pct > 10:
            score += min(15, (rapid_trade_pct / 10) * 5)
        
        # Pattern 3: Increasing frequency after small moves (ratio > 3.0 indicates faster trading)
        if frequency_increase_ratio > 3.0:
            score += min(10, (frequency_increase_ratio / 3.0) * 6)
        
        # Pattern 4: High transaction costs relative to returns (>80% of net return)
        if cost_to_return_ratio > 0.8 and total_net_return > 0:
            score += min(10, (cost_to_return_ratio / 0.8) * 6)
        elif cost_to_return_ratio > 1.5:
            score += 15  # Costs greatly exceed returns
        
        severity = 'Low' if score < 50 else 'Moderate' if score < 80 else 'High'
        
        return {
            'detected': score > 50,
            'severity': severity,
            'score': min(100, round(score, 1)),
            'metrics': {
                'avg_trades_per_day': round(avg_trades_per_day, 2),
                'max_trades_per_day': int(max_trades_per_day),
                'rapid_trade_percentage': round(rapid_trade_pct, 1),
                'avg_minutes_between_trades': round(avg_time_between_trades, 1) if not pd.isna(avg_time_between_trades) else 0,
                'frequency_increase_after_small_moves': round(frequency_increase_ratio, 2),
                'cost_to_return_ratio': round(cost_to_return_ratio * 100, 1) if cost_to_return_ratio > 0 else 0,
                'total_estimated_costs': round(total_estimated_costs, 2),
                'total_net_return': round(total_net_return, 2)
            },
            'description': self._get_overtrading_description(severity, avg_trades_per_day, rapid_trade_pct, cost_to_return_ratio)
        }
    
    def detect_loss_aversion(self):
        """
        Detect loss aversion bias based on harmful patterns:
        - Holding losing positions significantly longer than winning positions
        - Small average gains but large average losses
        - Refusal to close losing trades even after breaching a predefined risk threshold
        - Frequently moving stop-loss levels further away to avoid realizing a loss
        """
        wins = self.df[self.df['Is_Win']]
        losses = self.df[self.df['Is_Loss']]
        
        if len(wins) == 0 or len(losses) == 0:
            return {
                'detected': False,
                'severity': 'Low',
                'score': 0,
                'metrics': {},
                'description': 'Insufficient data to detect loss aversion patterns.'
            }
        
        avg_win = wins['P/L'].mean()
        avg_loss = abs(losses['P/L'].mean())
        
        # Pattern 1: Small average gains but large average losses
        # Risk-reward ratio (should be > 1.5 for healthy trading)
        risk_reward_ratio = avg_win / avg_loss if avg_loss > 0 else 0
        
        # Pattern 2: Holding losing positions longer than winning positions
        # Estimate holding time based on trade sequence and P/L patterns
        # If we see larger losses developing over time, suggests holding losers
        loss_sizes = losses['P/L'].abs().sort_values(ascending=False)
        win_sizes = wins['P/L'].sort_values(ascending=False)
        
        # Check if losses are getting larger (indicating holding losers)
        if len(loss_sizes) > 1:
            # Compare recent losses to earlier losses
            recent_losses = loss_sizes.head(max(1, len(loss_sizes) // 3))
            earlier_losses = loss_sizes.tail(max(1, len(loss_sizes) // 3))
            loss_escalation = recent_losses.mean() / earlier_losses.mean() if earlier_losses.mean() > 0 else 1
        else:
            loss_escalation = 1
        
        # Pattern 3: Large losses relative to wins (breaching risk thresholds)
        largest_win = wins['P/L'].max()
        largest_loss = abs(losses['P/L'].min())
        loss_to_win_ratio = largest_loss / largest_win if largest_win > 0 else 0
        
        # Pattern 4: Distribution analysis - many small wins, few large losses
        # This suggests cutting winners short but letting losers run
        median_win = wins['P/L'].median()
        median_loss = abs(losses['P/L'].median())
        win_rate = (len(wins) / len(self.df)) * 100
        
        # Check for pattern: high win rate but poor risk-reward (cutting winners)
        cutting_winners_pattern = win_rate > 55 and risk_reward_ratio < 1.2
        
        # Score calculation based on harmful patterns
        score = 0
        
        # Pattern 1: Small gains, large losses (poor risk-reward)
        if risk_reward_ratio < 0.7:
            score += 35  # Very poor ratio
        elif risk_reward_ratio < 1.0:
            score += 25
        elif risk_reward_ratio < 1.3:
            score += 15
        
        # Pattern 2: Losses escalating (holding losers longer)
        if loss_escalation > 1.5:
            score += 25
        elif loss_escalation > 1.2:
            score += 15
        
        # Pattern 3: Large losses relative to wins (breaching thresholds)
        if loss_to_win_ratio > 3.0:
            score += 30
        elif loss_to_win_ratio > 2.0:
            score += 20
        
        # Pattern 4: Cutting winners short (high win rate, low avg win)
        if cutting_winners_pattern:
            score += 20
        
        # Additional: Median analysis - if median loss >> median win
        if median_loss > median_win * 2:
            score += 15
        
        severity = 'Low' if score < 30 else 'Moderate' if score < 60 else 'High'
        
        return {
            'detected': score > 25,
            'severity': severity,
            'score': min(100, round(score, 1)),
            'metrics': {
                'risk_reward_ratio': round(risk_reward_ratio, 2),
                'avg_win': round(avg_win, 2),
                'avg_loss': round(abs(avg_loss), 2),
                'median_win': round(median_win, 2),
                'median_loss': round(median_loss, 2),
                'win_rate': round(win_rate, 1),
                'largest_win': round(largest_win, 2),
                'largest_loss': round(largest_loss, 2),
                'loss_to_win_ratio': round(loss_to_win_ratio, 2),
                'loss_escalation_factor': round(loss_escalation, 2)
            },
            'description': self._get_loss_aversion_description(severity, risk_reward_ratio, loss_to_win_ratio, cutting_winners_pattern)
        }
    
    def detect_revenge_trading(self):
        """
        Detect revenge trading bias based on harmful patterns:
        - Sharp increase in trade size or frequency immediately following a large loss
        - Rapid re-entry into the same asset after a losing trade
        - Emotional clustering of trades within minutes of a significant negative P/L
        - Escalating risk exposure after consecutive losses
        """
        if len(self.df) < 2:
            return {
                'detected': False,
                'severity': 'Low',
                'score': 0,
                'metrics': {},
                'description': 'Insufficient data to detect revenge trading patterns.'
            }
        
        # Calculate time between trades
        self.df['Time_Since_Prev'] = self.df['Timestamp'].diff().dt.total_seconds() / 60  # minutes
        self.df['Prev_Is_Loss'] = self.df['Is_Loss'].shift(1)
        self.df['Prev_PL'] = self.df['P/L'].shift(1)
        self.df['Prev_Asset'] = self.df['Asset'].shift(1)
        
        # Pattern 1: Identify large losses (top 20% of losses)
        losses = self.df[self.df['Is_Loss']]
        if len(losses) == 0:
            return {
                'detected': False,
                'severity': 'Low',
                'score': 0,
                'metrics': {},
                'description': 'No loss patterns detected.'
            }
        
        large_loss_threshold = losses['P/L'].quantile(0.2)  # Bottom 20% (most negative)
        self.df['Prev_Is_Large_Loss'] = (self.df['Prev_PL'] <= large_loss_threshold) & (self.df['Prev_Is_Loss'] == True)
        
        # Trades after losses
        after_loss = self.df[self.df['Prev_Is_Loss'] == True]
        after_large_loss = self.df[self.df['Prev_Is_Large_Loss'] == True]
        after_win = self.df[self.df['Prev_Is_Loss'] == False]
        
        if len(after_loss) == 0:
            return {
                'detected': False,
                'severity': 'Low',
                'score': 0,
                'metrics': {},
                'description': 'No consecutive loss patterns detected.'
            }
        
        # Pattern 1: Sharp increase in trade size after large loss
        avg_abs_pl_after_large_loss = abs(after_large_loss['P/L']).mean() if len(after_large_loss) > 0 else 0
        avg_abs_pl_normal = abs(self.df['P/L']).mean()
        size_increase_ratio = avg_abs_pl_after_large_loss / avg_abs_pl_normal if avg_abs_pl_normal > 0 else 1
        
        # Pattern 2: Rapid re-entry into same asset after losing trade
        same_asset_after_loss = after_loss[after_loss['Asset'] == after_loss['Prev_Asset']]
        same_asset_rapid = same_asset_after_loss[same_asset_after_loss['Time_Since_Prev'] < 30]  # Within 30 minutes
        rapid_same_asset_pct = (len(same_asset_rapid) / len(after_loss)) * 100 if len(after_loss) > 0 else 0
        
        # Pattern 3: Emotional clustering within minutes of significant negative P/L
        # Trades within 15 minutes after a loss
        emotional_cluster = after_loss[after_loss['Time_Since_Prev'] < 15]
        emotional_cluster_pct = (len(emotional_cluster) / len(after_loss)) * 100 if len(after_loss) > 0 else 0
        
        # Pattern 4: Escalating risk after consecutive losses
        # Track consecutive losses
        self.df['Consecutive_Losses'] = 0
        consecutive_count = 0
        for idx, row in self.df.iterrows():
            if row['Is_Loss']:
                consecutive_count += 1
            else:
                consecutive_count = 0
            self.df.at[idx, 'Consecutive_Losses'] = consecutive_count
        
        # Check if trade size increases with consecutive losses
        trades_after_multiple_losses = self.df[self.df['Consecutive_Losses'] >= 2]
        if len(trades_after_multiple_losses) > 0:
            avg_size_after_multiple = abs(trades_after_multiple_losses['P/L']).mean()
            escalation_ratio = avg_size_after_multiple / avg_abs_pl_normal if avg_abs_pl_normal > 0 else 1
        else:
            escalation_ratio = 1
        
        # Average time between trades after losses vs after wins
        avg_time_after_loss = after_loss['Time_Since_Prev'].mean()
        avg_time_after_win = after_win['Time_Since_Prev'].mean() if len(after_win) > 0 else avg_time_after_loss
        
        # Win rate after losses
        win_rate_after_loss = (after_loss['Is_Win'].sum() / len(after_loss)) * 100 if len(after_loss) > 0 else 0
        
        # Score calculation based on harmful patterns
        score = 0
        
        # Pattern 1: Sharp increase in trade size after large loss (>50% increase)
        if size_increase_ratio > 1.5:
            score += 30
        elif size_increase_ratio > 1.3:
            score += 20
        
        # Pattern 2: Rapid re-entry into same asset (>30% of trades)
        if rapid_same_asset_pct > 40:
            score += 25
        elif rapid_same_asset_pct > 25:
            score += 15
        
        # Pattern 3: Emotional clustering (>50% within 15 minutes)
        if emotional_cluster_pct > 50:
            score += 30
        elif emotional_cluster_pct > 30:
            score += 20
        
        # Pattern 4: Escalating risk after consecutive losses
        if escalation_ratio > 1.4:
            score += 25
        elif escalation_ratio > 1.2:
            score += 15
        
        # Additional: Much faster trading after losses
        if avg_time_after_loss < avg_time_after_win * 0.4:
            score += 15
        
        # Poor win rate after losses suggests emotional trading
        if win_rate_after_loss < 35:
            score += 15
        
        severity = 'Low' if score < 30 else 'Moderate' if score < 60 else 'High'
        
        return {
            'detected': score > 25,
            'severity': severity,
            'score': min(100, round(score, 1)),
            'metrics': {
                'avg_minutes_after_loss': round(avg_time_after_loss, 1) if not pd.isna(avg_time_after_loss) else 0,
                'avg_minutes_after_win': round(avg_time_after_win, 1) if not pd.isna(avg_time_after_win) else 0,
                'rapid_same_asset_pct': round(rapid_same_asset_pct, 1),
                'emotional_cluster_pct': round(emotional_cluster_pct, 1),
                'win_rate_after_loss': round(win_rate_after_loss, 1),
                'size_increase_after_large_loss': round(size_increase_ratio, 2),
                'risk_escalation_ratio': round(escalation_ratio, 2),
                'trades_after_consecutive_losses': len(trades_after_multiple_losses)
            },
            'description': self._get_revenge_trading_description(severity, emotional_cluster_pct, rapid_same_asset_pct, escalation_ratio)
        }
    
    def generate_summary(self):
        """Generate overall summary of detected biases"""
        total_trades = len(self.df)
        total_pl = self.df['P/L'].sum()
        win_rate = (self.df['Is_Win'].sum() / total_trades) * 100
        
        biases_detected = []
        if self.detect_overtrading()['detected']:
            biases_detected.append('Overtrading')
        if self.detect_loss_aversion()['detected']:
            biases_detected.append('Loss Aversion')
        if self.detect_revenge_trading()['detected']:
            biases_detected.append('Revenge Trading')
        
        return {
            'total_trades': total_trades,
            'total_pnl': round(total_pl, 2),
            'win_rate': round(win_rate, 1),
            'biases_detected': biases_detected,
            'bias_count': len(biases_detected)
        }
    
    def generate_recommendations(self):
        """Generate personalized recommendations based on detected biases"""
        recommendations = []
        
        overtrading = self.detect_overtrading()
        loss_aversion = self.detect_loss_aversion()
        revenge_trading = self.detect_revenge_trading()
        
        if overtrading['detected']:
            avg_trades = overtrading['metrics']['avg_trades_per_day']
            recommendations.append({
                'bias': 'Overtrading',
                'recommendation': f'Set a daily trade limit of {max(5, int(avg_trades * 0.5))} trades per day',
                'priority': 'High' if overtrading['severity'] == 'High' else 'Medium'
            })
            recommendations.append({
                'bias': 'Overtrading',
                'recommendation': 'Implement a mandatory 30-minute cooldown period between trades',
                'priority': 'Medium'
            })
        
        if loss_aversion['detected']:
            rr_ratio = loss_aversion['metrics']['risk_reward_ratio']
            recommendations.append({
                'bias': 'Loss Aversion',
                'recommendation': f'Set stop-loss orders at 2% and take-profit at {max(3, int(rr_ratio * 2))}% to improve risk-reward ratio',
                'priority': 'High' if loss_aversion['severity'] == 'High' else 'Medium'
            })
            recommendations.append({
                'bias': 'Loss Aversion',
                'recommendation': 'Use trailing stop-losses to let winners run while protecting gains',
                'priority': 'Medium'
            })
        
        if revenge_trading['detected']:
            recommendations.append({
                'bias': 'Revenge Trading',
                'recommendation': 'Implement a mandatory 2-hour break after any losing trade',
                'priority': 'High' if revenge_trading['severity'] == 'High' else 'Medium'
            })
            recommendations.append({
                'bias': 'Revenge Trading',
                'recommendation': 'Reduce position size by 50% for the next 3 trades after a loss',
                'priority': 'Medium'
            })
        
        # General recommendations
        if not recommendations:
            recommendations.append({
                'bias': 'General',
                'recommendation': 'Maintain a trading journal to track emotions and decisions',
                'priority': 'Low'
            })
            recommendations.append({
                'bias': 'General',
                'recommendation': 'Review your trading plan weekly and stick to predefined rules',
                'priority': 'Low'
            })
        
        return recommendations
    
    def get_statistics(self):
        """Get comprehensive trading statistics"""
        return {
            'total_trades': len(self.df),
            'winning_trades': int(self.df['Is_Win'].sum()),
            'losing_trades': int(self.df['Is_Loss'].sum()),
            'total_pnl': round(self.df['P/L'].sum(), 2),
            'avg_pnl': round(self.df['P/L'].mean(), 2),
            'largest_win': round(self.df['P/L'].max(), 2),
            'largest_loss': round(self.df['P/L'].min(), 2),
            'win_rate': round((self.df['Is_Win'].sum() / len(self.df)) * 100, 1),
            'trading_days': len(self.df['Date'].unique()),
            'unique_assets': int(self.df['Asset'].nunique()),
            'human_tax': self.calculate_human_tax(),
            'prosperity_projection': self.calculate_prosperity_projection()
        }

    def calculate_human_tax(self):
        """
        Calculate 'Human Tax': Total losses from likely biased trades.
        Biased trades:
        1. Overtrading: Trades beyond 5 per day.
        2. Rapid Fire: Trades within 1 minute of previous.
        3. Revenge Trading: Trades within 15 minutes of a loss.
        """
        human_tax = 0.0
        
        # Prepare data
        df = self.df.copy()
        df['Timestamp'] = pd.to_datetime(df['Timestamp'])
        df = df.sort_values('Timestamp')
        df['Date'] = df['Timestamp'].dt.date
        
        # Calculate time diffs and previous outcomes
        df['TimeDiff'] = df['Timestamp'].diff().dt.total_seconds() / 60.0
        df['PrevPL'] = df['P/L'].shift(1)
        df['PrevIsLoss'] = df['PrevPL'] < 0
        
        # Daily trade count
        trade_counts = df.groupby('Date').cumcount() + 1
        df['DailyTradeNum'] = trade_counts.values # Assign back correctly

        for index, row in df.iterrows():
            if row['P/L'] >= 0:
                continue # Only count losses
            
            is_biased = False
            
            # 1. Overtrading (> 8 trades/day) - Adjusted to be slightly more lenient than 5
            if row['DailyTradeNum'] > 8:
                is_biased = True
                
            # 2. Rapid Fire (< 1 min)
            if pd.notna(row['TimeDiff']) and row['TimeDiff'] < 1.0:
                is_biased = True
                
            # 3. Revenge Trading (< 15 mins after loss)
            if pd.notna(row['TimeDiff']) and row['TimeDiff'] < 15.0 and row['PrevIsLoss']:
                is_biased = True
                
            if is_biased:
                human_tax += abs(row['P/L'])
                
        return round(human_tax, 2)

    def calculate_prosperity_projection(self):
        """
        Project 10-year growth of the Human Tax at 7% annual return.
        """
        tax = self.calculate_human_tax()
        rate = 0.07
        years = 10
        projection = tax * ((1 + rate) ** years)
        return round(projection, 2)
    
    def _get_overtrading_description(self, severity, avg_trades, rapid_pct, cost_ratio):
        if severity == 'High':
            return f"You're averaging {avg_trades:.1f} trades per day with {rapid_pct:.1f}% occurring within 1 minute. Transaction costs represent {cost_ratio:.1f}% of your net returns. This suggests impulsive, strategy-less trading."
        elif severity == 'Moderate':
            return f"Your trading frequency ({avg_trades:.1f} trades/day) is elevated (>10/day) with {rapid_pct:.1f}% rapid-fire trades. Consider filtering for only A+ setups."
        else:
            return "Your trading frequency appears reasonable (<10/day), but continue to monitor for impulsive trades."
    
    def _get_loss_aversion_description(self, severity, rr_ratio, loss_win_ratio, cutting_winners):
        if severity == 'High':
            desc = f"Your risk-reward ratio ({rr_ratio:.2f}) shows small average gains but large average losses. "
            if loss_win_ratio > 2:
                desc += f"Your largest loss is {loss_win_ratio:.1f}x your largest win, indicating you're holding losing positions too long. "
            if cutting_winners:
                desc += "High win rate with low average wins suggests cutting winners short."
            return desc
        elif severity == 'Moderate':
            return f"Your risk-reward ratio ({rr_ratio:.2f}) could be improved. Consider letting winners run longer and cutting losses faster when they breach your risk threshold."
        else:
            return "Your risk-reward management appears balanced."
    
    def _get_revenge_trading_description(self, severity, emotional_pct, rapid_same_asset, escalation):
        if severity == 'High':
            desc = f"You're clustering {emotional_pct:.1f}% of trades within 15 minutes after losses. "
            if rapid_same_asset > 30:
                desc += f"{rapid_same_asset:.1f}% involve rapid re-entry into the same asset. "
            if escalation > 1.3:
                desc += f"Trade sizes increase {((escalation-1)*100):.0f}% after consecutive losses, showing escalating risk exposure."
            return desc + "This suggests emotionally driven attempts to 'win back' money."
        elif severity == 'Moderate':
            return f"You show some tendency to trade quickly after losses ({emotional_pct:.1f}% within 15 minutes). Take breaks after losses to avoid emotional decisions."
        else:
            return "You're managing emotions well after losses. Continue this discipline."
