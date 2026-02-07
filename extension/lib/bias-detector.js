// Bias Detector - JavaScript implementation
class BiasDetector {
    constructor(trades) {
        this.trades = trades.map(t => ({
            ...t,
            timestamp: new Date(t.timestamp || t.Timestamp),
            pl: parseFloat(t.pl || t['P/L'] || 0),
            action: t.action || t['Buy/sell'] || 'Buy',
            asset: t.asset || t.Asset || 'Unknown'
        })).filter(t => !isNaN(t.timestamp.getTime()) && !isNaN(t.pl))
            .sort((a, b) => a.timestamp - b.timestamp);

        // Calculate additional metrics
        this.trades.forEach(t => {
            t.isLoss = t.pl < 0;
            t.isWin = t.pl > 0;
            t.date = t.timestamp.toISOString().split('T')[0];
        });
    }

    detectOvertrading() {
        if (this.trades.length === 0) {
            return this._emptyResult('Overtrading');
        }

        // Group trades by date
        const tradesByDate = {};
        this.trades.forEach(t => {
            if (!tradesByDate[t.date]) tradesByDate[t.date] = [];
            tradesByDate[t.date].push(t);
        });

        const tradesPerDay = Object.values(tradesByDate).map(arr => arr.length);
        const avgTradesPerDay = tradesPerDay.reduce((a, b) => a + b, 0) / tradesPerDay.length;
        const maxTradesPerDay = Math.max(...tradesPerDay);

        // Calculate time differences
        const timeDiffs = [];
        for (let i = 1; i < this.trades.length; i++) {
            const diff = (this.trades[i].timestamp - this.trades[i - 1].timestamp) / (1000 * 60); // minutes
            if (diff > 0) {
                timeDiffs.push(diff);
                this.trades[i].timeSincePrev = diff;
                this.trades[i].prevPL = this.trades[i - 1].pl;
            }
        }
        const avgTimeBetween = timeDiffs.length > 0
            ? timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length
            : 0;

        // Pattern 1: Rapid-fire trades (within 1 minute)
        const rapidTrades = timeDiffs.filter(d => d < 1).length;
        const rapidTradePct = (rapidTrades / this.trades.length) * 100;

        // Pattern 2: Increasing frequency after small gains/losses
        const avgTradeSize = Math.abs(this.trades.reduce((sum, t) => sum + Math.abs(t.pl), 0) / this.trades.length);
        const smallMoveThreshold = avgTradeSize * 0.02;

        const tradesAfterSmallMoves = this.trades.filter(t =>
            t.prevPL !== undefined && Math.abs(t.prevPL) <= smallMoveThreshold
        );

        let frequencyIncreaseRatio = 1;
        if (tradesAfterSmallMoves.length > 0) {
            const avgTimeAfterSmall = tradesAfterSmallMoves.reduce((sum, t) => sum + (t.timeSincePrev || 0), 0) / tradesAfterSmallMoves.length;
            frequencyIncreaseRatio = avgTimeBetween / avgTimeAfterSmall;
        }

        // Pattern 3: High transaction costs relative to net returns
        const estimatedCostPerTrade = avgTradeSize * 0.001; // 0.1% estimate
        const totalEstimatedCosts = this.trades.length * estimatedCostPerTrade;
        const totalNetReturn = this.trades.reduce((sum, t) => sum + t.pl, 0);
        const costToReturnRatio = totalNetReturn !== 0 ? Math.abs(totalEstimatedCosts / totalNetReturn) : 0;

        // Score calculation based on harmful patterns
        let score = 0;

        // Pattern 1: Excessively high trades per day (>50/day avg or >80/day max)
        if (avgTradesPerDay > 50) {
            score += Math.min(20, (avgTradesPerDay / 50) * 8);
        }
        if (maxTradesPerDay > 80) {
            score += Math.min(15, (maxTradesPerDay / 80) * 8);
        }

        // Pattern 2: Rapid-fire trades (>60% within 1 minute)
        if (rapidTradePct > 60) {
            score += Math.min(20, (rapidTradePct / 60) * 10);
        } else if (rapidTradePct > 40) {
            score += Math.min(10, (rapidTradePct / 40) * 5);
        }

        // Pattern 3: Increasing frequency after small moves
        if (frequencyIncreaseRatio > 3.0) {
            score += Math.min(10, (frequencyIncreaseRatio / 3.0) * 6);
        }

        // Pattern 4: High transaction costs relative to returns
        if (costToReturnRatio > 0.8 && totalNetReturn > 0) {
            score += Math.min(10, (costToReturnRatio / 0.8) * 6);
        } else if (costToReturnRatio > 1.5) {
            score += 15; // Costs greatly exceed returns
        }

        const severity = score < 50 ? 'Low' : score < 80 ? 'Moderate' : 'High';

        return {
            detected: score > 50,
            severity: severity,
            score: Math.min(100, Math.round(score * 10) / 10),
            metrics: {
                avg_trades_per_day: Math.round(avgTradesPerDay * 100) / 100,
                max_trades_per_day: maxTradesPerDay,
                rapid_trade_percentage: Math.round(rapidTradePct * 10) / 10,
                avg_minutes_between_trades: Math.round(avgTimeBetween * 10) / 10,
                frequency_increase_after_small_moves: Math.round(frequencyIncreaseRatio * 100) / 100,
                cost_to_return_ratio: Math.round(costToReturnRatio * 1000) / 10,
                total_estimated_costs: Math.round(totalEstimatedCosts * 100) / 100,
                total_net_return: Math.round(totalNetReturn * 100) / 100
            },
            description: this._getOvertradingDescription(severity, avgTradesPerDay, rapidTradePct, costToReturnRatio)
        };
    }

