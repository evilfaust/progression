/* ══════════════════════════════════════════════════════════════
   Прогрессии · движок интерактивных моделей
   Lab.model(def) строит страницу модели: сцена с таймлайном,
   условие с живыми числами, параметры, пошаговое решение.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ─── мелочи ──────────────────────────────────────────────
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Число по-русски: десятичная запятая, минус «−», пробел-разделитель тысяч от 10 000. */
  function fmt(x, digits = 2) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    const k = Math.pow(10, digits);
    let r = Math.round(x * k) / k;
    if (Object.is(r, -0)) r = 0;
    let s = Math.abs(r).toFixed(digits);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    let [int, frac] = s.split('.');
    if (int.length > 4) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (r < 0 ? '−' : '') + int + (frac ? ',' + frac : '');
  }
  /** Сокращённая запись больших чисел для подписей на холсте. */
  function short(x) {
    const a = Math.abs(x);
    if (a >= 1e9) return fmt(x / 1e9, 1) + ' млрд';
    if (a >= 1e6) return fmt(x / 1e6, 1) + ' млн';
    if (a >= 1e4) return fmt(x / 1e3, 1) + ' тыс';
    return fmt(x, 2);
  }
  /** Склонение: plural(5, 'день', 'дня', 'дней'). */
  function plural(n, one, few, many) {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }
  const ORD = ['нулевой', 'первый', 'второй', 'третий', 'четвёртый', 'пятый', 'шестой', 'седьмой', 'восьмой', 'девятый', 'десятый',
    'одиннадцатый', 'двенадцатый', 'тринадцатый', 'четырнадцатый', 'пятнадцатый', 'шестнадцатый', 'семнадцатый', 'восемнадцатый', 'девятнадцатый', 'двадцатый'];
  const ordinal = n => ORD[n] || n + '-й';
  const sub = n => String(n).replace(/\d/g, c => '₀₁₂₃₄₅₆₇₈₉'[c]);
  const sup = n => String(n).replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).replace('-', '⁻');

  // ─── мини-вёрстка формул ─────────────────────────────────
  // F('a_n = a_1 + (n-1)*d') → курсивные переменные, индексы, дроби \frac{}{}.
  const SYMBOLS = {
    cdot: '·', times: '×', approx: '≈', ne: '≠', le: '≤', ge: '≥', lt: '&lt;', gt: '&gt;', to: '→', Rightarrow: '⇒',
    in: '∈', phi: '<i>φ</i>', psi: '<i>ψ</i>', pi: '<i>π</i>', infty: '∞', sum: '∑', pm: '±', quad: ' ', ldots: '…', deg: '°',
  };
  const WORDS = new Set(['ln', 'log', 'lg', 'max', 'min', 'mod', 'sin', 'cos', 'O']);
  function parseF(s) {
    let out = '', i = 0;
    const group = () => {
      if (s[i] === '{') {
        let depth = 1, j = i + 1;
        while (j < s.length && depth) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
        const inner = s.slice(i + 1, j - 1);
        i = j;
        return parseF(inner);
      }
      const m = /^(\d+(?:[.,]\d+)?|[A-Za-z]|\\[a-z]+|.)/.exec(s.slice(i));
      i += m[0].length;
      return parseF(m[0]);
    };
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') {
        if (s[i + 1] === '{' || s[i + 1] === '}') { out += s[i + 1]; i += 2; continue; }
        const m = /^\\([A-Za-z]+)/.exec(s.slice(i));
        if (!m) { out += '\\'; i++; continue; }
        i += m[0].length;
        const cmd = m[1];
        if (cmd === 'frac') { const a = group(), b = group(); out += `<span class="frac"><span>${a}</span><span>${b}</span></span>`; }
        else if (cmd === 'hl' || cmd === 'ans') out += `<span class="${cmd}">${group()}</span>`;
        else if (cmd === 'sqrt') out += `√<span style="text-decoration:overline">${group()}</span>`;
        else if (cmd === 't') { const start = i + 1; let j = start; while (j < s.length && s[j] !== '}') j++; out += `<span style="font-style:normal">${escapeHtml(s.slice(start, j))}</span>`; i = j + 1; }
        else if (SYMBOLS[cmd]) out += SYMBOLS[cmd];
        else out += cmd;
        continue;
      }
      if (c === '_') { i++; out += `<sub>${group()}</sub>`; continue; }
      if (c === '^') { i++; out += `<sup>${group()}</sup>`; continue; }
      if (/[A-Za-z]/.test(c)) {
        let j = i;
        while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
        const w = s.slice(i, j);
        i = j;
        out += WORDS.has(w) ? w : [...w].map(ch => `<i>${ch}</i>`).join('');
        continue;
      }
      if (c === '-') { out += '−'; i++; continue; }
      if (c === '*') { out += '<span class="op">·</span>'; i++; continue; }
      if (c === '<') { out += '&lt;'; i++; continue; }
      if (c === '>') { out += '&gt;'; i++; continue; }
      if (c === '~') { out += ' '; i++; continue; }
      out += c; i++;
    }
    return out;
  }
  const F = src => `<span class="m">${parseF(src)}</span>`;

  // ─── иконки ──────────────────────────────────────────────
  const P = {
    play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/>',
    pause: '<rect x="6" y="5" width="4.2" height="14" rx="1.3" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.3" fill="currentColor"/>',
    prev: '<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    next: '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    stepb: '<path d="M7 6v12M18 6l-7 6 7 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    stepf: '<path d="M17 6v12M6 6l7 6-7 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.8h3.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    sun: '<circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    moon: '<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z" fill="currentColor"/>',
    full: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.3" fill="currentColor"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="2" fill="currentColor"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2" fill="currentColor" opacity=".55"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2" fill="currentColor" opacity=".55"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" fill="currentColor"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="15" cy="15" r="1.5" fill="currentColor"/><circle cx="15" cy="9" r="1.5" fill="currentColor"/><circle cx="9" cy="15" r="1.5" fill="currentColor"/>',
    undo: '<path d="M9 7L4.5 11.5 9 16M5 11.5h9.5a5 5 0 0 1 0 10H12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    doc: '<path d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12h6M9 16h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="7" r="2.3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="17" r="2.3" fill="none" stroke="currentColor" stroke-width="2"/>',
    steps: '<path d="M5 6h3v3H5zM5 15h3v3H5z" fill="currentColor"/><path d="M11 7.5h8M11 16.5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    list: '<rect x="3.5" y="13" width="3.5" height="7" rx="1.2" fill="currentColor"/><rect x="10.25" y="9" width="3.5" height="11" rx="1.2" fill="currentColor"/><rect x="17" y="4" width="3.5" height="16" rx="1.2" fill="currentColor"/>',
    spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" fill="currentColor"/><path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" opacity=".6"/>',
    github: '<path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    minus: '<path d="M6 12h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    plus: '<path d="M6 12h12M12 6v12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  };
  const icon = (name, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name]}</svg>`;

  // ─── тема ────────────────────────────────────────────────
  const THEME_KEY = 'lab-theme';
  function storedTheme() {
    try {
      const s = localStorage.getItem(THEME_KEY);
      if (s === 'light' || s === 'dark') return s;
      const old = localStorage.getItem('ap-theme'); // ключ прошлой версии сайта
      if (old === 'light' || old === 'dark') return old;
    } catch (e) { /* приватный режим */ }
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
    document.querySelectorAll('[data-theme-toggle]').forEach(b => {
      b.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
      b.setAttribute('aria-label', theme === 'dark' ? 'Светлая тема' : 'Тёмная тема');
      b.title = (theme === 'dark' ? 'Светлая тема' : 'Тёмная тема') + ' (T)';
    });
    window.dispatchEvent(new CustomEvent('lab:theme', { detail: theme }));
  }
  const toggleTheme = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  document.documentElement.dataset.theme = storedTheme();

  // ─── цвета для холста ────────────────────────────────────
  const SERIES = {
    light: { blue: '#2f7de1', violet: '#8b45d6', green: '#2f9e44', amber: '#e09a0b', orange: '#e8590c', rose: '#d6336c', teal: '#0f9b8e', cyan: '#0c8fb5', red: '#e03131', indigo: '#5b5bd6', gold: '#f2b705', brown: '#8a5a2b' },
    dark: { blue: '#5c9cf5', violet: '#b07ff0', green: '#51cf66', amber: '#fcc419', orange: '#ff8a3d', rose: '#f06595', teal: '#38d9a9', cyan: '#3bc9db', red: '#ff6b6b', indigo: '#8b8bf0', gold: '#ffd43b', brown: '#c08a55' },
  };
  function readColors() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const cs = getComputedStyle(document.body);
    const v = n => cs.getPropertyValue(n).trim();
    return Object.assign({
      dark,
      bg: v('--bg'), surface: v('--surface'), surface2: v('--surface-2'), surface3: v('--surface-3'),
      line: v('--line'), lineStrong: v('--line-strong'),
      ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'),
      acc: v('--acc'), acc2: v('--acc-2'),
      good: v('--good'), bad: v('--bad'),
    }, SERIES[dark ? 'dark' : 'light']);
  }

  // ─── инструменты рисования ───────────────────────────────
  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const D = {
    clamp, lerp, seg,
    ease: {
      out: t => 1 - Math.pow(1 - t, 3),
      inOut: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
      in: t => t * t * t,
      back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
      elastic: t => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI) / 3) + 1),
    },
    alpha(color, a) {
      if (color.startsWith('rgb')) return color.replace(/rgba?\(([^)]+)\)/, (_, c) => `rgba(${c.split(',').slice(0, 3).join(',')},${a})`);
      const [r, g, b] = hexToRgb(color);
      return `rgba(${r},${g},${b},${a})`;
    },
    mix(c1, c2, t) {
      const a = hexToRgb(c1), b = hexToRgb(c2);
      const m = a.map((x, i) => Math.round(lerp(x, b[i], t)));
      return '#' + m.map(x => x.toString(16).padStart(2, '0')).join('');
    },
    rand(seed) {
      let a = seed >>> 0;
      return () => {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    },
    rr(ctx, x, y, w, h, r) {
      r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },
    font(size, weight = 600, kind = 'ui') {
      const fam = kind === 'math'
        ? '"STIX Two Text", "Cambria Math", Cambria, "Times New Roman", serif'
        : 'Inter, "SF Pro Text", -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
      return `${kind === 'math' ? 'italic ' : ''}${weight} ${size}px ${fam}`;
    },
    text(ctx, str, x, y, o = {}) {
      ctx.font = o.font || D.font(o.size || 13, o.weight || 600, o.kind);
      ctx.fillStyle = o.color || '#000';
      ctx.textAlign = o.align || 'center';
      ctx.textBaseline = o.base || 'middle';
      if (o.stroke) { ctx.lineWidth = o.strokeWidth || 4; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
      ctx.fillText(str, x, y);
    },
    /** Подпись-«пилюля» с центром в (x, y). */
    pill(ctx, str, x, y, o = {}) {
      const size = o.size || 12;
      ctx.font = D.font(size, o.weight || 700);
      const padX = o.padX ?? size * .7, h = o.h || size * 1.9;
      const w = ctx.measureText(str).width + padX * 2;
      let bx = x - w / 2;
      if (o.align === 'left') bx = x;
      if (o.align === 'right') bx = x - w;
      if (o.shadow) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2; }
      D.rr(ctx, bx, y - h / 2, w, h, o.r ?? h / 2);
      ctx.fillStyle = o.bg || '#fff';
      ctx.fill();
      if (o.shadow) ctx.restore();
      if (o.border) { ctx.lineWidth = 1.5; ctx.strokeStyle = o.border; ctx.stroke(); }
      D.text(ctx, str, bx + w / 2, y + .5, { size, weight: o.weight || 700, color: o.color || '#000' });
      return w;
    },
    line(ctx, x1, y1, x2, y2, color, width = 1, dash) {
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.setLineDash(dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    },
    circle(ctx, x, y, r, fill, stroke, sw = 1.5) {
      ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
    },
    glow(ctx, x, y, r, color, a = .5) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, D.alpha(color, a));
      g.addColorStop(1, D.alpha(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    },
    shadow(ctx, blur = 12, color = 'rgba(0,0,0,.18)', y = 4) {
      ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = y;
    },
    noShadow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; },
    arrow(ctx, x1, y1, x2, y2, color, width = 2, head = 8) {
      const a = Math.atan2(y2 - y1, x2 - x1);
      D.line(ctx, x1, y1, x2 - Math.cos(a) * head * .6, y2 - Math.sin(a) * head * .6, color, width);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(a - .45) * head, y2 - Math.sin(a - .45) * head);
      ctx.lineTo(x2 - Math.cos(a + .45) * head, y2 - Math.sin(a + .45) * head);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
    },
    /** Размерная линия со стрелками и подписью посередине. */
    dim(ctx, x1, y1, x2, y2, label, o = {}) {
      const col = o.color || '#888';
      D.arrow(ctx, (x1 + x2) / 2, (y1 + y2) / 2, x1, y1, col, o.width || 1.5, 6);
      D.arrow(ctx, (x1 + x2) / 2, (y1 + y2) / 2, x2, y2, col, o.width || 1.5, 6);
      if (label) D.pill(ctx, label, (x1 + x2) / 2, (y1 + y2) / 2, { bg: o.bg || '#fff', color: o.labelColor || col, size: o.size || 11 });
    },
    sky(ctx, w, h, C, o = {}) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      if (C.dark) { g.addColorStop(0, o.top || '#0b1022'); g.addColorStop(1, o.bottom || '#1b2140'); }
      else { g.addColorStop(0, o.top || '#bfe3ff'); g.addColorStop(1, o.bottom || '#f3f8ff'); }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    stars(ctx, w, h, time, seed = 7, count = 70) {
      const r = D.rand(seed);
      for (let i = 0; i < count; i++) {
        const x = r() * w, y = r() * h, s = r() * 1.4 + .3, ph = r() * 6.28;
        const a = .35 + .45 * (0.5 + 0.5 * Math.sin(time * (0.6 + r()) + ph));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      }
    },
    cloud(ctx, x, y, s, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, s * .5, Math.PI * .5, Math.PI * 1.5);
      ctx.arc(x + s * .55, y - s * .42, s * .62, Math.PI, Math.PI * 2);
      ctx.arc(x + s * 1.25, y - s * .1, s * .45, Math.PI * 1.25, Math.PI * .5);
      ctx.closePath();
      ctx.fill();
    },
    /** «Красивые» деления оси. */
    ticks(max, count = 5) {
      if (max <= 0) return [0];
      const raw = max / count;
      const pow = Math.pow(10, Math.floor(Math.log10(raw)));
      const step = [1, 2, 2.5, 5, 10].map(k => k * pow).find(s => s >= raw) || raw;
      const out = [];
      for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
      return out;
    },
  };

  // ─── DOM-помощник ────────────────────────────────────────
  function el(tag, attrs = {}, html) {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }

  function buildMenu(currentId) {
    const { GROUPS, MODELS } = window.CATALOG;
    const menu = el('nav', { class: 'menu', 'aria-label': 'Все модели' });
    menu.innerHTML = GROUPS.map(g => `
      <div class="menu-group">
        <h4>${g.title} · ${g.badge}</h4>
        <div class="menu-grid">
          ${MODELS.filter(m => m.group === g.id).map(m => `
            <a href="${m.id}.html" ${m.id === currentId ? 'aria-current="page"' : ''}>
              <span class="e">${m.emoji}</span>${m.title}
            </a>`).join('')}
        </div>
      </div>`).join('') + `
      <div class="kbd-hint">
        <span><kbd>Пробел</kbd>пуск / пауза</span>
        <span><kbd>←</kbd><kbd>→</kbd>шаг</span>
        <span><kbd>R</kbd>сначала</span>
        <span><kbd>F</kbd>во весь экран</span>
        <span><kbd>T</kbd>тема</span>
        <span><kbd>I</kbd>о модели</span>
      </div>`;
    return menu;
  }

  // ══════════════════════════════════════════════════════════
  //   Модель
  // ══════════════════════════════════════════════════════════
  function model(def) {
    const { MODELS, KINDS, GROUPS } = window.CATALOG;
    const idx = MODELS.findIndex(m => m.id === def.id);
    const cat = MODELS[idx];
    const prev = MODELS[(idx - 1 + MODELS.length) % MODELS.length];
    const next = MODELS[(idx + 1) % MODELS.length];
    const group = GROUPS.find(g => g.id === cat.group);

    document.body.classList.add('model-page');
    document.body.dataset.accent = def.accent || cat.accent;
    document.title = `${cat.title} — Прогрессии`;

    const labels = Object.assign({ problem: 'Условие', params: 'Параметры', solution: 'Решение', terms: 'Члены последовательности' }, def.labels);
    const sol = def.solution ? { reveal: true, ...def.solutionOptions } : null;

    // ── состояние
    const p = {};
    const listIdx = {};
    (def.params || []).forEach(pr => { p[pr.key] = pr.value; });
    let m = def.compute(p);
    let dur = Math.max(0, def.duration(p, m));
    let t = def.startAtEnd ? dur : 0;
    let playing = false, speed = 1, solOpen = sol ? !sol.reveal : false, endShown = false;
    let lastStep = null, dirty = true, colors = null;
    const t0 = performance.now();

    // ── каркас
    document.body.innerHTML = '';
    const app = el('div', { class: 'app' });
    app.innerHTML = `
      <header class="topbar">
        <a class="brand" href="index.html" title="Все модели">
          <span class="brand-mark">a<sub style="font-size:.6em">n</sub></span>
        </a>
        <div class="model-title">
          <div class="emoji" aria-hidden="true">${cat.emoji}</div>
          <div style="min-width:0">
            <h1>${cat.title}</h1>
            <div class="meta">
              <span class="chip acc">${group.title}${group.id !== 'seq' ? ' · ' + group.badge : ''}</span>
              ${cat.kind !== 'seq' ? `<span class="chip">${KINDS[cat.kind]} прогрессия</span>` : ''}
            </div>
          </div>
        </div>
        <div class="spacer"></div>
        <a class="btn icon ghost hide-sm" href="${prev.id}.html" title="${prev.title}" aria-label="Предыдущая модель">${icon('prev')}</a>
        <button class="btn ghost" data-menu aria-expanded="false">${icon('grid')}<span class="hide-sm">Все модели</span></button>
        <a class="btn icon ghost hide-sm" href="${next.id}.html" title="${next.title}" aria-label="Следующая модель">${icon('next')}</a>
        <span class="sep hide-sm"></span>
        ${def.about ? `<button class="btn ghost" data-about title="О модели (I)">${icon('info')}<span class="hide-md">О модели</span></button>` : ''}
        <button class="btn icon ghost hide-sm" data-full title="Во весь экран (F)" aria-label="Во весь экран">${icon('full')}</button>
        <button class="btn icon ghost" data-theme-toggle></button>
      </header>
      <main class="workspace">
        <section class="stage" aria-label="Анимация">
          <div class="canvas-box">
            <canvas aria-hidden="true"></canvas>
            <div class="hud"></div>
            <div class="toast" role="status"></div>
          </div>
          <div class="transport">
            <button class="play" data-play aria-label="Пуск">
              <svg class="i-play" viewBox="0 0 24 24">${P.play}</svg>
              <svg class="i-pause" viewBox="0 0 24 24">${P.pause}</svg>
            </button>
            <button class="btn icon ghost" data-back title="Шаг назад (←)" aria-label="Шаг назад">${icon('stepb')}</button>
            <button class="btn icon ghost" data-fwd title="Шаг вперёд (→)" aria-label="Шаг вперёд">${icon('stepf')}</button>
            <div class="scrub" role="slider" tabindex="0" aria-label="Время">
              <div class="scrub-track"><div class="scrub-fill"></div><div class="scrub-ticks"></div></div>
              <div class="scrub-thumb"></div>
            </div>
            <div class="time-label"></div>
            <div class="seg" data-speed>
              ${(def.speeds || [0.5, 1, 2]).map(s => `<button aria-pressed="${s === 1}" data-s="${s}">${fmt(s, 2)}×</button>`).join('')}
            </div>
            <button class="btn icon ghost" data-reset title="Сначала (R)" aria-label="Сначала">${icon('reset')}</button>
          </div>
        </section>
        <aside class="side"></aside>
      </main>`;
    document.body.appendChild(app);

    const menu = buildMenu(def.id);
    const scrim = el('div', { class: 'scrim' });
    const drawer = el('aside', { class: 'drawer', 'aria-label': 'О модели' });
    if (def.about) drawer.innerHTML = `
      <div class="drawer-h"><span class="chip acc">${cat.emoji} О модели</span><h2>${cat.title}</h2>
        <button class="btn icon ghost" data-close aria-label="Закрыть">${icon('close')}</button></div>
      <div class="drawer-b about">${def.about}</div>`;
    document.body.append(scrim, menu, drawer);

    const $ = s => app.querySelector(s);
    const canvas = $('canvas'), ctx = canvas.getContext('2d');
    const box = $('.canvas-box'), hud = $('.hud'), toast = $('.toast');
    const side = $('.side'), stage = $('.stage');
    const scrub = $('.scrub'), fill = $('.scrub-fill'), thumb = $('.scrub-thumb'), ticksEl = $('.scrub-ticks');
    const timeLabel = $('.time-label');

    // ── карточки боковой панели
    const cards = {};
    function card(id, title, ico) {
      const c = el('section', { class: 'card', 'data-card': id });
      c.innerHTML = `<h2 class="card-h">${icon(ico)}<span class="grow">${title}</span></h2><div class="card-b"></div>`;
      cards[id] = c;
      return c;
    }
    const extra = def.cards || [];
    const placeExtra = at => extra.filter(c => (c.at || 'end') === at).forEach(c => side.appendChild(card(c.id, c.title, c.icon || 'spark')));

    placeExtra('start');
    if (def.problem) side.appendChild(card('problem', labels.problem, 'doc'));
    placeExtra('after-problem');
    if (def.params && def.params.length) side.appendChild(card('params', labels.params, 'sliders'));
    placeExtra('after-params');
    if (sol) {
      const c = card('solution', labels.solution, 'steps');
      c.classList.add('solution');
      if (sol.reveal) {
        const b = el('button', { class: 'btn sm soft', 'data-sol': '' });
        c.querySelector('.card-h').appendChild(b);
        b.addEventListener('click', () => setSolution(!solOpen));
      }
      side.appendChild(c);
    }
    placeExtra('after-solution');
    if (def.terms) side.appendChild(card('terms', labels.terms, 'list'));
    placeExtra('end');

    // ── параметры
    const controls = {};
    function listValues(pr) { return pr.values(p, m); }
    function syncRange(key) {
      const c = controls[key]; if (!c) return;
      const pr = c.pr;
      if (pr.type === 'seg') {
        c.root.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(p[key]))));
        return;
      }
      if (pr.type === 'number') { if (document.activeElement !== c.input) c.input.value = p[key]; return; }
      let val, min, max;
      if (pr.values) {
        const vals = listValues(pr);
        c.input.min = 0; c.input.max = Math.max(0, vals.length - 1); c.input.step = 1;
        c.input.value = listIdx[key];
        val = listIdx[key]; min = 0; max = vals.length - 1;
      } else {
        val = p[key]; min = pr.min; max = pr.max;
        c.input.value = val;
      }
      c.input.style.setProperty('--p', (max > min ? (val - min) / (max - min) * 100 : 0) + '%');
      c.out.textContent = pr.format ? pr.format(p[key], p) : fmt(p[key], pr.digits ?? 2);
    }
    // для параметров-списков: выбрать допустимое значение после изменения соседей
    function fixLists() {
      (def.params || []).filter(pr => pr.values).forEach(pr => {
        const vals = listValues(pr);
        if (!vals.length) return;
        let i;
        if (pr.keepIndex && listIdx[pr.key] != null) i = clamp(listIdx[pr.key], 0, vals.length - 1);
        else {
          i = 0;
          vals.forEach((v, j) => { if (Math.abs(v - p[pr.key]) < Math.abs(vals[i] - p[pr.key])) i = j; });
        }
        listIdx[pr.key] = i;
        p[pr.key] = vals[i];
      });
    }
    function buildParams() {
      const body = cards.params.querySelector('.card-b');
      body.innerHTML = '';
      const wrap = el('div', { class: 'params' });
      def.params.forEach(pr => {
        const row = el('div', { class: 'param' });
        const lbl = `<div class="param-label">${pr.sym ? F(pr.sym) : ''}<span class="t">${pr.label || ''}</span></div>`;
        if (pr.type === 'seg') {
          row.innerHTML = lbl;
          row.style.gridTemplateColumns = '1fr';
          const segEl = el('div', { class: 'seg' });
          pr.options.forEach(o => {
            const b = el('button', { 'data-v': o.value }, o.label);
            b.addEventListener('click', () => set(pr.key, o.value));
            segEl.appendChild(b);
          });
          row.appendChild(segEl);
          controls[pr.key] = { pr, root: segEl };
        } else if (pr.type === 'number') {
          row.innerHTML = lbl;
          row.style.gridTemplateColumns = '1fr';
          const inp = el('input', { class: 'num-input', type: 'number', inputmode: 'numeric', min: pr.min, max: pr.max, step: 1, value: p[pr.key], 'aria-label': pr.label });
          inp.addEventListener('input', () => {
            const v = parseInt(inp.value, 10);
            if (!isNaN(v)) set(pr.key, clamp(v, pr.min, pr.max), { keepInput: true });
          });
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') { inp.blur(); play(true); } e.stopPropagation(); });
          row.appendChild(inp);
          controls[pr.key] = { pr, input: inp };
        } else {
          row.innerHTML = `${lbl}
            <div class="param-value">
              <button data-dec aria-label="Меньше">${icon('minus', 'ico')}</button>
              <output></output>${pr.unit ? `<span class="u">${pr.unit}</span>` : ''}
              <button data-inc aria-label="Больше">${icon('plus', 'ico')}</button>
            </div>
            <input type="range" aria-label="${escapeHtml(pr.label || pr.key)}">`;
          const input = row.querySelector('input');
          if (!pr.values) { input.min = pr.min; input.max = pr.max; input.step = pr.step || 1; }
          const fromInput = () => {
            if (pr.values) { const vals = listValues(pr); listIdx[pr.key] = +input.value; set(pr.key, vals[+input.value]); }
            else set(pr.key, +input.value);
          };
          input.addEventListener('input', fromInput);
          const bump = dir => {
            if (pr.values) {
              const vals = listValues(pr);
              listIdx[pr.key] = clamp(listIdx[pr.key] + dir, 0, vals.length - 1);
              set(pr.key, vals[listIdx[pr.key]]);
            } else {
              const st = pr.step || 1;
              set(pr.key, clamp(+(p[pr.key] + dir * st).toFixed(6), pr.min, pr.max));
            }
          };
          row.querySelector('[data-dec]').addEventListener('click', () => bump(-1));
          row.querySelector('[data-inc]').addEventListener('click', () => bump(1));
          controls[pr.key] = { pr, input, out: row.querySelector('output') };
        }
        wrap.appendChild(row);
      });
      body.appendChild(wrap);
      body.appendChild(el('div', { class: 'warn', hidden: true }));
      const actions = el('div', { class: 'param-actions' });
      const bDef = el('button', { class: 'btn sm' }, `${icon('undo')}Как в задаче`);
      bDef.addEventListener('click', () => setMany(Object.fromEntries(def.params.map(pr => [pr.key, pr.value]))));
      actions.appendChild(bDef);
      if (def.random) {
        const bR = el('button', { class: 'btn sm' }, `${icon('dice')}Другие числа`);
        bR.addEventListener('click', () => setMany(def.random(p)));
        actions.appendChild(bR);
      }
      body.appendChild(actions);
    }

    function set(key, value, opts = {}) {
      setMany({ [key]: value }, opts);
    }
    function setMany(obj, opts = {}) {
      const changed = Object.keys(obj).filter(k => p[k] !== obj[k]);
      Object.assign(p, obj);
      // индексы списков выставить по значению
      (def.params || []).filter(pr => pr.values && obj[pr.key] !== undefined).forEach(pr => {
        const vals = listValues(pr);
        let i = vals.findIndex(v => Math.abs(v - obj[pr.key]) < 1e-9);
        if (i >= 0) listIdx[pr.key] = i;
      });
      fixLists();
      recompute();
      (def.params || []).forEach(pr => syncRange(pr.key));
      renderPanels(changed);
      if (def.onChange) def.onChange(p, m, api);
    }
    function recompute() {
      m = def.compute(p);
      dur = Math.max(0, def.duration(p, m));
      t = Math.min(t, dur);
      if (t < dur) endShown = false;
      buildTicks();
      lastStep = null;
      dirty = true;
    }

    // ── панели
    const v = (key, text) => `<span class="pv" data-k="${key}">${text != null ? text : (() => {
      const pr = (def.params || []).find(x => x.key === key);
      return pr && pr.format ? pr.format(p[key], p) : fmt(p[key], pr && pr.digits != null ? pr.digits : 2);
    })()}</span>`;

    function renderPanels(changed = []) {
      if (cards.problem) {
        cards.problem.querySelector('.card-b').innerHTML = `<p class="problem">${def.problem(p, m, v)}</p>${def.problemNote ? `<p class="note">${def.problemNote(p, m)}</p>` : ''}`;
        changed.forEach(k => cards.problem.querySelectorAll(`.pv[data-k="${k}"]`).forEach(e => { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); }));
      }
      if (cards.params) {
        const warn = def.validate ? def.validate(p, m) : null;
        const w = cards.params.querySelector('.warn');
        w.hidden = !warn; w.textContent = warn || '';
      }
      if (sol) renderSolution();
      extra.forEach(c => { if (c.render) cards[c.id].querySelector('.card-b').innerHTML = c.render(p, m, api); });
      lastStep = null;
      updateStepUI();
    }

    function renderSolution() {
      const s = def.solution(p, m);
      const c = cards.solution;
      const steps = s.steps.map(st => `
        <li class="step${st.final ? ' final' : ''}${st.always ? ' always' : ''}">
          ${st.t ? `<div class="step-t">${st.t}</div>` : ''}
          ${st.f ? `<div class="step-f">${st.f}</div>` : ''}
          ${st.c ? `<div class="step-c">${st.c}</div>` : ''}
        </li>`).join('');
      c.querySelector('.card-b').innerHTML = `<ol class="steps">${steps}</ol>${s.answer ? `<div class="answer-bar"><span class="lbl">Ответ</span><span class="val">${s.answer}</span></div>` : ''}`;
      c.dataset.open = String(solOpen);
      const b = c.querySelector('[data-sol]');
      if (b) b.innerHTML = solOpen ? 'Скрыть' : `${icon('eye')}Показать`;
    }
    function setSolution(open) {
      if (!sol) return;
      solOpen = open;
      renderSolution();
    }

    // ── члены последовательности и HUD
    function updateStepUI() {
      const step = Math.floor(t + 1e-9);
      if (step === lastStep) return;
      lastStep = step;
      if (def.terms) {
        const T = def.terms(p, m);
        const items = T.items;
        const now = T.now ? T.now(t) : (t >= dur ? items.length : step);
        const max = T.max || 40;
        let html = '';
        const from = items.length > max ? clamp(now - Math.floor(max / 2), 0, items.length - max) : 0;
        if (from > 0) html += `<span class="term more">…</span>`;
        for (let i = from; i < Math.min(items.length, from + max); i++) {
          const it = items[i];
          const st = i < now ? 'done' : i === now ? 'now' : '';
          html += `<span class="term ${st}${it.star ? ' star' : ''}${it.mark ? ' mark' : ''}" title="${escapeHtml(it.title || '')}">
            <span class="i">${it.i ?? ''}</span><span class="x">${it.x}</span></span>`;
        }
        if (from + max < items.length) html += `<span class="term more">+${items.length - from - max}</span>`;
        const sum = T.sum ? `<div class="terms-sum">${T.sum(t)}</div>` : '';
        cards.terms.querySelector('.card-b').innerHTML = `<div class="terms">${html}</div>${sum}`;
      }
      extra.forEach(c => { if (c.step) c.step(cards[c.id].querySelector('.card-b'), t, p, m, api); });
    }

    let hudCache = '';
    function updateHud() {
      const items = def.hud ? def.hud(p, m, t) : [];
      const key = JSON.stringify(items);
      if (key === hudCache) return;
      if (hud.children.length !== items.length) {
        hud.innerHTML = items.map(() => `<div class="hud-item"><span class="k"></span><span class="v"></span></div>`).join('');
      }
      items.forEach((it, i) => {
        const node = hud.children[i];
        node.className = 'hud-item' + (it.tone ? ' ' + it.tone : '');
        node.querySelector('.k').textContent = it.k;
        node.querySelector('.v').innerHTML = `${it.v}${it.u ? `<small>${it.u}</small>` : ''}`;
      });
      hudCache = key;
    }

    // ── таймлайн
    function buildTicks() {
      ticksEl.innerHTML = '';
      if (dur <= 0 || dur > 60) return;
      for (let i = 1; i < dur; i++) {
        const s = el('span');
        s.style.left = (i / dur * 100) + '%';
        ticksEl.appendChild(s);
      }
    }
    function updateTimeline() {
      const f = dur > 0 ? t / dur : 0;
      fill.style.width = (f * 100) + '%';
      thumb.style.left = (f * 100) + '%';
      [...ticksEl.children].forEach((s, i) => s.classList.toggle('on', (i + 1) <= t));
      const lbl = def.timeLabel ? def.timeLabel(t, p, m, dur) :
        `${def.unit || 'Шаг'} <b>${Math.min(Math.ceil(t - 1e-9), dur)}</b> из ${dur}`;
      if (timeLabel._v !== lbl) { timeLabel.innerHTML = lbl; timeLabel._v = lbl; }
      scrub.setAttribute('aria-valuenow', Math.round(t * 100) / 100);
    }
    function setT(x) {
      t = clamp(x, 0, dur);
      if (t < dur) endShown = false;
      dirty = true;
    }
    function play(fromStart) {
      if (dur <= 0) return;
      if (fromStart || t >= dur - 1e-6) t = 0;
      playing = true;
      endShown = false;
      stage.classList.add('playing');
      $('[data-play]').setAttribute('aria-label', 'Пауза');
    }
    function pause() {
      playing = false;
      stage.classList.remove('playing');
      $('[data-play]').setAttribute('aria-label', 'Пуск');
    }
    const toggle = () => (playing ? pause() : play());
    function stepBy(dir) {
      pause();
      if (dir > 0) setT(Math.floor(t + 1e-6) + 1);
      else setT(Math.ceil(t - 1e-6) - 1);
      if (dir > 0 && t >= dur) onEnd();
    }
    function reset() { pause(); setT(0); toast.classList.remove('show'); if (sol && sol.reveal) setSolution(false); }
    let toastTimer;
    function showToast(text) {
      if (!text) return;
      toast.textContent = text;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
    }
    function onEnd() {
      if (endShown) return;
      endShown = true;
      if (sol && sol.reveal && def.autoReveal !== false) setSolution(true);
      if (def.doneText) showToast(def.doneText(p, m));
    }

    // перетаскивание по таймлайну
    function scrubAt(e) {
      const r = scrub.getBoundingClientRect();
      setT(clamp((e.clientX - r.left) / r.width, 0, 1) * dur);
    }
    scrub.addEventListener('pointerdown', e => {
      pause(); scrub.setPointerCapture(e.pointerId); scrub.classList.add('drag'); scrubAt(e);
    });
    scrub.addEventListener('pointermove', e => { if (scrub.classList.contains('drag')) scrubAt(e); });
    scrub.addEventListener('pointerup', () => { scrub.classList.remove('drag'); if (t >= dur) onEnd(); });
    scrub.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); stepBy(e.key === 'ArrowRight' ? 1 : -1); }
    });

    $('[data-play]').addEventListener('click', toggle);
    $('[data-back]').addEventListener('click', () => stepBy(-1));
    $('[data-fwd]').addEventListener('click', () => stepBy(1));
    $('[data-reset]').addEventListener('click', reset);
    $('[data-speed]').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      speed = +b.dataset.s;
      $('[data-speed]').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    });

    // ── меню, «о модели», полноэкранный режим, тема
    const menuBtn = $('[data-menu]');
    function closeOverlays() {
      menu.classList.remove('open'); drawer.classList.remove('open'); scrim.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
    menuBtn.addEventListener('click', () => {
      const open = !menu.classList.contains('open');
      closeOverlays();
      if (open) { menu.classList.add('open'); scrim.classList.add('open'); menuBtn.setAttribute('aria-expanded', 'true'); }
    });
    const openAbout = () => { closeOverlays(); drawer.classList.add('open'); scrim.classList.add('open'); };
    if (def.about) { $('[data-about]').addEventListener('click', openAbout); drawer.querySelector('[data-close]').addEventListener('click', closeOverlays); }
    scrim.addEventListener('click', closeOverlays);
    const fullscreen = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    };
    $('[data-full]').addEventListener('click', fullscreen);
    document.querySelectorAll('[data-theme-toggle]').forEach(b => b.addEventListener('click', toggleTheme));
    applyTheme(document.documentElement.dataset.theme);
    window.addEventListener('lab:theme', () => { colors = null; dirty = true; });

    document.addEventListener('keydown', e => {
      if (e.target.matches('input[type="number"], input[type="text"], textarea')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.key === ' ' && !e.target.matches('button, a')) { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight' && !e.target.matches('input')) { e.preventDefault(); stepBy(1); }
      else if (e.key === 'ArrowLeft' && !e.target.matches('input')) { e.preventDefault(); stepBy(-1); }
      else if (k === 'r' || k === 'к' || e.key === 'Home') reset();
      else if (k === 'f' || k === 'а') fullscreen();
      else if (k === 't' || k === 'е') toggleTheme();
      else if ((k === 'i' || k === 'ш') && def.about) openAbout();
      else if (e.key === 'Escape') closeOverlays();
    });

    // ── холст
    let W = 0, H = 0, dpr = 1;
    function resize() {
      const r = box.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      dirty = true;
    }
    new ResizeObserver(resize).observe(box);
    resize();

    if (def.pointer) {
      const pt = (e, type) => {
        const r = canvas.getBoundingClientRect();
        if (def.pointer(state(), e.clientX - r.left, e.clientY - r.top, type, api)) dirty = true;
      };
      canvas.addEventListener('pointermove', e => pt(e, 'move'));
      canvas.addEventListener('pointerleave', e => pt(e, 'leave'));
      canvas.addEventListener('pointerdown', e => pt(e, 'down'));
    }

    function state(now = performance.now()) {
      return { w: W, h: H, t, p, m, dur, C: colors, dark: colors && colors.dark, time: (now - t0) / 1000, playing };
    }

    // ── главный цикл
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (playing) {
        const rate = typeof def.rate === 'function' ? def.rate(p, m, t) : (def.rate || 1);
        t = Math.min(dur, t + dt * rate * speed);
        if (t >= dur) { pause(); onEnd(); }
      }
      if (!colors) colors = readColors();
      try {
        if (playing || dirty || def.ambient !== false) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, W, H);
          ctx.save();
          def.draw(ctx, state(now));
          ctx.restore();
          dirty = false;
        }
        updateTimeline();
        updateStepUI();
        updateHud();
      } catch (err) {
        // ошибка одного кадра не должна останавливать анимацию
        if (!frame.failed) { console.error(err); frame.failed = true; }
      }
      requestAnimationFrame(frame);
    }

    const api = {
      get p() { return p; }, get m() { return m; }, get t() { return t; }, get dur() { return dur; },
      set, setMany, setT, play, pause, reset, redraw: () => { dirty = true; }, refresh: () => renderPanels(), toast: showToast,
      fmt, F,
    };

    // ── старт
    fixLists();
    recompute();
    if (cards.params) { buildParams(); def.params.forEach(pr => syncRange(pr.key)); }
    renderPanels();
    if (def.init) def.init(api);
    window.labModel = api; // для отладки из консоли
    requestAnimationFrame(frame);
    return api;
  }

  // ─── справка для «О модели» ──────────────────────────────
  const THEORY = {
    ap: `
      <h3>Арифметическая прогрессия</h3>
      <p>Последовательность, в которой каждый член получается из предыдущего прибавлением одного и того же числа <i>d</i> — <strong>разности прогрессии</strong>.</p>
      <div class="box">a<sub>n+1</sub> = a<sub>n</sub> + d<br>a<sub>n</sub> = a<sub>1</sub> + (n − 1)·d<br>S<sub>n</sub> = (a<sub>1</sub> + a<sub>n</sub>)·n / 2 = (2a<sub>1</sub> + (n − 1)·d)·n / 2</div>
      <h3>Полезные свойства</h3>
      <ul>
        <li>Любой член — среднее арифметическое соседей: <span class="m">a<sub><i>n</i></sub> = (a<sub><i>n</i>−1</sub> + a<sub><i>n</i>+1</sub>) / 2</span>.</li>
        <li>Суммы членов, равноудалённых от концов, одинаковы: <span class="m">a<sub>1</sub> + a<sub><i>n</i></sub> = a<sub>2</sub> + a<sub><i>n</i>−1</sub> = …</span> Отсюда и формула суммы.</li>
        <li>Разность находится по любым двум членам: <span class="m"><i>d</i> = (a<sub><i>m</i></sub> − a<sub><i>k</i></sub>) / (<i>m</i> − <i>k</i>)</span>.</li>
      </ul>
      <h3>История формулы суммы</h3>
      <p>По легенде, маленький Карл Гаусс за минуту сложил числа от 1 до 100: заметил, что 1 + 100 = 2 + 99 = … = 101, а таких пар 50. Получилось 5050.</p>`,
    gp: `
      <h3>Геометрическая прогрессия</h3>
      <p>Последовательность, в которой каждый член получается из предыдущего умножением на одно и то же число <i>q</i> ≠ 0 — <strong>знаменатель прогрессии</strong>.</p>
      <div class="box">b<sub>n+1</sub> = b<sub>n</sub>·q<br>b<sub>n</sub> = b<sub>1</sub>·q<sup>n−1</sup><br>S<sub>n</sub> = b<sub>1</sub>·(q<sup>n</sup> − 1) / (q − 1),  q ≠ 1</div>
      <h3>Рост и убывание</h3>
      <ul>
        <li>При <span class="m"><i>q</i> &gt; 1</span> прогрессия растёт «взрывообразно»: так растут бактерии, вклады со сложными процентами, слухи.</li>
        <li>При <span class="m">0 &lt; <i>q</i> &lt; 1</span> члены убывают и стремятся к нулю: распад, затухание, отскоки мяча.</li>
        <li>Любой член — среднее геометрическое соседей: <span class="m">b<sub><i>n</i></sub><sup>2</sup> = b<sub><i>n</i>−1</sub>·b<sub><i>n</i>+1</sub></span>.</li>
      </ul>
      <h3>Проценты</h3>
      <p>Рост «на <i>p</i>%» означает умножение на <span class="m"><i>q</i> = 1 + <i>p</i>/100</span>. Поэтому «на 300%» — это в 4 раза, а не в 3.</p>`,
  };

  window.Lab = { THEORY, model, fmt, short, plural, ordinal, sub, sup, F, D, icon, el, clamp, lerp, seg, applyTheme, toggleTheme, readColors, buildMenu };
})();
