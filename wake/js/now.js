/* ─────────────────────────────────────────
   now.js —「いま」画面

   このアプリの1枚目。未完了の葉タスク（＝それ以上分解されていない、
   いま手をつけられる単位）だけを、木の形を無視して期限の近い順に並べる。
   どこにあるタスクかを考えずに、上から順に手をつければいい状態を作る。
   ───────────────────────────────────────── */

var NowView = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;

  function render(host, rootId) {
    UI.clear(host);
    var showDone = Store.settings().showDone;
    var list = Model.actionable(rootId, showDone);

    if (!Store.all().length) {
      host.appendChild(empty('タスクはまだありません',
        '大きなかたまりのまま「親タスク」として入れてしまって、あとから分解していきます。',
        '親タスクを追加', function () { Task.promptAdd(null); }));
      return;
    }
    if (!list.length) {
      host.appendChild(empty('手をつけられるタスクはありません',
        rootId ? 'この親タスクは、いまのところ全部かたづいています。'
               : '全部かたづいています。新しく分解するなら「分解」から。',
        '分解へ', function () { App.go('tree'); }));
      return;
    }

    var head = el('div', 'now-head');
    head.appendChild(el('span', 'now-count', list.length + '件'));
    head.appendChild(el('span', 'now-hint', '上から順に。大きすぎたら、開いて分解する'));
    host.appendChild(head);

    var ul = el('div', 'rows');
    list.forEach(function (t) { ul.appendChild(row(t)); });
    host.appendChild(ul);
  }

  function row(t) {
    var r = el('div', 'row' + (Model.done(t.id) ? ' row-done' : ''));
    r.appendChild(Task.checkbox(t.id));

    var bar = el('span', 'bar');
    bar.style.background = Model.colorOf(t.id);
    r.appendChild(bar);

    var main = el('div', 'row-main');
    main.appendChild(el('div', 'row-title', t.title));
    var path = Model.ancestors(t.id).map(function (a) { return a.title; });
    if (path.length) main.appendChild(el('div', 'row-sub', path.join(' › ')));
    r.appendChild(main);

    var badge = Task.dueBadge(t.id);
    if (badge) r.appendChild(badge);

    main.addEventListener('click', function () { Task.open(t.id); });
    return r;
  }

  function empty(title, note, actionLabel, onAction) {
    var box = el('div', 'empty');
    box.appendChild(el('div', 'empty-title', title));
    box.appendChild(el('p', 'empty-note', note));
    box.appendChild(btn('btn btn-primary', actionLabel, onAction));
    return box;
  }

  return { render: render, empty: empty };
})();
