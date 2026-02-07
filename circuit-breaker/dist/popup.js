/* Circuit Breaker – Popup (vanilla JS, zero dependencies) */
(function () {
  "use strict";

  /* ── Helpers ──────────────────────────────────────────── */
  function msg(m) {
    return new Promise(function (r) { chrome.runtime.sendMessage(m, r); });
  }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (k === "className") el.className = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else el.setAttribute(k, v);
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      if (typeof c === "string" || typeof c === "number")
        el.appendChild(document.createTextNode(String(c)));
      else el.appendChild(c);
    }
    return el;
  }

  /* ── State ───────────────────────────────────────────── */
  var currentTab = "dashboard";
  var stats = null;
  var fp = null;
  var settings = null;
  var loading = true;
  var importStatus = null;

  /* ── Constants ────────────────────────────────────────── */
  var LABELS = {
    overtrading: "Overtrading",
    revenge_trading: "Revenge Trading",
    loss_aversion: "Loss Aversion",
    disposition_effect: "Disposition Effect",
    herd_mentality: "Herd Mentality",
    anchoring_bias: "Anchoring Bias",
    confirmation_bias: "Confirmation Bias",
    recency_bias: "Recency Bias",
    gamblers_fallacy: "Gambler\u2019s Fallacy",
    overconfidence: "Overconfidence",
    sunk_cost: "Sunk Cost Fallacy",
    mental_accounting: "Mental Accounting",
    availability_bias: "Availability Bias",
    clean: "Clean Trades"
  };

  var COLORS = {
    overtrading: "#e74c3c",
    revenge_trading: "#e67e22",
    loss_aversion: "#f39c12",
    disposition_effect: "#9b59b6",
    herd_mentality: "#1abc9c",
    anchoring_bias: "#3498db",
    confirmation_bias: "#e91e63",
    recency_bias: "#00bcd4",
    gamblers_fallacy: "#ff5722",
    overconfidence: "#ff9800",
    sunk_cost: "#795548",
    mental_accounting: "#607d8b",
    availability_bias: "#8bc34a",
    clean: "#27ae60"
  };

  /* ── Data Loading ─────────────────────────────────────── */
  async function refresh() {
    loading = true;
    render();
    try {
      var results = await Promise.all([
        msg({ type: "GET_STATS" }),
        msg({ type: "GET_FINGERPRINT" }),
        msg({ type: "GET_SETTINGS" })
      ]);
      var s = results[0], f = results[1], st = results[2];
      stats = s && !s.error ? s : emptyStats();
      fp = f && !f.error ? f : null;
      settings = st && !st.error ? st : null;
    } catch (err) {
      console.error("[CB Popup] refresh error:", err);
      stats = emptyStats();
    }
    loading = false;
    render();
  }

  function emptyStats() {
    return {
      tradesLast20: [], tradesLast24h: [], tradesLast30d: [],
      avgTradeSize: {}, avgTradesPerHour30d: 0, lossStreak: 0,
      currentLossStreak: 0, monthToDateBiasCost: 0, disciplineScore: 100
    };
  }

  /* ── Main Render ──────────────────────────────────────── */
  function render() {
    var root = document.getElementById("root");
    root.innerHTML = "";

    /* Header */
    var logo = h("img", { className: "cb-logo", src: "icons/heuristx_logo.png", alt: "HeuristX" });
    root.appendChild(
      h("header", { className: "cb-popup-header" },
        logo,
        h("p", { className: "cb-tagline" }, "Trading discipline, quantified")
      )
    );

    /* Tabs */
    root.appendChild(
      h("nav", { className: "cb-tabs" },
        h("button", {
          className: currentTab === "dashboard" ? "active" : "",
          onClick: function () { currentTab = "dashboard"; render(); }
        }, "Dashboard"),
        h("button", {
          className: currentTab === "settings" ? "active" : "",
          onClick: function () { currentTab = "settings"; render(); }
        }, "Settings")
      )
    );

    if (loading) {
      root.appendChild(h("div", { className: "cb-loading" }, "Loading\u2026"));
      return;
    }

    if (currentTab === "dashboard") renderDashboard(root);
    else renderSettings(root);
  }

  /* ── Dashboard ────────────────────────────────────────── */
  var periodLabel = "30 days"; /* updated dynamically based on data */

  function renderDashboard(root) {
    var container = h("div", { className: "cb-dashboard" });
    root.appendChild(container);

    var trades30d = (stats && stats.tradesLast30d) || [];

    /* Detect if backend fell back to all-time data */
    if (trades30d.length > 0) {
      var now = Date.now();
      var cutoff30d = now - 30 * 24 * 60 * 60 * 1000;
      var recentCount = 0;
      for (var ti = 0; ti < trades30d.length; ti++) {
        var ts = new Date(trades30d[ti].timestamp).getTime();
        if (ts > cutoff30d) recentCount++;
      }
      periodLabel = recentCount === trades30d.length ? "30 days" : "all time";
    }

    if (trades30d.length === 0) {
      container.appendChild(
        h("div", { className: "cb-empty" },
          h("p", null, "No trades recorded yet."),
          h("p", { className: "cb-hint" }, "Import your own CSV, use the demo page, or seed sample data.")
        )
      );
      container.appendChild(buildImportExport());
      container.appendChild(
        h("div", { className: "cb-seed-actions" },
          h("button", { className: "cb-btn-gold", onClick: seedData }, "Seed Demo Data")
        )
      );
      return;
    }

    container.appendChild(buildDisciplineScore(stats.disciplineScore || 0));
    container.appendChild(buildBiasBreakdown(trades30d));
    container.appendChild(buildEquityVsEmotion(trades30d));
    container.appendChild(buildCoachCorner());
    container.appendChild(buildImportExport());
    container.appendChild(
      h("div", { className: "cb-seed-actions" },
        h("button", { className: "cb-btn-sm", onClick: seedData }, "Seed More Data"),
        h("button", { className: "cb-btn-sm cb-btn-danger", onClick: clearData }, "Clear All Data")
      )
    );
  }

  /* ── Discipline Score (SVG ring) ──────────────────────── */
  function buildDisciplineScore(score) {
    var r = 38, c = 2 * Math.PI * r;
    var pct = Math.max(0, Math.min(100, score));
    var offset = c * (1 - pct / 100);
    var color = score >= 75 ? "#27ae60" : score >= 50 ? "#f39c12" : "#e74c3c";

    var section = h("div", { className: "cb-section" },
      h("div", { className: "cb-section-title" }, "Discipline Score")
    );

    var ring = document.createElement("div");
    ring.className = "cb-score-ring";
    ring.innerHTML =
      '<svg width="90" height="90">' +
        '<circle cx="45" cy="45" r="' + r + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>' +
        '<circle cx="45" cy="45" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" ' +
          'stroke-dasharray="' + c + '" stroke-dashoffset="' + offset + '" stroke-linecap="round" ' +
          'transform="rotate(-90 45 45)"/>' +
      '</svg>' +
      '<div class="cb-score-number" style="color:' + color + '">' + score + '</div>';

    var wrap = h("div", { className: "cb-score-wrap" });
    wrap.appendChild(ring);
    wrap.appendChild(
      h("div", null,
        h("div", { className: "cb-score-label" }, "Out of 100"),
        h("div", { className: "cb-score-detail" },
          (stats.tradesLast30d || []).length + " trades (" + periodLabel + ") \u2022 $" +
          (stats.monthToDateBiasCost || 0).toFixed(2) + " bias cost"
        )
      )
    );

    section.appendChild(wrap);
    return section;
  }

  /* ── Bias Breakdown (CSS horizontal bars) ─────────────── */
  function buildBiasBreakdown(trades) {
    if (!trades || trades.length === 0) return document.createDocumentFragment();

    var counts = { clean: 0 };
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      if (!t.flags || t.flags.length === 0) { counts.clean++; continue; }
      for (var j = 0; j < t.flags.length; j++) {
        var f = t.flags[j];
        counts[f] = (counts[f] || 0) + 1;
      }
    }

    var entries = Object.entries(counts).filter(function (e) { return e[1] > 0; })
      .sort(function (a, b) { return b[1] - a[1]; });
    if (entries.length === 0) return document.createDocumentFragment();

    var maxVal = Math.max.apply(null, entries.map(function (e) { return e[1]; }));
    var totalTrades = trades.length;

    var section = h("div", { className: "cb-section" },
      h("div", { className: "cb-section-title" }, "Bias Breakdown (" + periodLabel + ")")
    );
    var chart = h("div", { className: "cb-chart-wrap", style: { position: "relative" } });

    /* Shared tooltip for bars */
    var barTip = document.createElement("div");
    barTip.style.cssText = "position:absolute;pointer-events:none;opacity:0;transition:opacity .15s;" +
      "background:#152238;border:1px solid rgba(197,165,90,.35);border-radius:6px;padding:6px 10px;" +
      "font-size:11px;color:#e8e6e3;white-space:nowrap;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,.4);";
    chart.appendChild(barTip);

    for (var k = 0; k < entries.length; k++) {
      (function (key, val) {
        var pct = (val / maxVal) * 100;
        var pctOfTotal = ((val / totalTrades) * 100).toFixed(1);
        var color = COLORS[key] || "#555";

        var row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:default;";

        var label = document.createElement("span");
        label.style.cssText = "min-width:120px;font-size:11px;color:#a0a2a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
        label.textContent = LABELS[key] || key;

        var barWrap = document.createElement("div");
        barWrap.style.cssText = "flex:1;height:16px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;";

        var bar = document.createElement("div");
        bar.style.cssText = "height:100%;width:" + pct + "%;background:" + color + ";border-radius:3px;transition:width .4s ease;";

        var countEl = document.createElement("span");
        countEl.style.cssText = "min-width:28px;text-align:right;font-size:11px;font-weight:700;color:#e8e6e3;";
        countEl.textContent = String(val);

        row.addEventListener("mouseenter", function (e) {
          bar.style.opacity = "0.8";
          barTip.textContent = (LABELS[key] || key) + ": " + val + " trades (" + pctOfTotal + "% of total)";
          barTip.style.opacity = "1";
          var rect = chart.getBoundingClientRect();
          var rowRect = row.getBoundingClientRect();
          barTip.style.left = (rowRect.left - rect.left + rowRect.width / 2 - barTip.offsetWidth / 2) + "px";
          barTip.style.top = (rowRect.top - rect.top - barTip.offsetHeight - 4) + "px";
        });
        row.addEventListener("mouseleave", function () {
          bar.style.opacity = "1";
          barTip.style.opacity = "0";
        });

        barWrap.appendChild(bar);
        row.appendChild(label);
        row.appendChild(barWrap);
        row.appendChild(countEl);
        chart.appendChild(row);
      })(entries[k][0], entries[k][1]);
    }

    section.appendChild(chart);
    return section;
  }

  /* ── Equity vs Emotion (inline SVG line chart with hover) ─ */
  function buildEquityVsEmotion(trades) {
    if (!trades || trades.length < 3) return document.createDocumentFragment();

    var actual = 0, ghost = 0;
    var data = [];
    for (var i = 0; i < trades.length; i++) {
      var pl = trades[i].pl != null ? trades[i].pl : 0;
      actual += pl;
      if (!trades[i].flags || trades[i].flags.length === 0) ghost += pl;
      data.push({ actual: +actual.toFixed(2), ghost: +ghost.toFixed(2) });
    }

    var allVals = [];
    for (var j = 0; j < data.length; j++) { allVals.push(data[j].actual, data[j].ghost); }
    allVals.push(0);
    var minY = Math.min.apply(null, allVals);
    var maxY = Math.max.apply(null, allVals);
    var range = maxY - minY || 1;

    var W = 360, HH = 180, padT = 10, padB = 20, padL = 48, padR = 10;
    var chartW = W - padL - padR;
    var chartH = HH - padT - padB;

    function toX(idx) { return padL + (idx / (data.length - 1)) * chartW; }
    function toY(v) { return padT + chartH - ((v - minY) / range) * chartH; }

    var actualPath = "", ghostPath = "";
    for (var n = 0; n < data.length; n++) {
      var prefix = n === 0 ? "M" : "L";
      actualPath += prefix + toX(n).toFixed(1) + "," + toY(data[n].actual).toFixed(1);
      ghostPath += prefix + toX(n).toFixed(1) + "," + toY(data[n].ghost).toFixed(1);
    }

    var gridLines = "";
    var ySteps = 4;
    for (var s = 0; s <= ySteps; s++) {
      var v = minY + (range * s / ySteps);
      var y = toY(v);
      gridLines += '<text x="' + (padL - 4) + '" y="' + (y + 3) + '" text-anchor="end" fill="#6b6d73" font-size="10">$' + v.toFixed(0) + '</text>';
      gridLines += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="rgba(255,255,255,.06)"/>';
    }

    var zeroY = toY(0);

    /* Build invisible hover hit-targets + visible dots + crosshair */
    var hoverElements = "";
    for (var hi = 0; hi < data.length; hi++) {
      var cx = toX(hi).toFixed(1);
      /* Visible dots (hidden by default, shown on hover via JS) */
      hoverElements += '<circle class="cb-dot-actual" data-i="' + hi + '" cx="' + cx + '" cy="' + toY(data[hi].actual).toFixed(1) + '" r="3.5" fill="#c5a55a" opacity="0" style="transition:opacity .12s"/>';
      hoverElements += '<circle class="cb-dot-ghost" data-i="' + hi + '" cx="' + cx + '" cy="' + toY(data[hi].ghost).toFixed(1) + '" r="3.5" fill="#27ae60" opacity="0" style="transition:opacity .12s"/>';
      /* Invisible wide hit-target strip for each data point */
      var stripW = Math.max(6, chartW / data.length);
      var stripX = +cx - stripW / 2;
      hoverElements += '<rect class="cb-hit" data-i="' + hi + '" x="' + stripX.toFixed(1) + '" y="' + padT + '" width="' + stripW.toFixed(1) + '" height="' + chartH + '" fill="transparent" style="cursor:crosshair"/>';
    }

    /* Crosshair line (hidden by default) */
    var crosshair = '<line id="cb-crosshair" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + chartH) + '" stroke="rgba(197,165,90,.4)" stroke-width="1" stroke-dasharray="3 2" opacity="0" style="transition:opacity .12s"/>';

    var section = h("div", { className: "cb-section" },
      h("div", { className: "cb-section-title" }, "Equity vs Emotion")
    );
    var wrap = document.createElement("div");
    wrap.className = "cb-chart-wrap";
    wrap.style.position = "relative";

    wrap.innerHTML =
      '<svg width="' + W + '" height="' + HH + '" style="display:block">' +
        gridLines +
        '<line x1="' + padL + '" y1="' + zeroY + '" x2="' + (W - padR) + '" y2="' + zeroY + '" stroke="rgba(255,255,255,.15)" stroke-dasharray="3 3"/>' +
        '<path d="' + actualPath + '" fill="none" stroke="#c5a55a" stroke-width="2"/>' +
        '<path d="' + ghostPath + '" fill="none" stroke="#27ae60" stroke-width="2" stroke-dasharray="5 5"/>' +
        crosshair +
        hoverElements +
      '</svg>' +
      '<div id="cb-chart-tip" style="position:absolute;pointer-events:none;opacity:0;transition:opacity .12s;' +
        'background:#152238;border:1px solid rgba(197,165,90,.35);border-radius:6px;padding:8px 12px;' +
        'font-size:11px;color:#e8e6e3;white-space:nowrap;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,.5);"></div>' +
      '<div style="display:flex;gap:16px;justify-content:center;padding:6px 0">' +
        '<span style="font-size:11px;color:#c5a55a">\u2501 Actual P/L</span>' +
        '<span style="font-size:11px;color:#27ae60">\u254C Ghost (no bias)</span>' +
      '</div>';

    /* Wire up hover interactions after DOM insertion */
    setTimeout(function () {
      var svg = wrap.querySelector("svg");
      var tip = wrap.querySelector("#cb-chart-tip");
      var crossLine = wrap.querySelector("#cb-crosshair");
      if (!svg || !tip || !crossLine) return;

      var hitRects = svg.querySelectorAll(".cb-hit");
      var dotActuals = svg.querySelectorAll(".cb-dot-actual");
      var dotGhosts = svg.querySelectorAll(".cb-dot-ghost");

      function showPoint(idx) {
        /* Hide all dots first */
        dotActuals.forEach(function (d) { d.setAttribute("opacity", "0"); });
        dotGhosts.forEach(function (d) { d.setAttribute("opacity", "0"); });
        /* Show this point's dots */
        dotActuals[idx].setAttribute("opacity", "1");
        dotGhosts[idx].setAttribute("opacity", "1");
        /* Move crosshair */
        var cx = toX(idx).toFixed(1);
        crossLine.setAttribute("x1", cx);
        crossLine.setAttribute("x2", cx);
        crossLine.setAttribute("opacity", "1");
        /* Position tooltip */
        var d = data[idx];
        var diff = d.actual - d.ghost;
        var diffStr = diff >= 0 ? "+$" + diff.toFixed(2) : "-$" + Math.abs(diff).toFixed(2);
        tip.innerHTML =
          '<div style="font-weight:700;color:#c5a55a;margin-bottom:3px">Trade #' + (idx + 1) + '</div>' +
          '<div style="color:#c5a55a">Actual: <b>$' + d.actual.toFixed(2) + '</b></div>' +
          '<div style="color:#27ae60">Ghost: <b>$' + d.ghost.toFixed(2) + '</b></div>' +
          '<div style="color:#8b8d93;margin-top:3px;border-top:1px solid rgba(255,255,255,.08);padding-top:3px">Bias gap: ' + diffStr + '</div>';
        tip.style.opacity = "1";
        /* Position: above the highest dot, clamped to chart bounds */
        var tipX = +cx - tip.offsetWidth / 2;
        var minDotY = Math.min(+dotActuals[idx].getAttribute("cy"), +dotGhosts[idx].getAttribute("cy"));
        var tipY = minDotY - tip.offsetHeight - 8;
        if (tipY < 0) tipY = Math.max(+dotActuals[idx].getAttribute("cy"), +dotGhosts[idx].getAttribute("cy")) + 10;
        if (tipX < 0) tipX = 4;
        if (tipX + tip.offsetWidth > W) tipX = W - tip.offsetWidth - 4;
        tip.style.left = tipX + "px";
        tip.style.top = tipY + "px";
      }

      function hideAll() {
        dotActuals.forEach(function (d) { d.setAttribute("opacity", "0"); });
        dotGhosts.forEach(function (d) { d.setAttribute("opacity", "0"); });
        crossLine.setAttribute("opacity", "0");
        tip.style.opacity = "0";
      }

      hitRects.forEach(function (rect) {
        rect.addEventListener("mouseenter", function () {
          showPoint(parseInt(rect.getAttribute("data-i")));
        });
      });

      svg.addEventListener("mouseleave", hideAll);
    }, 0);

    section.appendChild(wrap);
    return section;
  }

  /* ── Coach's Corner ──────────────────────────────────── */
  function buildCoachCorner() {
    if (!stats) return document.createDocumentFragment();

    var tips = [];

    if ((stats.currentLossStreak || 0) >= 3) {
      tips.push({ title: "Losing Streak Alert", body: "You\u2019ve had " + stats.currentLossStreak + " consecutive losses. Consider stepping away for at least 30 minutes. Losses compound faster when emotions are high." });
    }
    if ((stats.monthToDateBiasCost || 0) > 500) {
      tips.push({ title: "Emotional Tax Climbing", body: "Your month-to-date bias cost is $" + stats.monthToDateBiasCost.toFixed(0) + ". Try reducing position sizes on flagged trades or using the cooling-off feature more." });
    }

    var checks = [
      ["overtrading", 3, "24h", "Slow Down", " overtrading flags in the last 24h. Set a daily trade limit and stick to it. Quality > quantity.", stats.tradesLast24h],
      ["revenge_trading", 2, "30d", "Revenge Pattern", " revenge trading instances this month. After a loss, wait at least 15 minutes and reduce your next position by 50%.", stats.tradesLast30d],
      ["disposition_effect", 2, "30d", "Disposition Effect", null, stats.tradesLast30d],
      ["gamblers_fallacy", 1, "30d", "Gambler\u2019s Fallacy", null, stats.tradesLast30d],
      ["sunk_cost", 2, "30d", "Sunk Cost Trap", null, stats.tradesLast30d],
      ["overconfidence", 2, "30d", "Overconfidence Warning", null, stats.tradesLast30d],
      ["confirmation_bias", 2, "30d", "Confirmation Bias", null, stats.tradesLast30d],
      ["recency_bias", 1, "30d", "Recency Bias", null, stats.tradesLast30d],
      ["mental_accounting", 1, "30d", "Mental Accounting", null, stats.tradesLast30d]
    ];

    var defaultBodies = {
      disposition_effect: "You\u2019re cutting winners short and holding losers. Try setting profit targets AND stop-losses before entering trades.",
      gamblers_fallacy: "You\u2019re increasing bets after losses expecting a reversal. Each trade is independent \u2014 past losses don\u2019t make wins more likely.",
      sunk_cost: "You\u2019re averaging down into losing positions. The money already lost shouldn\u2019t influence your next decision \u2014 focus on what the trade looks like NOW.",
      overconfidence: "Your risk per trade is climbing beyond your average. Stay disciplined \u2014 overconfidence is the most expensive bias in trading.",
      confirmation_bias: "You keep buying into losing positions. Actively seek out reasons NOT to make a trade before entering.",
      recency_bias: "Your trade sizing is swinging based on recent wins or losses. Stick to a consistent position sizing strategy regardless of recent outcomes.",
      mental_accounting: "You\u2019re risking more after profits \u2014 treating gains as \u2018house money.\u2019 All capital is real money. Maintain consistent risk rules."
    };

    for (var ci = 0; ci < checks.length; ci++) {
      var flag = checks[ci][0], threshold = checks[ci][1];
      var title = checks[ci][3], bodyTpl = checks[ci][4], tradeList = checks[ci][5];
      var count = (tradeList || []).filter(function (t) { return t.flags && t.flags.indexOf(flag) !== -1; }).length;
      if (count >= threshold) {
        var body = bodyTpl ? ("Detected " + count + bodyTpl) : defaultBodies[flag] || "";
        tips.push({ title: title, body: body });
      }
    }

    if (fp) {
      var entries = Object.entries(fp.hourlyPattern || {});
      if (entries.length > 0) {
        entries.sort(function (a, b) { return b[1] - a[1]; });
        var worst = entries[0];
        if (parseInt(worst[0]) >= 21 || parseInt(worst[0]) <= 5) {
          tips.push({ title: "Late-Night Trading", body: "Most of your trades happen around " + worst[0] + ":00. Late-night sessions tend to produce worse outcomes. Consider limiting trading hours." });
        }
      }
      var issues = Object.entries(fp.assetIssues || {});
      for (var ai = 0; ai < issues.length; ai++) {
        var asset = issues[ai][0], flagCount = typeof issues[ai][1] === "number" ? issues[ai][1] : 0;
        if (flagCount >= 5) {
          tips.push({ title: asset + " Trouble Spot", body: asset + " has been flagged in " + flagCount + " trades. Consider taking a break from this asset or reducing your exposure." });
          break;
        }
      }
    }

    if (tips.length === 0) {
      tips.push({ title: "Strong Discipline", body: "No major issues detected. Keep following your trading plan and using cooling-off periods when needed." });
    }

    var section = h("div", { className: "cb-section" },
      h("div", { className: "cb-section-title" }, "Coach\u2019s Corner")
    );
    var shown = tips.slice(0, 5);
    for (var ti = 0; ti < shown.length; ti++) {
      section.appendChild(
        h("div", { className: "cb-coach-card" },
          h("h4", null, shown[ti].title),
          h("p", null, shown[ti].body)
        )
      );
    }
    return section;
  }

  /* ── Import / Export ──────────────────────────────────── */
  function buildImportExport() {
    var section = h("div", { className: "cb-section" },
      h("div", { className: "cb-section-title" }, "Import / Export Data")
    );

    section.appendChild(
      h("div", { className: "cb-import-row", style: { marginBottom: "8px" } },
        h("button", { className: "cb-btn-gold cb-btn-import", onClick: handleImportClick }, "Import CSV")
      )
    );

    if (importStatus) {
      section.appendChild(h("div", { className: "cb-import-status" }, importStatus));
    }

    section.appendChild(
      h("div", { className: "cb-export-row" },
        h("button", { className: "cb-btn-sm", onClick: exportBasic }, "Basic CSV"),
        h("button", { className: "cb-btn-sm", onClick: exportAdvanced }, "Advanced CSV")
      )
    );

    return section;
  }

  function dlFile(csv, filename) {
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportBasic() {
    var csv = await msg({ type: "EXPORT_CSV", payload: { advanced: false } });
    if (typeof csv === "string") dlFile(csv, "trades_basic.csv");
  }

  async function exportAdvanced() {
    var csv = await msg({ type: "EXPORT_CSV", payload: { advanced: true } });
    if (typeof csv === "string") dlFile(csv, "trades_advanced.csv");
  }

  function handleImportClick() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      importStatus = "Reading file\u2026";
      render();
      var text = await file.text();
      importStatus = "Analyzing " + (text.split("\n").length - 1) + " trades\u2026";
      render();
      try {
        var result = await msg({ type: "IMPORT_CSV", payload: { csvText: text } });
        if (!result) {
          importStatus = "Error: No response from background. Try a smaller CSV or reload the extension.";
        } else if (result.error) {
          importStatus = "Error: " + result.error;
        } else {
          importStatus = "Imported " + result.imported + " trades (" + (result.flagged || 0) + " flagged)" + (result.skipped > 0 ? ", " + result.skipped + " skipped" : "");
          refresh();
          return;
        }
      } catch (err) {
        importStatus = "Error: " + (err.message || "Import failed");
      }
      render();
      setTimeout(function () { importStatus = null; render(); }, 8000);
    };
    input.click();
  }

  /* ── Settings ─────────────────────────────────────────── */
  function renderSettings(root) {
    if (!settings) return;
    var container = h("div", { className: "cb-settings" });
    root.appendChild(container);

    var fields = [
      { key: "cooldownMinutes", label: "Cooling-off duration (minutes)", type: "number", min: "1", max: "30" },
      { key: "dailyTradeLimit", label: "Daily trade limit", type: "number", min: "1", max: "200" },
      { key: "maxSizeMultiplier", label: "Max size multiplier", type: "number", min: "1", max: "20", step: "0.5" },
      { key: "baseRiskUnit", label: "Base risk unit ($)", type: "number", min: "10", max: "10000", step: "10" },
      { key: "timezone", label: "Timezone", type: "text" }
    ];

    for (var i = 0; i < fields.length; i++) {
      (function (field) {
        var group = h("div", { className: "cb-setting-group" });
        group.appendChild(h("label", null, field.label));

        var input = document.createElement("input");
        input.type = field.type;
        input.value = String(settings[field.key] != null ? settings[field.key] : "");
        if (field.min) input.setAttribute("min", field.min);
        if (field.max) input.setAttribute("max", field.max);
        if (field.step) input.setAttribute("step", field.step);

        input.addEventListener("change", async function (e) {
          var val = field.type === "number" ? +e.target.value : e.target.value;
          var res = await msg({ type: "UPDATE_SETTINGS", payload: { [field.key]: val } });
          settings = res;
        });

        group.appendChild(input);
        container.appendChild(group);
      })(fields[i]);
    }
  }

  /* ── Actions ──────────────────────────────────────────── */
  async function seedData() {
    await msg({ type: "SEED_DEMO_DATA" });
    refresh();
  }

  async function clearData() {
    await msg({ type: "CLEAR_DATA" });
    refresh();
  }

  /* ── Init ─────────────────────────────────────────────── */
  refresh();
})();
