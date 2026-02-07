class HumanTaxWidget {
    constructor() {
        this.element = null;
        this.totalTax = 0;
        this.breakdown = {};
        this.isExpanded = false;
        this.init();
    }

    async init() {
        // Load initial state
        const storage = await chrome.storage.local.get(['session_human_tax', 'session_tax_breakdown']);
        this.totalTax = storage.session_human_tax || 0;
        this.breakdown = storage.session_tax_breakdown || {};

        this.injectStyles();
        this.createWidget();
        this.updateDisplay(this.totalTax, false);

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                if (changes.session_human_tax) {
                    const newValue = changes.session_human_tax.newValue;
                    const oldValue = changes.session_human_tax.oldValue || 0;
                    this.totalTax = newValue;
                    this.updateDisplay(newValue, newValue > oldValue);
                }
                if (changes.session_tax_breakdown) {
                    this.breakdown = changes.session_tax_breakdown.newValue || {};
                    if (this.isExpanded) this.renderBreakdown();
                }
            }
        });
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Georgia:wght@400;700&display=swap');

            .human-tax-widget {
                position: fixed;
                top: 20px;
                right: 20px;
                background: #0f172a;
                border: 2px solid #d4af37;
                color: #d4af37;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: 'Georgia', serif;
                z-index: 999999;
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                transition: all 0.3s ease;
                cursor: pointer;
                user-select: none;
                min-width: 150px;
                text-align: center;
            }

            .human-tax-widget:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(212, 175, 55, 0.2);
            }

            .human-tax-label {
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 1px;
                opacity: 0.8;
                margin-bottom: 4px;
            }

            .human-tax-value {
                font-size: 24px;
                font-weight: bold;
            }

            .human-tax-pulse {
                animation: taxPulse 1.5s ease;
                color: #ff4757;
                border-color: #ff4757;
            }

            @keyframes taxPulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    createWidget() {
        this.element = document.createElement('div');
        this.element.className = 'human-tax-widget';

        this.renderMainContent();

        this.element.addEventListener('click', () => {
            this.isExpanded = !this.isExpanded;
            if (this.isExpanded) {
                this.renderBreakdown();
            } else {
                this.renderMainContent();
            }
        });

        document.body.appendChild(this.element);
    }

    renderMainContent() {
        this.element.innerHTML = `
            <div class="human-tax-label">Session Human Tax</div>
            <div class="human-tax-value">$${this.totalTax.toFixed(2)}</div>
            <div style="font-size: 10px; opacity: 0.6; margin-top: 4px;">Click for Breakdown</div>
        `;
    }

    renderBreakdown() {
        let listHtml = '';
        const types = ['Overtrading', 'Revenge Trading', 'Loss Aversion'];

        types.forEach(type => {
            const amount = this.breakdown[type] || 0;
            listHtml += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
                    <span>${type}:</span>
                    <span style="font-weight: bold;">$${amount.toFixed(2)}</span>
                </div>
            `;
        });

        // Add others if any
        Object.keys(this.breakdown).forEach(key => {
            if (!types.includes(key)) {
                listHtml += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
                    <span>${key}:</span>
                    <span style="font-weight: bold;">$${this.breakdown[key].toFixed(2)}</span>
                </div>`;
            }
        });

        this.element.innerHTML = `
            <div class="human-tax-label" style="border-bottom: 1px solid #d4af37; padding-bottom: 4px; margin-bottom: 8px;">Tax Breakdown</div>
            ${listHtml}
            <div style="margin-top: 8px; border-top: 1px solid rgba(212, 175, 55, 0.3); padding-top: 4px;">
                <span style="font-weight: bold;">Total: $${this.totalTax.toFixed(2)}</span>
            </div>
        `;
    }

    updateDisplay(amount, animate = true) {
        if (!this.isExpanded) { // Only update the main display if not in breakdown view
            const valueEl = this.element.querySelector('.human-tax-value');
            if (valueEl) { // Ensure element exists before updating
                valueEl.innerText = `$${amount.toFixed(2)}`;
            }
        } else {
            // If expanded, re-render breakdown to show updated total/values
            this.renderBreakdown();
        }

        if (animate) {
            this.element.classList.add('human-tax-pulse');
            setTimeout(() => {
                this.element.classList.remove('human-tax-pulse');
            }, 1500);
        }
    }
}

// Initialize
if (!window.humanTaxWidget) {
    window.humanTaxWidget = new HumanTaxWidget();
}
