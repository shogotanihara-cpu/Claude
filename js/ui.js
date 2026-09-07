/* ─────────────────────────────────────────
   ui.js — 日付ユーティリティと共通UI部品
   ───────────────────────────────────────── */

var UI = (function () {
  'use strict';

  var MIN = 60000, HOUR = 3600000, DAY = 86400000;
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  /* ── date helpers ─────────────────────── */

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  }

  function addDays(ts, n) {
    var x = new Date(ts);
    x.setDate(x.getDate() + n);
    return x.getTime();
  }

  /** ts を含む週の月曜 0:00 */
  function startOfWeekMonday(ts) {
    var x = new Date(startOfDay(ts));
    var wd = x.getDay(); // 0=日 .. 6=土
    var diff = (wd === 0) ? -6 : (1 - wd);
    x.setDate(x.getDate() + diff);
    return x.getTime();
  }

  /** ts を含む月の1日 0:00 */
  function startOfMonth(ts) {
    var x = new Date(ts);
    x.setHours(0, 0, 0, 0);
    x.setDate(1);
    return x.getTime();
  }

  /** 月初(ts)から n ヶ月ずらした月初を返す */
  function addMonths(ts, n) {
    var x = new Date(startOfMonth(ts));
    x.setMonth(x.getMonth() + n);
    return x.getTime();
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** epoch → "YYYY-MM-DD"（input[type=date] 用・ローカル時刻） */
  function dateInputValue(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** epoch → "HH:MM"（input[type=time] 用） */
  function timeInputValue(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /** "YYYY-MM-DD" + "HH:MM" → epoch */
  function parseDateTime(dateStr, timeStr) {
    var dp = (dateStr || '').split('-');
    var tp = (timeStr || '00:00').split(':');
    var d = new Date(+dp[0], (+dp[1] || 1) - 1, +dp[2] || 1, +tp[0] || 0, +tp[1] || 0, 0, 0);
    return d.getTime();
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + WD[d.getDay()] + ')';
  }

  function fmtDateFull(ts) {
    var d = new Date(ts);
    var today = startOfDay(Date.now());
    var day = startOfDay(ts);
    var suffix = '';
    if (day === today) suffix = '・今日';
    else if (day === addDays(today, -1)) suffix = '・昨日';
    else if (day === addDays(today, 1)) suffix = '・明日';
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() +
           '(' + WD[d.getDay()] + ')' + suffix;
  }

  function fmtShortDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  /** 週の表示: "2026/9/1(月)〜9/7(日)" */
  function fmtWeekLabel(from) {
    var to = addDays(from, 6);
    var f = new Date(from), t = new Date(to);
    var head = f.getFullYear() + '/' + (f.getMonth() + 1) + '/' + f.getDate() + '(' + WD[f.getDay()] + ')';
    var tailYear = (t.getFullYear() !== f.getFullYear()) ? (t.getFullYear() + '/') : '';
    return head + '〜' + tailYear + (t.getMonth() + 1) + '/' + t.getDate() + '(' + WD[t.getDay()] + ')';
  }

  /** 月の表示: "2026年9月" */
  function fmtMonthLabel(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
  }

  /** 複数月にまたがる範囲の表示: "2026年7月〜9月" / "2025年11月〜2026年1月" */
  function fmtMonthRangeLabel(fromMonthStart, toMonthStart) {
    var f = new Date(fromMonthStart), t = new Date(toMonthStart);
    if (f.getFullYear() === t.getFullYear()) {
      return f.getFullYear() + '年' + (f.getMonth() + 1) + '月〜' + (t.getMonth() + 1) + '月';
    }
    return f.getFullYear() + '年' + (f.getMonth() + 1) + '月〜' + t.getFullYear() + '年' + (t.getMonth() + 1) + '月';
  }

  /** ミリ秒 → "7時間30分" / "45分" */
  function fmtDuration(ms) {
    if (ms < 0) ms = 0;
    var m = Math.round(ms / MIN);
    var h = Math.floor(m / 60);
    m = m % 60;
    if (h && m) return h + '時間' + m + '分';
    if (h) return h + '時間';
    return m + '分';
  }

  /** ミリ秒 → "7.5h"（集計表示用） */
  function fmtHours(ms) {
    return (Math.round(ms / HOUR * 10) / 10) + 'h';
  }

  /** ミリ秒 → "7<small>時間</small>40<small>分</small>"。数字を大きく見せたい箇所用（HTMLを返す） */
  function fmtDurationHTML(ms) {
    if (ms < 0 || !isFinite(ms)) ms = 0;
    var m = Math.round(ms / MIN);
    var h = Math.floor(m / 60);
    m = m % 60;
    return h + '<small>時間</small>' + pad(m) + '<small>分</small>';
  }

  /** epoch → "2026年9月7日(月)"。今日/昨日の付加をしない、書類向けの表記 */
  function fmtDateFullPlain(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() +
           '日(' + WD[d.getDay()] + ')';
  }

  /* ── DOM helpers ──────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(id) { return document.getElementById(id); }

  /** 背景色に対して読みやすい文字色を返す */
  function textOn(hex) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#14171c' : '#ffffff';
  }

  /* ── sheet (bottom modal) ─────────────── */

  var sheetEl, scrimEl, onCloseCb = null;
  var dragBound = false;
  var drag = null;
  var CLOSE_DISTANCE = 90; // これ以上下にドラッグしたら閉じる(px)

  function openSheet(html, onMount, onClose) {
    sheetEl = el('sheet');
    scrimEl = el('scrim');
    sheetEl.style.transition = '';
    sheetEl.style.transform = '';
    sheetEl.innerHTML = '<div class="sheet-grip"></div>' + html;
    sheetEl.hidden = false;
    scrimEl.hidden = false;
    document.body.style.overflow = 'hidden';
    onCloseCb = onClose || null;
    bindSheetDrag();
    if (onMount) onMount(sheetEl);
  }

  function closeSheet() {
    if (!sheetEl) return;
    sheetEl.hidden = true;
    if (scrimEl) scrimEl.hidden = true;
    sheetEl.innerHTML = '';
    sheetEl.style.transition = '';
    sheetEl.style.transform = '';
    document.body.style.overflow = '';
    if (onCloseCb) { var cb = onCloseCb; onCloseCb = null; cb(); }
  }

  /** シートを下にスワイプすると閉じられるようにする（内容が一番上までスクロール
   *  されているときだけドラッグを開始し、途中で本文のスクロールに切り替わっても
   *  邪魔しない） */
  function bindSheetDrag() {
    if (dragBound) return;
    dragBound = true;

    sheetEl.addEventListener('touchstart', function (e) {
      if (sheetEl.scrollTop > 0) { drag = null; return; }
      drag = { startY: e.touches[0].clientY, dy: 0, active: false };
    }, { passive: true });

    sheetEl.addEventListener('touchmove', function (e) {
      if (!drag) return;
      if (sheetEl.scrollTop > 0) { drag = null; sheetEl.style.transform = ''; return; }
      var dy = e.touches[0].clientY - drag.startY;
      if (dy <= 0) { drag.active = false; sheetEl.style.transform = ''; return; }
      drag.active = true;
      drag.dy = dy;
      sheetEl.style.transition = 'none';
      sheetEl.style.transform = 'translateY(' + dy + 'px)';
      e.preventDefault();
    }, { passive: false });

    function endDrag() {
      if (!drag) return;
      var shouldClose = drag.active && drag.dy > CLOSE_DISTANCE;
      drag = null;
      sheetEl.style.transition = 'transform .18s ease';
      if (shouldClose) closeSheet();
      else sheetEl.style.transform = '';
    }
    sheetEl.addEventListener('touchend', endDrag);
    sheetEl.addEventListener('touchcancel', endDrag);
  }

  /* ── ファイルの書き出し ───────────────── */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ── toast ────────────────────────────── */

  var toastTimer = null;

  function toast(msg) {
    var t = el('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }

  return {
    MIN: MIN, HOUR: HOUR, DAY: DAY, WD: WD,
    startOfDay: startOfDay, addDays: addDays, pad: pad,
    startOfWeekMonday: startOfWeekMonday, startOfMonth: startOfMonth, addMonths: addMonths,
    dateInputValue: dateInputValue, timeInputValue: timeInputValue,
    parseDateTime: parseDateTime,
    fmtTime: fmtTime, fmtDate: fmtDate, fmtDateFull: fmtDateFull,
    fmtShortDate: fmtShortDate, fmtDuration: fmtDuration, fmtHours: fmtHours,
    fmtDurationHTML: fmtDurationHTML, fmtDateFullPlain: fmtDateFullPlain,
    fmtWeekLabel: fmtWeekLabel, fmtMonthLabel: fmtMonthLabel, fmtMonthRangeLabel: fmtMonthRangeLabel,
    esc: esc, el: el, textOn: textOn, download: download,
    openSheet: openSheet, closeSheet: closeSheet, toast: toast
  };
})();
