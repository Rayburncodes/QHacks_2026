"use strict";
(() => {
  console.log("[HeuristX] Background v2.1 loaded");
  // src/shared/constants.ts
  var DEFAULT_SETTINGS = {
    cooldownMinutes: 5,
    dailyTradeLimit: 20,
    maxSizeMultiplier: 3,
    timezone: "America/Toronto",
    baseRiskUnit: 100
  };
  var ROLLING_WINDOWS = {
    RECENT_TRADES: 20,
    LAST_24H_MS: 24 * 60 * 60 * 1e3,
    LAST_7D_MS: 7 * 24 * 60 * 60 * 1e3,
    LAST_30D_MS: 30 * 24 * 60 * 60 * 1e3
  };
  var BIAS_THRESHOLDS = {
    /* Overtrading */
    OVERTRADING_FREQUENCY_MULTIPLIER: 5,
    OVERTRADING_BURST_COUNT: 15,
    OVERTRADING_BURST_WINDOW_MINUTES: 5,
    OVERTRADING_TRADES_PER_BALANCE_PCT: 0.1, // 10% of balance in trades per day = excessive
    OVERTRADING_ASSET_SWITCH_THRESHOLD: 5, // More than 5 different assets in short period
    OVERTRADING_POST_LOSS_WINDOW_MINUTES: 60, // Window after large loss to detect revenge trading
    OVERTRADING_POST_WIN_WINDOW_MINUTES: 30, // Window after large win to detect overconfidence
    OVERTRADING_HOURLY_CLUSTER_THRESHOLD: 10, // More than 10 trades in a single hour
    /* Revenge Trading */
    REVENGE_SIZE_MULTIPLIER: 2,
    REVENGE_WINDOW_MINUTES: 30,
    /* Loss Aversion */
    LOSS_AVERSION_DRAWDOWN_PCT: 0.1,
    LOSS_AVERSION_CANCEL_COUNT: 2,
    /* Herd Mentality */
    HERD_NEW_ASSET_THRESHOLD: 3,           // fewer than N past trades on asset = "new"
    /* Anchoring */
    ANCHORING_PRICE_TOLERANCE: 0.03,       // within 3% of entry price
    ANCHORING_MIN_TRADES: 3,
    /* Recency Bias */
    RECENCY_STREAK_LENGTH: 3,
    RECENCY_SIZE_CHANGE_PCT: 0.5,          // 50% size change after streak
    /* Gambler's Fallacy */
    GAMBLER_LOSS_STREAK: 4,
    GAMBLER_SIZE_INCREASE_PCT: 0.3,        // 30% size escalation
    /* Overconfidence */
    OVERCONFIDENCE_RISK_INCREASE: 2,       // risk per trade 2× recent avg
    OVERCONFIDENCE_CONCENTRATION: 0.7,     // 70%+ in one asset
    /* Sunk Cost Fallacy */
    SUNK_COST_REPEAT_BUYS: 3,             // 3+ buys into same losing position
    SUNK_COST_TOTAL_LOSS_PCT: 0.2,        // 20% total loss on asset
    /* Mental Accounting */
    MENTAL_ACCOUNTING_RISK_SPIKE: 1.8,    // risk 1.8× after profitable day
    /* Availability Bias */
    AVAILABILITY_CONCENTRATION: 0.6,       // 60%+ trades in one "new" asset recently
    AVAILABILITY_RECENCY_HOURS: 24
  };
  var STORAGE_KEYS = {
    TRADES: "cb_trades",
    SETTINGS: "cb_settings",
    COOLDOWN: "cb_cooldown",
    FINGERPRINT: "cb_fingerprint",
    DAILY_COUNT: "cb_daily_count"
  };

  // src/shared/biasEngine.ts
  var BiasEngine = class {
    constructor(trades, currentTrade) {
      this.trades = Array.isArray(trades) ? trades : [];
      this.currentTrade = currentTrade || {};
    }
    /** Run all 13 classifiers; return only the ones that triggered. */
    analyze() {
      const detectors = [
        () => this.detectOvertrading(),
        () => this.detectRevengeTrading(),
        () => this.detectLossAversion(),
        () => this.detectHerdMentality(),
        () => this.detectAnchoringBias(),
        () => this.detectRecencyBias(),
        () => this.detectGamblersFallacy(),
        () => this.detectOverconfidence(),
        () => this.detectSunkCostFallacy(),
        () => this.detectMentalAccounting(),
        () => this.detectAvailabilityBias()
      ];
      const results = [];
      for (const fn of detectors) {
        try {
          const r = fn();
          if (r && r.detected) results.push(r);
        } catch (err) {
          console.error("[CB BiasEngine] Detector error:", err);
        }
      }
      return results;
    }
    /* ── A) Overtrading ───────────────────────────────────── */
    detectOvertrading() {
      const now = Date.now();
      const factors = [];
      let score = 0;
      const last7d = this.trades.filter(
        (t) => now - new Date(t.timestamp).getTime() < 7 * 24 * 36e5
      );
      const hoursIn7d = Math.max(
        1,
        last7d.length > 0 ? (now - Math.min(...last7d.map((t) => new Date(t.timestamp).getTime()))) / 36e5 : 168
      );
      const avg = last7d.length / hoursIn7d;
      const lastHour = this.trades.filter(
        (t) => now - new Date(t.timestamp).getTime() < 36e5
      );
      const currentRate = lastHour.length + 1;
      const ratio = avg > 0 ? currentRate / avg : currentRate > 3 ? 3 : 1;
      
      // Pattern 1: Frequency multiplier (existing)
      if (ratio > BIAS_THRESHOLDS.OVERTRADING_FREQUENCY_MULTIPLIER) {
        score += Math.min(30, ratio / BIAS_THRESHOLDS.OVERTRADING_FREQUENCY_MULTIPLIER * 12);
        factors.push(`Trading at ${ratio.toFixed(1)}\xD7 your usual rate this hour`);
      }
      
      // Pattern 2: Burst trading (existing)
      const burstMs = BIAS_THRESHOLDS.OVERTRADING_BURST_WINDOW_MINUTES * 6e4;
      const burst = this.trades.filter((t) => now - new Date(t.timestamp).getTime() < burstMs);
      if (burst.length + 1 > BIAS_THRESHOLDS.OVERTRADING_BURST_COUNT) {
        score += 20;
        factors.push(
          `${burst.length + 1} trades in the last ${BIAS_THRESHOLDS.OVERTRADING_BURST_WINDOW_MINUTES} min`
        );
      }
      
      // Pattern 3: Time-based clustering - trades per hour
      if (lastHour.length + 1 > BIAS_THRESHOLDS.OVERTRADING_HOURLY_CLUSTER_THRESHOLD) {
        score += 25;
        factors.push(`${lastHour.length + 1} trades in the last hour — excessive clustering`);
      }
      
      // Pattern 4: Excessive trades relative to balance size
      const recent24h = this.trades.filter((t) => now - new Date(t.timestamp).getTime() < 24 * 36e5);
      if (recent24h.length > 0) {
        // Estimate balance from trade sizes (sum of all trade values)
        const totalTradeValue = recent24h.reduce((sum, t) => {
          const size = (t.quantity ?? 1) * (t.price ?? 0);
          return sum + size;
        }, 0);
        // Estimate current balance (rough approximation: use average trade size * 20 as balance proxy)
        const avgTradeSize = totalTradeValue / recent24h.length;
        const estimatedBalance = avgTradeSize * 20; // Rough estimate
        if (estimatedBalance > 0) {
          const tradesPerBalancePct = (recent24h.length * avgTradeSize) / estimatedBalance;
          if (tradesPerBalancePct > BIAS_THRESHOLDS.OVERTRADING_TRADES_PER_BALANCE_PCT) {
            score += 20;
            factors.push(`Trading volume represents ${(tradesPerBalancePct * 100).toFixed(1)}% of estimated balance — excessive relative to account size`);
          }
        }
      }
      
      // Pattern 5: Frequent switching of positions (asset hopping)
      const recent10 = this.trades.slice(-10);
      if (recent10.length >= 5) {
        const uniqueAssets = new Set(recent10.map(t => t.asset));
        if (uniqueAssets.size > BIAS_THRESHOLDS.OVERTRADING_ASSET_SWITCH_THRESHOLD) {
          score += 15;
          factors.push(`${uniqueAssets.size} different assets in last ${recent10.length} trades — frequent position switching`);
        }
        // Check for rapid asset changes (switching every trade)
        let assetSwitches = 0;
        for (let i = 1; i < recent10.length; i++) {
          if (recent10[i].asset !== recent10[i - 1].asset) assetSwitches++;
        }
        const switchRate = assetSwitches / (recent10.length - 1);
        if (switchRate > 0.7) { // More than 70% of trades switch assets
          score += 12;
          factors.push(`Switching positions ${(switchRate * 100).toFixed(0)}% of the time — lack of position discipline`);
        }
      }
      
      // Pattern 6: Trading after large losses
      const recentTrades = this.trades.slice(-20);
      if (recentTrades.length >= 3) {
        // Find large losses (>5% of average trade size)
        const avgTradeValue = recentTrades.reduce((sum, t) => {
          const size = (t.quantity ?? 1) * (t.price ?? 0);
          return sum + size;
        }, 0) / recentTrades.length;
        const largeLossThreshold = avgTradeValue * 0.05;
        
        for (let i = recentTrades.length - 2; i >= 0; i--) {
          const trade = recentTrades[i];
          if ((trade.pl ?? 0) < -largeLossThreshold) {
            // Check if there are trades soon after this loss
            const lossTime = new Date(trade.timestamp).getTime();
            const tradesAfterLoss = recentTrades.filter(t => {
              const tTime = new Date(t.timestamp).getTime();
              return tTime > lossTime && tTime <= lossTime + BIAS_THRESHOLDS.OVERTRADING_POST_LOSS_WINDOW_MINUTES * 6e4;
            });
            if (tradesAfterLoss.length >= 2) {
              score += 18;
              factors.push(`${tradesAfterLoss.length} trades within ${BIAS_THRESHOLDS.OVERTRADING_POST_LOSS_WINDOW_MINUTES} min of a $${Math.abs(trade.pl ?? 0).toFixed(2)} loss — emotional trading`);
              break; // Only count once
            }
          }
        }
      }
      
      // Pattern 7: Trading after large wins (overconfidence)
      if (recentTrades.length >= 3) {
        const avgTradeValue = recentTrades.reduce((sum, t) => {
          const size = (t.quantity ?? 1) * (t.price ?? 0);
          return sum + size;
        }, 0) / recentTrades.length;
        const largeWinThreshold = avgTradeValue * 0.05;
        
        for (let i = recentTrades.length - 2; i >= 0; i--) {
          const trade = recentTrades[i];
          if ((trade.pl ?? 0) > largeWinThreshold) {
            // Check if there are trades soon after this win
            const winTime = new Date(trade.timestamp).getTime();
            const tradesAfterWin = recentTrades.filter(t => {
              const tTime = new Date(t.timestamp).getTime();
              return tTime > winTime && tTime <= winTime + BIAS_THRESHOLDS.OVERTRADING_POST_WIN_WINDOW_MINUTES * 6e4;
            });
            if (tradesAfterWin.length >= 3) {
              score += 15;
              factors.push(`${tradesAfterWin.length} trades within ${BIAS_THRESHOLDS.OVERTRADING_POST_WIN_WINDOW_MINUTES} min of a $${(trade.pl ?? 0).toFixed(2)} win — overconfidence after success`);
              break; // Only count once
            }
          }
        }
      }
      
      // Pattern 8: Win rate declining while frequency increases (existing)
      const recent = this.trades.slice(-20);
      if (recent.length >= 8) {
        const mid = Math.floor(recent.length / 2);
        const wr1 = recent.slice(0, mid).filter((t) => (t.pl ?? 0) > 0).length / mid;
        const wr2 = recent.slice(mid).filter((t) => (t.pl ?? 0) > 0).length / (recent.length - mid);
        if (wr2 < wr1 - 0.25 && currentRate > 5) {
          score += 10;
          factors.push("Win rate declining while trade frequency increases — ignoring strategy discipline");
        }
      }
      
      score = Math.min(100, score);
      return {
        detected: score >= 50,
        type: "overtrading",
        severity: score >= 85 ? "high" : score >= 65 ? "moderate" : "low",
        score,
        description: score >= 50 ? "You are trading significantly more frequently than your baseline. This level of activity is often driven by impulse rather than strategy. Consider setting daily trade limits and sticking to your trading plan." : "Trade frequency is within normal range.",
        factors
      };
    }
    /* ── B) Revenge Trading ───────────────────────────────── */
    detectRevengeTrading() {
      const now = Date.now();
      const factors = [];
      let score = 0;
      const windowMs = BIAS_THRESHOLDS.REVENGE_WINDOW_MINUTES * 6e4;
      const recent = this.trades.filter(
        (t) => now - new Date(t.timestamp).getTime() < windowMs
      );
      const recentLosses = recent.filter((t) => (t.pl ?? 0) < 0);
      if (recentLosses.length === 0) {
        return {
          detected: false,
          type: "revenge_trading",
          severity: "low",
          score: 0,
          description: "No recent losses detected \u2014 no revenge trading pattern.",
          factors: []
        };
      }
      const last = this.trades[this.trades.length - 1];
      if (last && (last.pl ?? 0) < 0) {
        score += 15;
        factors.push(`Last trade: loss of $${Math.abs(last.pl ?? 0).toFixed(2)}`);
      }
      const curSize = (this.currentTrade.quantity ?? 1) * (this.currentTrade.price ?? 0);
      const asset = this.currentTrade.asset || "";
      const assetAvg = this.avgSize(this.trades.filter((t) => t.asset === asset));
      const overall = this.avgSize(this.trades);
      const avg = assetAvg > 0 ? assetAvg : overall;
      const mult = avg > 0 ? curSize / avg : 1;
      if (mult > BIAS_THRESHOLDS.REVENGE_SIZE_MULTIPLIER) {
        score += Math.min(45, mult / BIAS_THRESHOLDS.REVENGE_SIZE_MULTIPLIER * 25);
        factors.push(
          `Trade size is ${mult.toFixed(1)}\xD7 your average (threshold: ${BIAS_THRESHOLDS.REVENGE_SIZE_MULTIPLIER}\xD7)`
        );
      }
      let streak = 0;
      for (let i = this.trades.length - 1; i >= 0; i--) {
        if ((this.trades[i].pl ?? 0) < 0) streak++;
        else break;
      }
      if (streak >= 2) {
        score += Math.min(30, streak * 10);
        factors.push(`Currently on a ${streak}-trade losing streak`);
      }
      if (last && (last.pl ?? 0) < 0) {
        const gap = now - new Date(last.timestamp).getTime();
        if (gap < 5 * 6e4) {
          score += 20;
          factors.push("Re-entering within 5 minutes of a loss");
        } else if (gap < 15 * 6e4) {
          score += 10;
          factors.push("Re-entering within 15 minutes of a loss");
        }
      }
      score = Math.min(100, score);
      return {
        detected: score >= 30,
        type: "revenge_trading",
        severity: score >= 70 ? "high" : score >= 45 ? "moderate" : "low",
        score,
        description: score >= 30 ? 'We detected a pattern consistent with Revenge Trading. After a loss you may be increasing position size to "win it back" \u2014 this often amplifies losses.' : "No revenge trading pattern detected.",
        factors
      };
    }
    /* ── C) Loss Aversion ("Hope Trap") ───────────────────── */
    detectLossAversion() {
      const now = Date.now();
      const factors = [];
      let score = 0;
      const asset = this.currentTrade.asset || "";
      const recent24h = this.trades.filter(
        (t) => t.asset === asset && now - new Date(t.timestamp).getTime() < 864e5
      );
      const losingTrades = recent24h.filter((t) => (t.pl ?? 0) < 0);
      if (losingTrades.length >= 3) {
        score += 25;
        factors.push(
          `${losingTrades.length} losing trades on ${asset} in the last 24 h \u2014 possible attachment`
        );
      }
      const uncSells = recent24h.filter((t) => t.action === "Sell" && !t.confirmed);
      if (uncSells.length >= BIAS_THRESHOLDS.LOSS_AVERSION_CANCEL_COUNT) {
        score += 30;
        factors.push(
          `${uncSells.length} abandoned sell orders for ${asset} \u2014 reluctance to realise losses`
        );
      }
      if (recent24h.length >= 2) {
        const assetPL = recent24h.reduce((s, t) => s + (t.pl ?? 0), 0) / recent24h.length;
        const totalPL = this.trades.length ? this.trades.reduce((s, t) => s + (t.pl ?? 0), 0) / this.trades.length : 0;
        if (assetPL < totalPL - Math.abs(totalPL) * 0.2) {
          score += 20;
          factors.push(`${asset} is underperforming your portfolio average \u2014 potential "Hope Trap"`);
        }
      }
      if (recent24h.length >= 3) {
        const ts = recent24h.map((t) => new Date(t.timestamp).getTime()).sort((a, b) => a - b);
        const gaps = ts.slice(1).map((v, i) => v - ts[i]);
        if (gaps.length >= 2 && gaps[gaps.length - 1] > gaps[0] * 2) {
          score += 15;
          factors.push("Increasing time between trades on this asset \u2014 may be avoiding a necessary exit");
        }
      }
      if (this.currentTrade.action === "Buy" && losingTrades.length >= 2) {
        score += 20;
        factors.push("Buying more of a losing asset (averaging down) can compound losses");
      }
      score = Math.min(100, score);
      return {
        detected: score >= 30,
        type: "loss_aversion",
        severity: score >= 70 ? "high" : score >= 45 ? "moderate" : "low",
        score,
        description: score >= 30 ? `"Hope Trap" detected on ${asset || "this asset"}. You may be holding onto a losing position hoping it recovers rather than cutting losses.` : "No loss-aversion patterns detected.",
        factors
      };
    }
    /* ── D) Herd Mentality ───────────────────────────────── */
    detectHerdMentality() {
      const factors = [];
      let score = 0;
      const asset = this.currentTrade.asset || "";
      const pastAssetTrades = this.trades.filter(t => t.asset === asset);
      // New/unusual asset for this trader
      if (pastAssetTrades.length < BIAS_THRESHOLDS.HERD_NEW_ASSET_THRESHOLD) {
        score += 30;
        factors.push(`${asset} is outside your usual trading universe (only ${pastAssetTrades.length} prior trades)`);
      }
      // Sudden asset switch — different from recent trading pattern
      const recent5 = this.trades.slice(-5);
      const recentAssets = new Set(recent5.map(t => t.asset));
      if (recent5.length >= 3 && !recentAssets.has(asset)) {
        score += 25;
        factors.push("Sudden switch to a new asset — possible herd-following behavior");
      }
      // Multiple new assets in short period
      const now = Date.now();
      const last24h = this.trades.filter(t => now - new Date(t.timestamp).getTime() < 864e5);
      const uniqueAssets24h = new Set(last24h.map(t => t.asset));
      const allTimeAssets = new Set(this.trades.map(t => t.asset));
      let newAssets24h = 0;
      for (const a of uniqueAssets24h) {
        if (this.trades.filter(t => t.asset === a && now - new Date(t.timestamp).getTime() > 864e5).length === 0) newAssets24h++;
      }
      if (newAssets24h >= 3) {
        score += 20;
        factors.push(`${newAssets24h} brand-new assets traded in the last 24h — trend chasing pattern`);
      }
      score = Math.min(100, score);
      return {
        detected: score >= 30, type: "herd_mentality",
        severity: score >= 70 ? "high" : score >= 45 ? "moderate" : "low",
        score, description: score >= 30 ? "Herd Mentality detected: you may be following the crowd into an unfamiliar asset instead of trading based on your own analysis." : "No herd mentality detected.",
        factors
      };
    }
    /* ── G) Anchoring Bias ───────────────────────────────── */
    detectAnchoringBias() {
      const factors = [];
      let score = 0;
      const asset = this.currentTrade.asset || "";
      const price = this.currentTrade.price ?? 0;
      const assetTrades = this.trades.filter(t => t.asset === asset);
      if (assetTrades.length < BIAS_THRESHOLDS.ANCHORING_MIN_TRADES || price === 0) {
        return { detected: false, type: "anchoring_bias", severity: "low", score: 0, description: "Not enough data to assess.", factors: [] };
      }
      // Find first buy as "anchor" price
      const firstBuy = assetTrades.find(t => t.action === "buy" || t.action === "Buy");
      if (firstBuy && firstBuy.price) {
        const anchor = firstBuy.price;
        const pctFromAnchor = Math.abs(price - anchor) / anchor;
        // Selling near anchor price despite losses
        if (this.currentTrade.action === "sell" && pctFromAnchor < BIAS_THRESHOLDS.ANCHORING_PRICE_TOLERANCE) {
          const assetPL = assetTrades.reduce((s, t) => s + (t.pl ?? 0), 0);
          if (assetPL < 0) {
            score += 40;
            factors.push(`Selling near your entry price ($${anchor.toFixed(2)}) — possible anchoring to break-even`);
          }
        }
        // Multiple sell attempts near anchor
        const sellsNearAnchor = assetTrades.filter(t =>
          (t.action === "sell" || t.action === "Sell") && t.price && Math.abs(t.price - anchor) / anchor < BIAS_THRESHOLDS.ANCHORING_PRICE_TOLERANCE
        );
        if (sellsNearAnchor.length >= 2) {
          score += 30;
          factors.push(`${sellsNearAnchor.length} sell attempts near entry price — fixated on break-even`);
        }
        // Holding despite price being well below anchor
        if (price < anchor * 0.85) {
          const recentBuys = assetTrades.filter(t => t.action === "buy" || t.action === "Buy");
          if (recentBuys.length >= 2 && this.currentTrade.action !== "sell") {
            score += 25;
            factors.push(`${asset} is ${((1 - price / anchor) * 100).toFixed(1)}% below your entry but you haven't exited`);
          }
        }
      }
      score = Math.min(100, score);
      return {
        detected: score >= 30, type: "anchoring_bias",
        severity: score >= 70 ? "high" : score >= 45 ? "moderate" : "low",
        score, description: score >= 30 ? `Anchoring Bias detected on ${asset}: you may be fixated on your entry price rather than making decisions based on current market reality.` : "No anchoring bias detected.",
        factors
      };
    }
    /* ── H) Recency Bias ─────────────────────────────────── */
    detectRecencyBias() {
      const factors = [];
      let score = 0;
      const recent = this.trades.slice(-10);
      if (recent.length < BIAS_THRESHOLDS.RECENCY_STREAK_LENGTH) {
        return { detected: false, type: "recency_bias", severity: "low", score: 0, description: "Not enough data.", factors: [] };
      }
      // Check for winning streak
      let winStreak = 0;
      for (let i = recent.length - 1; i >= 0; i--) {
        if ((recent[i].pl ?? 0) > 0) winStreak++; else break;
      }
      // Check for losing streak
      let lossStreak = 0;
      for (let i = recent.length - 1; i >= 0; i--) {
        if ((recent[i].pl ?? 0) < 0) lossStreak++; else break;
      }
      const curSize = (this.currentTrade.quantity ?? 1) * (this.currentTrade.price ?? 0);
      const avgSz = this.avgSize(recent);
      const sizeChange = avgSz > 0 ? (curSize - avgSz) / avgSz : 0;
      if (winStreak >= BIAS_THRESHOLDS.RECENCY_STREAK_LENGTH && sizeChange > BIAS_THRESHOLDS.RECENCY_SIZE_CHANGE_PCT) {
        score += 45;
        factors.push(`${winStreak}-trade win streak and position size up ${(sizeChange * 100).toFixed(0)}% — overweighting recent wins`);
      }
      if (lossStreak >= BIAS_THRESHOLDS.RECENCY_STREAK_LENGTH && sizeChange < -BIAS_THRESHOLDS.RECENCY_SIZE_CHANGE_PCT) {
        score += 40;
        factors.push(`${lossStreak}-trade loss streak and position size down ${(Math.abs(sizeChange) * 100).toFixed(0)}% — panic from recent losses`);
      }
      if (lossStreak >= BIAS_THRESHOLDS.RECENCY_STREAK_LENGTH && sizeChange > BIAS_THRESHOLDS.RECENCY_SIZE_CHANGE_PCT) {
        score += 35;
        factors.push(`${lossStreak}-trade loss streak but INCREASING size — emotionally chasing recovery`);
      }
      score = Math.min(100, score);
      return {
        detected: score >= 30, type: "recency_bias",
        severity: score >= 70 ? "high" : score >= 45 ? "moderate" : "low",
        score, description: score >= 30 ? "Recency Bias detected: you're overweighting recent outcomes. Recent wins don't predict future ones, and recent losses don't mean you're cursed." : "No recency bias detected.",
        factors
      };
    }
    /* ── J) Gambler's Fallacy ────────────────────────────── */
    detectGamblersFallacy() {
      const factors = [];
      let score = 0;
      let lossStreak = 0;
      for (let i = this.trades.length - 1; i >= 0; i--) {
        if ((this.trades[i].pl ?? 0) < 0) lossStreak++; else break;
      }
      if (lossStreak < BIAS_THRESHOLDS.GAMBLER_LOSS_STREAK) {
        return { detected: false, type: "gamblers_fallacy", severity: "low", score: 0, description: "No significant loss streak.", factors: [] };
      }
      const curSize = (this.currentTrade.quantity ?? 1) * (this.currentTrade.price ?? 0);
      const recent = this.trades.slice(-20);
      const avgSz = this.avgSize(recent);
      const sizeIncrease = avgSz > 0 ? (curSize - avgSz) / avgSz : 0;
      score += Math.min(40, lossStreak * 8);
      factors.push(`Currently on a ${lossStreak}-trade losing streak`);
      if (sizeIncrease > BIAS_THRESHOLDS.GAMBLER_SIZE_INCREASE_PCT) {
        score += 35;
        factors.push(`Trade size up ${(sizeIncrease * 100).toFixed(0)}% despite losses — escalating bets expecting a reversal`);
      }
      // Still trading despite persistent poor results
      if (lossStreak >= 6) {
        score += 15;
        factors.push("Persistent trading despite extended losing streak — belief that outcomes must balance out");
      }
      score = Math.min(100, score);
      return {
        detected: score >= 30, type: "gamblers_fallacy",
        severity: score >= 70 ? "high" : score >= 45 ? "moderate" : "low",
        score, description: score >= 30 ? `Gambler's Fallacy detected: you've lost ${lossStreak} trades in a row and may believe the next one "has to" win. Each trade is independent.` : "No gambler's fallacy detected.",
        factors
      };
    }
    /* ── K) Overconfidence Bias ───────────────────────────── */
    detectOverconfidence() {
      const factors = [];
      let score = 0;
      if (!this.trades || !Array.isArray(this.trades)) return { detected: false, type: "overconfidence", severity: "low", score: 0, description: "No data.", factors: [] };
      const recent = this.trades.slice(-20);
      if (recent.length < 5) {
        return { detected: false, type: "overconfidence", severity: "low", score: 0, description: "Not enough data.", factors: [] };
      }
      const curSize = (this.currentTrade.quantity ?? 1) * (this.currentTrade.price ?? 0);
      const avgSz = this.avgSize(recent);
      // Risk per trade increasing significantly
      if (avgSz > 0 && curSize / avgSz > BIAS_THRESHOLDS.OVERCONFIDENCE_RISK_INCREASE) {
        score += 35;
        factors.push(`Position size is ${(curSize / avgSz).toFixed(1)}\xD7 your recent average — excessive risk`);
      }
      // No diversification — too concentrated
      const assetCounts = {};
      for (const t of recent) { assetCounts[t.asset] = (assetCounts[t.asset] || 0) + 1; }
      const vals = Object.values(assetCounts);
      const maxConc = vals.length > 0 ? Math.max(...vals) / recent.length : 0;
      if (maxConc > BIAS_THRESHOLDS.OVERCONFIDENCE_CONCENTRATION) {
        const sorted = Object.entries(assetCounts).sort((a, b) => b[1] - a[1]);
        const topAsset = sorted.length > 0 ? sorted[0][0] : "unknown";
        score += 25;
        factors.push(`${(maxConc * 100).toFixed(0)}% of recent trades in ${topAsset} — no diversification`);
      }
      // High trade volume + poor results = overconfidence
      const winRate = recent.filter(t => (t.pl ?? 0) > 0).length / recent.length;
      if (winRate < 0.4 && recent.length >= 10) {
        score += 20;
        factors.push(`Win rate only ${(winRate * 100).toFixed(0)}% across ${recent.length} recent trades — may be overestimating skill`);
      }
      score = Math.min(100, score);
      return {
        detected: score >= 30, type: "overconfidence",
        severity: score >= 70 ? "high" : score >= 45 ? "moderate" : "low",
        score, description: score >= 30 ? "Overconfidence Bias detected: you may be taking on excessive risk because you believe you're more skilled than your results show." : "No overconfidence detected.",
        factors
      };
    }
    /* ── L) Sunk Cost Fallacy ────────────────────────────── */
    detectSunkCostFallacy() {
      const factors = [];
      let score = 0;
      const asset = this.currentTrade.asset || "";
      const assetTrades = this.trades.filter(t => t.asset === asset);
      const assetBuys = assetTrades.filter(t => t.action === "buy" || t.action === "Buy");
      const assetPL = assetTrades.reduce((s, t) => s + (t.pl ?? 0), 0);
      const totalInvested = assetBuys.reduce((s, t) => s + (t.quantity ?? 1) * (t.price ?? 0), 0);
      // Multiple buys into a losing position
      if (assetBuys.length >= BIAS_THRESHOLDS.SUNK_COST_REPEAT_BUYS && assetPL < 0 && this.currentTrade.action === "buy") {
        score += 45;
        factors.push(`${assetBuys.length} buy orders into ${asset} with net loss of $${Math.abs(assetPL).toFixed(2)} — averaging down repeatedly`);
      }
      // Significant total loss but still adding
      if (totalInvested > 0 && assetPL < 0 && Math.abs(assetPL) / totalInvested > BIAS_THRESHOLDS.SUNK_COST_TOTAL_LOSS_PCT) {
        score += 30;
        factors.push(`Lost ${(Math.abs(assetPL) / totalInvested * 100).toFixed(1)}% of total investment in ${asset} — sunk cost keeping you in`);
      }
      // Refusing to close despite continued losses
      if (assetTrades.length >= 5 && assetPL < 0) {
        const sellCount = assetTrades.filter(t => t.action === "sell" || t.action === "Sell").length;
        if (sellCount === 0) {
          score += 20;
          factors.push(`No sells on ${asset} despite ${assetTrades.length} trades — refusing to exit`);
        }
      }
      score = Math.min(100, score);
      return {
        detected: score >= 30, type: "sunk_cost",
        severity: score >= 70 ? "high" : score >= 45 ? "moderate" : "low",
        score, description: score >= 30 ? `Sunk Cost Fallacy on ${asset}: you're continuing to invest because of what you've already put in, not because the trade makes sense going forward.` : "No sunk cost fallacy detected.",
        factors
      };
    }
    /* ── M) Mental Accounting ────────────────────────────── */
    detectMentalAccounting() {
      const factors = [];
      let score = 0;
      const now = Date.now();
      // Identify if trader had a profitable recent session
      const last24h = this.trades.filter(t => now - new Date(t.timestamp).getTime() < 864e5);
      const prev24h = this.trades.filter(t => {
        const age = now - new Date(t.timestamp).getTime();
        return age >= 864e5 && age < 2 * 864e5;
      });
      if (prev24h.length >= 3 && last24h.length >= 1) {
        const prevPL = prev24h.reduce((s, t) => s + (t.pl ?? 0), 0);
        const prevAvgSize = this.avgSize(prev24h);
        const curSize = (this.currentTrade.quantity ?? 1) * (this.currentTrade.price ?? 0);
        // Risk spike after profitable day ("house money")
        if (prevPL > 0 && prevAvgSize > 0 && curSize / prevAvgSize > BIAS_THRESHOLDS.MENTAL_ACCOUNTING_RISK_SPIKE) {
          score += 40;
          factors.push(`Yesterday's profit: +$${prevPL.toFixed(2)}. Today's trade size is ${(curSize / prevAvgSize).toFixed(1)}\xD7 yesterday's avg — "house money" effect`);
        }
      }
      // Size swings between days
      const curSize = (this.currentTrade.quantity ?? 1) * (this.currentTrade.price ?? 0);
      const overallAvg = this.avgSize(this.trades.slice(-20));
      if (overallAvg > 0 && curSize > overallAvg * 2 && last24h.length > 0) {
        const todayPL = last24h.reduce((s, t) => s + (t.pl ?? 0), 0);
        if (todayPL > 0) {
          score += 30;
          factors.push("Risk increased significantly after profitable trades today — treating gains differently from capital");
        }
      }
      score = Math.min(100, score);
      return {
        detected: score >= 30, type: "mental_accounting",
        severity: score >= 70 ? "high" : score >= 45 ? "moderate" : "low",
        score, description: score >= 30 ? "Mental Accounting detected: you're treating recent profits as 'house money' and taking bigger risks. All capital should be treated equally." : "No mental accounting detected.",
        factors
      };
    }
    /* ── N) Availability Bias ────────────────────────────── */
    detectAvailabilityBias() {
      const factors = [];
      let score = 0;
      const now = Date.now();
      const windowMs = BIAS_THRESHOLDS.AVAILABILITY_RECENCY_HOURS * 36e5;
      const recentTrades = this.trades.filter(t => now - new Date(t.timestamp).getTime() < windowMs);
      if (recentTrades.length < 3) {
        return { detected: false, type: "availability_bias", severity: "low", score: 0, description: "Not enough recent data.", factors: [] };
      }
      // Check concentration in recent trades
      const assetCounts = {};
      for (const t of recentTrades) { assetCounts[t.asset] = (assetCounts[t.asset] || 0) + 1; }
      const sortedEntries = Object.entries(assetCounts).sort((a, b) => b[1] - a[1]);
      if (sortedEntries.length === 0) {
        return { detected: false, type: "availability_bias", severity: "low", score: 0, description: "No data.", factors: [] };
      }
      const topEntry = sortedEntries[0];
      const concentration = topEntry[1] / recentTrades.length;
      const topAsset = topEntry[0];
      // Is this a "new" asset for the trader?
      const olderTrades = this.trades.filter(t => now - new Date(t.timestamp).getTime() >= windowMs);
      const priorCount = olderTrades.filter(t => t.asset === topAsset).length;
      if (concentration > BIAS_THRESHOLDS.AVAILABILITY_CONCENTRATION && priorCount < 3) {
        score += 40;
        factors.push(`${(concentration * 100).toFixed(0)}% of last ${recentTrades.length} trades are in ${topAsset} — a new asset for you`);
      }
      // Current trade is in the hot asset
      if (this.currentTrade.asset === topAsset && priorCount < 3) {
        score += 25;
        factors.push(`Trading ${topAsset} again — may be influenced by its visibility/hype rather than analysis`);
      }
      // Asset hopping — many new assets in a short time
      const recentAssets = new Set(recentTrades.map(t => t.asset));
      let newCount = 0;
      for (const a of recentAssets) {
        if (olderTrades.filter(t => t.asset === a).length === 0) newCount++;
      }
      if (newCount >= 3) {
        score += 20;
        factors.push(`${newCount} brand-new assets in the last ${BIAS_THRESHOLDS.AVAILABILITY_RECENCY_HOURS}h — trend-chasing behavior`);
      }
      score = Math.min(100, score);
      return {
        detected: score >= 30, type: "availability_bias",
        severity: score >= 70 ? "high" : score >= 45 ? "moderate" : "low",
        score, description: score >= 30 ? "Availability Bias detected: you're trading based on what's most visible or recent in your memory, not on analysis." : "No availability bias detected.",
        factors
      };
    }
    /* ── Helpers ───────────────────────────────────────────── */
    avgSize(arr) {
      if (!arr || arr.length === 0) return 0;
      return arr.reduce((s, t) => s + (t.quantity ?? 1) * (t.price ?? 0), 0) / arr.length;
    }
  };

  // src/shared/biasCost.ts
  function computeBiasCost(biases, currentTrade, recentTrades, baseRiskUnit = DEFAULT_SETTINGS.baseRiskUnit) {
    const explanation = [];
    const curSize = (currentTrade.quantity ?? 1) * (currentTrade.price ?? 0);
    const avgSize = recentTrades.length > 0 ? recentTrades.reduce((s, t) => s + (t.quantity ?? 1) * (t.price ?? 0), 0) / recentTrades.length : curSize;
    const excessSizeMultiplier = Math.max(1, avgSize > 0 ? curSize / avgSize : 1);
    if (excessSizeMultiplier > 1.5) {
      explanation.push(`Position size is ${excessSizeMultiplier.toFixed(1)}\xD7 your average`);
    }
    const losses = recentTrades.filter((t) => (t.pl ?? 0) < 0).slice(-5);
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + (t.pl ?? 0), 0) / losses.length) : 0;
    const recentLossMagnitudeFactor = avgLoss > 0 ? Math.max(1, 1 + avgLoss / baseRiskUnit * 0.5) : 1;
    if (recentLossMagnitudeFactor > 1.2) {
      explanation.push(`Recent losses avg $${avgLoss.toFixed(2)} amplify emotional risk`);
    }
    const now = Date.now();
    const lastHour = recentTrades.filter(
      (t) => now - new Date(t.timestamp).getTime() < 36e5
    );
    const hourlyRate = lastHour.length + 1;
    const frequencyFactor = Math.max(1, hourlyRate / 3);
    if (frequencyFactor > 1.5) {
      explanation.push(`${hourlyRate} trades in the last hour \u2014 high frequency`);
    }
    let severityBoost = 1;
    for (const b of biases) {
      severityBoost *= b.severity === "high" ? 1.5 : b.severity === "moderate" ? 1.25 : 1.1;
      explanation.push(`${b.type.replace(/_/g, " ")} (${b.severity})`);
    }
    if (biases.length === 0) {
      severityBoost = 0;
      explanation.push("No biases detected \u2014 no emotional tax");
    }
    const totalCost = +(excessSizeMultiplier * recentLossMagnitudeFactor * frequencyFactor * severityBoost * baseRiskUnit).toFixed(2);
    return {
      totalCost,
      excessSizeMultiplier: +excessSizeMultiplier.toFixed(2),
      recentLossMagnitudeFactor: +recentLossMagnitudeFactor.toFixed(2),
      frequencyFactor: +frequencyFactor.toFixed(2),
      baseRiskUnit,
      explanation
    };
  }

  // src/shared/storage.ts
  async function get(key, fallback) {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? fallback;
  }
  async function set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  }
  // Use Set for O(1) lookup instead of array indexOf
  var REMOVED_BIASES_SET = new Set(["confirmation_bias", "disposition_effect"]);
  async function getTrades() {
    var trades = await get(STORAGE_KEYS.TRADES, []);
    // Only filter if there are trades with flags to avoid unnecessary iteration
    if (trades.length > 0) {
      for (var i = 0; i < trades.length; i++) {
        if (trades[i].flags && trades[i].flags.length > 0) {
          trades[i].flags = trades[i].flags.filter(function(f) { return !REMOVED_BIASES_SET.has(f); });
        }
      }
    }
    return trades;
  }
  async function addTrade(trade) {
    const trades = await getTrades();
    trades.push(trade);
    // Keep all trades from the last 30 days
    const cutoff = Date.now() - ROLLING_WINDOWS.LAST_30D_MS;
    const trimmed = trades.filter(t => new Date(t.timestamp).getTime() > cutoff);
    await set(STORAGE_KEYS.TRADES, trimmed);
  }
  async function getRecentTrades(windowMs) {
    const trades = await getTrades();
    const cutoff = Date.now() - windowMs;
    return trades.filter((t) => new Date(t.timestamp).getTime() > cutoff);
  }
  var getTradesLast24h = () => getRecentTrades(ROLLING_WINDOWS.LAST_24H_MS);
  var getTradesLast30d = () => getRecentTrades(ROLLING_WINDOWS.LAST_30D_MS);
  async function getSettings() {
    return get(STORAGE_KEYS.SETTINGS, { ...DEFAULT_SETTINGS });
  }
  async function updateSettings(partial) {
    const current = await getSettings();
    const updated = { ...current, ...partial };
    await set(STORAGE_KEYS.SETTINGS, updated);
    return updated;
  }
  async function getCooldown() {
    const state = await get(STORAGE_KEYS.COOLDOWN, {
      active: false,
      expiresAt: null,
      reason: ""
    });
    if (state.active && state.expiresAt && Date.now() > state.expiresAt) {
      const expired = { active: false, expiresAt: null, reason: "" };
      await set(STORAGE_KEYS.COOLDOWN, expired);
      return expired;
    }
    return state;
  }
  async function setCooldown(minutes, reason) {
    const state = {
      active: true,
      expiresAt: Date.now() + minutes * 6e4,
      reason
    };
    await set(STORAGE_KEYS.COOLDOWN, state);
    return state;
  }
  async function getFingerprint() {
    return get(STORAGE_KEYS.FINGERPRINT, {
      hourlyPattern: {},
      dayOfWeekPattern: {},
      assetIssues: {},
      avgTimeBetweenTrades: 0,
      riskProfile: "moderate"
    });
  }
  async function updateFingerprint(trade) {
    const fp = await getFingerprint();
    const d = new Date(trade.timestamp);
    fp.hourlyPattern[d.getHours()] = (fp.hourlyPattern[d.getHours()] || 0) + 1;
    fp.dayOfWeekPattern[d.getDay()] = (fp.dayOfWeekPattern[d.getDay()] || 0) + 1;
    if (trade.flags && trade.flags.length > 0) {
      fp.assetIssues[trade.asset] = (fp.assetIssues[trade.asset] || 0) + 1;
    }
    const trades = await getTrades();
    if (trades.length >= 2) {
      const times = trades.map((t) => new Date(t.timestamp).getTime()).sort((a, b) => a - b);
      const diffs = times.slice(1).map((t, i) => t - times[i]);
      fp.avgTimeBetweenTrades = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }
    const avgSize = trades.length > 0 ? trades.reduce((s, t) => s + (t.quantity || 1) * (t.price || 0), 0) / trades.length : 0;
    fp.riskProfile = avgSize > 1e4 ? "aggressive" : avgSize > 2e3 ? "moderate" : "conservative";
    await set(STORAGE_KEYS.FINGERPRINT, fp);
  }
  async function getDailyTradeCount() {
    const data = await get(STORAGE_KEYS.DAILY_COUNT, { date: "", count: 0 });
    const today = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    return data.date === today ? data.count : 0;
  }
  async function incrementDailyCount() {
    const today = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    const data = await get(STORAGE_KEYS.DAILY_COUNT, { date: today, count: 0 });
    if (data.date !== today) {
      await set(STORAGE_KEYS.DAILY_COUNT, { date: today, count: 1 });
      return 1;
    }
    data.count++;
    await set(STORAGE_KEYS.DAILY_COUNT, data);
    return data.count;
  }
  async function exportCSV(advanced) {
    const trades = await getTrades();
    const settings = await getSettings();
    const tz = settings.timezone || "America/Toronto";
    if (!advanced) {
      const header2 = "Timestamp,Buy/sell,Asset,P/L";
      const rows2 = trades.map((t) => {
        const ts = new Date(t.timestamp).toLocaleString("en-CA", { timeZone: tz });
        return `${ts},${t.action},${t.asset},${t.pl ?? ""}`;
      });
      return [header2, ...rows2].join("\n");
    }
    const header = "Timestamp,Buy/sell,Asset,Price,Quantity,P/L,OrderType,Flags,BiasCost,EmotionTag,Confirmed,CooledOff";
    const rows = trades.map((t) => {
      const ts = new Date(t.timestamp).toLocaleString("en-CA", { timeZone: tz });
      return [
        ts,
        t.action,
        t.asset,
        t.price ?? "",
        t.quantity ?? "",
        t.pl ?? "",
        t.orderType ?? "",
        t.flags.join(";"),
        t.biasCost.toFixed(2),
        t.emotionTag ?? "",
        t.confirmed,
        t.cooledOff
      ].join(",");
    });
    return [header, ...rows].join("\n");
  }

  // CSV Import
  async function importCSV(csvText) {
    if (!csvText || typeof csvText !== "string") return { error: "No CSV data provided" };
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return { error: "CSV must have a header row and at least one data row" };

    const headerLine = lines[0].toLowerCase().replace(/[^a-z0-9,\/_ -]/g, "");
    const headers = headerLine.split(",").map(h => h.trim());
    console.log("[CB Import] Headers detected:", headers);
    console.log("[CB Import] Total data rows:", lines.length - 1);

    // Map column names to indices
    const colMap = {};
    headers.forEach((h, i) => {
      if (h.includes("timestamp") || h.includes("date") || h.includes("time")) colMap.timestamp = i;
      else if (h === "buy/sell" || h === "buysell" || h.includes("action") || h.includes("side") || h.includes("direction") || h.includes("type")) colMap.action = i;
      else if (h.includes("asset") || h.includes("symbol") || h.includes("ticker") || h.includes("instrument")) colMap.asset = i;
      else if (h === "p/l" || h === "pl" || h.includes("profit") || h.includes("pnl") || h.includes("gain") || h.includes("return")) colMap.pl = i;
      else if (h.includes("price") || h.includes("entry") || h.includes("fill")) colMap.price = i;
      else if (h.includes("quantity") || h.includes("qty") || h.includes("size") || h.includes("volume") || h.includes("amount") || h.includes("shares") || h.includes("units")) colMap.quantity = i;
      else if (h.includes("order") && h.includes("type")) colMap.orderType = i;
    });

    console.log("[CB Import] Column mapping:", JSON.stringify(colMap));
    if (colMap.timestamp === undefined) return { error: "CSV must have a Timestamp/Date column. Found headers: " + headers.join(", ") };
    if (colMap.action === undefined) return { error: "CSV must have a Buy/sell or Action column. Found headers: " + headers.join(", ") };

    const existingTrades = await getTrades();
    const imported = [];
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Simple CSV parse (handles quoted fields)
      const cols = [];
      let inQuotes = false, field = "";
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === "," && !inQuotes) { cols.push(field.trim()); field = ""; }
        else { field += ch; }
      }
      cols.push(field.trim());

      const rawTs = colMap.timestamp !== undefined ? cols[colMap.timestamp] : "";
      const rawAction = colMap.action !== undefined ? cols[colMap.action] : "";
      const rawAsset = colMap.asset !== undefined ? cols[colMap.asset] : "UNKNOWN";
      const rawPl = colMap.pl !== undefined ? cols[colMap.pl] : "";
      const rawPrice = colMap.price !== undefined ? cols[colMap.price] : "";
      const rawQty = colMap.quantity !== undefined ? cols[colMap.quantity] : "";
      const rawOrderType = colMap.orderType !== undefined ? cols[colMap.orderType] : "";

      // Parse timestamp
      let ts = new Date(rawTs).getTime();
      if (isNaN(ts)) { skipped++; continue; }

      // Parse action
      const actionLower = rawAction.toLowerCase();
      let action = "buy";
      if (actionLower.includes("sell") || actionLower.includes("short") || actionLower === "s") action = "sell";

      // Parse numbers
      const pl = rawPl ? parseFloat(rawPl.replace(/[$,]/g, "")) : undefined;
      const price = rawPrice ? parseFloat(rawPrice.replace(/[$,]/g, "")) : undefined;
      const quantity = rawQty ? parseFloat(rawQty.replace(/[$,]/g, "")) : undefined;

      const trade = {
        id: "imp_" + ts + "_" + i,
        timestamp: ts,
        action,
        asset: rawAsset.toUpperCase() || "UNKNOWN",
        price: isNaN(price) ? undefined : price,
        quantity: isNaN(quantity) ? undefined : quantity,
        pl: isNaN(pl) ? undefined : pl,
        orderType: rawOrderType || "market",
        flags: [],
        biasCost: 0,
        emotionTag: null,
        confirmed: true,
        cooledOff: false,
        source: "csv_import"
      };

      imported.push(trade);
    }

    console.log("[CB Import] Parsed " + imported.length + " trades, skipped " + skipped + " rows");
    if (imported.length === 0) return { error: "No valid trades found in CSV. Skipped " + skipped + " rows. Check that timestamps are in a recognizable date format." };

    // Sort imported trades chronologically
    imported.sort((a, b) => a.timestamp - b.timestamp);

    // Retroactive bias analysis: batch process for performance
    // For large imports (>100 trades), use sampling to speed up analysis
    const analyzed = [];
    const maxHistory = 200;
    const shouldAnalyzeAll = imported.length <= 100; // Full analysis for small imports
    const sampleRate = imported.length > 500 ? 10 : imported.length > 200 ? 5 : 1; // Analyze every Nth trade for large imports
    
    for (let idx = 0; idx < imported.length; idx++) {
      const trade = imported[idx];
      
      // Skip analysis for sampled trades in large imports (they'll get flags from nearby analyzed trades)
      if (!shouldAnalyzeAll && idx % sampleRate !== 0 && idx > 0 && idx < imported.length - 1) {
        // Copy flags from previous analyzed trade if similar
        const prevAnalyzed = analyzed[analyzed.length - 1];
        if (prevAnalyzed && Math.abs(trade.timestamp - prevAnalyzed.timestamp) < 3600000) { // Within 1 hour
          trade.flags = [...prevAnalyzed.flags];
          trade.biasCost = prevAnalyzed.biasCost * 0.8; // Slightly lower cost
        } else {
          trade.flags = [];
          trade.biasCost = 0;
        }
        analyzed.push(trade);
        continue;
      }
      
      // Use a sliding window of recent history for performance
      const fullHistory = [...existingTrades, ...analyzed];
      const history = fullHistory.length > maxHistory ? fullHistory.slice(-maxHistory) : fullHistory;

      // Build an intent object that the BiasEngine expects
      const intent = {
        action: trade.action,
        asset: trade.asset,
        price: trade.price,
        quantity: trade.quantity,
        orderType: trade.orderType || "market"
      };

      // Run bias analysis with Date.now override for retroactive detection
      const originalNow = Date.now;
      Date.now = () => trade.timestamp;
      try {
        const engine = new BiasEngine(history, intent);
        const biases = engine.analyze();
        trade.flags = biases.map(b => b.type);

        // Compute bias cost
        if (biases.length > 0) {
          const curSize = (trade.quantity ?? 1) * (trade.price ?? 0);
          const recentSizes = history.slice(-20).map(t => (t.quantity ?? 1) * (t.price ?? 0));
          const avgSz = recentSizes.length > 0 ? recentSizes.reduce((a, b) => a + b, 0) / recentSizes.length : curSize;
          const excessMult = Math.max(1, avgSz > 0 ? curSize / avgSz : 1);
          const losses = history.filter(t => (t.pl ?? 0) < 0).slice(-5);
          const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + (t.pl ?? 0), 0) / losses.length) : 0;
          const lossFactor = avgLoss > 0 ? Math.max(1, 1 + avgLoss / DEFAULT_SETTINGS.baseRiskUnit * 0.5) : 1;
          const sevBoost = biases.length >= 3 ? 2 : biases.length >= 2 ? 1.5 : 1;
          trade.biasCost = +(excessMult * lossFactor * sevBoost * DEFAULT_SETTINGS.baseRiskUnit).toFixed(2);
        } else {
          trade.biasCost = 0;
        }
      } catch (analysisErr) {
        console.error("[CB Import] Bias analysis error on trade " + idx + ":", analysisErr);
        trade.flags = [];
        trade.biasCost = 0;
      } finally {
        Date.now = originalNow;
      }

      analyzed.push(trade);
      
      // Yield to browser every 50 trades to prevent UI freezing
      if (idx % 50 === 0 && idx > 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Deduplicate: remove existing trades that match an imported trade by timestamp + asset
    const importedKeys = new Set(analyzed.map(t => t.timestamp + "_" + t.asset));
    const deduped = existingTrades.filter(t => !importedKeys.has(t.timestamp + "_" + t.asset));
    const allTrades = [...deduped, ...analyzed];
    allTrades.sort((a, b) => a.timestamp - b.timestamp);
    // Keep all trades from the last 30 days (no count cap)
    const cutoff30d = Date.now() - ROLLING_WINDOWS.LAST_30D_MS;
    const trimmed = allTrades.filter(t => new Date(t.timestamp).getTime() > cutoff30d);
    // If all trades are older than 30 days (e.g. historical CSV), keep them all
    const toStore = trimmed.length > 0 ? trimmed : allTrades;
    await chrome.storage.local.set({ [STORAGE_KEYS.TRADES]: toStore });
    
    // Batch update fingerprint instead of individual calls
    const fp = await getFingerprint();
    for (const t of analyzed) {
      const d = new Date(t.timestamp);
      fp.hourlyPattern[d.getHours()] = (fp.hourlyPattern[d.getHours()] || 0) + 1;
      fp.dayOfWeekPattern[d.getDay()] = (fp.dayOfWeekPattern[d.getDay()] || 0) + 1;
      if (t.flags && t.flags.length > 0) {
        fp.assetIssues[t.asset] = (fp.assetIssues[t.asset] || 0) + 1;
      }
    }
    // Update avgTimeBetweenTrades and riskProfile once
    const allTradesForFp = [...existingTrades, ...analyzed];
    if (allTradesForFp.length >= 2) {
      const times = allTradesForFp.map((t) => new Date(t.timestamp).getTime()).sort((a, b) => a - b);
      const diffs = times.slice(1).map((t, i) => t - times[i]);
      fp.avgTimeBetweenTrades = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }
    const avgSize = allTradesForFp.length > 0 ? allTradesForFp.reduce((s, t) => s + (t.quantity || 1) * (t.price || 0), 0) / allTradesForFp.length : 0;
    fp.riskProfile = avgSize > 1e4 ? "aggressive" : avgSize > 2e3 ? "moderate" : "conservative";
    await set(STORAGE_KEYS.FINGERPRINT, fp);

    const flaggedCount = analyzed.filter(t => t.flags.length > 0).length;
    console.log("[CB Import] Complete. Imported:", analyzed.length, "Flagged:", flaggedCount, "Total:", allTrades.length);
    return { imported: analyzed.length, skipped, flagged: flaggedCount, total: allTrades.length };
  }

  // src/background/serviceWorker.ts
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handleMessage(msg).then(sendResponse).catch((err) => {
      console.error("[CB Background]", err);
      sendResponse({ error: err.message });
    });
    return true;
  });
  async function handleMessage(msg) {
    switch (msg.type) {
      case "CHECK_BIAS":
        return checkBias(msg.payload);
      case "TRADE_CONFIRMED":
        return tradeConfirmed(msg.payload);
      case "PROCEED_ANYWAY":
        return { allowed: true };
      case "GET_STATS":
        return getStats();
      case "GET_TRADES":
        return getTrades();
      case "SET_COOLDOWN":
        return setCooldown(msg.payload.minutes, msg.payload.reason);
      case "CHECK_COOLDOWN":
        return getCooldown();
      case "EXPORT_CSV":
        return exportCSV(msg.payload.advanced);
      case "IMPORT_CSV":
        return importCSV(msg.payload.csvText);
      case "SET_LIMIT":
        return updateSettings(msg.payload);
      case "GET_SETTINGS":
        return getSettings();
      case "UPDATE_SETTINGS":
        return updateSettings(msg.payload);
      case "GET_FINGERPRINT":
        return getFingerprint();
      case "SEED_DEMO_DATA":
        return seedDemoData();
      case "CLEAR_DATA":
        return clearAllData();
      default:
        return { error: `Unknown type: ${msg.type}` };
    }
  }
  async function checkBias(intent) {
    const [trades, settings, cooldown, dailyCount] = await Promise.all([
      getTrades(),
      getSettings(),
      getCooldown(),
      getDailyTradeCount()
    ]);
    if (cooldown.active) {
      return {
        biases: [],
        cost: zeroCost(settings.baseRiskUnit, "Cooldown active"),
        cooldown,
        dailyLimitReached: false
      };
    }
    const engine = new BiasEngine(trades, intent);
    const biases = engine.analyze();
    const recent = trades.slice(-20);
    const cost = computeBiasCost(biases, intent, recent, settings.baseRiskUnit);
    const dailyLimitReached = dailyCount >= settings.dailyTradeLimit;
    return { biases, cost, cooldown, dailyLimitReached };
  }
  function zeroCost(base, reason) {
    return {
      totalCost: 0,
      excessSizeMultiplier: 1,
      recentLossMagnitudeFactor: 1,
      frequencyFactor: 1,
      baseRiskUnit: base,
      explanation: [reason]
    };
  }
  async function tradeConfirmed(p) {
    const settings = await getSettings();
    const tz = settings.timezone || "America/Toronto";
    const trade = {
      id: p.tradeId || String(Date.now()),
      timestamp: (/* @__PURE__ */ new Date()).toLocaleString("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }),
      action: p.trade.action || "Buy",
      asset: p.trade.asset || "Unknown",
      price: p.trade.price,
      quantity: p.trade.quantity,
      orderType: p.trade.orderType,
      pl: p.trade.pl,
      flags: p.biases.map((b) => b.type),
      biasCost: p.biasCost,
      emotionTag: p.emotionTag,
      confirmed: !p.cooledOff,
      cooledOff: !!p.cooledOff
    };
    await addTrade(trade);
    await updateFingerprint(trade);
    if (trade.confirmed) await incrementDailyCount();
    return { ok: true };
  }
  async function getStats() {
    // Load trades once and filter in memory for better performance
    const allTrades = await getTrades();
    const now = Date.now();
    const last24hCutoff = now - ROLLING_WINDOWS.LAST_24H_MS;
    const last30dCutoff = now - ROLLING_WINDOWS.LAST_30D_MS;
    
    // Filter in memory instead of multiple storage calls
    const last24h = allTrades.filter(t => new Date(t.timestamp).getTime() > last24hCutoff);
    const last30d = allTrades.filter(t => new Date(t.timestamp).getTime() > last30dCutoff);
    const last20 = allTrades.slice(-20);
    
    // If no trades in the last 30 days but we have trades, fall back to all trades
    // so the dashboard still shows imported/historical data
    const displayTrades = last30d.length > 0 ? last30d : allTrades;
    const display24h = last24h.length > 0 ? last24h : allTrades;
    
    // Optimize avgTradeSize calculation - only process displayTrades instead of all trades
    const avgTradeSize = {};
    const counts = {};
    for (const t of displayTrades) {
      const sz = (t.quantity ?? 1) * (t.price ?? 0);
      avgTradeSize[t.asset] = (avgTradeSize[t.asset] || 0) + sz;
      counts[t.asset] = (counts[t.asset] || 0) + 1;
    }
    for (const a of Object.keys(avgTradeSize)) avgTradeSize[a] /= counts[a];
    const avgTradesPerHour30d = last30d.length / Math.max(1, 720);
    
    // Use displayTrades for loss streaks so they match the period we show
    let maxStreak = 0, tempStreak = 0, currentLossStreak = 0;
    for (const t of displayTrades) {
      if ((t.pl ?? 0) < 0) {
        tempStreak++;
        maxStreak = Math.max(maxStreak, tempStreak);
      } else tempStreak = 0;
    }
    for (let i = displayTrades.length - 1; i >= 0; i--) {
      if ((displayTrades[i].pl ?? 0) < 0) currentLossStreak++;
      else break;
    }
    const monthStart = /* @__PURE__ */ new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const mtd = displayTrades.filter((t) => new Date(t.timestamp).getTime() >= monthStart.getTime());
    // If no MTD trades, compute bias cost across displayed set (e.g. historical import)
    const biasCostTrades = mtd.length > 0 ? mtd : displayTrades;
    const monthToDateBiasCost = biasCostTrades.reduce((s, t) => s + (t.biasCost || 0), 0);
    return {
      tradesLast20: last20,
      tradesLast24h: display24h,
      tradesLast30d: displayTrades,
      avgTradeSize,
      avgTradesPerHour30d,
      lossStreak: maxStreak,
      currentLossStreak,
      monthToDateBiasCost
    };
  }
  async function seedDemoData() {
    const assets = ["AAPL", "TSLA", "BTC/USD", "ETH/USD", "SPY"];
    const actions = ["Buy", "Sell"];
    const now = Date.now();
    const trades = [];
    for (let i = 0; i < 30; i++) {
      const hoursAgo = Math.random() * 72;
      const asset = assets[Math.floor(Math.random() * assets.length)];
      const action = actions[Math.floor(Math.random() * 2)];
      const price = asset.includes("BTC") ? 45e3 + Math.random() * 5e3 : asset.includes("ETH") ? 2500 + Math.random() * 500 : 150 + Math.random() * 50;
      const qty = Math.floor(1 + Math.random() * 10);
      const pl = +((Math.random() - 0.45) * price * qty * 0.02).toFixed(2);
      trades.push({
        id: `demo-${i}`,
        timestamp: new Date(now - hoursAgo * 36e5).toISOString(),
        action,
        asset,
        price: +price.toFixed(2),
        quantity: qty,
        orderType: "Market",
        pl,
        flags: [],
        biasCost: 0,
        confirmed: true,
        cooledOff: false
      });
    }
    for (let i = 0; i < 3; i++) {
      trades.push({
        id: `loss-${i}`,
        timestamp: new Date(now - (30 - i * 10) * 6e4).toISOString(),
        action: "Buy",
        asset: "TSLA",
        price: 180 + i * 2,
        quantity: 5 + i * 3,
        orderType: "Market",
        pl: -(50 + i * 30),
        flags: i > 0 ? ["revenge_trading"] : [],
        biasCost: i > 0 ? 150 + i * 50 : 0,
        emotionTag: "frustrated",
        confirmed: true,
        cooledOff: false
      });
    }
    trades.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    await chrome.storage.local.set({ [STORAGE_KEYS.TRADES]: trades });
    return { seeded: trades.length };
  }
  async function clearAllData() {
    await chrome.storage.local.clear();
    return { ok: true };
  }
})();
//# sourceMappingURL=background.js.map
