/* ─────────────────────────────────────────
   list.js — 「明細」の画面

   月ごとの明細を、日付でまとめて新しい順に並べる。
   上のチップで大分類に絞れる。「月」の画面で小分類を押して来たときは、
   その小分類だけに絞った状態で開く。
   ───────────────────────────────────────── */

var ListView = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;

  function render(host, ym, filter) {
    UI.clear(host);
    host.appendChild(MonthView.monthBar(ym));
    host.appendChild(filterBar(filter));

    var list = Model.recsOfMonth(ym, filter);
    if (!list.length) {
      var empty = el('div', 'empty');
      empty.appendChild(el('div', 'empty-title', 'この条件の明細はありません'));
      host.appendChild(empty);
      return;
    }

    var s = Model.summaryOf(list);
    var head = el('div', 'listhead');
    head.appendChild(el('span', 'listhead-main', list.length + ' 件'));
    head.appendChild(el('span', 'listhead-sub', '合計 ' + UI.yen(s.total)));
    host.appendChild(head);

    var days = [], byDay = {};
    list.forEach(function (r) {
      if (!byDay[r.date]) { byDay[r.date] = []; days.push(r.date); }
      byDay[r.date].push(r);
    });

    days.forEach(function (d) {
      var sec = el('section', 'group');
      var gh = el('div', 'group-head');
      gh.appendChild(el('span', 'group-name', UI.fmtDate(d)));
      gh.appendChild(el('span', 'group-count', UI.yen(Model.summaryOf(byDay[d]).total)));
      sec.appendChild(gh);
      var rows = el('div', 'rows');
      byDay[d].forEach(function (r) { rows.appendChild(Entry.row(r)); });
      sec.appendChild(rows);
      host.appendChild(sec);
    });
  }

  function filterBar(filter) {
    var bar = el('div', 'chips chips-filter');
    bar.appendChild(chip('すべて', null, !filter.cat, {}));
    Store.majors().forEach(function (m) {
      bar.appendChild(chip(m.name, m.color, filter.cat === m.id && filter.sub === undefined, { cat: m.id }));
    });
    bar.appendChild(chip('未分類', null, filter.cat === 'none', { cat: 'none' }));

    if (filter.cat && filter.sub !== undefined) {
      // 小分類まで絞っているときは、それが分かるチップを足す。押すと大分類に戻る
      var m = Store.majorById(filter.cat);
      var s = filter.sub ? Store.subById(filter.sub) : null;
      var c = chip((m ? m.name : '') + '／' + (s ? s.name : '小分類なし') + ' ×',
        m ? m.color : null, true, { cat: filter.cat });
      bar.appendChild(c);
    }
    return bar;
  }

  function chip(text, color, on, next) {
    var c = btn('fchip' + (on ? ' on' : ''), '', function () { App.openList(next); });
    if (color) {
      c.appendChild(Cats.dot(color));
      c.style.setProperty('--c', color);
    }
    c.appendChild(el('span', null, text));
    return c;
  }

  return { render: render };
})();
