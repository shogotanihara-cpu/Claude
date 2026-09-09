/* ─────────────────────────────────────────
   app.js — 画面の切り替えと設定

   画面は「いま」「分解」「期限」「カレンダー」「設定」の5枚。
   上部の色チップで、表示する親タスクを1つに絞るか、全部出すかを切り替える。
   ───────────────────────────────────────── */

var App = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;

  var VIEWS = [
    { key: 'now',  label: 'いま',       render: function (h, r) { NowView.render(h, r); } },
    { key: 'tree', label: '分解',       render: function (h, r) { TreeView.render(h, r); } },
    { key: 'due',  label: '期限',       render: function (h, r) { DueView.render(h, r); } },
    { key: 'cal',  label: 'カレンダー', render: function (h, r) { CalView.render(h, r); } },
    { key: 'set',  label: '設定',       render: function (h) { renderSettings(h); } }
  ];

  var current = 'now';

  function go(key) {
    current = key;
    window.scrollTo(0, 0);           // 前の画面のスクロール位置を持ち込まない
    Store.setSetting('view', key);   // setSetting の中で再描画される
  }

  function view() { return VIEWS.filter(function (v) { return v.key === current; })[0] || VIEWS[0]; }

  /* ── 描画 ─────────────────────────────── */

  function render() {
    var rootId = Store.settings().filterRootId;
    renderFilter(rootId);
    renderTabs();

    var host = document.getElementById('viewHost');
    host.className = 'view view-' + current;
    view().render(host, rootId);

    var fab = document.getElementById('fab');
    var showFab = (current === 'now' || current === 'tree');
    fab.hidden = !showFab;
  }

  function renderFilter(rootId) {
    var bar = UI.clear(document.getElementById('filterBar'));
    bar.hidden = (current === 'set');
    if (bar.hidden) return;

    var roots = Model.roots();
    if (roots.length < 2) { bar.hidden = true; return; }   // 1つしかないなら切替は要らない

    bar.appendChild(chip('すべて', null, rootId == null, null));
    roots.forEach(function (r) {
      bar.appendChild(chip(r.title, r.color, rootId === r.id, r.id));
    });
  }

  function chip(text, color, on, id) {
    var c = btn('fchip' + (on ? ' on' : ''), '', function () {
      Store.setSetting('filterRootId', on ? null : id);
    });
    if (color) {
      var d = Task.dot(color);
      c.appendChild(d);
      c.style.setProperty('--c', color);
    }
    c.appendChild(el('span', null, text));
    return c;
  }

  function renderTabs() {
    var bar = UI.clear(document.getElementById('tabbar'));
    VIEWS.forEach(function (v) {
      var b = btn('tab' + (v.key === current ? ' on' : ''), '', function () { go(v.key); });
      b.appendChild(icon(v.key));
      b.appendChild(el('span', 'tab-label', v.label));
      bar.appendChild(b);
    });
  }

  /* ── タブのアイコン ───────────────────── */

  var NS = 'http://www.w3.org/2000/svg';

  /* 「分解」は、アプリのアイコンと同じ「1本 → 2本 → 3本」の形にそろえてある */
  var SHAPES = {
    now:  [['path', { d: 'M8 5.5l11 6.5-11 6.5z' }]],
    tree: [['rect', { x: 3.5, y: 4.5, width: 17, height: 3.4, rx: 1.5 }],
           ['rect', { x: 3.5, y: 10.3, width: 7.6, height: 3.4, rx: 1.5 }],
           ['rect', { x: 12.9, y: 10.3, width: 7.6, height: 3.4, rx: 1.5 }],
           ['rect', { x: 3.5, y: 16.1, width: 4.4, height: 3.4, rx: 1.5 }],
           ['rect', { x: 9.8, y: 16.1, width: 4.4, height: 3.4, rx: 1.5 }],
           ['rect', { x: 16.1, y: 16.1, width: 4.4, height: 3.4, rx: 1.5 }]],
    due:  [['circle', { cx: 5, cy: 6.5, r: 1.7 }],
           ['circle', { cx: 5, cy: 12, r: 1.7 }],
           ['circle', { cx: 5, cy: 17.5, r: 1.7 }],
           ['rect', { x: 9, y: 5.4, width: 12, height: 2.2, rx: 1.1 }],
           ['rect', { x: 9, y: 10.9, width: 12, height: 2.2, rx: 1.1 }],
           ['rect', { x: 9, y: 16.4, width: 8, height: 2.2, rx: 1.1 }]],
    cal:  [['rect', { x: 3.2, y: 5, width: 17.6, height: 15, rx: 3, fill: 'none',
                      stroke: 'currentColor', 'stroke-width': 1.8 }],
           ['rect', { x: 3.2, y: 5, width: 17.6, height: 4.4, rx: 2 }],
           ['circle', { cx: 8.6, cy: 13.6, r: 1.5 }],
           ['circle', { cx: 15.4, cy: 13.6, r: 1.5 }]],
    set:  [['rect', { x: 3, y: 5.4, width: 18, height: 2.2, rx: 1.1 }],
           ['rect', { x: 3, y: 10.9, width: 18, height: 2.2, rx: 1.1 }],
           ['rect', { x: 3, y: 16.4, width: 18, height: 2.2, rx: 1.1 }],
           ['circle', { cx: 15.5, cy: 6.5, r: 3, fill: 'var(--panel)',
                        stroke: 'currentColor', 'stroke-width': 1.8 }],
           ['circle', { cx: 8, cy: 12, r: 3, fill: 'var(--panel)',
                        stroke: 'currentColor', 'stroke-width': 1.8 }],
           ['circle', { cx: 16.5, cy: 17.5, r: 3, fill: 'var(--panel)',
                        stroke: 'currentColor', 'stroke-width': 1.8 }]]
  };

  function icon(key) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'tab-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    (SHAPES[key] || []).forEach(function (s) {
      var node = document.createElementNS(NS, s[0]);
      Object.keys(s[1]).forEach(function (k) { node.setAttribute(k, s[1][k]); });
      if (!s[1].fill) node.setAttribute('fill', 'currentColor');
      svg.appendChild(node);
    });
    return svg;
  }

  /* ── 設定 ─────────────────────────────── */

  function renderSettings(host) {
    UI.clear(host);

    /* 表示 */
    var s1 = section(host, '表示');
    var sw = el('label', 'switch');
    var cb = el('input');
    cb.type = 'checkbox';
    cb.checked = Store.settings().showDone;
    cb.addEventListener('change', function () { Store.setSetting('showDone', cb.checked); });
    sw.appendChild(cb);
    sw.appendChild(el('span', null, '完了したタスクも表示する'));
    s1.appendChild(sw);

    /* 親タスク */
    var s2 = section(host, '親タスク');
    var roots = Model.roots();
    if (!roots.length) {
      s2.appendChild(el('p', 'sheet-note', 'まだありません。'));
    } else {
      var rows = el('div', 'rows');
      roots.forEach(function (r) {
        var row = el('div', 'row');
        var bar = el('span', 'bar');
        bar.style.background = r.color;
        row.appendChild(bar);
        var main = el('div', 'row-main');
        main.appendChild(el('div', 'row-title', r.title));
        var p = Model.progress(r.id);
        main.appendChild(el('div', 'row-sub', p.done + '／' + p.total + ' 完了'));
        main.addEventListener('click', function () { Task.open(r.id); });
        row.appendChild(main);
        rows.appendChild(row);
      });
      s2.appendChild(rows);
    }
    s2.appendChild(btn('btn btn-primary btn-wide', '＋ 親タスクを追加', function () {
      Task.promptAdd(null);
    }));

    /* データ */
    var s3 = section(host, 'データ');
    s3.appendChild(el('p', 'sheet-note',
      'タスクはお使いの端末のブラウザの中だけに保存されます。サーバーには何も送られません。' +
      'ブラウザのデータを消したり、機種を変えたりすると消えるので、ときどき書き出してください。'));
    s3.appendChild(btn('btn btn-wide', 'バックアップを保存（JSON）', backup));

    var restore = el('label', 'btn btn-wide btn-file');
    restore.appendChild(el('span', null, 'バックアップから復元'));
    var file = el('input');
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.addEventListener('change', function () { readBackup(file); });
    restore.appendChild(file);
    s3.appendChild(restore);

    s3.appendChild(btn('btn btn-danger btn-wide', 'すべて削除', function () {
      UI.confirmSheet('すべて削除しますか', 'この端末に入っているタスクを全部消します。',
        '削除する', function () {
          Store.clearAll();
          UI.toast('削除しました', '取り消す', function () { if (Store.undo()) UI.toast('戻しました'); });
        });
    }));

    /* このアプリについて */
    var s4 = section(host, 'ワケワケについて');
    s4.appendChild(el('p', 'sheet-note',
      '大きなタスクを、実行できる大きさになるまで分解して、' +
      '「いま」の一番上から手をつけるためのアプリです。' +
      'ブラウザだけで動くので、共有メニューから「ホーム画面に追加」を選ぶと、' +
      'アプリのように開けます。'));
  }

  function section(host, title) {
    var sec = el('section', 'group');
    sec.appendChild(el('div', 'group-head')).appendChild(el('span', 'group-name', title));
    host.appendChild(sec);
    return sec;
  }

  function backup() {
    var name = 'wakewake-' + UI.dateValue(Date.now()) + '.json';
    var blob = new Blob([Store.exportData()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function readBackup(input) {
    var f = input.files && input.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        Store.importData(String(reader.result));
        UI.toast('復元しました', '取り消す', function () { if (Store.undo()) UI.toast('戻しました'); });
      } catch (e) {
        UI.toast('読み込めませんでした（' + e.message + '）');
      }
      input.value = '';
    };
    reader.readAsText(f);
  }

  /* ── 起動 ─────────────────────────────── */

  function start() {
    Store.onError(function () {
      UI.toast('保存できませんでした。端末の空きが足りないかもしれません。');
    });
    Store.init();
    var saved = Store.settings().view;
    if (VIEWS.some(function (v) { return v.key === saved; })) current = saved;

    document.getElementById('fab').addEventListener('click', function () {
      var rootId = Store.settings().filterRootId;
      Task.promptAdd(current === 'tree' ? null : rootId);
    });

    Store.subscribe(render);
    render();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* 使えなくても動く */ });
      });
    }
  }

  return { start: start, go: go, render: render };
})();

document.addEventListener('DOMContentLoaded', App.start);
