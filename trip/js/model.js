/* ─────────────────────────────────────────
   model.js — 旅程から導き出す値の計算

   画面はここが返したものを並べるだけにする。重なりの列割りや空き時間を
   描画のなかで計算すると、直したいときに描画コードを読み解く羽目になるため。

   種別（cat）はここが持つ。色は css の --c-<キー> と対にしてある。
   ───────────────────────────────────────── */

var Model = (function () {
  'use strict';

  var CATS = [
    { key: 'move', label: '移動' },
    { key: 'see', label: '観光' },
    { key: 'eat', label: '食事' },
    { key: 'live', label: '現場' },
    { key: 'stay', label: '宿泊' },
    { key: 'etc', label: 'その他' }
  ];

  /* 空き時間として知らせる下限。これより短い隙間は移動や片付けで埋まるので
     出しても邪魔になるだけ。実際の旅程で試して45分に落ち着いた。 */
  var FREE_MIN = 45;

  /* 重なり判定で使う、期間の最小の見なし長さ。所要0分の予定（チェックインなど）が
     隣と重なって見えないよう、判定の上でだけ15分あるものとして扱う。 */
  var MIN_SPAN = 15;

  function catLabel(key) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].key === key) return CATS[i].label;
    return 'その他';
  }

  /* ── 日付 ───────────────────────── */

  function daysOf(trip) {
    var out = [];
    if (!trip) return out;
    var cur = UI.parseISO(trip.start);
    var end = UI.parseISO(trip.end);
    if (isNaN(cur) || isNaN(end) || end < cur) return [trip.start];
    var guard = 0;
    while (cur <= end && guard++ < 90) {
      out.push(UI.isoOf(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  /* 今日が期間に入っているか、これからか、終わったか */
  function tripStatus(trip) {
    var t = UI.today();
    if (trip.end < t) return { key: 'past', label: '記録' };
    if (trip.start > t) return { key: 'future', label: 'これから' };
    return { key: 'now', label: '旅行中' };
  }

  /* ── 予定の取り出し ───────────────────────── */

  function scheduled(trip, day) {
    if (!trip) return [];
    return trip.items
      .filter(function (i) { return i.day === day && i.time; })
      .sort(function (a, b) { return UI.toMin(a.time) - UI.toMin(b.time); });
  }

  /* 行き先候補＝まだ日と時刻を決めていない予定 */
  function candidates(trip) {
    if (!trip) return [];
    return trip.items.filter(function (i) { return !i.day || !i.time; });
  }

  function spansOf(list) {
    return list.filter(function (i) { return i.kind !== 'point'; });
  }

  function pointsOf(list) {
    return list.filter(function (i) { return i.kind === 'point'; });
  }

  /* ── 重なりの列割り ─────────────────────────
     重なりを禁止すると旅程が組めないので、許したうえで横に割って並べる。
     戻り値は各予定に { col, cols } を添えた配列。 */
  function layout(spans) {
    var out = spans.map(function (it) {
      var s = UI.toMin(it.time);
      return { item: it, start: s, end: s + Math.max(+it.dur || 0, MIN_SPAN), col: 0, cols: 1 };
    });

    var group = [];
    var groupEnd = -1;
    var groups = [];

    out.forEach(function (r) {
      /* 直前のかたまりと切れたら、そこで列割りを閉じる。
         かたまりごとに独立して割らないと、無関係な予定まで細くなる。 */
      if (group.length && r.start >= groupEnd) {
        groups.push(group);
        group = [];
        groupEnd = -1;
      }
      group.push(r);
      groupEnd = Math.max(groupEnd, r.end);
    });
    if (group.length) groups.push(group);

    groups.forEach(function (g) {
      var ends = [];
      g.forEach(function (r) {
        var placed = false;
        for (var c = 0; c < ends.length; c++) {
          if (ends[c] <= r.start) { r.col = c; ends[c] = r.end; placed = true; break; }
        }
        if (!placed) { r.col = ends.length; ends.push(r.end); }
      });
      g.forEach(function (r) { r.cols = ends.length; });
    });

    return out;
  }

  /* 前の予定の終わりが次の始まりを追い越しているか。
     組み立て中に破綻を見せるのがこのアプリの役目なので、隠さず印を付ける。 */
  function conflicts(spans) {
    var flags = {};
    var reach = -1;
    spans.forEach(function (it) {
      var s = UI.toMin(it.time);
      if (reach > s) flags[it.id] = true;
      reach = Math.max(reach, s + (+it.dur || 0));
    });
    return flags;
  }

  /* 予定と予定のあいだの空き。旅程の前後（就寝帯）は出さない。
     一日の端に「9時間空き」と出しても、置ける時間帯の情報にならないため。 */
  function freeGaps(spans) {
    var out = [];
    var cursor = null;
    spans.forEach(function (it) {
      var s = UI.toMin(it.time);
      if (cursor !== null && s - cursor >= FREE_MIN) {
        out.push({ start: cursor, end: s, minutes: s - cursor });
      }
      cursor = (cursor === null) ? s + (+it.dur || 0) : Math.max(cursor, s + (+it.dur || 0));
    });
    return out;
  }

  return {
    CATS: CATS,
    FREE_MIN: FREE_MIN,
    catLabel: catLabel,
    daysOf: daysOf,
    tripStatus: tripStatus,
    scheduled: scheduled,
    candidates: candidates,
    spansOf: spansOf,
    pointsOf: pointsOf,
    layout: layout,
    conflicts: conflicts,
    freeGaps: freeGaps
  };
})();
