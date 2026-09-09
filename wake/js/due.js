/* ─────────────────────────────────────────
   due.js —「期限」画面

   葉タスクと、期限を手で入れた枝タスク（＝節目）を、期限で区切って並べる。
   枝の自動期限まで出すと、同じ日付が親子で二重に並んでしまうため出さない。
   ───────────────────────────────────────── */

var DueView = (function () {
  'use strict';

  var el = UI.el;

  function render(host, rootId) {
    UI.clear(host);
    var showDone = Store.settings().showDone;
    var list = Model.dated(rootId, showDone);

    if (!list.length) {
      host.appendChild(NowView.empty('期限のついたタスクはありません',
        'タスクを開いて期限を入れると、こことカレンダーに並びます。',
        '分解へ', function () { App.go('tree'); }));
      return;
    }

    var today = UI.today(), weekEnd = UI.endOfWeek(today);
    var groups = [
      { key: 'over',  name: '超過',     items: [] },
      { key: 'today', name: '今日',     items: [] },
      { key: 'week',  name: '今週',     items: [] },
      { key: 'later', name: 'それ以降', items: [] },
      { key: 'none',  name: '期限なし', items: [] }
    ];

    list.forEach(function (t) {
      var d = Model.due(t.id);
      var g = (d == null) ? 4
            : (d < today) ? 0
            : (d === today) ? 1
            : (d <= weekEnd) ? 2 : 3;
      groups[g].items.push(t);
    });

    groups.forEach(function (g) {
      if (!g.items.length) return;
      var sec = el('section', 'group');
      var h = el('div', 'group-head');
      h.appendChild(el('span', 'group-name group-' + g.key, g.name));
      h.appendChild(el('span', 'group-count', g.items.length + '件'));
      sec.appendChild(h);
      var rows = el('div', 'rows');
      g.items.forEach(function (t) { rows.appendChild(row(t)); });
      sec.appendChild(rows);
      host.appendChild(sec);
    });
  }

  function row(t) {
    var leaf = Model.isLeaf(t.id);
    var r = el('div', 'row' + (Model.done(t.id) ? ' row-done' : '') + (leaf ? '' : ' row-branch'));
    r.appendChild(Task.checkbox(t.id));

    var bar = el('span', 'bar');
    bar.style.background = Model.colorOf(t.id);
    r.appendChild(bar);

    var main = el('div', 'row-main');
    var title = el('div', 'row-title', t.title);
    if (!leaf) {
      var p = Model.progress(t.id);
      title.appendChild(el('span', 'row-prog', p.done + '/' + p.total));
    }
    main.appendChild(title);
    var path = Model.ancestors(t.id).map(function (a) { return a.title; });
    if (path.length) main.appendChild(el('div', 'row-sub', path.join(' › ')));
    r.appendChild(main);

    var badge = Task.dueBadge(t.id);
    if (badge) r.appendChild(badge);

    main.addEventListener('click', function () { Task.open(t.id); });
    return r;
  }

  return { render: render, row: row };
})();
