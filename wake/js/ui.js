/* ─────────────────────────────────────────
   ui.js — 日付まわりと、共通のUI部品（シート・トースト）
   ───────────────────────────────────────── */

var UI = (function () {
  'use strict';

  var DAY = 86400000;
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  /* ── 日付 ─────────────────────────────── */

  function startOfDay(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function today() { return startOfDay(Date.now()); }

  function addDays(ts, n) {
    var d = new Date(ts);
    d.setDate(d.getDate() + n);
    return startOfDay(d.getTime());
  }

  function startOfMonth(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    return d.getTime();
  }

  function addMonths(ts, n) {
    var d = new Date(startOfMonth(ts));
    d.setMonth(d.getMonth() + n);
    return d.getTime();
  }

  /** ts を含む週の日曜 0:00（カレンダーは日曜はじまり） */
  function startOfWeek(ts) {
    var d = new Date(startOfDay(ts));
    d.setDate(d.getDate() - d.getDay());
    return d.getTime();
  }

  /** 今週の終わり（土曜）。「今週」の区切りに使う */
  function endOfWeek(ts) { return addDays(startOfWeek(ts), 6); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** epoch → "YYYY-MM-DD"（input[type=date] 用・ローカル時刻） */
  function dateValue(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** "YYYY-MM-DD" → epoch（その日の 0:00）。おかしければ null */
  function parseDateValue(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /** "9/12(金)"。年が違うときだけ "2027/1/5(火)" */
  function fmtDate(ts) {
    var d = new Date(ts), now = new Date();
    var head = (d.getFullYear() !== now.getFullYear() ? d.getFullYear() + '/' : '');
    return head + (d.getMonth() + 1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ')';
  }

  function daysFromToday(ts) {
    return Math.round((startOfDay(ts) - today()) / DAY);
  }

  /** 期限の見え方。{ text, tone } tone: over|today|soon|far */
  function dueLabel(ts) {
    if (ts == null) return { text: '期限なし', tone: 'none' };
    var n = daysFromToday(ts);
    if (n < 0)  return { text: fmtDate(ts) + ' ' + (-n) + '日超過', tone: 'over' };
    if (n === 0) return { text: '今日', tone: 'today' };
    if (n === 1) return { text: '明日', tone: 'soon' };
    if (n <= 7)  return { text: fmtDate(ts) + ' あと' + n + '日', tone: 'soon' };
    return { text: fmtDate(ts), tone: 'far' };
  }

  /* ── DOM の小道具 ─────────────────────── */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function btn(cls, text, onClick) {
    var b = el('button', cls, text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  /* ── ボトムシート ─────────────────────── */

  var sheetHost = null;

  function closeSheet() {
    if (!sheetHost) return;
    sheetHost.classList.remove('open');
    var host = sheetHost;
    setTimeout(function () { if (host.classList.contains('open')) return; clear(host); }, 180);
  }

  /**
   * 下から出るシートを開く。build(body, close) で中身を組み立てる。
   * スマホで片手で閉じられるよう、背景タップとハンドルのどちらでも閉じる。
   */
  function sheet(title, build) {
    sheetHost = sheetHost || document.getElementById('sheetHost');
    clear(sheetHost);

    var back = el('div', 'sheet-back');
    var panel = el('div', 'sheet-panel');
    var handle = el('div', 'sheet-handle');
    var head = el('div', 'sheet-head');
    head.appendChild(el('h2', 'sheet-title', title));
    head.appendChild(btn('sheet-close', '閉じる', closeSheet));
    var body = el('div', 'sheet-body');

    panel.appendChild(handle);
    panel.appendChild(head);
    panel.appendChild(body);
    sheetHost.appendChild(back);
    sheetHost.appendChild(panel);

    back.addEventListener('click', closeSheet);
    handle.addEventListener('click', closeSheet);

    build(body, closeSheet);

    // 次のフレームで open を付けて、下からせり上がるように見せる
    requestAnimationFrame(function () { sheetHost.classList.add('open'); });
    return closeSheet;
  }

  /* ── トースト（取り消し付き） ─────────── */

  var toastTimer = null;

  function toast(message, actionLabel, onAction) {
    var host = document.getElementById('toastHost');
    clear(host);
    var box = el('div', 'toast');
    box.appendChild(el('span', 'toast-msg', message));
    if (actionLabel) {
      box.appendChild(btn('toast-action', actionLabel, function () {
        clear(host);
        if (onAction) onAction();
      }));
    }
    host.appendChild(box);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { clear(host); }, actionLabel ? 8000 : 3000);
  }

  /* ── 確認ダイアログ ───────────────────── */

  function confirmSheet(title, message, okLabel, onOk) {
    sheet(title, function (body, close) {
      body.appendChild(el('p', 'sheet-note', message));
      var row = el('div', 'sheet-actions');
      row.appendChild(btn('btn btn-ghost', 'やめる', close));
      row.appendChild(btn('btn btn-danger', okLabel, function () { close(); onOk(); }));
      body.appendChild(row);
    });
  }

  return {
    DAY: DAY, WD: WD,
    startOfDay: startOfDay, today: today, addDays: addDays,
    startOfMonth: startOfMonth, addMonths: addMonths,
    startOfWeek: startOfWeek, endOfWeek: endOfWeek,
    dateValue: dateValue, parseDateValue: parseDateValue,
    fmtDate: fmtDate, daysFromToday: daysFromToday, dueLabel: dueLabel,
    el: el, clear: clear, btn: btn,
    sheet: sheet, closeSheet: closeSheet, toast: toast, confirmSheet: confirmSheet
  };
})();
