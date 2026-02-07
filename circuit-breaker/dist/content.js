"use strict";
(() => {
  // src/shared/selectors.ts
  var DEFAULT_SELECTORS = {
    confirmButton: [
      '[data-action="confirm"]',
      "#confirm-trade",
      'button[type="submit"]',
      ".confirm-btn",
      ".order-confirm"
    ],
    buyButton: [
      '[data-action="buy"]',
      "#buy-btn",
      ".buy-button",
      "button.buy"
    ],
    sellButton: [
      '[data-action="sell"]',
      "#sell-btn",
      ".sell-button",
      "button.sell"
    ],
    assetField: [
      '[data-field="asset"]',
      "#asset-select",
      ".asset-selector select",
      'select[name="asset"]'
    ],
    priceField: [
      '[data-field="price"]',
      "#price-display",
      "#price-input",
      'input[name="price"]'
    ],
    quantityField: [
      '[data-field="quantity"]',
      "#quantity-input",
      'input[name="quantity"]'
    ],
    orderTypeField: [
      '[data-field="order-type"]',
      "#order-type",
      'select[name="orderType"]'
    ],
    plDisplay: [
      '[data-field="pl"]',
      "#pl-value",
      ".pnl-display"
    ],
    formContainer: [
      "#order-form",
      ".order-form",
      ".trade-form"
    ]
  };
  var SITE_OVERRIDES = {
    localhost: {
      confirmButton: ["#confirm-trade"],
      buyButton: ["#buy-btn"],
      sellButton: ["#sell-btn"],
      assetField: ["#asset-select"],
      priceField: ["#price-display"],
      quantityField: ["#quantity-input"],
      plDisplay: ["#pl-value"],
      formContainer: ["#order-form"]
    }
  };
  function getSelectorsForSite(hostname) {
    for (const [key, override] of Object.entries(SITE_OVERRIDES)) {
      if (hostname.includes(key)) {
        return { ...DEFAULT_SELECTORS, ...override };
      }
    }
    return DEFAULT_SELECTORS;
  }
  function querySelector(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch {
        continue;
      }
    }
    return null;
  }
  function querySelectorValue(selectors) {
    const el = querySelector(selectors);
    if (!el) return "";
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return el.value;
    return el.textContent?.trim() || "";
  }

  // src/content/observer.ts
  var TradeObserver = class {
    constructor(onConfirm) {
      this.currentAction = "Buy";
      this.passThrough = false;
      this.mo = null;
      /* ── Internal handlers ─────────────────────────────────── */
      this.handleActionClick = (e) => {
        const t = e.target;
        if (this.matches(t, this.sel.buyButton)) this.currentAction = "Buy";
        if (this.matches(t, this.sel.sellButton)) this.currentAction = "Sell";
      };
      this.handleConfirmClick = (e) => {
        const t = e.target;
        const btn = this.findMatch(t, this.sel.confirmButton);
        if (!btn) return;
        if (this.passThrough) {
          this.passThrough = false;
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.onConfirm(this.scrapeIntent(), btn);
      };
      this.sel = getSelectorsForSite(window.location.hostname);
      this.onConfirm = onConfirm;
    }
    start() {
      document.addEventListener("click", this.handleActionClick, true);
      document.addEventListener("click", this.handleConfirmClick, true);
      this.mo = new MutationObserver(() => {
      });
      if (document.body) {
        this.mo.observe(document.body, { childList: true, subtree: true });
      }
      console.log("[HeuristX] Observer active on", window.location.hostname);
    }
    /** Let the next confirm click pass through unblocked. */
    allowOneConfirm() {
      this.passThrough = true;
    }
    destroy() {
      document.removeEventListener("click", this.handleActionClick, true);
      document.removeEventListener("click", this.handleConfirmClick, true);
      this.mo?.disconnect();
    }
    /* ── Scraper ───────────────────────────────────────────── */
    scrapeIntent() {
      return {
        action: this.currentAction,
        asset: querySelectorValue(this.sel.assetField) || "Unknown",
        price: parseFloat(querySelectorValue(this.sel.priceField).replace(/[^0-9.-]/g, "")) || 0,
        quantity: parseFloat(querySelectorValue(this.sel.quantityField).replace(/[^0-9.-]/g, "")) || 1,
        orderType: querySelectorValue(this.sel.orderTypeField) || "Market"
      };
    }
    /* ── Selector helpers ──────────────────────────────────── */
    matches(el, sels) {
      for (const s of sels) {
        try {
          if (el.matches(s) || el.closest(s)) return true;
        } catch {
        }
      }
      return false;
    }
    findMatch(el, sels) {
      for (const s of sels) {
        try {
          if (el.matches(s)) return el;
          const p = el.closest(s);
          if (p) return p;
        } catch {
        }
      }
      return null;
    }
  };

  // src/content/overlay.ts
  var CircuitBreakerOverlay = class {
    constructor(actions) {
      this.el = null;
      this.actions = actions;
    }
    /* ── Show bias intervention ────────────────────────────── */
    show(p) {
      this.remove();
      const el = document.createElement("div");
      el.id = "cb-overlay";
      el.innerHTML = this.html(p);
      document.body.appendChild(el);
      this.el = el;
      requestAnimationFrame(() => el.classList.add("cb-visible"));
      this.bind(p);
    }
    /* ── Show cooldown screen ──────────────────────────────── */
    showCooldown(cd) {
      this.remove();
      const mins = cd.expiresAt ? Math.ceil(Math.max(0, cd.expiresAt - Date.now()) / 6e4) : 0;
      const el = document.createElement("div");
      el.id = "cb-overlay";
      el.innerHTML = `
      <div class="cb-modal">
        <div class="cb-header"><div class="cb-icon">\u23F8</div>
          <h2 class="cb-title">Cooling-Off Period Active</h2></div>
        <div class="cb-body">
          <p class="cb-cooldown-msg">Trading paused for your protection.</p>
          <p class="cb-cooldown-reason">${cd.reason}</p>
          <div class="cb-timer"><span class="cb-timer-value" id="cb-timer">${mins}</span>
            <span class="cb-timer-label">minutes remaining</span></div>
        </div>
        <div class="cb-actions">
          <button class="cb-btn cb-btn-secondary" id="cb-dismiss">Dismiss</button>
        </div>
      </div>`;
      document.body.appendChild(el);
      this.el = el;
      requestAnimationFrame(() => el.classList.add("cb-visible"));
      const iv = setInterval(() => {
        const r = cd.expiresAt ? Math.max(0, cd.expiresAt - Date.now()) : 0;
        const d = document.getElementById("cb-timer");
        if (d) d.textContent = String(Math.ceil(r / 6e4));
        if (r <= 0) {
          clearInterval(iv);
          this.remove();
        }
      }, 1e4);
      document.getElementById("cb-dismiss")?.addEventListener("click", () => {
        clearInterval(iv);
        this.remove();
      });
    }
    remove() {
      if (!this.el) return;
      this.el.classList.remove("cb-visible");
      const ref = this.el;
      setTimeout(() => ref.remove(), 300);
      this.el = null;
    }
    /* ── HTML builder ──────────────────────────────────────── */
    html(p) {
      const cards = p.biases.map((b) => `
      <div class="cb-bias-card cb-severity-${b.severity}">
        <div class="cb-bias-header">
          <span class="cb-bias-icon">${icon(b.type)}</span>
          <span class="cb-bias-label">${label(b.type)}</span>
          <span class="cb-bias-severity">${b.severity}</span>
        </div>
        <p class="cb-bias-desc">${b.description}</p>
        <ul class="cb-bias-factors">${b.factors.map((f) => `<li>${f}</li>`).join("")}</ul>
        <div class="cb-bias-score-bar"><div class="cb-bias-score-fill" style="width:${b.score}%"></div></div>
      </div>`).join("");
      const breakdown = p.cost.explanation.map((e) => `<li>${e}</li>`).join("");
      return `
      <div class="cb-modal">
        <div class="cb-header">
          <div class="cb-icon"></div>
          <h2 class="cb-title">HeuristX</h2>
          <p class="cb-subtitle">Behavioral pattern detected \u2014 review before confirming</p>
        </div>
        <div class="cb-body">
          ${p.dailyLimitReached ? '<div class="cb-limit-warning">\u26A0\uFE0F Daily trade limit reached. Consider stopping for today.</div>' : ""}
          <div class="cb-bias-cards">${cards}</div>
          <div class="cb-cost-section">
            <div class="cb-cost-row">
              <span class="cb-cost-label">Estimated Bias Cost (this trade)</span>
              <span class="cb-cost-value">$${p.cost.totalCost.toFixed(2)}</span>
            </div>
            <div class="cb-cost-row cb-cost-mtd">
              <span class="cb-cost-label">Month-to-Date Emotional Tax</span>
              <span class="cb-cost-value">$${(p.monthToDateCost + p.cost.totalCost).toFixed(2)}</span>
            </div>
            <div class="cb-cost-breakdown"><p class="cb-cost-breakdown-title">Cost Breakdown</p><ul>${breakdown}</ul></div>
          </div>
          <div class="cb-emotion-section">
            <p class="cb-emotion-prompt">How are you feeling right now?</p>
            <div class="cb-emotion-buttons">
              <button class="cb-emotion-btn" data-emotion="frustrated">\u{1F624} Frustrated</button>
              <button class="cb-emotion-btn" data-emotion="calm">\u{1F60C} Calm</button>
              <button class="cb-emotion-btn" data-emotion="bored">\u{1F611} Bored</button>
            </div>
          </div>
        </div>
        <div class="cb-actions">
          <button class="cb-btn cb-btn-proceed" id="cb-proceed" disabled>Proceed Anyway</button>
          <button class="cb-btn cb-btn-cooloff" id="cb-cooloff">\u{1F9CA} Cooling-Off Mode</button>
          <button class="cb-btn cb-btn-limit"   id="cb-set-limit">\u{1F4CF} Set a Limit</button>
        </div>
        <div class="cb-limit-panel" id="cb-limit-panel" style="display:none">
          <div class="cb-limit-field"><label>Daily trade limit</label><input type="number" id="cb-limit-daily" value="20" min="1" max="100"/></div>
          <div class="cb-limit-field"><label>Max size multiplier</label><input type="number" id="cb-limit-size" value="2" min="1" max="10" step="0.5"/></div>
          <button class="cb-btn cb-btn-confirm-limit" id="cb-confirm-limit">Apply Limits</button>
        </div>
      </div>`;
    }
    /* ── Event binding ─────────────────────────────────────── */
    bind(_p) {
      let emotion = null;
      document.querySelectorAll(".cb-emotion-btn").forEach(
        (btn) => btn.addEventListener("click", (e) => {
          document.querySelectorAll(".cb-emotion-btn").forEach((b) => b.classList.remove("cb-selected"));
          e.target.classList.add("cb-selected");
          emotion = e.target.dataset.emotion;
          const p = document.getElementById("cb-proceed");
          if (p) p.disabled = false;
        })
      );
      document.getElementById("cb-proceed")?.addEventListener("click", () => {
        this.remove();
        this.actions.onProceed(emotion || "calm");
      });
      document.getElementById("cb-cooloff")?.addEventListener("click", () => {
        this.remove();
        this.actions.onCoolOff();
      });
      document.getElementById("cb-set-limit")?.addEventListener("click", () => {
        const panel = document.getElementById("cb-limit-panel");
        if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
      });
      document.getElementById("cb-confirm-limit")?.addEventListener("click", () => {
        const d = parseInt(document.getElementById("cb-limit-daily")?.value || "20");
        const s = parseFloat(document.getElementById("cb-limit-size")?.value || "2");
        this.remove();
        this.actions.onSetLimit(d, s);
      });
    }
  };
  var BIAS_ICONS = {
    overtrading: "\u{1F504}",
    revenge_trading: "\u{1F3AF}",
    loss_aversion: "\u{1FAA4}",
    herd_mentality: "\u{1F411}",
    anchoring_bias: "\u2693",
    recency_bias: "\u23F3",
    gamblers_fallacy: "\u{1F3B2}",
    overconfidence: "\u{1F451}",
    sunk_cost: "\u{1F4B8}",
    mental_accounting: "\u{1F4B0}",
    availability_bias: "\u{1F4F0}"
  };
  var BIAS_LABELS = {
    overtrading: "Overtrading",
    revenge_trading: "Revenge Trading",
    loss_aversion: "Loss Aversion (Hope Trap)",
    herd_mentality: "Herd Mentality",
    anchoring_bias: "Anchoring Bias",
    recency_bias: "Recency Bias",
    gamblers_fallacy: "Gambler's Fallacy",
    overconfidence: "Overconfidence Bias",
    sunk_cost: "Sunk Cost Fallacy",
    mental_accounting: "Mental Accounting",
    availability_bias: "Availability Bias"
  };
  function icon(t) {
    return BIAS_ICONS[t] || "\u26A0\uFE0F";
  }
  function label(t) {
    return BIAS_LABELS[t] || t;
  }

  // src/content/index.ts
  (function main() {
    "use strict";
    let intent = null;
    let confirmBtn = null;
    let biases = [];
    let biasCost = 0;
    const overlay = new CircuitBreakerOverlay({
      onProceed: proceed,
      onCoolOff: coolOff,
      onSetLimit: setLimit
    });
    const observer = new TradeObserver(onConfirmAttempt);
    async function onConfirmAttempt(tradeIntent, btn) {
      intent = tradeIntent;
      confirmBtn = btn;
      const cd = await msg({ type: "CHECK_COOLDOWN" });
      if (cd?.active) {
        overlay.showCooldown(cd);
        return;
      }
      const res = await msg({
        type: "CHECK_BIAS",
        payload: {
          action: tradeIntent.action,
          asset: tradeIntent.asset,
          price: tradeIntent.price,
          quantity: tradeIntent.quantity,
          orderType: tradeIntent.orderType
        }
      });
      if (res?.error) {
        console.error("[CB]", res.error);
        allowThrough();
        return;
      }
      biases = res.biases || [];
      biasCost = res.cost?.totalCost || 0;
      if (biases.length === 0 && !res.dailyLimitReached) {
        await recordAndAllow("calm");
        return;
      }
      const stats = await msg({ type: "GET_STATS" });
      overlay.show({
        biases,
        cost: res.cost,
        monthToDateCost: stats?.monthToDateBiasCost || 0,
        cooldown: res.cooldown,
        dailyLimitReached: res.dailyLimitReached
      });
    }
    async function proceed(emotion) {
      await recordAndAllow(emotion);
    }
    async function coolOff() {
      const settings = await msg({ type: "GET_SETTINGS" });
      await msg({
        type: "SET_COOLDOWN",
        payload: { minutes: settings?.cooldownMinutes || 5, reason: "Voluntary cooling-off after bias detection" }
      });
      if (intent) {
        await msg({
          type: "TRADE_CONFIRMED",
          payload: { tradeId: String(Date.now()), trade: intent, biases, biasCost, emotionTag: "frustrated", cooledOff: true }
        });
      }
      reset();
    }
    async function setLimit(daily, sizeMult) {
      await msg({ type: "SET_LIMIT", payload: { dailyTradeLimit: daily, maxSizeMultiplier: sizeMult } });
      await recordAndAllow("calm");
    }
    async function recordAndAllow(emotion) {
      if (!intent) return;
      await msg({
        type: "TRADE_CONFIRMED",
        payload: { tradeId: String(Date.now()), trade: intent, biases, biasCost, emotionTag: emotion }
      });
      allowThrough();
    }
    function allowThrough() {
      if (!confirmBtn) return;
      observer.allowOneConfirm();
      confirmBtn.click();
      reset();
    }
    function reset() {
      intent = null;
      confirmBtn = null;
      biases = [];
      biasCost = 0;
    }
    function msg(m) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(m, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    }
    chrome.runtime.onMessage.addListener((m) => {
      if (m.type === "COOLDOWN_EXPIRED") overlay.remove();
    });
    // ── Floating Action Button & Mini Dashboard ──────────────
    function createFAB() {
      // Avoid duplicates
      if (document.getElementById("cb-fab")) return;
      // FAB button
      const fab = document.createElement("div");
      fab.id = "cb-fab";
      try {
        const fabImg = document.createElement("img");
        fabImg.src = chrome.runtime.getURL("icons/heuristx_x.png");
        fabImg.alt = "HeuristX";
        fabImg.style.cssText = "width:38px;height:38px;object-fit:contain;pointer-events:none;";
        fabImg.onerror = function() { fab.textContent = "HX"; fab.style.fontWeight = "700"; fab.style.fontSize = "14px"; fab.style.color = "#c5a55a"; };
        fab.appendChild(fabImg);
      } catch(e) {
        fab.textContent = "HX";
        fab.style.fontWeight = "700";
        fab.style.fontSize = "14px";
        fab.style.color = "#c5a55a";
      }
      fab.title = "HeuristX";
      document.body.appendChild(fab);

      // Mini dashboard panel
      const panel = document.createElement("div");
      panel.id = "cb-mini-panel";
      panel.innerHTML = '<div class="cb-mini-loading">Loading...</div>';
      document.body.appendChild(panel);

      let panelOpen = false;

      fab.addEventListener("click", async () => {
        panelOpen = !panelOpen;
        if (panelOpen) {
          panel.classList.add("cb-mini-open");
          fab.classList.add("cb-fab-active");
          await refreshMiniPanel();
        } else {
          panel.classList.remove("cb-mini-open");
          fab.classList.remove("cb-fab-active");
        }
      });

      // Close panel when clicking outside
      document.addEventListener("click", (e) => {
        if (panelOpen && !panel.contains(e.target) && e.target !== fab) {
          panelOpen = false;
          panel.classList.remove("cb-mini-open");
          fab.classList.remove("cb-fab-active");
        }
      });

      async function refreshMiniPanel() {
        try {
          const [stats, fp] = await Promise.all([
            msg({ type: "GET_STATS" }),
            msg({ type: "GET_FINGERPRINT" })
          ]);

          if (!stats || stats.error) {
            panel.innerHTML = '<div class="cb-mini-empty">No data yet. Import a CSV or start trading.</div>';
            return;
          }

          const trades30d = stats.tradesLast30d || [];
          const total30d = trades30d.length;
          const flagged30d = trades30d.filter(t => t.flags && t.flags.length > 0).length;
          const clean30d = total30d - flagged30d;
          const score = stats.disciplineScore ?? 100;
          const mtdCost = (stats.monthToDateBiasCost || 0).toFixed(2);

          // Count biases
          const biasCounts = {};
          for (const t of trades30d) {
            if (t.flags) for (const f of t.flags) {
              biasCounts[f] = (biasCounts[f] || 0) + 1;
            }
          }
          const topBiases = Object.entries(biasCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

          // Score color
          const scoreColor = score >= 75 ? "#27ae60" : score >= 50 ? "#f39c12" : "#e74c3c";

          let biasListHtml = "";
          if (topBiases.length > 0) {
            biasListHtml = topBiases.map(([type, count]) =>
              '<div class="cb-mini-bias-row"><span class="cb-mini-bias-name">' + (BIAS_LABELS[type] || type) + '</span><span class="cb-mini-bias-count">' + count + '</span></div>'
            ).join("");
          } else {
            biasListHtml = '<div class="cb-mini-clean">All clean trades this month</div>';
          }

          panel.innerHTML =
            '<div class="cb-mini-header">' +
              '<div class="cb-mini-title">HeuristX</div>' +
              '<div class="cb-mini-subtitle">30-day summary</div>' +
            '</div>' +
            '<div class="cb-mini-score-section">' +
              '<div class="cb-mini-score" style="color:' + scoreColor + '">' + score + '</div>' +
              '<div class="cb-mini-score-label">Discipline Score</div>' +
            '</div>' +
            '<div class="cb-mini-stats">' +
              '<div class="cb-mini-stat"><span class="cb-mini-stat-num">' + total30d + '</span><span class="cb-mini-stat-lbl">Trades</span></div>' +
              '<div class="cb-mini-stat"><span class="cb-mini-stat-num">' + flagged30d + '</span><span class="cb-mini-stat-lbl">Flagged</span></div>' +
              '<div class="cb-mini-stat"><span class="cb-mini-stat-num">$' + mtdCost + '</span><span class="cb-mini-stat-lbl">Bias Cost</span></div>' +
            '</div>' +
            '<div class="cb-mini-biases-title">Top Biases (30d)</div>' +
            '<div class="cb-mini-biases">' + biasListHtml + '</div>' +
            '<div class="cb-mini-footer">' +
              '<button class="cb-mini-btn" id="cb-mini-import">Import CSV</button>' +
              '<button class="cb-mini-btn cb-mini-btn-secondary" id="cb-mini-refresh">Refresh</button>' +
            '</div>';

          // Bind buttons
          document.getElementById("cb-mini-refresh")?.addEventListener("click", refreshMiniPanel);
          document.getElementById("cb-mini-import")?.addEventListener("click", () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".csv,text/csv";
            input.onchange = async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              panel.innerHTML = '<div class="cb-mini-loading">Importing & analyzing...</div>';
              const result = await msg({ type: "IMPORT_CSV", payload: { csvText: text } });
              if (result?.error) {
                panel.innerHTML = '<div class="cb-mini-empty">Error: ' + result.error + '</div>';
              } else {
                await refreshMiniPanel();
              }
            };
            input.click();
          });

        } catch (err) {
          panel.innerHTML = '<div class="cb-mini-empty">Error loading data</div>';
        }
      }
    }

    // Create FAB first (so it always appears even if observer fails)
    if (document.body) createFAB();
    else document.addEventListener("DOMContentLoaded", createFAB);

    // Start trade observer (wrapped in try-catch so FAB still works if this fails)
    try {
      if (document.body) observer.start();
      else document.addEventListener("DOMContentLoaded", () => { try { observer.start(); } catch(e) { console.warn("[CB] Observer start failed:", e); } });
    } catch (e) {
      console.warn("[CB] Observer start failed:", e);
    }

    console.log("[HeuristX] Content script loaded.");
  })();
})();
//# sourceMappingURL=content.js.map
