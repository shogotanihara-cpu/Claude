/* ─────────────────────────────────────────
   store.js — データ層（localStorage）

   ログ1件のかたち:
     { id, catId, type: 'span' | 'point', start: <epoch ms>,
       end: <epoch ms | null>, memo: string }
   - type 'span'  … 期間（睡眠・仕事など）。end が null なら「継続中」
   - type 'point' … 点（服薬など）。end は常に null
   ───────────────────────────────────────── */

var Store = (function () {
  'use strict';

  var KEY = 'actionlog.v1';

  var PALETTE = [
    '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
    '#ec4899', '#8b5cf6', '#14b8a6', '#84cc16', '#f97316',
    '#64748b', '#a855f7'
  ];

  var DEFAULT_CATEGORIES = [
    { id: 'c1', name: '睡眠', color: '#6366f1', kind: 'span' },
    { id: 'c2', name: '仕事', color: '#0ea5e9', kind: 'span' },
    { id: 'c3', name: '食事', color: '#f59e0b', kind: 'span' },
    { id: 'c4', name: '運動', color: '#10b981', kind: 'span' },
    { id: 'c5', name: '移動', color: '#64748b', kind: 'span' },
    { id: 'c6', name: '休憩', color: '#14b8a6', kind: 'span' },
    { id: 'c7', name: '服薬', color: '#ef4444', kind: 'point' },
    { id: 'c8', name: 'その他', color: '#a855f7', kind: 'span' }
  ];

  var state = null;
  var listeners = [];

  function uid(prefix) {
    return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function blank() {
    return { version: 1, categories: DEFAULT_CATEGORIES.slice(), logs: [] };
  }

  function load() {
    if (state) return state;
    try {
      var raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : blank();
    } catch (e) {
      state = blank();
    }
    if (!state.categories || !state.categories.length) state.categories = DEFAULT_CATEGORIES.slice();
    if (!state.logs) state.logs = [];
    return state;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert('保存に失敗しました。端末の空き容量をご確認ください。');
    }
    listeners.forEach(function (fn) { fn(); });
  }

  function onChange(fn) { listeners.push(fn); }

  /* ── categories ───────────────────────── */

  function categories() { return load().categories; }

  function category(id) {
    var list = categories();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return { id: id, name: '（削除済み）', color: '#9aa1ac', kind: 'span' };
  }

  function addCategory(name, color, kind) {
    load().categories.push({ id: uid('c'), name: name, color: color, kind: kind || 'span' });
    persist();
  }

  function updateCategory(id, patch) {
    var c = category(id);
    if (c) { Object.keys(patch).forEach(function (k) { c[k] = patch[k]; }); persist(); }
  }

  function removeCategory(id) {
    var s = load();
    s.categories = s.categories.filter(function (c) { return c.id !== id; });
    s.logs = s.logs.filter(function (l) { return l.catId !== id; });
    persist();
  }

  function categoryUsage(id) {
    return load().logs.filter(function (l) { return l.catId === id; }).length;
  }

  /* ── logs ─────────────────────────────── */

  function logs() { return load().logs; }

  function addLog(log) {
    log.id = uid('l');
    load().logs.push(log);
    persist();
    return log;
  }

  function updateLog(id, patch) {
    var list = logs();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        Object.keys(patch).forEach(function (k) { list[i][k] = patch[k]; });
        persist();
        return list[i];
      }
    }
    return null;
  }

  function removeLog(id) {
    var s = load();
    s.logs = s.logs.filter(function (l) { return l.id !== id; });
    persist();
  }

  function getLog(id) {
    var list = logs();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** 継続中（end が null の span）のログを新しい順で返す */
  function runningLogs() {
    return logs()
      .filter(function (l) { return l.type === 'span' && !l.end; })
      .sort(function (a, b) { return b.start - a.start; });
  }

  /** [from, to) に少しでも重なるログ。span は日をまたいでも拾う */
  function logsInRange(from, to) {
    return logs().filter(function (l) {
      if (l.type === 'point') return l.start >= from && l.start < to;
      var end = l.end || Date.now();
      return l.start < to && end > from;
    }).sort(function (a, b) { return a.start - b.start; });
  }

  /* ── backup ───────────────────────────── */

  function exportJSON() { return JSON.stringify(load(), null, 2); }

  function importJSON(text) {
    var data = JSON.parse(text);
    if (!data || !Array.isArray(data.logs) || !Array.isArray(data.categories)) {
      throw new Error('形式が違います');
    }
    state = data;
    persist();
  }

  function clearAll() { state = blank(); persist(); }

  return {
    PALETTE: PALETTE,
    uid: uid,
    onChange: onChange,
    categories: categories,
    category: category,
    addCategory: addCategory,
    updateCategory: updateCategory,
    removeCategory: removeCategory,
    categoryUsage: categoryUsage,
    logs: logs,
    getLog: getLog,
    addLog: addLog,
    updateLog: updateLog,
    removeLog: removeLog,
    runningLogs: runningLogs,
    logsInRange: logsInRange,
    exportJSON: exportJSON,
    importJSON: importJSON,
    clearAll: clearAll
  };
})();
