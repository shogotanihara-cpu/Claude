/* ─────────────────────────────────────────
   ui.js — 日付まわりの道具と、共通のUI部品

   ここに置くのは「どの画面からも呼ぶもの」だけ。画面固有の描画は
   plan.js / gear.js / trips.js / app.js にある。

   タブや操作のアイコンは、絵文字を使わずその場でインラインSVGを組む。
   絵文字は端末とフォントで見え方が変わり、環境によっては豆腐になるため。
   ───────────────────────────────────────── */

var UI = (function () {
  'use strict';

  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  /* ── 日付・時刻 ───────────────────────── */

  /* "HH:MM" → 0時からの分。タイムラインの縦位置はすべてこの分で計算する */
  function toMin(t) {
    var p = String(t || '0:0').split(':');
    return (+p[0]) * 60 + (+p[1] || 0);
  }

  function fromMin(m) {
    m = Math.max(0, Math.min(1439, Math.round(m)));
    return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
  }

  function fmtDur(m) {
    m = Math.round(m || 0);
    if (m <= 0) return '';
    var h = Math.floor(m / 60), mm = m % 60;
    return (h ? h + '時間' : '') + (mm ? mm + '分' : (h ? '' : '0分'));
  }

  function yen(n) {
    return '¥' + Math.round(n || 0).toLocaleString('ja-JP');
  }

  /* "YYYY-MM-DD" は文字列のまま大小比較できるので、日付の前後判定は
     Date に直さず文字列で行う（タイムゾーンの事故を避けるため）。 */
  function parseISO(s) {
    var p = String(s).split('-');
    return new Date(+p[0], (+p[1]) - 1, +p[2]);
  }

  function isoOf(d) {
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  function today() { return isoOf(new Date()); }

  function dateLabel(iso) {
    var d = parseISO(iso);
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WEEK[d.getDay()] + ')';
  }

  function nowMinutes() {
    var n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── アイコン ───────────────────────── */

  var PATHS = {
    plan: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    gear: '<path d="M6 8h12l1 12H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    trips: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M3 12h18"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.4v2M12 18.6V21M20.6 12h-2M5.4 12h-2M18.1 5.9l-1.4 1.4M7.3 16.7l-1.4 1.4M18.1 18.1l-1.4-1.4M7.3 7.3 5.9 5.9"/>',
    prev: '<path d="m15 18-6-6 6-6"/>',
    next: '<path d="m9 18 6-6-6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 13 4 4 10-10"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>'
  };

  function icon(name, size) {
    var d = PATHS[name] || '';
    var s = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  /* ── 下から出るシート ─────────────────────────
     画面ごとに作らず、1つの器を使い回す。開いている間だけ裏を覆う。 */

  var sheetHost = null;
  var onSheetClose = null;
  /* シートの中身は開くたび作り直すが、器の要素は使い回す。
     開くたびに addEventListener すると同じ処理が二重三重に走るので、
     受け口は下で1度だけ張り、開いている画面の handler に振り分ける。 */
  var sheetHandlers = null;

  function host() {
    if (!sheetHost) sheetHost = document.getElementById('sheetHost');
    return sheetHost;
  }

  function openSheet(title, bodyHTML, footHTML, handlers) {
    handlers = handlers || {};
    sheetHandlers = handlers;
    onSheetClose = handlers.onClose || null;
    host().innerHTML =
      '<div class="scrim" data-sheet-close="1"></div>' +
      '<section class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="sheet-grab"></div>' +
        '<header class="sheet-head">' +
          '<h2>' + esc(title) + '</h2>' +
          '<button type="button" class="sheet-x" data-sheet-close="1" aria-label="閉じる">' +
            icon('close', 18) + '</button>' +
        '</header>' +
        '<div class="sheet-body">' + bodyHTML + '</div>' +
        (footHTML ? '<footer class="sheet-foot">' + footHTML + '</footer>' : '') +
      '</section>';
    host().hidden = false;
    /* 1フレーム置いてからクラスを付ける。付けた直後だと開くアニメが飛ぶ */
    requestAnimationFrame(function () {
      var s = host().querySelector('.sheet');
      if (s) s.classList.add('open');
      var c = host().querySelector('.scrim');
      if (c) c.classList.add('open');
    });
  }

  function closeSheet() {
    if (host().hidden) return;
    host().hidden = true;
    host().innerHTML = '';
    sheetHandlers = null;
    var fn = onSheetClose;
    onSheetClose = null;
    if (fn) fn();
  }

  function sheetOpen() { return !host().hidden; }

  /* ── トースト ─────────────────────────
     消したものを戻せるようにする。取り消しの受け口はここ1つ。 */

  var toastTimer = null;

  function toast(message, actionLabel, onAction) {
    var h = document.getElementById('toastHost');
    clearTimeout(toastTimer);
    h.innerHTML =
      '<div class="toast">' +
        '<span>' + esc(message) + '</span>' +
        (actionLabel ? '<button type="button" id="toastAction">' + esc(actionLabel) + '</button>' : '') +
      '</div>';
    if (actionLabel && onAction) {
      document.getElementById('toastAction').addEventListener('click', function () {
        clearTimeout(toastTimer);
        h.innerHTML = '';
        onAction();
      });
    }
    toastTimer = setTimeout(function () { h.innerHTML = ''; }, 6000);
  }

  /* シートの閉じるボタンと背景は、どの画面から開いても同じように効かせる */
  document.addEventListener('click', function (e) {
    var hit = e.target.closest ? e.target.closest('[data-sheet-close]') : null;
    if (hit) { closeSheet(); return; }
    if (sheetHandlers && sheetHandlers.click && host().contains(e.target)) {
      sheetHandlers.click(e);
    }
  });

  document.addEventListener('input', function (e) {
    if (sheetHandlers && sheetHandlers.input && host().contains(e.target)) {
      sheetHandlers.input(e);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheetOpen()) closeSheet();
  });

  return {
    WEEK: WEEK,
    toMin: toMin,
    fromMin: fromMin,
    fmtDur: fmtDur,
    yen: yen,
    parseISO: parseISO,
    isoOf: isoOf,
    today: today,
    dateLabel: dateLabel,
    nowMinutes: nowMinutes,
    esc: esc,
    icon: icon,
    openSheet: openSheet,
    closeSheet: closeSheet,
    sheetOpen: sheetOpen,
    toast: toast
  };
})();
