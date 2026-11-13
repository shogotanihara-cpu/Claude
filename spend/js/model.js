/* ─────────────────────────────────────────
   model.js — 集計と導出

   Store の明細から、画面に出す数字を作る。ここは読むだけで、書き換えない。

   決まりごと
     - 「集計に含めない」明細は、どの合計にも入れない
     - 月の集計は分類の軸だけで行う。イベントに入れても月の数字は変わらない
     - 仮置き（自動で振り分けたまま）の明細も、仮の分類で合計に入れる。
       入れないと、仕分けが済むまで月の合計が実際より小さく見えてしまう
   ───────────────────────────────────────── */

var Model = (function () {
  'use strict';

  function monthOf(date) { return date.slice(0, 7); }

  /** 確認待ちかどうか。未分類か、仮置きで「確かめて」と印がついたもの */
  function needsReview(r) {
    return !r.off && !r.ok && (r.ask || !r.cat);
  }

  function queue() {
    return Store.recs().filter(needsReview).sort(byDateDesc);
  }

  function byDateDesc(a, b) {
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  }

  /** 明細の入っている月の一覧（新しい順）。月の切り替えの端を決めるのに使う */
  function months() {
    var seen = {};
    Store.recs().forEach(function (r) { seen[monthOf(r.date)] = true; });
    return Object.keys(seen).sort().reverse();
  }

  function emptySummary() {
    var s = { total: 0, count: 0, cats: {}, none: { sum: 0, count: 0 } };
    Store.majors().forEach(function (m) {
      s.cats[m.id] = { sum: 0, count: 0, auto: 0, subs: {} };
    });
    return s;
  }

  function addTo(s, r) {
    if (r.off) return;
    s.total += r.amt;
    s.count++;
    var c = r.cat && s.cats[r.cat];
    if (!c) { s.none.sum += r.amt; s.none.count++; return; }
    c.sum += r.amt;
    c.count++;
    if (!r.ok) c.auto++;
    var k = r.sub || '';
    c.subs[k] = (c.subs[k] || 0) + r.amt;
  }

  /** prefix は "2026-10"（月）でも "2026"（年）でもよい */
  function summary(prefix) {
    var s = emptySummary();
    Store.recs().forEach(function (r) {
      if (r.date.indexOf(prefix) === 0) addTo(s, r);
    });
    return s;
  }

  function summaryOf(list) {
    var s = emptySummary();
    list.forEach(function (r) { addTo(s, r); });
    return s;
  }

  /** 小分類ごとの金額を、金額の大きい順に。{ id, name, sum } の配列 */
  function subRows(catSummary) {
    return Object.keys(catSummary.subs).map(function (k) {
      var s = k ? Store.subById(k) : null;
      return { id: k || null, name: s ? s.name : '小分類なし', sum: catSummary.subs[k] };
    }).filter(function (x) { return x.sum !== 0; })
      .sort(function (a, b) { return b.sum - a.sum; });
  }

  /** filter: { cat, sub }。cat が 'none' なら未分類だけ。sub は undefined なら問わない */
  function recsOfMonth(ym, filter) {
    filter = filter || {};
    return Store.recs().filter(function (r) {
      if (monthOf(r.date) !== ym) return false;
      if (filter.cat === 'none') return !r.cat;
      if (filter.cat && r.cat !== filter.cat) return false;
      if (filter.sub !== undefined && (r.sub || null) !== (filter.sub || null)) return false;
      return true;
    }).sort(byDateDesc);
  }

  /** 明細の見出しに使う名前。お店 → 品目 → メモの1行目 の順で、あるものを使う */
  function title(r) {
    if (r.shop && r.shop !== '-') return r.shop;
    if (r.item) return r.item;
    if (r.memo) return r.memo.split('\n')[0];
    return '（名前なし）';
  }

  function classLabel(r) {
    var m = r.cat ? Store.majorById(r.cat) : null;
    if (!m) return '未分類';
    var s = r.sub ? Store.subById(r.sub) : null;
    return s ? m.name + '／' + s.name : m.name;
  }

  /* ── イベント ─────────────────────────── */

  function eventRecs(evId) {
    return Store.recs().filter(function (r) { return r.ev === evId; }).sort(byDateDesc).reverse();
  }

  /**
   * イベントに入れる候補。期間の中にあって、まだどのイベントにも入っていない明細。
   * 期間が決まっていないイベントには候補を出さない（全部が候補になってしまう）。
   */
  function eventCandidates(ev) {
    if (!ev.from) return [];
    var to = ev.to || ev.from;
    return Store.recs().filter(function (r) {
      return !r.ev && !r.off && r.date >= ev.from && r.date <= to;
    }).sort(byDateDesc).reverse();
  }

  return {
    monthOf: monthOf, needsReview: needsReview, queue: queue, months: months,
    summary: summary, summaryOf: summaryOf, subRows: subRows,
    recsOfMonth: recsOfMonth, title: title, classLabel: classLabel,
    eventRecs: eventRecs, eventCandidates: eventCandidates
  };
})();