    detectLossAversion() {
        const wins = this.trades.filter(t => t.isWin);
        const losses = this.trades.filter(t => t.isLoss);

        if (wins.length === 0 || losses.length === 0) {
            return {
                detected: false,
                severity: 'Low',
                score: 0,
                metrics: {},
                description: 'Insufficient data to detect loss aversion patterns.'
            };
        }

        // Pattern 1: Small average gains but large average losses
        const avgWin = wins.reduce((sum, t) => sum + t.pl, 0) / wins.length;
        const avgLoss = Math.abs(losses.reduce((sum, t) => sum + t.pl, 0) / losses.length);
        const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

        // Pattern 2: Loss escalation (holding losers longer)
        const lossSizes = losses.map(t => Math.abs(t.pl)).sort((a, b) => b - a);
        let lossEscalation = 1;
        if (lossSizes.length > 1) {
            const recentLosses = lossSizes.slice(0, Math.max(1, Math.floor(lossSizes.length / 3)));
            const earlierLosses = lossSizes.slice(-Math.max(1, Math.floor(lossSizes.length / 3)));
            const recentAvg = recentLosses.reduce((a, b) => a + b, 0) / recentLosses.length;
            const earlierAvg = earlierLosses.reduce((a, b) => a + b, 0) / earlierLosses.length;
            lossEscalation = earlierAvg > 0 ? recentAvg / earlierAvg : 1;
        }

        // Pattern 3: Large losses relative to wins (breaching thresholds)
        const largestWin = Math.max(...wins.map(t => t.pl));
        const largestLoss = Math.abs(Math.min(...losses.map(t => t.pl)));
        const lossToWinRatio = largestWin > 0 ? largestLoss / largestWin : 0;

        // Pattern 4: Distribution analysis
        const winSizes = wins.map(t => t.pl).sort((a, b) => a - b);
        const medianWin = winSizes[Math.floor(winSizes.length / 2)];
        const medianLoss = lossSizes[Math.floor(lossSizes.length / 2)];
        const winRate = (wins.length / this.trades.length) * 100;
        const cuttingWinnersPattern = winRate > 55 && riskRewardRatio < 1.2;

        // Score calculation
        let score = 0;

        // Pattern 1: Small gains, large losses
        if (riskRewardRatio < 0.7) {
            score += 35;
        } else if (riskRewardRatio < 1.0) {
            score += 25;
        } else if (riskRewardRatio < 1.3) {
            score += 15;
        }

        // Pattern 2: Loss escalation
        if (lossEscalation > 1.5) {
            score += 25;
        } else if (lossEscalation > 1.2) {
            score += 15;
        }

        // Pattern 3: Large losses relative to wins
        if (lossToWinRatio > 3.0) {
            score += 30;
        } else if (lossToWinRatio > 2.0) {
            score += 20;
        }

        // Pattern 4: Cutting winners short
        if (cuttingWinnersPattern) {
            score += 20;
        }

        // Additional: Median analysis
        if (medianLoss > medianWin * 2) {
            score += 15;
        }

        const severity = score < 30 ? 'Low' : score < 60 ? 'Moderate' : 'High';

        return {
            detected: score > 25,
            severity: severity,
            score: Math.min(100, Math.round(score * 10) / 10),
            metrics: {
                risk_reward_ratio: Math.round(riskRewardRatio * 100) / 100,
                avg_win: Math.round(avgWin * 100) / 100,
                avg_loss: Math.round(avgLoss * 100) / 100,
                median_win: Math.round(medianWin * 100) / 100,
                median_loss: Math.round(medianLoss * 100) / 100,
                win_rate: Math.round(winRate * 10) / 10,
                largest_win: Math.round(largestWin * 100) / 100,
                largest_loss: Math.round(largestLoss * 100) / 100,
                loss_to_win_ratio: Math.round(lossToWinRatio * 100) / 100,
                loss_escalation_factor: Math.round(lossEscalation * 100) / 100
            },
            description: this._getLossAversionDescription(severity, riskRewardRatio, lossToWinRatio, cuttingWinnersPattern)
        };
    }

