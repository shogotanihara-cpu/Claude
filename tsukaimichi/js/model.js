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

  /* ── イベントの提案 ───────────────────────
     明細から「これはイベントだったのでは」というものを拾う。手がかりは4種類。

       strong … 新幹線、関西以外の地名。その日は現地にいたと見てよい
       weak   … 対応表で印のついたカテゴリ（初期値は旅行）。旅先の食事や交通
       book   … 旅行サイト・航空券・チケットサイト。払った日とイベントの日がずれる

     strong と weak は「現地にいた日」を表す。その日を並べ、連続した日は
     同じイベントとして1つにまとめて、期間として提案する。
     strong が1件でもあれば提案する。weak だけのまとまりは、たまたまの1件を
     拾わないよう「3件以上」かつ「お店が2つ以上」のときだけ提案する。

     book は日付が当てにならないので、期間を作る材料にしない。
     「予約・チケットの支払い」として別に並べ、どのイベントに入れるかは人が選ぶ。
     ───────────────────────────────────────── */

  /* 比べる前に表記をそろえる。全角半角・大文字小文字・ひらがなカタカナのほか、
     QUICPay の明細は小さい「ョ」が大きい「ヨ」で入っている（トウキヨウ）ので、それも寄せる */
  var SMALL = { 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ' };

  function fold(s) {
    s = String(s || '');
    if (s.normalize) s = s.normalize('NFKC');
    return s.toUpperCase().replace(/[ぁ-ゖ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) + 0x60);
    }).replace(/[ァィゥェォッャュョヮ]/g, function (c) { return SMALL[c]; });
  }

  var folded = null, foldedFrom = null;

  function wordLists() {
    var w = Store.words();
    if (foldedFrom !== w) {
      foldedFrom = w;
      folded = {};
      ['ride', 'book', 'place'].forEach(function (k) {
        folded[k] = w[k].map(fold).filter(function (x) { return x; });
      });
    }
    return folded;
  }

  function hasAny(text, list) {
    for (var i = 0; i < list.length; i++) if (text.indexOf(list[i]) >= 0) return true;
    return false;
  }

  /** 明細の手がかりの種類。{ kind: 'book'|'strong'|'weak', why } か null */
  function hint(r) {
    var w = wordLists();
    var text = fold(r.shop + ' ' + r.item + ' ' + r.memo);
    // 予約を先に見る。「楽天トラベル」はザイムでは旅行に入っているが、払った日は旅行の日ではない
    if (hasAny(text, w.book)) return { kind: 'book', why: '予約・チケット' };
    if (hasAny(text, w.ride)) return { kind: 'strong', why: '新幹線' };
    // 末尾の「(TOKYO)」「(JAPAN)」はお店の本社の場所なので、地名を探す前に落とす
    if (hasAny(text.replace(/\([A-Z0-9 .,\-]*\)/g, ''), w.place)) return { kind: 'strong', why: '関西以外の地名' };
    if (Store.isEventHint(r)) return { kind: 'weak', why: '旅行の明細' };
    return null;
  }

  function dayShift(s, n) {
    var p = s.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /**
   * 期間の提案。新しい順。
   * { key, from, to, hints（現地の手がかりの明細）, why（理由の一覧）, hintTotal, shops }
   */
  function suggestions() {
    var byDay = {};
    Store.recs().forEach(function (r) {
      if (r.ev || r.off) return;
      var h = hint(r);
      if (!h || h.kind === 'book') return;
      (byDay[r.date] = byDay[r.date] || []).push({ rec: r, hint: h });
    });
    var days = Object.keys(byDay).sort();
    var runs = [], cur = null;
    days.forEach(function (d) {
      if (cur && dayShift(cur.to, 1) === d) { cur.to = d; cur.days.push(d); }
      else { cur = { from: d, to: d, days: [d] }; runs.push(cur); }
    });

    var events = Store.events();
    var out = [];
    runs.forEach(function (run) {
      var key = run.from + '|' + run.to;
      if (Store.skipped(key)) return;
      // すでにあるイベントの期間と重なるなら、そちらの候補に出るので提案しない
      var taken = events.some(function (e) {
        return e.from && run.from <= (e.to || e.from) && run.to >= e.from;
      });
      if (taken) return;

      var hints = [], shops = {}, why = {}, strong = false;
      run.days.forEach(function (d) {
        byDay[d].forEach(function (x) {
          hints.push(x.rec);
          shops[title(x.rec)] = true;
          why[x.hint.why] = true;
          if (x.hint.kind === 'strong') strong = true;
        });
      });
      if (!strong && (hints.length < 3 || Object.keys(shops).length < 2)) return;

      out.push({
        key: key, from: run.from, to: run.to, hints: hints,
        why: Object.keys(why), hintTotal: summaryOf(hints).total,
        shops: Object.keys(shops)
      });
    });
    return out.reverse();
  }

  function isBooking(r) {
    if (r.ev || r.off) return false;
    var h = hint(r);
    return !!h && h.kind === 'book';
  }

  /** まだどのイベントにも入っていない、予約・チケットの支払い。新しい順 */
  function bookings() {
    return Store.recs().filter(function (r) {
      return isBooking(r) && !Store.skipped('b:' + r.id);
    }).sort(byDateDesc);
  }

  var AHEAD = 120;   // 何日前の支払いまでを「このイベントの予約かも」と見るか

  /** イベントの前に払った、予約・チケットらしき明細。期間内のものは候補のほうに出るので除く */
  function eventAdvance(ev) {
    if (!ev.from) return [];
    var since = dayShift(ev.from, -AHEAD);
    return Store.recs().filter(function (r) {
      return r.date >= since && r.date < ev.from && isBooking(r);
    }).sort(byDateDesc).reverse();
  }

  return {
    suggestions: suggestions, bookings: bookings, eventAdvance: eventAdvance, hint: hint,
    monthOf: monthOf, needsReview: needsReview, queue: queue, months: months,
    summary: summary, summaryOf: summaryOf, subRows: subRows,
    recsOfMonth: recsOfMonth, title: title, classLabel: classLabel,
    eventRecs: eventRecs, eventCandidates: eventCandidates
  };
})();
