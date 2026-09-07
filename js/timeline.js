/* ─────────────────────────────────────────
   timeline.js — 1日のバーチカル（縦型）タイムライン描画
   ───────────────────────────────────────── */

var Timeline = (function () {
  'use strict';

  // 0〜24時が一画面に収まることを優先し、1時間ぶんの高さを大きく圧縮している。
  // その代わり、多くのブロックは名前+長さだけの簡易表示（is-short）になる。
  // 詳細（時刻範囲・メモ）は長い記録なら収まるし、それ以外はタップで見られる。
  var HOUR_H = 20;          // 1時間あたりの高さ(px) — CSS の --hour-h と合わせる
  var LABEL_STEP = 2;       // 時刻ラベルは詰まりすぎないよう2時間おきに間引く
  var MIN_BLOCK_H = 14;     // ブロックの最小高さ
  var SHORT_BLOCK_H = 34;   // これ未満は1行表示に切り替え
  var POINT_H = 20;         // 点・体調イベントの高さ(px)

  // 期間・点・体調を常に3分割の固定幅にする（その日にどれかが無くても
  // 幅が変わらないようにして、日をまたいだ見比べがしやすいようにする）
  var SPAN_AREA = 58;       // 期間ブロックの幅(%)
  var POINT_START = 58, POINT_WIDTH = 21;   // 点レーン
  var SCALE_START = 79, SCALE_WIDTH = 21;   // 体調レーン

  /** 重なり合う期間ブロックを列（レーン）に振り分ける */
  function assignLanes(items) {
    var laneEnds = [];
    items.forEach(function (it) {
      var lane = -1;
      for (var i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] <= it.from) { lane = i; break; }
      }
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = it.to;
      it.lane = lane;
    });
    // 重なっているグループごとの列数を求め、幅を最大化する
    items.forEach(function (it) {
      var overlapping = items.filter(function (o) { return o.from < it.to && o.to > it.from; });
      var maxLane = 0;
      overlapping.forEach(function (o) { if (o.lane > maxLane) maxLane = o.lane; });
      it.lanes = maxLane + 1;
    });
    return items;
  }

  function yFor(ts, dayStart) {
    return (ts - dayStart) / UI.HOUR * HOUR_H;
  }

  function roundTo5Min(ts) {
    return Math.round(ts / (5 * UI.MIN)) * (5 * UI.MIN);
  }

  /**
   * @param {HTMLElement} root       描画先
   * @param {number} dayStart        その日の 0:00 (epoch)
   * @param {function} onTap         既存ログのIDを受け取るコールバック
   * @param {function} [onEmptyTap]  空いている時間帯をタップしたときに時刻(epoch)を渡す
   * @param {function} [onDragCreate] 空いている時間帯をドラッグしたときに (開始, 終了,
   *                                  指を離した位置のX, Y) を渡す。入力画面には遷移せず、
   *                                  呼び出し側で軽いカテゴリ選択だけ出すことを想定している
   */
  function render(root, dayStart, onTap, onEmptyTap, onDragCreate) {
    var dayEnd = UI.addDays(dayStart, 1);
    var now = Date.now();

    root.innerHTML = '';
    root.style.height = (24 * HOUR_H) + 'px';

    // root（#timeline）は毎回作り直さず使い回すので、innerHTML を空にしても
    // 前回 addEventListener したハンドラは残ったままになる。付け直す前に必ず外す。
    if (root._tlCleanup) { root._tlCleanup(); root._tlCleanup = null; }

    if (onEmptyTap || onDragCreate) {
      var DRAG_THRESHOLD = 8;   // これ未満の移動はタップとして扱う(px)
      var drag = null;

      var range = function (offsetA, offsetB) {
        var a = Math.min(offsetA, offsetB), b = Math.max(offsetA, offsetB);
        var start = roundTo5Min(dayStart + (a / HOUR_H) * UI.HOUR);
        var end = roundTo5Min(dayStart + (b / HOUR_H) * UI.HOUR);
        start = Math.min(Math.max(start, dayStart), dayEnd - 5 * UI.MIN);
        end = Math.max(end, start + 5 * UI.MIN);
        end = Math.min(end, dayEnd);
        return { start: start, end: end };
      };

      var onPointerDown = function (e) {
        drag = null;
        if (e.target !== root) return;   // 記録のブロック自体を押した場合は何もしない
        var rect = root.getBoundingClientRect();
        var xPct = (e.clientX - rect.left) / rect.width * 100;
        if (xPct >= SPAN_AREA) return;   // 点・体調のレーンではドラッグ作成はしない
        drag = {
          rect: rect, pointerId: e.pointerId, moved: false,
          startOffsetY: e.clientY - rect.top
        };
      };

      var onPointerMove = function (e) {
        if (!drag || e.pointerId !== drag.pointerId) return;
        var curOffsetY = e.clientY - drag.rect.top;
        if (!drag.moved && Math.abs(curOffsetY - drag.startOffsetY) < DRAG_THRESHOLD) return;
        if (!drag.moved) {
          drag.moved = true;
          try { root.setPointerCapture(drag.pointerId); } catch (err) { /* noop */ }
        }
        if (!onDragCreate) return;
        e.preventDefault();

        var r = range(drag.startOffsetY, curOffsetY);
        if (!drag.previewEl) {
          drag.previewEl = document.createElement('div');
          drag.previewEl.className = 'drag-preview';
          drag.previewEl.style.width = 'calc(' + SPAN_AREA + '% - 3px)';
          root.appendChild(drag.previewEl);
        }
        var top = yFor(r.start, dayStart), bottom = yFor(r.end, dayStart);
        drag.previewEl.style.top = top + 'px';
        drag.previewEl.style.height = Math.max(bottom - top, 4) + 'px';
        drag.previewEl.innerHTML = '<span class="drag-preview-label">' +
          UI.fmtTime(r.start) + '–' + UI.fmtTime(r.end) + '</span>';
      };

      var onPointerUp = function (e) {
        if (!drag || e.pointerId !== drag.pointerId) { drag = null; return; }
        if (drag.previewEl) drag.previewEl.remove();

        if (!drag.moved) {
          if (onEmptyTap) {
            var ts = roundTo5Min(dayStart + (drag.startOffsetY / HOUR_H) * UI.HOUR);
            onEmptyTap(Math.min(Math.max(ts, dayStart), dayEnd - UI.MIN));
          }
        } else if (onDragCreate) {
          var curOffsetY = e.clientY - drag.rect.top;
          var r = range(drag.startOffsetY, curOffsetY);
          onDragCreate(r.start, r.end, e.clientX, e.clientY);
        }
        drag = null;
      };

      var onPointerCancel = function () {
        if (drag && drag.previewEl) drag.previewEl.remove();
        drag = null;
      };

      root.addEventListener('pointerdown', onPointerDown);
      root.addEventListener('pointermove', onPointerMove);
      root.addEventListener('pointerup', onPointerUp);
      root.addEventListener('pointercancel', onPointerCancel);

      root._tlCleanup = function () {
        root.removeEventListener('pointerdown', onPointerDown);
        root.removeEventListener('pointermove', onPointerMove);
        root.removeEventListener('pointerup', onPointerUp);
        root.removeEventListener('pointercancel', onPointerCancel);
      };
    }

    /* 時刻グリッド（30分刻みの罫線は、この高さでは詰まりすぎるので省く） */
    var grid = document.createDocumentFragment();
    for (var h = 0; h < 24; h++) {
      var line = document.createElement('div');
      line.className = 'hour' + (h % 6 === 0 ? ' is-major' : '');
      line.style.top = (h * HOUR_H) + 'px';
      if (h % LABEL_STEP === 0) {
        line.innerHTML = '<span class="hour-label">' + UI.pad(h) + ':00</span>';
      }
      grid.appendChild(line);
    }
    root.appendChild(grid);

    var logs = Store.logsInRange(dayStart, dayEnd);
    var spans = [];
    var points = [];
    var scaleMarks = [];

    logs.forEach(function (l) {
      if (l.type === 'point') { points.push(l); return; }
      if (l.type === 'scale') { scaleMarks.push(l); return; }
      var end = l.end || Math.min(now, dayEnd);
      if (end <= l.start) end = l.start + 60000;
      spans.push({
        log: l,
        from: Math.max(l.start, dayStart),
        to: Math.min(end, dayEnd),
        cutTop: l.start < dayStart,
        cutBottom: end > dayEnd
      });
    });

    /* 期間ブロック（常に固定幅のレーンを使う） */
    assignLanes(spans);
    var spanWidth = SPAN_AREA;

    spans.forEach(function (s) {
      var cat = Store.category(s.log.catId);
      var top = yFor(s.from, dayStart);
      var height = Math.max(yFor(s.to, dayStart) - top, MIN_BLOCK_H);
      var w = spanWidth / s.lanes;

      var classes = ['span-block'];
      if (height < SHORT_BLOCK_H) classes.push('is-short');
      if (!s.log.end) classes.push('is-open');
      if (s.cutTop) classes.push('is-cut-top');
      if (s.cutBottom) classes.push('is-cut-bottom');

      var b = document.createElement('button');
      b.className = classes.join(' ');
      b.style.top = top + 'px';
      b.style.height = height + 'px';
      b.style.left = (s.lane * w) + '%';
      b.style.width = 'calc(' + w + '% - 3px)';
      b.style.background = cat.color;
      b.style.color = UI.textOn(cat.color);
      b.dataset.id = s.log.id;

      // 日をまたぐ場合は「前日」「翌日」を明記し、その辺の枠線を破線にして途切れていることを示す
      var startLabel = s.cutTop ? '前日 ' + UI.fmtTime(s.log.start) : UI.fmtTime(s.log.start);
      var endLabel = !s.log.end ? '継続中' :
                     s.cutBottom ? '翌日 ' + UI.fmtTime(s.log.end) : UI.fmtTime(s.log.end);
      var range = startLabel + '–' + endLabel;
      var dur = UI.fmtDuration((s.log.end || now) - s.log.start);

      var html = '<span class="sb-title">' + UI.esc(cat.name) + '</span>';
      if (height < SHORT_BLOCK_H) {
        html += '<span class="sb-meta">' + dur + '</span>';
      } else {
        html += '<span class="sb-meta">' + range + '・' + dur + '</span>';
        if (s.log.memo && height > 58) {
          html += '<span class="sb-memo">' + UI.esc(s.log.memo) + '</span>';
        }
      }
      b.innerHTML = html;
      b.addEventListener('click', function () { onTap(s.log.id); });
      root.appendChild(b);
    });

    /* 点・体調のレーンに、それぞれ固定位置で並べる（重なったら下にずらす） */
    function renderMarkLane(list, laneStart, laneWidth, buildInner) {
      var lastBottom = -Infinity;
      list.sort(function (a, b) { return a.start - b.start; });
      list.forEach(function (p) {
        var y = yFor(p.start, dayStart);
        var top = Math.max(y - POINT_H / 2, lastBottom + 3);
        lastBottom = top + POINT_H;

        var tick = document.createElement('div');
        tick.className = 'point-tick';
        tick.style.top = y + 'px';
        tick.style.left = SPAN_AREA + '%';
        tick.style.right = '0';
        root.appendChild(tick);

        var b = document.createElement('button');
        b.className = 'point-item';
        b.style.top = top + 'px';
        b.style.left = laneStart + '%';
        b.style.width = 'calc(' + laneWidth + '% - 4px)';
        b.dataset.id = p.id;
        b.innerHTML = buildInner(p);
        b.addEventListener('click', function () { onTap(p.id); });
        root.appendChild(b);
      });
    }

    // レーンの幅が狭いので、時刻は表示しない（左の時刻軸とタップで十分わかる）。
    // 限られた幅は、何の記録かがひと目でわかる名前・メモに使う。
    renderMarkLane(points, POINT_START, POINT_WIDTH, function (p) {
      var cat = Store.category(p.catId);
      return '<span class="dot" style="background:' + cat.color + '"></span>' +
        '<span class="pi-name">' + UI.esc(cat.name) + (p.memo ? ' ' + UI.esc(p.memo) : '') + '</span>';
    });

    renderMarkLane(scaleMarks, SCALE_START, SCALE_WIDTH, function (p) {
      var si = Store.scaleInfo(p.scale);
      return '<span class="pi-scale" style="background:' + si.color + '">' + si.v + '</span>' +
        (p.memo ? '<span class="pi-name">' + UI.esc(p.memo) + '</span>' : '');
    });

    /* 現在時刻ライン */
    if (now >= dayStart && now < dayEnd) {
      var nl = document.createElement('div');
      nl.className = 'now-line';
      nl.style.top = yFor(now, dayStart) + 'px';
      root.appendChild(nl);
    }

    return { count: logs.length, spans: spans, points: points.concat(scaleMarks) };
  }

  /** その日の最初の予定（なければ現在時刻）あたりまでスクロール */
  function scrollToRelevant(dayStart, spans, points) {
    var target = null;
    var now = Date.now();
    if (now >= dayStart && now < UI.addDays(dayStart, 1)) target = now;
    var firsts = [];
    spans.forEach(function (s) { firsts.push(s.from); });
    points.forEach(function (p) { firsts.push(p.start); });
    if (firsts.length) {
      var min = Math.min.apply(null, firsts);
      target = target === null ? min : Math.min(target, min);
    }
    if (target === null) target = dayStart + 7 * UI.HOUR;
    var y = yFor(target, dayStart);
    var wrap = document.querySelector('.timeline-wrap');
    var offset = wrap ? wrap.offsetTop : 0;
    window.scrollTo({ top: Math.max(0, offset + y - 120), behavior: 'auto' });
  }

  return { render: render, scrollToRelevant: scrollToRelevant, HOUR_H: HOUR_H };
})();