    detectRevengeTrading() {
        if (this.trades.length < 2) {
            return {
                detected: false,
                severity: 'Low',
                score: 0,
                metrics: {},
                description: 'Insufficient data to detect revenge trading patterns.'
            };
        }

        // Prepare trade data with previous trade info
        for (let i = 1; i < this.trades.length; i++) {
            const prevTrade = this.trades[i - 1];
            const currTrade = this.trades[i];
            currTrade.timeSincePrev = (currTrade.timestamp - prevTrade.timestamp) / (1000 * 60);
            currTrade.prevIsLoss = prevTrade.isLoss;
            currTrade.prevPL = prevTrade.pl;
            currTrade.prevAsset = prevTrade.asset;
        }

        // Pattern 1: Identify large losses (bottom 20% of losses)
        const losses = this.trades.filter(t => t.isLoss);
        if (losses.length === 0) {
            return {
                detected: false,
                severity: 'Low',
                score: 0,
                metrics: {},
                description: 'No loss patterns detected.'
            };
        }

        const lossSizes = losses.map(t => Math.abs(t.pl)).sort((a, b) => a - b);
        const largeLossThreshold = lossSizes[Math.floor(lossSizes.length * 0.2)] || 0;

        // Trades after losses
        const afterLoss = this.trades.filter(t => t.prevIsLoss === true && t.timeSincePrev !== undefined);
        const afterLargeLoss = afterLoss.filter(t => Math.abs(t.prevPL) >= largeLossThreshold);
        const afterWin = this.trades.filter(t => t.prevIsLoss === false && t.timeSincePrev !== undefined);

        if (afterLoss.length === 0) {
            return {
                detected: false,
                severity: 'Low',
                score: 0,
                metrics: {},
                description: 'No consecutive loss patterns detected.'
            };
        }

        // Pattern 1: Sharp increase in trade size after large loss
        const avgAbsPlAfterLargeLoss = afterLargeLoss.length > 0
            ? afterLargeLoss.reduce((sum, t) => sum + Math.abs(t.pl), 0) / afterLargeLoss.length
            : 0;
        const avgAbsPlNormal = this.trades.reduce((sum, t) => sum + Math.abs(t.pl), 0) / this.trades.length;
        const sizeIncreaseRatio = avgAbsPlNormal > 0 ? avgAbsPlAfterLargeLoss / avgAbsPlNormal : 1;

        // Pattern 2: Rapid re-entry into same asset after losing trade
        const sameAssetAfterLoss = afterLoss.filter(t => t.asset === t.prevAsset);
        const sameAssetRapid = sameAssetAfterLoss.filter(t => t.timeSincePrev < 30);
        const rapidSameAssetPct = afterLoss.length > 0
            ? (sameAssetRapid.length / afterLoss.length) * 100
            : 0;

        // Pattern 3: Emotional clustering within minutes of significant negative P/L
        const emotionalCluster = afterLoss.filter(t => t.timeSincePrev < 15);
        const emotionalClusterPct = afterLoss.length > 0
            ? (emotionalCluster.length / afterLoss.length) * 100
            : 0;

        // Pattern 4: Escalating risk after consecutive losses
        let consecutiveCount = 0;
        const tradesAfterMultipleLosses = [];
        for (let i = 0; i < this.trades.length; i++) {
            if (this.trades[i].isLoss) {
                consecutiveCount++;
            } else {
                consecutiveCount = 0;
            }
            if (consecutiveCount >= 2 && i > 0) {
                tradesAfterMultipleLosses.push(this.trades[i]);
            }
        }

        let escalationRatio = 1;
        if (tradesAfterMultipleLosses.length > 0) {
            const avgSizeAfterMultiple = tradesAfterMultipleLosses.reduce((sum, t) => sum + Math.abs(t.pl), 0) / tradesAfterMultipleLosses.length;
            escalationRatio = avgAbsPlNormal > 0 ? avgSizeAfterMultiple / avgAbsPlNormal : 1;
        }

        const avgTimeAfterLoss = afterLoss.reduce((sum, t) => sum + t.timeSincePrev, 0) / afterLoss.length;
        const avgTimeAfterWin = afterWin.length > 0
            ? afterWin.reduce((sum, t) => sum + t.timeSincePrev, 0) / afterWin.length
            : avgTimeAfterLoss;

        const winRateAfterLoss = (afterLoss.filter(t => t.isWin).length / afterLoss.length) * 100;

        // Score calculation
        let score = 0;

        // Pattern 1: Sharp increase in trade size after large loss
        if (sizeIncreaseRatio > 1.5) {
            score += 30;
        } else if (sizeIncreaseRatio > 1.3) {
            score += 20;
        }

        // Pattern 2: Rapid re-entry into same asset
        if (rapidSameAssetPct > 40) {
            score += 25;
        } else if (rapidSameAssetPct > 25) {
            score += 15;
        }

        // Pattern 3: Emotional clustering
        if (emotionalClusterPct > 50) {
            score += 30;
        } else if (emotionalClusterPct > 30) {
            score += 20;
        }

        // Pattern 4: Escalating risk after consecutive losses
        if (escalationRatio > 1.4) {
            score += 25;
        } else if (escalationRatio > 1.2) {
            score += 15;
        }

        // Additional patterns
        if (avgTimeAfterLoss < avgTimeAfterWin * 0.4) {
            score += 15;
        }
        if (winRateAfterLoss < 35) {
            score += 15;
        }

        const severity = score < 30 ? 'Low' : score < 60 ? 'Moderate' : 'High';

        return {
            detected: score > 25,
            severity: severity,
            score: Math.min(100, Math.round(score * 10) / 10),
            metrics: {
                avg_minutes_after_loss: Math.round(avgTimeAfterLoss * 10) / 10,
                avg_minutes_after_win: Math.round(avgTimeAfterWin * 10) / 10,
                rapid_same_asset_pct: Math.round(rapidSameAssetPct * 10) / 10,
                emotional_cluster_pct: Math.round(emotionalClusterPct * 10) / 10,
                win_rate_after_loss: Math.round(winRateAfterLoss * 10) / 10,
                size_increase_after_large_loss: Math.round(sizeIncreaseRatio * 100) / 100,
                risk_escalation_ratio: Math.round(escalationRatio * 100) / 100,
                trades_after_consecutive_losses: tradesAfterMultipleLosses.length
            },
            description: this._getRevengeTradingDescription(severity, emotionalClusterPct, rapidSameAssetPct, escalationRatio)
        };
    }

