/* ─────────────────────────────────────────
   timeline.js — 1日のバーチカル（縦型）タイムライン描画
   ───────────────────────────────────────── */

var Timeline = (function () {
  'use strict';

  var HOUR_H = 56;          // 1時間あたりの高さ(px) — CSS の --hour-h と合わせる
  var MIN_BLOCK_H = 16;     // ブロックの最小高さ
  var SHORT_BLOCK_H = 34;   // これ未満は1行表示に切り替え
  var SPAN_AREA = 72;       // 点イベントがある日に期間ブロックが使う幅(%)
  var POINT_H = 26;         // 点・体調イベントの高さ(px)

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

  /**
   * @param {HTMLElement} root  描画先
   * @param {number} dayStart   その日の 0:00 (epoch)
   * @param {function} onTap    ログ ID を受け取るコールバック
   */
  function render(root, dayStart, onTap) {
    var dayEnd = UI.addDays(dayStart, 1);
    var now = Date.now();

    root.innerHTML = '';
    root.style.height = (24 * HOUR_H) + 'px';

    /* 時刻グリッド */
    var grid = document.createDocumentFragment();
    for (var h = 0; h < 24; h++) {
      var line = document.createElement('div');
      line.className = 'hour' + (h % 6 === 0 ? ' is-major' : '');
      line.style.top = (h * HOUR_H) + 'px';
      line.innerHTML = '<span class="hour-label">' + UI.pad(h) + ':00</span>';
      grid.appendChild(line);

      var half = document.createElement('div');
      half.className = 'halfhour';
      half.style.top = (h * HOUR_H + HOUR_H / 2) + 'px';
      grid.appendChild(half);
    }
    root.appendChild(grid);

    var logs = Store.logsInRange(dayStart, dayEnd);
    var spans = [];
    var points = [];

    logs.forEach(function (l) {
      // 点（服薬など）と体調（スケール）は、どちらも右側のレーンに並べる
      if (l.type === 'point' || l.type === 'scale') {
        points.push(l);
        return;
      }
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

    /* 期間ブロック */
    assignLanes(spans);
    var spanWidth = points.length ? SPAN_AREA : 98;

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

    /* 点イベント（重なったら下にずらす） */
    var lastBottom = -Infinity;
    points.sort(function (a, b) { return a.start - b.start; });
    points.forEach(function (p) {
      var cat = Store.category(p.catId);
      var y = yFor(p.start, dayStart);
      var top = Math.max(y - POINT_H / 2, lastBottom + 3);
      lastBottom = top + POINT_H;

      var tick = document.createElement('div');
      tick.className = 'point-tick';
      tick.style.top = y + 'px';
      tick.style.left = SPAN_AREA + '%';
      tick.style.right = '0';
      root.appendChild(tick);

      var isScale = (p.type === 'scale' && p.scale);
      var mark;
      if (isScale) {
        var si = Store.scaleInfo(p.scale);
        mark = '<span class="pi-scale" style="background:' + si.color + '">' + si.v + '</span>';
      } else {
        mark = '<span class="dot" style="background:' + cat.color + '"></span>';
      }

      var b = document.createElement('button');
      b.className = 'point-item' + (isScale ? ' is-scale' : '');
      b.style.top = top + 'px';
      b.dataset.id = p.id;
      b.innerHTML = mark +
        '<span class="pi-name">' + UI.esc(cat.name) + (p.memo ? ' ' + UI.esc(p.memo) : '') + '</span>' +
        '<span class="pi-time">' + UI.fmtTime(p.start) + '</span>';
      b.addEventListener('click', function () { onTap(p.id); });
      root.appendChild(b);
    });

    /* 現在時刻ライン */
    if (now >= dayStart && now < dayEnd) {
      var nl = document.createElement('div');
      nl.className = 'now-line';
      nl.style.top = yFor(now, dayStart) + 'px';
      root.appendChild(nl);
    }

    return { count: logs.length, spans: spans, points: points };
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
