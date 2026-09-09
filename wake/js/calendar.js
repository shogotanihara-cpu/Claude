/* ─────────────────────────────────────────
   calendar.js —「カレンダー」画面

   月表示のマスに、その日が期限のタスクを色付きのチップで並べる。
   日をタップすると、下にその日の詳細が出る。
   ───────────────────────────────────────── */

var CalView = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;
  var MAX_CHIPS = 3;                       // マスに出す上限。あふれた分は「+N」
  var month = UI.startOfMonth(Date.now());
  var picked = UI.today();

  function render(host, rootId) {
    UI.clear(host);
    var showDone = Store.settings().showDone;

    /* 日付 → その日が期限のタスク */
    var byDay = {};
    Model.dated(rootId, showDone).forEach(function (t) {
      var d = Model.due(t.id);
      if (d == null) return;
      (byDay[d] = byDay[d] || []).push(t);
    });

    host.appendChild(monthBar());
    host.appendChild(grid(byDay));
    host.appendChild(dayList(byDay[picked] || []));
  }

  function monthBar() {
    var bar = el('div', 'monthbar');
    bar.appendChild(btn('iconbtn', '‹', function () {
      month = UI.addMonths(month, -1); App.render();
    }));
    var d = new Date(month);
    bar.appendChild(el('div', 'monthlabel', d.getFullYear() + '年' + (d.getMonth() + 1) + '月'));
    bar.appendChild(btn('iconbtn', '›', function () {
      month = UI.addMonths(month, 1); App.render();
    }));
    bar.appendChild(btn('todaybtn', '今日', function () {
      month = UI.startOfMonth(Date.now());
      picked = UI.today();
      App.render();
    }));
    return bar;
  }

  function grid(byDay) {
    var g = el('div', 'cal');
    UI.WD.forEach(function (w, i) {
      g.appendChild(el('div', 'cal-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''), w));
    });

    var start = UI.startOfWeek(month);
    var next = UI.addMonths(month, 1);
    var today = UI.today();

    for (var ts = start; ts < next || new Date(ts).getDay() !== 0; ts = UI.addDays(ts, 1)) {
      (function (day) {
        var inMonth = day >= month && day < next;
        var cell = el('div', 'cal-cell'
          + (inMonth ? '' : ' out')
          + (day === today ? ' today' : '')
          + (day === picked ? ' picked' : ''));
        cell.appendChild(el('div', 'cal-num', String(new Date(day).getDate())));

        var items = byDay[day] || [];
        items.slice(0, MAX_CHIPS).forEach(function (t) {
          var c = el('div', 'cal-chip' + (Model.done(t.id) ? ' done' : ''), t.title);
          c.style.setProperty('--c', Model.colorOf(t.id));
          cell.appendChild(c);
        });
        if (items.length > MAX_CHIPS) {
          cell.appendChild(el('div', 'cal-more', '+' + (items.length - MAX_CHIPS)));
        }

        cell.addEventListener('click', function () { picked = day; App.render(); });
        g.appendChild(cell);
      })(ts);
      if (ts > UI.addDays(start, 41)) break;   // 念のための止め（6週まで）
    }
    return g;
  }

  function dayList(items) {
    var box = el('section', 'group');
    var h = el('div', 'group-head');
    h.appendChild(el('span', 'group-name', UI.fmtDate(picked)));
    h.appendChild(el('span', 'group-count', items.length ? items.length + '件' : '期限なし'));
    box.appendChild(h);

    if (!items.length) {
      box.appendChild(el('p', 'sheet-note', 'この日が期限のタスクはありません。'));
      return box;
    }
    var rows = el('div', 'rows');
    Model.sortByDue(items.slice()).forEach(function (t) { rows.appendChild(DueView.row(t)); });
    box.appendChild(rows);
    return box;
  }

  return { render: render };
})();