    generateSummary() {
        const totalTrades = this.trades.length;
        const totalPnL = this.trades.reduce((sum, t) => sum + t.pl, 0);
        const winRate = (this.trades.filter(t => t.isWin).length / totalTrades) * 100;

        const biases = [];
        if (this.detectOvertrading().detected) biases.push('Overtrading');
        if (this.detectLossAversion().detected) biases.push('Loss Aversion');
        if (this.detectRevengeTrading().detected) biases.push('Revenge Trading');

        return {
            total_trades: totalTrades,
            total_pnl: Math.round(totalPnL * 100) / 100,
            win_rate: Math.round(winRate * 10) / 10,
            biases_detected: biases,
            bias_count: biases.length
        };
    }

    generateRecommendations() {
        const recommendations = [];
        const overtrading = this.detectOvertrading();
        const lossAversion = this.detectLossAversion();
        const revengeTrading = this.detectRevengeTrading();

        if (overtrading.detected) {
            const avgTrades = overtrading.metrics.avg_trades_per_day;
            recommendations.push({
                bias: 'Overtrading',
                recommendation: `Set a daily trade limit of ${Math.max(5, Math.floor(avgTrades * 0.5))} trades per day`,
                priority: overtrading.severity === 'High' ? 'High' : 'Medium'
            });
            recommendations.push({
                bias: 'Overtrading',
                recommendation: 'Implement a mandatory 30-minute cooldown period between trades',
                priority: 'Medium'
            });
        }

        if (lossAversion.detected) {
            const rrRatio = lossAversion.metrics.risk_reward_ratio;
            recommendations.push({
                bias: 'Loss Aversion',
                recommendation: `Set stop-loss orders at 2% and take-profit at ${Math.max(3, Math.floor(rrRatio * 2))}% to improve risk-reward ratio`,
                priority: lossAversion.severity === 'High' ? 'High' : 'Medium'
            });
            recommendations.push({
                bias: 'Loss Aversion',
                recommendation: 'Use trailing stop-losses to let winners run while protecting gains',
                priority: 'Medium'
            });
        }

        if (revengeTrading.detected) {
            recommendations.push({
                bias: 'Revenge Trading',
                recommendation: 'Implement a mandatory 2-hour break after any losing trade',
                priority: revengeTrading.severity === 'High' ? 'High' : 'Medium'
            });
            recommendations.push({
                bias: 'Revenge Trading',
                recommendation: 'Reduce position size by 50% for the next 3 trades after a loss',
                priority: 'Medium'
            });
        }

        if (recommendations.length === 0) {
            recommendations.push({
                bias: 'General',
                recommendation: 'Maintain a trading journal to track emotions and decisions',
                priority: 'Low'
            });
        }

        return recommendations;
    }

