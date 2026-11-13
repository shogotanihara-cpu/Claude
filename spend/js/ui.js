/* ─────────────────────────────────────────
   ui.js — 日付・金額まわりと、共通のUI部品（シート・トースト）

   日付は "YYYY-MM-DD"、月は "YYYY-MM" の文字列で扱う。
   文字列のまま大小を比べられ、タイムゾーンのずれも起きない。
   ───────────────────────────────────────── */

var UI = (function () {
  'use strict';

  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  /* ── 日付 ─────────────────────────────── */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function dateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function today() { return dateStr(new Date()); }

  function addDays(s, n) {
    var p = s.split('-');
    return dateStr(new Date(+p[0], +p[1] - 1, +p[2] + n));
  }

  function addMonths(ym, n) {
    var p = ym.split('-');
    var d = new Date(+p[0], +p[1] - 1 + n, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

  /** "10/2(金)"。年が今年と違うときだけ "2025/4/1(火)" */
  function fmtDate(s, withYear) {
    var p = s.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var head = (withYear || +p[0] !== new Date().getFullYear()) ? p[0] + '/' : '';
    return head + (+p[1]) + '/' + (+p[2]) + '(' + WD[d.getDay()] + ')';
  }

  function fmtMonth(ym) {
    var p = ym.split('-');
    return p[0] + '年' + (+p[1]) + '月';
  }

  /** 期間の見え方。片方しかなければその日だけ */
  function fmtRange(from, to) {
    if (!from) return '期間なし';
    if (!to || to === from) return fmtDate(from);
    // 年をまたぐときは両方に年を出す。片方だけだと、同じ年の中の話に見えてしまう
    var cross = from.slice(0, 4) !== to.slice(0, 4);
    return fmtDate(from, cross) + ' 〜 ' + fmtDate(to, cross);
  }

  /* ── 金額 ─────────────────────────────── */

  function yen(n) {
    var s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '−' : '') + '¥' + s;
  }

  /** 前月との差。"+¥1,200" / "−¥800" / "±0" */
  function diff(n) {
    if (!n) return '±0';
    return (n > 0 ? '+' : '−') + '¥' + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

  function input(type, value, placeholder) {
    var i = el(type === 'area' ? 'textarea' : 'input', 'input' + (type === 'area' ? ' input-area' : ''));
    if (type !== 'area') i.type = type;
    else i.rows = 2;
    i.value = value == null ? '' : value;
    if (placeholder) i.placeholder = placeholder;
    return i;
  }

  function field(host, label, node) {
    host.appendChild(el('div', 'field-label', label));
    host.appendChild(node);
    return node;
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

  /** 「取り消す」付きのトースト。破壊的な操作のあとは必ずこれを出す */
  function undoToast(message) {
    toast(message, '取り消す', function () { if (Store.undo()) toast('戻しました'); });
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
    WD: WD,
    today: today, addDays: addDays, addMonths: addMonths, isDate: isDate,
    fmtDate: fmtDate, fmtMonth: fmtMonth, fmtRange: fmtRange,
    yen: yen, diff: diff,
    el: el, clear: clear, btn: btn, input: input, field: field,
    sheet: sheet, closeSheet: closeSheet,
    toast: toast, undoToast: undoToast, confirmSheet: confirmSheet
  };
})();
