/**
 * Calculator App
 * Supports multiple independent instances using instance state
 */

import AppBase from './AppBase.js';

class Calculator extends AppBase {
    constructor() {
        super({
            id: 'calculator',
            name: 'Calculator',
            icon: '🔢',
            width: 300,
            height: 360,
            minWidth: 280,
            minHeight: 340,
            resizable: false,
            category: 'accessories'  // Used by AppRegistry for Start Menu
        });
    }

    onOpen() {
        // Initialize instance state for this calculator window
        this.setInstanceState('displayValue', '0');
        this.setInstanceState('firstOperand', null);
        this.setInstanceState('waitingForSecondOperand', false);
        this.setInstanceState('operator', null);

        return `
            <div class="calculator">
                <div class="calc-display inset-border" id="display">0</div>

                <div class="calc-buttons">
                    <button class="calc-btn btn-danger" data-action="clear">C</button>
                    <button class="calc-btn" data-action="operator" data-op="/">÷</button>
                    <button class="calc-btn" data-action="operator" data-op="*">×</button>
                    <button class="calc-btn" data-action="operator" data-op="-">-</button>

                    <button class="calc-btn" data-num="7">7</button>
                    <button class="calc-btn" data-num="8">8</button>
                    <button class="calc-btn" data-num="9">9</button>
                    <button class="calc-btn" data-action="operator" data-op="+">+</button>

                    <button class="calc-btn" data-num="4">4</button>
                    <button class="calc-btn" data-num="5">5</button>
                    <button class="calc-btn" data-num="6">6</button>

                    <button class="calc-btn calc-btn-equal" data-action="equal">=</button>

                    <button class="calc-btn" data-num="1">1</button>
                    <button class="calc-btn" data-num="2">2</button>
                    <button class="calc-btn" data-num="3">3</button>

                    <button class="calc-btn calc-btn-zero" data-num="0">0</button>
                    <button class="calc-btn" data-action="decimal">.</button>
                </div>
            </div>
        `;
    }

    onMount() {
        const buttonsContainer = this.getElement('.calc-buttons');

        // Event Delegation - addHandler auto-scopes to this window
        this.addHandler(buttonsContainer, 'click', (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            target.blur();
            this.playSound('click');

            if (target.dataset.num) {
                this.inputDigit(target.dataset.num);
            } else if (target.dataset.action === 'decimal') {
                this.inputDecimal();
            } else if (target.dataset.action === 'operator') {
                this.handleOperator(target.dataset.op);
            } else if (target.dataset.action === 'equal') {
                this.handleEqual();
            } else if (target.dataset.action === 'clear') {
                this.resetCalculator();
            }
            this.updateDisplay();

            // Error feedback if calculation produced Error
            if (this.displayValue === 'Error') this.playSound('error');
        });

        // Keyboard support — only responds when a Calculator window is focused.
        this.addHandler(document, 'keydown', (e) => {
            if (!this.isFocused()) return;
            this.handleKeyboard(e);
        });

        // ===== SCRIPTING SUPPORT =====
        this._registerScriptingCommands();
    }

    /**
     * Register commands and queries for scripting support
     */
    _registerScriptingCommands() {
        // Command: Input a digit
        this.registerCommand('input', (payload) => {
            const value = String(payload.value);
            for (const char of value) {
                if (/[0-9]/.test(char)) {
                    this.inputDigit(char);
                } else if (char === '.') {
                    this.inputDecimal();
                } else if (['+', '-', '*', '/'].includes(char)) {
                    this.handleOperator(char);
                } else if (char === '=') {
                    this.handleEqual();
                }
            }
            this.updateDisplay();
            this.emitAppEvent('input', { value, display: this.displayValue });
            return { success: true, display: this.displayValue };
        });

        // Command: Clear calculator
        this.registerCommand('clear', () => {
            this.resetCalculator();
            this.updateDisplay();
            this.emitAppEvent('cleared', {});
            return { success: true };
        });

        // Command: Calculate expression
        this.registerCommand('calculate', (payload) => {
            const expression = String(payload.expression);
            // Parse simple expressions like "5+3" or "10*2"
            const match = expression.match(/^(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)$/);
            if (match) {
                const [, first, op, second] = match;
                const result = this.calculate(parseFloat(first), parseFloat(second), op);
                this.displayValue = String(parseFloat(result.toFixed(7)));
                this.updateDisplay();
                this.emitAppEvent('calculated', { expression, result: this.displayValue });
                return { success: true, result: parseFloat(this.displayValue) };
            }
            return { success: false, error: 'Invalid expression' };
        });

        // Query: Get current display value
        this.registerQuery('getValue', () => {
            return parseFloat(this.displayValue);
        });

        // Query: Get display text
        this.registerQuery('getDisplay', () => {
            return this.displayValue;
        });

        // Query: Get current operator
        this.registerQuery('getOperator', () => {
            return this.operator;
        });
    }