    getStatistics() {
        const wins = this.trades.filter(t => t.isWin);
        const losses = this.trades.filter(t => t.isLoss);
        const totalPnL = this.trades.reduce((sum, t) => sum + t.pl, 0);
        const avgPnL = totalPnL / this.trades.length;
        const uniqueAssets = new Set(this.trades.map(t => t.asset)).size;
        const uniqueDates = new Set(this.trades.map(t => t.date)).size;

        return {
            total_trades: this.trades.length,
            winning_trades: wins.length,
            losing_trades: losses.length,
            total_pnl: Math.round(totalPnL * 100) / 100,
            avg_pnl: Math.round(avgPnL * 100) / 100,
            largest_win: Math.round(Math.max(...this.trades.map(t => t.pl)) * 100) / 100,
            largest_loss: Math.round(Math.min(...this.trades.map(t => t.pl)) * 100) / 100,
            win_rate: Math.round((wins.length / this.trades.length) * 1000) / 10,
            trading_days: uniqueDates,
            unique_assets: uniqueAssets,
            human_tax: this.calculateHumanTax(),
            prosperity_projection: this.calculateProsperityProjection()
        };
    }

    calculateHumanTax() {
        // Human Tax = Sum of losses from biased trades
        // We identify biased trades as those contributing to detected patterns
        let humanTax = 0;

        // 1. Overtrading: Trades after the daily limit (e.g. > 5) or rapid fire
        // 2. Revenge Trading: Trades within 15 mins of a loss

        // Group by day for daily limit check
        const tradesByDate = {};
        this.trades.forEach(t => {
            if (!tradesByDate[t.date]) tradesByDate[t.date] = [];
            tradesByDate[t.date].push(t);
        });

        this.trades.forEach((t, index) => {
            if (t.pl >= 0) return; // Only count losses as "tax" (missed opportunity cost is harder to quantify)

            let isBiased = false;

            // Check Overtrading (Daily limit > 5)
            const dailyTrades = tradesByDate[t.date];
            const dailyIndex = dailyTrades.indexOf(t);
            if (dailyIndex >= 5) isBiased = true;

            // Check Rapid Fire (< 1 min from prev)
            if (t.timeSincePrev !== undefined && t.timeSincePrev < 1) isBiased = true;

            // Check Revenge Trading (within 15 mins of loss)
            if (t.timeSincePrev !== undefined && t.timeSincePrev < 15 && t.prevIsLoss) isBiased = true;

            if (isBiased) {
                humanTax += Math.abs(t.pl);
            }
        });

        return Math.round(humanTax * 100) / 100;
    }

