/* ─────────────────────────────────────────
   tree.js —「分解」画面

   親タスクごとにカードを作り、その中に木を描く。
   行の ＋ で分解、行のタップで編集シート、▸ で折りたたみ。
   ───────────────────────────────────────── */

var TreeView = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;
  var MAX_INDENT = 5;   // これより深くなってもインデントは増やさない

  function render(host, rootId) {
    UI.clear(host);
    var roots = Model.roots().filter(function (r) { return !rootId || r.id === rootId; });

    if (!roots.length) {
      host.appendChild(NowView.empty('親タスクがありません',
        'まず大きなかたまりを1つ入れて、そこから分解していきます。',
        '親タスクを追加', function () { Task.promptAdd(null); }));
      return;
    }

    var showDone = Store.settings().showDone;
    roots.forEach(function (r) {
      if (!showDone && Model.done(r.id)) return;
      host.appendChild(card(r, showDone));
    });

    if (!host.firstChild) {
      host.appendChild(NowView.empty('全部かたづいています',
        '完了したタスクも見るには、設定から表示を切り替えます。',
        '設定へ', function () { App.go('set'); }));
    }
  }

  function card(root, showDone) {
    var box = el('section', 'card');
    box.style.setProperty('--c', root.color);
    box.appendChild(rowFor(root, 0, showDone));
    if (!root.collapsed) box.appendChild(kids(root.id, 1, showDone));
    return box;
  }

  function kids(parentId, depth, showDone) {
    var wrap = el('div', 'kids');
    Model.children(parentId).forEach(function (t) {
      if (!showDone && Model.done(t.id)) return;
      wrap.appendChild(rowFor(t, depth, showDone));
      if (!t.collapsed && !Model.isLeaf(t.id)) {
        wrap.appendChild(kids(t.id, depth + 1, showDone));
      }
    });
    return wrap;
  }

  function rowFor(t, depth, showDone) {
    var leaf = Model.isLeaf(t.id);
    var isRoot = !t.parentId;
    var r = el('div', 'trow' + (isRoot ? ' trow-root' : '') + (Model.done(t.id) ? ' row-done' : ''));
    r.style.paddingLeft = (10 + Math.min(depth, MAX_INDENT) * 16) + 'px';

    /* 折りたたみ。葉には出さないが、幅は空けて縦をそろえる */
    if (leaf) {
      r.appendChild(el('span', 'caret caret-none'));
    } else {
      r.appendChild(btn('caret' + (t.collapsed ? ' closed' : ''), '▾', function (ev) {
        ev.stopPropagation();
        Store.update(t.id, { collapsed: !t.collapsed });
      }));
    }

    r.appendChild(Task.checkbox(t.id));

    var main = el('div', 'row-main');
    var title = el('div', 'row-title', t.title);
    if (!leaf) {
      var p = Model.progress(t.id);
      title.appendChild(el('span', 'row-prog', p.done + '/' + p.total));
    }
    main.appendChild(title);
    if (t.memo) main.appendChild(el('div', 'row-sub', t.memo));
    main.addEventListener('click', function () { Task.open(t.id); });
    r.appendChild(main);

    var badge = Task.dueBadge(t.id);
    if (badge) r.appendChild(badge);

    r.appendChild(btn('addbtn', '＋', function (ev) {
      ev.stopPropagation();
      Task.promptAdd(t.id);
    }));

    return r;
  }

  return { render: render };
})();
