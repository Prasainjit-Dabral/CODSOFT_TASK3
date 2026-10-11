(() => {
  'use strict';

  const MAX_DIGITS = 15;
  const SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const OPERATORS = new Set(Object.keys(SYMBOLS));

  const historyEl = document.getElementById('history');
  const currentEl = document.getElementById('current');
  const keypad = document.querySelector('.keypad');

  const state = { tokens: [], current: '', history: '', justEvaluated: false, error: false };

  /* ---------- Calculation (no eval) ---------- */

  class DivideByZeroError extends Error {}

  function evaluate(tokens) {
    // Pass 1: × and ÷ bind tighter
    const reduced = [parseFloat(tokens[0])];
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i];
      const rhs = parseFloat(tokens[i + 1]);
      if (op === '*') reduced[reduced.length - 1] *= rhs;
      else if (op === '/') {
        if (rhs === 0) throw new DivideByZeroError();
        reduced[reduced.length - 1] /= rhs;
      } else reduced.push(op, rhs);
    }
    // Pass 2: + and − left to right
    let total = reduced[0];
    for (let i = 1; i < reduced.length; i += 2) {
      total = reduced[i] === '+' ? total + reduced[i + 1] : total - reduced[i + 1];
    }
    return total;
  }

  function formatNumber(n) {
    if (!Number.isFinite(n)) throw new RangeError('overflow');
    return String(parseFloat(n.toPrecision(12))); // trims 0.1+0.2 noise
  }

  /* ---------- Helpers ---------- */

  const isNumeric = (s) => s !== '' && s !== '-' && !Number.isNaN(Number(s));
  const trimDot = (s) => (s.endsWith('.') ? s.slice(0, -1) : s);
  const toDisplay = (tokens) => tokens.map((t) => SYMBOLS[t] ?? t).join(' ');

  function prepareInput(keepResult = false) {
    if (state.error) clearAll();
    if (state.justEvaluated) {
      if (!keepResult) state.current = '';
      state.tokens = [];
      state.history = '';
      state.justEvaluated = false;
    }
  }

  /* ---------- Actions ---------- */

  function clearAll() {
    Object.assign(state, { tokens: [], current: '', history: '', justEvaluated: false, error: false });
  }

  function inputDigit(d) {
    prepareInput();
    if (state.current.replace(/[-.]/g, '').length >= MAX_DIGITS) return;
    if (state.current === '0') state.current = d;
    else if (state.current === '-0') state.current = '-' + d;
    else state.current += d;
  }

  function inputDecimal() {
    prepareInput();
    if (state.current.includes('.')) return; // one decimal per number
    state.current += (state.current === '' || state.current === '-') ? '0.' : '.';
  }

  function inputOperator(op) {
    if (state.error) return;
    if (state.justEvaluated) prepareInput(true); // keep chaining from the result

    const last = state.tokens[state.tokens.length - 1];

    if (state.current === '') {
      if (state.tokens.length === 0) {
        if (op === '-') state.current = '-'; // leading negative
        return;
      }
      if (OPERATORS.has(last)) state.tokens[state.tokens.length - 1] = op; // swap, never double up
      return;
    }
    if (state.current === '-') return;

    state.tokens.push(trimDot(state.current), op);
    state.current = '';
  }

  function inputPercent() {
    if (state.error) return;
    if (state.justEvaluated) prepareInput(true);
    if (!isNumeric(state.current)) return;
    state.current = formatNumber(parseFloat(state.current) / 100);
  }

  function deleteLast() {
    if (state.error) return clearAll();
    if (state.justEvaluated) { state.history = ''; state.justEvaluated = false; }
    if (state.current !== '') {
      state.current = state.current.slice(0, -1);
      if (state.current === '-') state.current = '';
    } else if (state.tokens.length) {
      state.tokens.pop();                      // drop the operator
      state.current = state.tokens.pop() ?? ''; // reopen the previous number
    }
  }

  function equals() {
    if (state.error || state.justEvaluated) return;
    const parts = [...state.tokens];
    if (isNumeric(state.current)) parts.push(trimDot(state.current));
    if (OPERATORS.has(parts[parts.length - 1])) parts.pop();
    if (parts.length === 0) return;

    const expression = toDisplay(parts);
    try {
      const value = formatNumber(evaluate(parts));
      Object.assign(state, { tokens: [], current: value, history: `${expression} =`, justEvaluated: true });
    } catch {
      Object.assign(state, { tokens: [], current: '', history: `${expression} =`, justEvaluated: false, error: true });
    }
  }

  /* ---------- Rendering ---------- */

  function render() {
    historyEl.textContent = state.history || toDisplay(state.tokens);

    const text = state.error ? 'Error' : state.current || '0';
    currentEl.textContent = text;
    currentEl.classList.toggle('is-error', state.error);
    currentEl.classList.toggle('is-long', !state.error && text.length > 9 && text.length <= 13);
    currentEl.classList.toggle('is-xlong', !state.error && text.length > 13);
  }

  function dispatch(action, value) {
    switch (action) {
      case 'digit': inputDigit(value); break;
      case 'decimal': inputDecimal(); break;
      case 'operator': inputOperator(value); break;
      case 'percent': inputPercent(); break;
      case 'delete': deleteLast(); break;
      case 'clear': clearAll(); break;
      case 'equals': equals(); break;
    }
    render();
  }

  /* ---------- Events ---------- */

  keypad.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (btn) dispatch(btn.dataset.action, btn.dataset.value);
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    let action, value;

    if (/^[0-9]$/.test(k)) [action, value] = ['digit', k];
    else if (k === '.' || k === ',') action = 'decimal';
    else if (OPERATORS.has(k)) [action, value] = ['operator', k];
    else if (k === '%') action = 'percent';
    else if (k === 'Enter' || k === '=') action = 'equals';
    else if (k === 'Backspace') action = 'delete';
    else if (k === 'Escape' || k === 'Delete') action = 'clear';
    else return;

    e.preventDefault();
    dispatch(action, value);

    const btn = [...keypad.querySelectorAll('button')].find(
      (b) => b.dataset.action === action && (value === undefined || b.dataset.value === value)
    );
    if (btn) {
      btn.classList.add('is-pressed');
      setTimeout(() => btn.classList.remove('is-pressed'), 110);
    }
  });

  render();
})();