/* ─────────────────────────────────────────
   plan.js — 行程画面（起動して1枚目に出る画面）

   このアプリで一番大事な一動作は「予定を組み立てる」こと。だから1枚目は
   旅行の一覧でも設定でもなく、その日1日の時間そのものを出す。

   縦軸は時間に比例させる。24時間ぶんを一定の高さで割り付けるので、
   何も置かれていない時間帯が「余白」として見える。空きを文字で
   「空き30分」と書くより、空間として見えることのほうが組み立てには効く。

   倍率は2段。
     通常 … 1時間44px。地名や費用まで読める。縦にスクロールする
     一望 … 24時間を画面の高さに収める。文字は消えて色帯だけになるが、
             どの時間帯が空いているかが一目で分かる

   日の移動は横スワイプ（scroll-snap）。1日1画面。
   ───────────────────────────────────────── */

var Plan = (function () {
  'use strict';

  var PX_PER_HOUR = 44;    // 通常表示。1時間あたりの高さ
  var MIN_BLOCK = 20;      // 短い予定でもこの高さは確保する（文字が入る下限）
  var MIN_BLOCK_FIT = 9;   // 一望では色帯として見えれば足りる
  var SNAP = 5;            // ドラッグの丸め（分）

  var dayIndex = 0;
  var fit = false;
  var placingId = null;    // 行き先候補から「置く」を押した状態
  var drag = null;
  var suppressClick = false;

  /* ── 描画 ───────────────────────── */

  function render(host) {
    var trip = Store.current();
    if (!trip) return;

    var days = Model.daysOf(trip);
    if (dayIndex >= days.length) dayIndex = days.length - 1;
    if (dayIndex < 0) dayIndex = 0;

    host.innerHTML =
      '<div class="plan-top">' +
        '<div class="daynav">' +
          navBtn('prev', '前の日') +
          '<div class="daynav-label">' +
            '<b id="dayTitle"></b><span id="daySub"></span>' +
          '</div>' +
          navBtn('next', '次の日') +
          '<button type="button" class="chip-today" id="todayBtn">今日</button>' +
        '</div>' +
        '<div class="seg" role="group" aria-label="表示の倍率">' +
          '<button type="button" data-fit="0" aria-pressed="' + (!fit) + '">通常</button>' +
          '<button type="button" data-fit="1" aria-pressed="' + fit + '">一望</button>' +
        '</div>' +
        (placingId ? placingBanner() : '') +
      '</div>' +
      '<div class="days" id="days">' +
        days.map(function (d) {
          return '<section class="daypage" data-day="' + d + '">' +
            '<div class="dayscroll"></div></section>';
        }).join('') +
      '</div>' +
      '<div class="dock">' +
        '<button type="button" class="fab" id="addItem" aria-label="予定を追加">' +
          UI.icon('plus', 22) + '</button>' +
        '<button type="button" class="dock-pill" id="candBtn">行き先候補 ' +
          '<span class="count">' + Model.candidates(trip).length + '</span></button>' +
      '</div>';

    var pages = host.querySelectorAll('.daypage');
    for (var i = 0; i < pages.length; i++) drawDay(trip, pages[i], i === dayIndex);

    var wrap = document.getElementById('days');
    wrap.scrollLeft = dayIndex * wrap.clientWidth;
    updateLabel(trip, days);
    watchSwipe(wrap);
  }

  function navBtn(dir, label) {
    return '<button type="button" class="daynav-btn" data-day-step="' +
      (dir === 'prev' ? -1 : 1) + '" aria-label="' + label + '">' +
      UI.icon(dir, 19) + '</button>';
  }

  function placingBanner() {
    var it = Store.itemById(placingId);
    return '<div class="placing">' +
      '<span>「' + UI.esc(it ? it.title : '') + '」を置く時間をタップ</span>' +
      '<button type="button" id="placingCancel">やめる</button></div>';
  }

  /* 1時間あたりの高さ。一望では画面に収まるところまで詰める */
  function pxPerHour() {
    if (!fit) return PX_PER_HOUR;
    var el = document.querySelector('.dayscroll');
    var h = el ? el.clientHeight - 18 : 420;
    return Math.max(11, h / 24);
  }

  function drawDay(trip, page, isCurrent) {
    var day = page.dataset.day;
    var scroller = page.querySelector('.dayscroll');
    var H = pxPerHour();

    var all = Model.scheduled(trip, day);
    var spans = Model.spansOf(all);
    var points = Model.pointsOf(all);
    var placed = Model.layout(spans);
    var bad = Model.conflicts(spans);
    var minH = fit ? MIN_BLOCK_FIT : MIN_BLOCK;

    var html = '<div class="grid' + (fit ? ' is-fit' : '') +
      (placingId ? ' is-placing' : '') + '" style="height:' + (H * 24 + 12) + 'px">';

    /* 時刻の目盛り。2時間ごとに数字、1時間ごとに線 */
    html += '<div class="gutter">';
    for (var h = 0; h <= 24; h += 2) {
      html += '<span style="top:' + (h * H) + 'px">' + ('0' + h).slice(-2) + ':00</span>';
    }
    html += '</div><div class="lane" data-lane="' + day + '">';
    for (var g = 0; g <= 24; g++) {
      html += '<div class="hline' + (g % 6 === 0 ? ' major' : '') +
        '" style="top:' + (g * H) + 'px"></div>';
    }

    /* 空き時間の枠。一望では余白そのものが見えるので出さない */
    if (!fit) {
      Model.freeGaps(spans).forEach(function (gap) {
        html += '<div class="freegap" style="top:' + (gap.start * H / 60 + 3) +
          'px; height:' + ((gap.end - gap.start) * H / 60 - 6) + 'px">' +
          UI.fmtDur(gap.minutes) + ' 空き</div>';
      });
    }

    placed.forEach(function (r) {
      var it = r.item;
      var dur = +it.dur || 0;
      var top = UI.toMin(it.time) * H / 60;
      var height = Math.max(minH, dur * H / 60);
      var w = 100 / r.cols;
      var meta = [];
      if (dur) meta.push(it.time + '–' + UI.fromMin(UI.toMin(it.time) + dur));
      if (it.place) meta.push(it.place);
      if (+it.cost) meta.push(UI.yen(it.cost));

      html += '<div class="block c-' + it.cat + (bad[it.id] ? ' is-conflict' : '') + '" ' +
        'data-item="' + it.id + '" ' +
        'style="top:' + top + 'px; height:' + height + 'px; ' +
        'left:calc(' + (r.col * w) + '% + 4px); width:calc(' + w + '% - 8px)">' +
        (height >= 14 ? '<span class="block-title">' + UI.esc(it.title) + '</span>' : '') +
        (height > 30 && !fit
          ? '<span class="block-meta">' + UI.esc(meta.join('　')) + '</span>' : '') +
        '</div>';
    });

    if (day === UI.today()) {
      html += '<div class="nowline" style="top:' + (UI.nowMinutes() * H / 60) + 'px"></div>';
    }

    html += '</div><div class="points">';
    points.forEach(function (it) {
      html += '<div class="point c-' + it.cat + '" data-item="' + it.id + '" ' +
        'style="top:' + (UI.toMin(it.time) * H / 60 - 6) + 'px">' +
        '<i></i><span class="point-label"><b>' + UI.esc(it.time) + '</b>' +
        '<span>' + UI.esc(it.title) + '</span></span></div>';
    });
    html += '</div></div>';

    scroller.innerHTML = html;

    /* 最初の予定のあたりまで送っておく。0:00 から始まると
       毎回スクロールしてからでないと旅程が見えないため。 */
    if (isCurrent && !fit) {
      var first = spans.length ? UI.toMin(spans[0].time)
        : (points.length ? UI.toMin(points[0].time) : 8 * 60);
      scroller.scrollTop = Math.max(0, first * H / 60 - 40);
    }
  }

  function updateLabel(trip, days) {
    var d = days[dayIndex];
    var title = document.getElementById('dayTitle');
    if (!title) return;
    title.textContent = UI.dateLabel(d);
    document.getElementById('daySub').textContent =
      trip.title + ' ・ DAY ' + (dayIndex + 1) + ' / ' + days.length;
    var btn = document.getElementById('todayBtn');
    btn.classList.toggle('on', d === UI.today());
  }

  /* ── 操作 ───────────────────────── */

  /* 画面の受け口は app.js が1度だけ張り、そこから呼ばれる。
     描画のたびに addEventListener すると同じ処理が二重に走るため。 */
  function onClick(e) {
    if (placingId) { placeHere(e); return; }

    {
      var step = e.target.closest ? e.target.closest('[data-day-step]') : null;
      if (step) { go(dayIndex + (+step.dataset.dayStep)); return; }

      var seg = e.target.closest ? e.target.closest('[data-fit]') : null;
      if (seg) { setFit(seg.dataset.fit === '1'); return; }

      if (e.target.closest && e.target.closest('#todayBtn')) {
        var days = Model.daysOf(Store.current());
        var i = days.indexOf(UI.today());
        go(i >= 0 ? i : 0);
        return;
      }
      if (e.target.closest && e.target.closest('#addItem')) {
        Item.open(null, Model.daysOf(Store.current())[dayIndex]);
        return;
      }
      if (e.target.closest && e.target.closest('#candBtn')) { Item.openCandidates(); return; }
      if (e.target.closest && e.target.closest('#placingCancel')) { stopPlacing(); return; }

      var blk = e.target.closest ? e.target.closest('[data-item]') : null;
      if (blk) {
        /* ドラッグの直後にも click は飛ぶ。移動したばかりの予定の
           シートが勝手に開かないよう、1回だけ捨てる。 */
        if (suppressClick) { suppressClick = false; return; }
        Item.open(blk.dataset.item);
      }
    }
  }

  /* 日ページの器は描画のたび作り直されるので、こちらはその都度で問題ない */
  function watchSwipe(wrap) {
    var timer = null;
    wrap.addEventListener('scroll', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var i = Math.round(wrap.scrollLeft / Math.max(1, wrap.clientWidth));
        if (i !== dayIndex) {
          dayIndex = i;
          updateLabel(Store.current(), Model.daysOf(Store.current()));
        }
      }, 90);
    });
  }

  function go(i) {
    var days = Model.daysOf(Store.current());
    dayIndex = Math.max(0, Math.min(days.length - 1, i));
    var wrap = document.getElementById('days');
    if (wrap) wrap.scrollTo({ left: dayIndex * wrap.clientWidth, behavior: 'smooth' });
    updateLabel(Store.current(), days);
  }

  function setFit(next) {
    fit = next;
    App.renderCurrent();
  }

  function goToDay(day) {
    var days = Model.daysOf(Store.current());
    var i = days.indexOf(day);
    if (i >= 0) dayIndex = i;
  }

  /* ── 行き先候補を置く ───────────────────────── */

  function startPlacing(id) {
    placingId = id;
    App.renderCurrent();
  }

  function stopPlacing() {
    placingId = null;
    App.renderCurrent();
  }

  function placeHere(e) {
    if (e.target.id === 'placingCancel') { stopPlacing(); return; }
    var lane = e.target.closest ? e.target.closest('.lane') : null;
    if (!lane) return;
    var it = Store.itemById(placingId);
    if (!it) { stopPlacing(); return; }

    var rect = lane.getBoundingClientRect();
    var minutes = Math.round(((e.clientY - rect.top) / pxPerHour() * 60) / SNAP) * SNAP;
    minutes = Math.max(0, Math.min(1435, minutes));

    Store.saveItem({
      id: it.id, kind: it.kind, cat: it.cat, title: it.title,
      day: lane.dataset.lane, time: UI.fromMin(minutes),
      dur: it.dur, cost: it.cost, place: it.place, memo: it.memo
    });
    placingId = null;
    App.renderCurrent();
    UI.toast('「' + it.title + '」を ' + UI.dateLabel(lane.dataset.lane) + ' ' +
      UI.fromMin(minutes) + ' に置きました');
  }

  /* ── ドラッグで時刻を動かす ─────────────────────────
     ブロックは touch-action:none にしてある。縦スクロールは時刻の目盛りや
     空いている場所からできるので、掴んだ指がそのまま移動に使える。 */

  function onDown(e) {
    if (placingId) return;
    var blk = e.target.closest ? e.target.closest('.block') : null;
    if (!blk) return;
    var it = Store.itemById(blk.dataset.item);
    if (!it) return;
    drag = {
      el: blk,
      id: it.id,
      dur: +it.dur || 0,
      startY: e.clientY,
      moved: 0,
      originTop: parseFloat(blk.style.top),
      H: pxPerHour(),
      minutes: null
    };
    try { blk.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
  }

  function onMove(e) {
    if (!drag) return;
    var dy = e.clientY - drag.startY;
    drag.moved = Math.max(drag.moved, Math.abs(dy));
    if (drag.moved < 6) return;   // 指の揺れをタップとして扱う余裕
    drag.el.classList.add('dragging');
    var top = Math.max(0, Math.min(24 * drag.H - 10, drag.originTop + dy));
    var minutes = Math.round((top / drag.H * 60) / SNAP) * SNAP;
    drag.minutes = minutes;
    drag.el.style.top = (minutes * drag.H / 60) + 'px';
    var meta = drag.el.querySelector('.block-meta');
    if (meta) {
      meta.textContent = UI.fromMin(minutes) + '–' + UI.fromMin(minutes + drag.dur);
    }
  }

  function onUp() {
    if (!drag) return;
    var d = drag;
    drag = null;
    d.el.classList.remove('dragging');
    if (d.moved < 6) return;      // タップ。click 側でシートを開く
    suppressClick = true;
    if (d.minutes === null) return;
    var it = Store.itemById(d.id);
    if (!it) return;
    Store.saveItem({
      id: it.id, kind: it.kind, cat: it.cat, title: it.title,
      day: it.day, time: UI.fromMin(d.minutes),
      dur: it.dur, cost: it.cost, place: it.place, memo: it.memo
    });
  }

  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);

  return {
    render: render,
    onClick: onClick,
    startPlacing: startPlacing,
    goToDay: goToDay,
    resetDay: function () { dayIndex = 0; }
  };
})();
