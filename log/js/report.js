/* ─────────────────────────────────────────
   report.js — 受診用レポート

   指定した期間の睡眠・服薬・体調を1枚にまとめ、
   そのまま見せる／印刷してPDFにできる形で出す。
   医学的な判断や解釈は行わない。記録した事実だけを並べる。
   ───────────────────────────────────────── */

var Report = (function () {
  'use strict';

  /** 睡眠とみなすカテゴリ（名前に「睡眠」を含む span） */
  function sleepCats() {
    return Store.categories().filter(function (c) {
      return c.kind === 'span' && c.name.indexOf('睡眠') >= 0;
    });
  }

  function scaleCats() {
    return Store.categories().filter(function (c) { return c.kind === 'scale'; });
  }

  function pointCats() {
    return Store.categories().filter(function (c) { return c.kind === 'point'; });
  }

  /* ── 集計 ─────────────────────────────── */

  /**
   * 睡眠を「1回のまとまり」として集める。
   * 日をまたぐので、その睡眠が終わった日に属させる（起床日で数える）。
   */
  function collectSleep(from, to) {
    var ids = sleepCats().map(function (c) { return c.id; });
    if (!ids.length) return [];
    return Store.logs().filter(function (l) {
      if (l.type !== 'span' || !l.end) return false;
      if (ids.indexOf(l.catId) < 0) return false;
      return l.end > from && l.end <= to;
    }).sort(function (a, b) { return a.start - b.start; });
  }

  function collectPoints(from, to) {
    var ids = pointCats().map(function (c) { return c.id; });
    return Store.logs().filter(function (l) {
      return l.type === 'point' && ids.indexOf(l.catId) >= 0 &&
             l.start >= from && l.start < to;
    }).sort(function (a, b) { return a.start - b.start; });
  }

  function collectScales(from, to) {
    return Store.logs().filter(function (l) {
      return l.type === 'scale' && l.scale && l.start >= from && l.start < to;
    }).sort(function (a, b) { return a.start - b.start; });
  }

  function collectMemos(from, to) {
    return Store.logsInRange(from, to).filter(function (l) {
      return l.memo && l.memo.trim();
    }).sort(function (a, b) { return a.start - b.start; });
  }

  /* ── 部品 ─────────────────────────────── */

  function stat(k, v, unit) {
    return '<div class="stat"><div class="stat-k">' + UI.esc(k) + '</div>' +
           '<div class="stat-v">' + v + (unit ? '<small>' + unit + '</small>' : '') + '</div></div>';
  }

  /**
   * 睡眠の帯グラフ。横軸は 18:00 →（翌）12:00 の18時間。
   * 就寝が夜遅く起床が朝、という形をそのまま見せたいのでこの範囲にする。
   */
  function hypnogram(sleeps, from, to) {
    var AXIS_START = 18, AXIS_LEN = 18; // 18:00 から 18時間ぶん
    // まだ来ていない日は行を作らない（空欄が並ぶだけなので）
    var limit = Math.min(to, UI.addDays(UI.startOfDay(Date.now()), 1));
    var days = Math.max(Math.round((limit - from) / UI.DAY), 0);
    var rows = [];

    for (var i = 0; i < days; i++) {
      var dayStart = UI.addDays(from, i);
      var dayEnd = UI.addDays(dayStart, 1);
      // その日に「起きた」睡眠を拾う
      var todays = sleeps.filter(function (s) {
        return s.end > dayStart && s.end <= dayEnd;
      });

      var bars = todays.map(function (s) {
        var cat = Store.category(s.catId);
        // 軸の原点 = 起床日の前日 18:00
        var origin = UI.addDays(dayStart, -1) + AXIS_START * UI.HOUR;
        var a = (s.start - origin) / UI.HOUR;
        var b = (s.end - origin) / UI.HOUR;
        a = Math.max(0, Math.min(AXIS_LEN, a));
        b = Math.max(0, Math.min(AXIS_LEN, b));
        if (b <= a) return '';
        return '<div class="hyp-bar" style="left:' + (a / AXIS_LEN * 100) + '%;width:' +
               ((b - a) / AXIS_LEN * 100) + '%;background:' + cat.color + '"></div>';
      }).join('');

      rows.push(
        '<div class="hyp-row">' +
          '<div class="hyp-day">' + UI.fmtShortDate(dayStart) + '(' +
            UI.WD[new Date(dayStart).getDay()] + ')</div>' +
          '<div class="hyp-track">' + bars + '</div>' +
        '</div>'
      );
    }

    var ticks = ['18:00', '0:00', '6:00', '12:00']
      .map(function (t) { return '<span>' + t + '</span>'; }).join('');

    return '<div class="hyp">' + rows.join('') + '</div>' +
           '<div class="hyp-scale"><span></span><div class="hyp-ticks">' + ticks + '</div></div>';
  }

  /** 体調の推移を点で並べる */
  function scalePlot(scales, from, to) {
    if (!scales.length) return '<p class="rep-none">この期間に体調の記録はありません。</p>';
    var span = Math.max(to - from, 1);
    var dots = scales.map(function (l) {
      var si = Store.scaleInfo(l.scale);
      var x = (l.start - from) / span * 100;
      var y = (5 - l.scale) / 4 * 100;   // 5 が上、1 が下
      return '<div class="scale-dot" style="left:' + x + '%;top:' + y + '%;background:' +
             si.color + '" title="' + UI.fmtShortDate(l.start) + ' ' + si.label + '"></div>';
    }).join('');
    return '<div class="scale-chart">' + dots + '</div>' +
           '<div class="scale-axis"><span>' + UI.fmtShortDate(from) + '</span>' +
           '<span>1 とても悪い → 5 とても良い</span>' +
           '<span>' + UI.fmtShortDate(UI.addDays(to, -1)) + '</span></div>';
  }

  /* ── 本体 ─────────────────────────────── */

  function build(from, to) {
    var days = Math.round((to - from) / UI.DAY);
    var sleeps = collectSleep(from, to);
    var points = collectPoints(from, to);
    var scales = collectScales(from, to);
    var memos = collectMemos(from, to);

    var html = '';

    html += '<div class="rep-head">' +
      '<h1 class="rep-title">生活記録</h1>' +
      '<div class="rep-range">' + UI.fmtDateFullPlain(from) + ' 〜 ' +
        UI.fmtDateFullPlain(UI.addDays(to, -1)) + '（' + days + '日間）</div>' +
      '<div class="rep-made">作成 ' + UI.fmtDateFullPlain(Date.now()) + '</div>' +
      '</div>';

    /* 睡眠 */
    html += '<div class="rep-sec"><h2 class="rep-h">睡眠</h2>';
    if (sleeps.length) {
      var totalMs = 0, minMs = Infinity, maxMs = 0;
      sleeps.forEach(function (s) {
        var d = s.end - s.start;
        totalMs += d;
        if (d < minMs) minMs = d;
        if (d > maxMs) maxMs = d;
      });
      var recordedDays = {};
      sleeps.forEach(function (s) { recordedDays[UI.startOfDay(s.end)] = true; });
      var nights = Object.keys(recordedDays).length;

      html += '<div class="rep-stats">' +
        stat('平均', UI.fmtDurationHTML(totalMs / sleeps.length)) +
        stat('最短', UI.fmtDurationHTML(minMs)) +
        stat('最長', UI.fmtDurationHTML(maxMs)) +
        stat('記録', nights + ' / ' + days, '日') +
        '</div>';
      html += hypnogram(sleeps, from, to);
    } else {
      html += '<p class="rep-none">この期間に睡眠の記録はありません。</p>';
    }
    html += '</div>';

    /* 服薬など点の記録 */
    if (pointCats().length) {
      html += '<div class="rep-sec"><h2 class="rep-h">服薬・記録した出来事</h2>';
      var byCat = {};
      points.forEach(function (p) {
        if (!byCat[p.catId]) byCat[p.catId] = [];
        byCat[p.catId].push(p);
      });
      var catIds = Object.keys(byCat);
      if (catIds.length) {
        html += '<div class="rep-stats">';
        catIds.forEach(function (cid) {
          var list = byCat[cid];
          var dayset = {};
          list.forEach(function (p) { dayset[UI.startOfDay(p.start)] = true; });
          html += stat(Store.category(cid).name,
                       list.length + '<small>回</small> ' + Object.keys(dayset).length + ' / ' + days,
                       '日');
        });
        html += '</div>';

        // 記録のなかった日
        var medCats = catIds.filter(function (cid) {
          return Store.category(cid).name.indexOf('服薬') >= 0;
        });
        medCats.forEach(function (cid) {
          var has = {};
          byCat[cid].forEach(function (p) { has[UI.startOfDay(p.start)] = true; });
          var missing = [];
          for (var i = 0; i < days; i++) {
            var d = UI.addDays(from, i);
            if (d > Date.now()) break;
            if (!has[d]) missing.push(UI.fmtShortDate(d));
          }
          html += '<p class="rep-none" style="margin-top:10px">' +
            UI.esc(Store.category(cid).name) + 'の記録がない日: ' +
            (missing.length ? missing.join('、') : 'なし') + '</p>';
        });
      } else {
        html += '<p class="rep-none">この期間に記録はありません。</p>';
      }
      html += '</div>';
    }

    /* 体調 */
    if (scaleCats().length) {
      html += '<div class="rep-sec"><h2 class="rep-h">体調</h2>';
      if (scales.length) {
        var sum = 0, counts = [0, 0, 0, 0, 0];
        scales.forEach(function (l) { sum += l.scale; counts[l.scale - 1]++; });
        var worst = counts[0] + counts[1];
        html += '<div class="rep-stats">' +
          stat('平均', (Math.round(sum / scales.length * 10) / 10) + '', '/ 5') +
          stat('記録', scales.length + '', '回') +
          stat('悪い日', worst + '', '回') +
          '</div>';
      }
      html += scalePlot(scales, from, to);
      html += '</div>';
    }

    /* メモ */
    html += '<div class="rep-sec"><h2 class="rep-h">メモ</h2>';
    if (memos.length) {
      html += '<div class="rep-list">' + memos.map(function (l) {
        var cat = Store.category(l.catId);
        var when = UI.fmtShortDate(l.start) + ' ' + UI.fmtTime(l.start);
        return '<div class="rep-item">' +
          '<div class="rep-when">' + when + '</div>' +
          '<div class="rep-what"><b>' + UI.esc(cat.name) + '</b> ' +
            '<span>' + UI.esc(l.memo) + '</span></div>' +
        '</div>';
      }).join('') + '</div>';
    } else {
      html += '<p class="rep-none">この期間にメモはありません。</p>';
    }
    html += '</div>';

    html += '<p class="rep-foot">本人が手入力した記録です。記録もれや入力の誤りが含まれる場合があります。' +
            'このアプリは記録の保存と表示のみを行い、診断や助言は行いません。</p>';

    return html;
  }

  /** レポートを開く */
  function open(from, to) {
    var el = UI.el('report');
    el.innerHTML =
      '<div class="rep-bar">' +
        '<button id="repClose">閉じる</button>' +
        '<button class="rep-print" id="repPrint">印刷 / PDFで保存</button>' +
      '</div>' +
      '<div class="rep-body">' + build(from, to) + '</div>';
    el.hidden = false;
    el.scrollTop = 0;
    document.body.style.overflow = 'hidden';

    UI.el('repClose').addEventListener('click', close);
    UI.el('repPrint').addEventListener('click', function () { window.print(); });
  }

  function close() {
    var el = UI.el('report');
    el.hidden = true;
    el.innerHTML = '';
    document.body.style.overflow = '';
  }

  return { open: open, close: close, build: build };
})();
