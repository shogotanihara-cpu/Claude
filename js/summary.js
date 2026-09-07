/* ─────────────────────────────────────────
   summary.js — 集計とグラフ描画
   ───────────────────────────────────────── */

var Summary = (function () {
  'use strict';

  /**
   * 直近 days 日分を日別・カテゴリ別に集計する。
   * 期間ログは日をまたぐぶんを日ごとに切り分けて合算する。
   */
  function aggregate(days) {
    var today = UI.startOfDay(Date.now());
    var from = UI.addDays(today, -(days - 1));
    var to = UI.addDays(today, 1);
    var now = Date.now();

    var dayList = [];
    for (var i = 0; i < days; i++) {
      dayList.push({ start: UI.addDays(from, i), byCat: {}, total: 0, points: 0 });
    }

    var totals = {};   // catId → { ms, count }
    var logs = Store.logsInRange(from, to);

    logs.forEach(function (l) {
      if (!totals[l.catId]) totals[l.catId] = { ms: 0, count: 0 };
      totals[l.catId].count++;

      if (l.type === 'point') {
        var di = Math.floor((UI.startOfDay(l.start) - from) / UI.DAY);
        if (dayList[di]) dayList[di].points++;
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
      return { catId: id, ms: totals[id].ms, count: totals[id].count };
    }).sort(function (a, b) {
      return (b.ms - a.ms) || (b.count - a.count);
    });

    return { days: dayList, ranked: ranked, from: from, to: to, dayCount: days };
  }

  function chartHTML(agg) {
    var max = 0;
    agg.days.forEach(function (d) { if (d.total > max) max = d.total; });
    if (max <= 0) max = UI.HOUR;

    // 日数が多いときはラベルを間引く
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

    var labels = agg.days.map(function (d, i) {
      var show = (i % step === 0) || i === agg.days.length - 1;
      return '<div class="chart-label">' + (show ? UI.fmtShortDate(d.start) : '') + '</div>';
    }).join('');

    return '<div class="chart">' + cols + '</div><div class="chart-labels">' + labels + '</div>';
  }

  function render(container, days) {
    var agg = aggregate(days);

    if (!agg.ranked.length) {
      container.innerHTML =
        '<div class="empty">この期間の記録はまだありません。<br>＋ ボタンから記録してみましょう。</div>';
      return;
    }

    var recordedDays = agg.days.filter(function (d) {
      return d.total > 0 || d.points > 0;
    }).length;
    var totalMs = agg.ranked.reduce(function (a, r) { return a + r.ms; }, 0);
    var totalCount = agg.ranked.reduce(function (a, r) { return a + r.count; }, 0);

    var html = '';

    /* 概要 */
    html += '<div class="card">' +
      '<div class="card-title">概要</div>' +
      '<div class="row"><div class="row-main"><div class="row-title">記録した日数</div></div>' +
      '<div class="row-val">' + recordedDays + ' / ' + agg.dayCount + '日</div></div>' +
      '<div class="row"><div class="row-main"><div class="row-title">記録件数</div></div>' +
      '<div class="row-val">' + totalCount + '件</div></div>' +
      '<div class="row"><div class="row-main"><div class="row-title">記録した時間の合計</div></div>' +
      '<div class="row-val">' + UI.fmtHours(totalMs) + '</div></div>' +
      '<div class="row"><div class="row-main"><div class="row-title">1日あたり平均</div></div>' +
      '<div class="row-val">' + UI.fmtHours(totalMs / Math.max(recordedDays, 1)) + '</div></div>' +
      '</div>';

    /* 日別グラフ */
    html += '<div class="card">' +
      '<div class="card-title">日別の内訳</div>' + chartHTML(agg) + '</div>';

    /* カテゴリ別 */
    var maxMs = agg.ranked[0].ms || 1;
    var rows = agg.ranked.map(function (r) {
      var cat = Store.category(r.catId);
      var isPoint = cat.kind === 'point' || r.ms === 0;
      var val = isPoint ? r.count + '回' : UI.fmtHours(r.ms);
      var sub = isPoint
        ? '1日あたり ' + (Math.round(r.count / Math.max(recordedDays, 1) * 10) / 10) + '回'
        : r.count + '件・平均 ' + UI.fmtDuration(r.ms / r.count);
      var pct = isPoint ? 0 : (r.ms / maxMs) * 100;
      return '<div class="row">' +
        '<span class="dot" style="background:' + cat.color + '"></span>' +
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

    container.innerHTML = html;
  }

  return { render: render, aggregate: aggregate };
})();