    calculateProsperityProjection() {
        const tax = this.calculateHumanTax();
        // 10-year projection at 7% annual return
        const rate = 0.07;
        const years = 10;
        const projection = tax * Math.pow(1 + rate, years);
        return Math.round(projection * 100) / 100;
    }

    _emptyResult(biasName) {
        return {
            detected: false,
            severity: 'Low',
            score: 0,
            metrics: {},
            description: `Insufficient data to detect ${biasName.toLowerCase()} patterns.`
        };
    }

    _getOvertradingDescription(severity, avgTrades, rapidPct, costRatio) {
        if (severity === 'High') {
            return `You're averaging ${avgTrades.toFixed(1)} trades per day with ${rapidPct.toFixed(1)}% occurring within 1 minute. Transaction costs represent ${(costRatio * 100).toFixed(1)}% of your net returns. This suggests impulsive, strategy-less trading that increases costs and emotional stress.`;
        } else if (severity === 'Moderate') {
            return `Your trading frequency (${avgTrades.toFixed(1)} trades/day) is elevated with ${rapidPct.toFixed(1)}% rapid-fire trades. Consider whether each trade aligns with your strategy before executing.`;
        } else {
            return 'Your trading frequency appears reasonable, but monitor for impulsive trades and transaction costs.';
        }
    }

    _getLossAversionDescription(severity, rrRatio, lossWinRatio, cuttingWinners) {
        if (severity === 'High') {
            let desc = `Your risk-reward ratio (${rrRatio.toFixed(2)}) shows small average gains but large average losses. `;
            if (lossWinRatio > 2) {
                desc += `Your largest loss is ${lossWinRatio.toFixed(1)}x your largest win, indicating you're holding losing positions too long. `;
            }
            if (cuttingWinners) {
                desc += 'High win rate with low average wins suggests cutting winners short.';
            }
            return desc;
        } else if (severity === 'Moderate') {
            return `Your risk-reward ratio (${rrRatio.toFixed(2)}) could be improved. Consider letting winners run longer and cutting losses faster when they breach your risk threshold.`;
        } else {
            return 'Your risk-reward management appears balanced.';
        }
    }

    _getRevengeTradingDescription(severity, emotionalPct, rapidSameAsset, escalation) {
        if (severity === 'High') {
            let desc = `You're clustering ${emotionalPct.toFixed(1)}% of trades within 15 minutes after losses. `;
            if (rapidSameAsset > 30) {
                desc += `${rapidSameAsset.toFixed(1)}% involve rapid re-entry into the same asset. `;
            }
            if (escalation > 1.3) {
                desc += `Trade sizes increase ${((escalation - 1) * 100).toFixed(0)}% after consecutive losses, showing escalating risk exposure.`;
            }
            return desc + ' This suggests emotionally driven attempts to "win back" money.';
        } else if (severity === 'Moderate') {
            return `You show some tendency to trade quickly after losses (${emotionalPct.toFixed(1)}% within 15 minutes). Take breaks after losses to avoid emotional decisions.`;
        } else {
            return "You're managing emotions well after losses. Continue this discipline.";
        }
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BiasDetector;
}
