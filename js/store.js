/* ─────────────────────────────────────────
   store.js — データ層（localStorage）

   ログ1件のかたち:
     { id, catId, type, start, end, memo, scale }
     - type 'span'  … 期間（睡眠など）。end が null なら「継続中」
     - type 'point' … 点（服薬など）。end は常に null
     - type 'scale' … その時点の状態（体調など）。scale に 1〜5

   カテゴリ:
     { id, name, color, kind: 'span'|'point'|'scale', quick: boolean }
     - kind はそのカテゴリの既定の記録方法
     - quick はタイムライン上部のワンタップ記録に出すかどうか
   ───────────────────────────────────────── */

var Store = (function () {
  'use strict';

  var KEY = 'actionlog.v1';   // 保存キーは据え置き（中身を version で見分ける）
  var VERSION = 3;

  var PALETTE = [
    '#5b63b7', '#4a7fa5', '#2f8f78', '#5a9367', '#c08a3e',
    '#c9584f', '#a05d7a', '#8a72a8', '#6b7a8f', '#7a6a5d'
  ];

  /** 体調スケール（1〜5）の定義。悪い→良いを色で示す */
  var SCALE = [
    { v: 1, label: 'とても悪い', short: '悪', color: '#a05d7a' },
    { v: 2, label: '悪い',       short: '↓',  color: '#9a7a86' },
    { v: 3, label: 'ふつう',     short: '－', color: '#7c8896' },
    { v: 4, label: '良い',       short: '↑',  color: '#5b9188' },
    { v: 5, label: 'とても良い', short: 'good', color: '#2f8f78' }
  ];

  function scaleInfo(v) {
    for (var i = 0; i < SCALE.length; i++) if (SCALE[i].v === v) return SCALE[i];
    return SCALE[2];
  }

  /** サマリー画面に並ぶカードの種類（表示順序のカスタマイズ対象） */
  var CARD_KEYS = ['overview', 'scaleTrend', 'dayGrid', 'categories', 'report'];

  /**
   * 保存されている並び順を、現在の CARD_KEYS を基準に補正する。
   * 未知のキーは捨て、足りないキーは末尾に補う（今後カードの種類が
   * 増減しても、既存の並び順設定を壊さないようにするため）。
   */
  function normalizeCardOrder(order) {
    var out = (order || []).filter(function (k) { return CARD_KEYS.indexOf(k) >= 0; });
    CARD_KEYS.forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    return out;
  }

  /* 体調の記録を中心に置いた初期カテゴリ（新規インストール時のみ使う） */
  var DEFAULT_CATEGORIES = [
    { id: 'c_sleep', name: '睡眠',     color: '#5b63b7', kind: 'span',  quick: true },
    { id: 'c_med',   name: '服薬',     color: '#c9584f', kind: 'point', quick: true },
    { id: 'c_cond',  name: '体調',     color: '#2f8f78', kind: 'scale', quick: true },
    { id: 'c_meal',  name: '食事',     color: '#c08a3e', kind: 'span',  quick: false },
    { id: 'c_move',  name: '運動',     color: '#5a9367', kind: 'span',  quick: false },
    { id: 'c_work',  name: '仕事',     color: '#4a7fa5', kind: 'span',  quick: false },
    { id: 'c_out',   name: '外出',     color: '#6b7a8f', kind: 'span',  quick: false },
    { id: 'c_event', name: 'できごと', color: '#8a72a8', kind: 'point', quick: false }
  ];

  var state = null;
  var listeners = [];

  function uid(prefix) {
    return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function blank() {
    return {
      version: VERSION, categories: DEFAULT_CATEGORIES.slice(), logs: [], reminders: [],
      cardOrder: CARD_KEYS.slice()
    };
  }

  /**
   * 既存データは壊さず、足りないものだけ足す。
   * 以前のバージョンで作った記録・カテゴリはそのまま残す。
   */
  function migrate(s) {
    if (s.version === VERSION) return s;

    if (!Array.isArray(s.reminders)) s.reminders = [];

    s.categories.forEach(function (c) {
      if (typeof c.quick !== 'boolean') c.quick = false;
      if (c.kind !== 'span' && c.kind !== 'point' && c.kind !== 'scale') c.kind = 'span';
    });

    // 体調（スケール）のカテゴリがなければ追加する
    var hasScale = s.categories.some(function (c) { return c.kind === 'scale'; });
    if (!hasScale) {
      s.categories.push({ id: uid('c'), name: '体調', color: '#2f8f78', kind: 'scale', quick: true });
    }

    // クイック記録が1つもなければ、代表的なものを出しておく
    if (!s.categories.some(function (c) { return c.quick; })) {
      var kinds = { span: false, point: false, scale: false };
      s.categories.forEach(function (c) {
        if (!kinds[c.kind]) { c.quick = true; kinds[c.kind] = true; }
      });
    }

    s.version = VERSION;
    return s;
  }

  /**
   * バージョンが一致していても必ず補う項目（migrate() は s.version === VERSION の
   * ときは何もしないので、新しく足したフィールドはここで面倒を見る）。
   */
  function ensureDefaults(s) {
    if (!s.categories || !s.categories.length) s.categories = DEFAULT_CATEGORIES.slice();
    if (!s.logs) s.logs = [];
    if (!s.reminders) s.reminders = [];
    s.cardOrder = normalizeCardOrder(s.cardOrder);
    return s;
  }

  function load() {
    if (state) return state;
    try {
      var raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : blank();
    } catch (e) {
      state = blank();
    }
    state = migrate(ensureDefaults(state));
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

  function quickCategories() {
    return categories().filter(function (c) { return c.quick; });
  }

  function category(id) {
    var list = categories();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return { id: id, name: '（削除済み）', color: '#8a93a1', kind: 'span', quick: false };
  }

  function addCategory(name, color, kind, quick) {
    load().categories.push({
      id: uid('c'), name: name, color: color, kind: kind || 'span', quick: !!quick
    });
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
    if (log.scale === undefined) log.scale = null;
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

  /** そのカテゴリで継続中のログ（なければ null） */
  function runningOf(catId) {
    var r = runningLogs();
    for (var i = 0; i < r.length; i++) if (r[i].catId === catId) return r[i];
    return null;
  }

  /** [from, to) に少しでも重なるログ。span は日をまたいでも拾う */
  function logsInRange(from, to) {
    return logs().filter(function (l) {
      if (l.type === 'span') {
        var end = l.end || Date.now();
        return l.start < to && end > from;
      }
      return l.start >= from && l.start < to;
    }).sort(function (a, b) { return a.start - b.start; });
  }

  /* ── サマリーのカード表示順序 ─────────── */

  function cardOrder() { return load().cardOrder.slice(); }

  function setCardOrder(order) {
    load().cardOrder = normalizeCardOrder(order);
    persist();
  }

  /* ── reminders ────────────────────────── */
  /* { id, time: "08:00", catId: カテゴリID または null } */

  function reminders() {
    return load().reminders.slice().sort(function (a, b) {
      return a.time < b.time ? -1 : (a.time > b.time ? 1 : 0);
    });
  }

  function addReminder(time, catId) {
    load().reminders.push({ id: uid('r'), time: time, catId: catId || null });
    persist();
  }

  function updateReminder(id, patch) {
    var list = load().reminders;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        Object.keys(patch).forEach(function (k) { list[i][k] = patch[k]; });
        persist();
        return;
      }
    }
  }

  function removeReminder(id) {
    var s = load();
    s.reminders = s.reminders.filter(function (r) { return r.id !== id; });
    persist();
  }

  /* ── backup ───────────────────────────── */

  function exportJSON() { return JSON.stringify(load(), null, 2); }

  function importJSON(text) {
    var data = JSON.parse(text);
    if (!data || !Array.isArray(data.logs) || !Array.isArray(data.categories)) {
      throw new Error('形式が違います');
    }
    state = migrate(ensureDefaults(data));
    persist();
  }

  function clearAll() { state = blank(); persist(); }

  return {
    PALETTE: PALETTE,
    SCALE: SCALE,
    scaleInfo: scaleInfo,
    uid: uid,
    onChange: onChange,
    categories: categories,
    quickCategories: quickCategories,
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
    runningOf: runningOf,
    logsInRange: logsInRange,
    reminders: reminders,
    addReminder: addReminder,
    updateReminder: updateReminder,
    removeReminder: removeReminder,
    cardOrder: cardOrder,
    setCardOrder: setCardOrder,
    exportJSON: exportJSON,
    importJSON: importJSON,
    clearAll: clearAll
  };
})();
