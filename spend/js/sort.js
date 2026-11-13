/* ─────────────────────────────────────────
   sort.js — 「仕分け」の画面

   自動では決めきれなかった明細だけが並ぶ。未分類のものと、
   「旅行」のように仮置きして確かめることにしてあるもの。

   日付ごとにまとめて出す。旅行の出費は同じ日に固まるので、
   「この日はまとめて推し活」と1回で片づけられるようにしてある。
   ───────────────────────────────────────── */

var SortView = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;

  var LIMIT = 60;   // 一度に描く件数。数百件を一気に並べると、スマホで重くなる

  function render(host) {
    UI.clear(host);
    var all = Model.queue();

    if (!all.length) {
      var empty = el('div', 'empty');
      empty.appendChild(el('div', 'empty-title', '確認待ちはありません'));
      empty.appendChild(el('p', 'empty-note',
        '自動で振り分けきれなかった明細が、ここに並びます。'));
      host.appendChild(empty);
      return;
    }

    var head = el('div', 'listhead');
    head.appendChild(el('span', 'listhead-main', '確認待ち ' + all.length + ' 件'));
    head.appendChild(el('span', 'listhead-sub', '破線が、いまの仮置きです'));
    host.appendChild(head);

    var shown = all.slice(0, LIMIT);
    var days = [], byDay = {};
    shown.forEach(function (r) {
      if (!byDay[r.date]) { byDay[r.date] = []; days.push(r.date); }
      byDay[r.date].push(r);
    });

    days.forEach(function (d) { host.appendChild(dayGroup(d, byDay[d])); });

    if (all.length > shown.length) {
      host.appendChild(el('p', 'sheet-note center', 'ほか ' + (all.length - shown.length) + ' 件。上から片づけると続きが出ます。'));
    }
  }

  function dayGroup(date, list) {
    var sec = el('section', 'group');
    var head = el('div', 'group-head');
    head.appendChild(el('span', 'group-name', UI.fmtDate(date)));
    head.appendChild(el('span', 'group-count', list.length + ' 件'));
    sec.appendChild(head);

    if (list.length > 1) {
      var bulk = el('div', 'bulk');
      bulk.appendChild(el('span', 'bulk-label', 'この日をまとめて'));
      bulk.appendChild(buttons(list.map(function (r) { return r.id; }), null, list.length + ' 件'));
      sec.appendChild(bulk);
    }

    list.forEach(function (r) { sec.appendChild(card(r)); });
    return sec;
  }

  function card(r) {
    var c = el('div', 'qcard');
    var top = el('div', 'qcard-top');
    var main = el('div', 'row-main');
    main.appendChild(el('div', 'row-title', Model.title(r)));
    var bits = [];
    if (r.zcat) bits.push('ザイム: ' + r.zcat + (r.zsub ? '／' + r.zsub : ''));
    var memo = (r.memo || r.item || '').split('\n')[0];
    if (memo && memo !== Model.title(r)) bits.push(memo);
    if (bits.length) main.appendChild(el('div', 'row-sub', bits.join(' ・ ')));
    top.appendChild(main);
    top.appendChild(el('span', 'amt amt-big' + (r.amt < 0 ? ' amt-minus' : ''), UI.yen(r.amt)));
    main.addEventListener('click', function () { Entry.open(r.id); });
    c.appendChild(top);
    c.appendChild(buttons([r.id], r.cat, Model.title(r)));
    return c;
  }

  /* 大分類3つのボタン。suggested に仮置き先を渡すと、そのボタンを破線で示す */
  function buttons(ids, suggested, what) {
    var row = el('div', 'qbtns');
    Store.majors().forEach(function (m) {
      var b = btn('qbtn' + (suggested === m.id ? ' qbtn-auto' : ''), '', function () {
        var moved = Store.setClass(ids, m.id);
        UI.undoToast(what + ' を ' + m.name + ' に入れました' +
          (moved ? '。同じお店の ' + moved + ' 件も振り直しました' : ''));
      });
      b.style.setProperty('--c', m.color);
      b.appendChild(Cats.dot(m.color));
      b.appendChild(el('span', null, m.name));
      row.appendChild(b);
    });
    return row;
  }

  return { render: render };
})();