    // --- State Helpers (use instance state) ---

    get displayValue() {
        return this.getInstanceState('displayValue', '0');
    }
    set displayValue(val) {
        this.setInstanceState('displayValue', val);
    }

    get firstOperand() {
        return this.getInstanceState('firstOperand', null);
    }
    set firstOperand(val) {
        this.setInstanceState('firstOperand', val);
    }

    get waitingForSecondOperand() {
        return this.getInstanceState('waitingForSecondOperand', false);
    }
    set waitingForSecondOperand(val) {
        this.setInstanceState('waitingForSecondOperand', val);
    }

    get operator() {
        return this.getInstanceState('operator', null);
    }
    set operator(val) {
        this.setInstanceState('operator', val);
    }

    // --- Logic ---

    inputDigit(digit) {
        if (this.waitingForSecondOperand) {
            this.displayValue = digit;
            this.waitingForSecondOperand = false;
        } else {
            this.displayValue = this.displayValue === '0' ? digit : this.displayValue + digit;
        }
    }

    inputDecimal() {
        if (this.waitingForSecondOperand) {
            this.displayValue = '0.';
            this.waitingForSecondOperand = false;
            return;
        }
        if (!this.displayValue.includes('.')) {
            this.displayValue = this.displayValue + '.';
        }
    }

    handleOperator(nextOperator) {
        const inputValue = parseFloat(this.displayValue);

        if (this.operator && this.waitingForSecondOperand) {
            this.operator = nextOperator;
            return;
        }

        if (this.firstOperand === null) {
            this.firstOperand = inputValue;
        } else if (this.operator) {
            const result = this.calculate(this.firstOperand, inputValue, this.operator);
            if (result === null) {
                this.displayValue = 'Error';
                this.firstOperand = null;
                this.operator = null;
                this.waitingForSecondOperand = true;
                return;
            }
            this.displayValue = String(parseFloat(result.toFixed(7)));
            this.firstOperand = result;
        }

        this.waitingForSecondOperand = true;
        this.operator = nextOperator;
    }

    handleEqual() {
        if (!this.operator || this.firstOperand === null) return;
        const inputValue = parseFloat(this.displayValue);
        const result = this.calculate(this.firstOperand, inputValue, this.operator);

        if (result === null) {
            // Division by zero
            this.displayValue = 'Error';
            this.firstOperand = null;
            this.operator = null;
            this.waitingForSecondOperand = true;
            return;
        }

        this.displayValue = String(parseFloat(result.toFixed(7)));
        this.firstOperand = null;
        this.operator = null;
        this.waitingForSecondOperand = true;
    }

    calculate(first, second, operator) {
        if (operator === '+') return first + second;
        if (operator === '-') return first - second;
        if (operator === '*') return first * second;
        if (operator === '/') return second === 0 ? null : first / second;
        return second;
    }

    resetCalculator() {
        this.displayValue = '0';
        this.firstOperand = null;
        this.waitingForSecondOperand = false;
        this.operator = null;
    }

    updateDisplay() {
        const display = this.getElement('#display');
        if (display) display.textContent = this.displayValue;
    }

    handleKeyboard(e) {
        // Only respond if our window is active
        if (!this.getWindow()?.classList.contains('active')) return;

        const key = e.key;
        if (/[0-9]/.test(key)) this.inputDigit(key);
        else if (key === '.') this.inputDecimal();
        else if (['+', '-', '*', '/'].includes(key)) this.handleOperator(key);
        else if (key === 'Enter' || key === '=') { e.preventDefault(); this.handleEqual(); }
        else if (key === 'Escape' || key === 'Backspace' || key === 'c') this.resetCalculator();
        this.updateDisplay();
    }
}

export default Calculator;
