/* ─────────────────────────────────────────
   summary.js — 集計とグラフ描画
   ───────────────────────────────────────── */

var Summary = (function () {
  'use strict';

  /**
   * [from, to) の範囲を日別・カテゴリ別に集計する。
   * 期間ログは日をまたぐぶんを日ごとに切り分けて合算する。
   */
  function aggregate(from, to) {
    var now = Date.now();
    var days = Math.round((to - from) / UI.DAY);

    var dayList = [];
    for (var i = 0; i < days; i++) {
      dayList.push({ start: UI.addDays(from, i), byCat: {}, total: 0, points: 0 });
    }

    var totals = {};    // catId → { ms, count, scaleSum, scaleCount }
    var scales = [];    // 体調の記録（推移グラフ用）
    var logs = Store.logsInRange(from, to);

    logs.forEach(function (l) {
      if (!totals[l.catId]) totals[l.catId] = { ms: 0, count: 0, scaleSum: 0, scaleCount: 0 };
      totals[l.catId].count++;

      // 点と体調は「その時点の記録」なので、長さを持たせない
      if (l.type === 'point' || l.type === 'scale') {
        var di = Math.round((UI.startOfDay(l.start) - from) / UI.DAY);
        if (dayList[di]) dayList[di].points++;
        if (l.type === 'scale' && l.scale) {
          totals[l.catId].scaleSum += l.scale;
          totals[l.catId].scaleCount++;
          scales.push(l);
        }
        return;
      }

      var end = Math.min(l.end || now, to);
      var start = Math.max(l.start, from);
      if (end <= start) return;
      totals[l.catId].ms += end - start;

      // 日ごとに切り分け
      var cursor = start;
      while (cursor < end) {
        var dayStart = UI.startOfDay(cursor);
        var dayEnd = UI.addDays(dayStart, 1);
        var slice = Math.min(end, dayEnd) - cursor;
        var idx = Math.round((dayStart - from) / UI.DAY);
        if (dayList[idx]) {
          dayList[idx].byCat[l.catId] = (dayList[idx].byCat[l.catId] || 0) + slice;
          dayList[idx].total += slice;
        }
        cursor = dayEnd;
      }
    });

    var ranked = Object.keys(totals).map(function (id) {
      var t = totals[id];
      return {
        catId: id, ms: t.ms, count: t.count,
        scaleAvg: t.scaleCount ? (t.scaleSum / t.scaleCount) : null
      };
    }).sort(function (a, b) {
      return (b.ms - a.ms) || (b.count - a.count);
    });

    return {
      days: dayList, ranked: ranked, scales: scales,
      from: from, to: to, dayCount: dayList.length
    };
  }

  function chartHTML(agg) {
    var max = 0;
    agg.days.forEach(function (d) { if (d.total > max) max = d.total; });
    if (max <= 0) max = UI.HOUR;

    var step = agg.dayCount <= 7 ? 1 : (agg.dayCount <= 31 ? 5 : 15);

    var cols = agg.days.map(function (d) {
      var segs = Object.keys(d.byCat)
        .sort(function (a, b) { return d.byCat[b] - d.byCat[a]; })
        .map(function (cid) {
          var h = (d.byCat[cid] / max) * 100;
          return '<div class="chart-seg" style="height:' + h + '%;background:' +
                 Store.category(cid).color + '"></div>';
        }).join('');
      return '<div class="chart-col" title="' + UI.fmtShortDate(d.start) + '">' + segs + '</div>';
    }).join('');

    // ラベルは日ごとの列をまたいで中央寄せにする（列より文字が大きくてもはみ出さない）
    var n = agg.days.length;
    var lastStepIdx = Math.floor((n - 1) / step) * step;
    var span = Math.min(n, step <= 1 ? 1 : (step <= 5 ? 5 : 9));
    var labels = agg.days.map(function (d, i) {
      var isLast = i === n - 1;
      var show = (i % step === 0) || (isLast && (i - lastStepIdx) >= Math.max(2, Math.floor(step / 3)));
      if (!show) return '';
      var startCol = Math.min(Math.max(i + 1 - Math.floor(span / 2), 1), n - span + 1);
      return '<div class="chart-label" style="grid-column:' + startCol + ' / span ' + span + '">' +
             UI.fmtShortDate(d.start) + '</div>';
    }).join('');

    return '<div class="chart">' + cols + '</div>' +
           '<div class="chart-labels" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' +
           labels + '</div>';
  }

  /** 体調の推移。縦が1〜5、横が期間 */
  function scaleHTML(agg) {
    var span = Math.max(agg.to - agg.from, 1);
    var dots = agg.scales.map(function (l) {
      var si = Store.scaleInfo(l.scale);
      var x = (l.start - agg.from) / span * 100;
      var y = (5 - l.scale) / 4 * 100;
      return '<div class="scale-dot" style="left:' + x + '%;top:' + y + '%;background:' +
             si.color + '"></div>';
    }).join('');
    return '<div class="scale-chart">' + dots + '</div>' +
           '<div class="scale-axis">' +
             '<span>' + UI.fmtShortDate(agg.from) + '</span>' +
             '<span>1 悪い → 5 良い</span>' +
             '<span>' + UI.fmtShortDate(UI.addDays(agg.to, -1)) + '</span>' +
           '</div>';
  }

  function reportCard() {
    return '<div class="card">' +
      '<div class="card-title">受診用レポート</div>' +
      '<p class="hint" style="margin-bottom:14px">この期間の睡眠・服薬・体調を1枚にまとめます。' +
      '印刷やPDF保存をして、そのまま渡せます。</p>' +
      '<button class="btn" id="reportBtn">レポートを作る</button>' +
      '</div>';
  }

  function render(container, from, to) {
    var agg = aggregate(from, to);

    if (!agg.ranked.length) {
      container.innerHTML =
        '<div class="empty">この期間の記録はまだありません。<br>' +
        '上部のボタンから記録してみましょう。</div>' + reportCard();
      return;
    }

    var recordedDays = agg.days.filter(function (d) {
      return d.total > 0 || d.points > 0;
    }).length;
    var totalMs = agg.ranked.reduce(function (a, r) { return a + r.ms; }, 0);
    var totalCount = agg.ranked.reduce(function (a, r) { return a + r.count; }, 0);

    var scaleAvg = null;
    if (agg.scales.length) {
      var s = 0;
      agg.scales.forEach(function (l) { s += l.scale; });
      scaleAvg = Math.round(s / agg.scales.length * 10) / 10;
    }

    var html = '';

    /* 概要 */
    html += '<div class="card">' +
      '<div class="card-title">概要</div>' +
      '<div class="row"><div class="row-main"><div class="row-title">記録した日数</div></div>' +
      '<div class="row-val">' + recordedDays + ' / ' + agg.dayCount + '日</div></div>' +
      '<div class="row"><div class="row-main"><div class="row-title">記録件数</div></div>' +
      '<div class="row-val">' + totalCount + '件</div></div>' +
      (scaleAvg !== null
        ? '<div class="row"><div class="row-main"><div class="row-title">体調の平均</div></div>' +
          '<div class="row-val">' + scaleAvg + ' / 5</div></div>'
        : '') +
      '<div class="row"><div class="row-main"><div class="row-title">記録した時間の合計</div></div>' +
      '<div class="row-val">' + UI.fmtHours(totalMs) + '</div></div>' +
      '</div>';

    /* 体調の推移 */
    if (agg.scales.length) {
      html += '<div class="card"><div class="card-title">体調の推移</div>' + scaleHTML(agg) + '</div>';
    }

    /* 日別グラフ */
    html += '<div class="card"><div class="card-title">日別の内訳</div>' + chartHTML(agg) + '</div>';

    /* カテゴリ別 */
    var maxMs = agg.ranked[0].ms || 1;
    var rows = agg.ranked.map(function (r) {
      var cat = Store.category(r.catId);
      var isScale = (r.scaleAvg !== null);
      var isPoint = !isScale && (cat.kind === 'point' || r.ms === 0);

      var val, sub, pct = 0;
      if (isScale) {
        val = (Math.round(r.scaleAvg * 10) / 10) + ' / 5';
        sub = r.count + '回の記録の平均';
      } else if (isPoint) {
        val = r.count + '回';
        sub = '1日あたり ' + (Math.round(r.count / Math.max(recordedDays, 1) * 10) / 10) + '回';
      } else {
        val = UI.fmtHours(r.ms);
        sub = r.count + '件・平均 ' + UI.fmtDuration(r.ms / r.count);
        pct = (r.ms / maxMs) * 100;
      }

      var dotColor = isScale ? Store.scaleInfo(Math.round(r.scaleAvg)).color : cat.color;
      return '<div class="row">' +
        '<span class="dot" style="background:' + dotColor + '"></span>' +
        '<div class="row-main">' +
          '<div class="row-title">' + UI.esc(cat.name) + '</div>' +
          '<div class="row-sub">' + sub + '</div>' +
          (pct > 0 ? '<div class="bar-track"><div class="bar-fill" style="width:' + pct +
                     '%;background:' + cat.color + '"></div></div>' : '') +
        '</div>' +
        '<div class="row-val">' + val + '</div>' +
      '</div>';
    }).join('');

    html += '<div class="card"><div class="card-title">カテゴリ別</div>' + rows + '</div>';
    html += reportCard();

    container.innerHTML = html;
  }

  return { render: render, aggregate: aggregate };
})();
