/* ─────────────────────────────────────────
   app.js — 画面の切り替えと設定

   画面は「月」「仕分け」「明細」「イベント」「設定」の5枚。
   「月」と「明細」は、いま見ている月を共有する。
   ───────────────────────────────────────── */

var App = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;

  var VIEWS = [
    { key: 'month',  label: '月',       render: function (h) { MonthView.render(h, month); } },
    { key: 'sort',   label: '仕分け',   render: function (h) { SortView.render(h); } },
    { key: 'list',   label: '明細',     render: function (h) { ListView.render(h, month, filter); } },
    { key: 'events', label: 'イベント', render: function (h) { EventsView.render(h, eventId); } },
    { key: 'set',    label: '設定',     render: function (h) { renderSettings(h); } }
  ];

  var current = 'month';
  var month = null;        // いま見ている月 "YYYY-MM"。保存はしない（開くたびに最新の月から）
  var filter = {};         // 明細の絞り込み { cat, sub }
  var eventId = null;      // 開いているイベント。null なら一覧

  function go(key) {
    current = key;
    window.scrollTo(0, 0);           // 前の画面のスクロール位置を持ち込まない
    Store.setSetting('view', key);   // setSetting の中で再描画される
  }

  function showMonth(ym) {
    month = ym;
    render();
  }

  function openList(next) {
    filter = next || {};
    if (current === 'list') { window.scrollTo(0, 0); render(); }
    else go('list');
  }

  function openEvent(id) {
    eventId = id;
    if (current === 'events') { window.scrollTo(0, 0); render(); }
    else go('events');
  }

  /** 取り込んだ直後。入れたばかりの月を見せ、確認待ちがあれば仕分けへ進める */
  function afterImport(lastDate) {
    if (lastDate) month = Model.monthOf(lastDate);
    go(Model.queue().length ? 'sort' : 'month');
  }

  function view() { return VIEWS.filter(function (v) { return v.key === current; })[0] || VIEWS[0]; }

  /* ── 描画 ─────────────────────────────── */

  function render() {
    renderTabs();
    var host = document.getElementById('viewHost');
    host.className = 'view view-' + current;
    view().render(host);
    document.getElementById('fab').hidden = !(current === 'month' || current === 'list');
  }

  function renderTabs() {
    var bar = UI.clear(document.getElementById('tabbar'));
    var waiting = Model.queue().length;
    VIEWS.forEach(function (v) {
      var b = btn('tab' + (v.key === current ? ' on' : ''), '', function () {
        if (v.key === 'events') eventId = null;   // タブを押したら一覧から
        go(v.key);
      });
      b.appendChild(icon(v.key));
      b.appendChild(el('span', 'tab-label', v.label));
      if (v.key === 'sort' && waiting) {
        b.appendChild(el('span', 'tab-badge', waiting > 99 ? '99+' : String(waiting)));
      }
      bar.appendChild(b);
    });
  }

  /* ── タブのアイコン ─────────────────────
     絵文字や記号の文字は環境によって化けるので、その場でSVGを組む */

  var NS = 'http://www.w3.org/2000/svg';

  var SHAPES = {
    month:  [['rect', { x: 3.5, y: 11, width: 4.6, height: 9.5, rx: 1.4 }],
             ['rect', { x: 9.7, y: 4, width: 4.6, height: 16.5, rx: 1.4 }],
             ['rect', { x: 15.9, y: 8, width: 4.6, height: 12.5, rx: 1.4 }]],
    sort:   [['rect', { x: 3.5, y: 4, width: 17, height: 4, rx: 1.6 }],
             ['rect', { x: 3.5, y: 15, width: 4.4, height: 5, rx: 1.4 }],
             ['rect', { x: 9.8, y: 15, width: 4.4, height: 5, rx: 1.4 }],
             ['rect', { x: 16.1, y: 15, width: 4.4, height: 5, rx: 1.4 }],
             ['path', { d: 'M12 8v7M12 11.5H5.7V15M12 11.5h6.3V15', fill: 'none',
                        stroke: 'currentColor', 'stroke-width': 1.6 }]],
    list:   [['circle', { cx: 5, cy: 6.5, r: 1.7 }],
             ['circle', { cx: 5, cy: 12, r: 1.7 }],
             ['circle', { cx: 5, cy: 17.5, r: 1.7 }],
             ['rect', { x: 9, y: 5.4, width: 12, height: 2.2, rx: 1.1 }],
             ['rect', { x: 9, y: 10.9, width: 12, height: 2.2, rx: 1.1 }],
             ['rect', { x: 9, y: 16.4, width: 8, height: 2.2, rx: 1.1 }]],
    events: [['rect', { x: 5, y: 3, width: 2.2, height: 18, rx: 1.1 }],
             ['path', { d: 'M8.5 4.5h11l-3 4 3 4h-11z' }]],
    set:    [['rect', { x: 3, y: 5.4, width: 18, height: 2.2, rx: 1.1 }],
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

    var s1 = section(host, '取り込み');
    s1.appendChild(el('p', 'sheet-note',
      'ザイムの「ファイル入出力」から書き出したCSVを選びます。' +
      '同じ期間を重ねて取り込んでも、入っている明細は飛ばします。'));
    s1.appendChild(Csv.fileButton('btn btn-primary btn-wide', 'ザイムのCSVを取り込む'));

    var s2 = section(host, '分類');
    s2.appendChild(el('p', 'sheet-note', '大分類は3つで固定です。名前は変えられます。小分類は自由に足せます。'));
    Cats.renderSection(s2);
    s2.appendChild(btn('btn btn-wide', 'ザイムのカテゴリとの対応を見る', Cats.openMap));

    var s3 = section(host, 'データ');
    s3.appendChild(el('p', 'sheet-note',
      '明細はお使いの端末のブラウザの中だけに保存されます。サーバーには何も送られません。' +
      'ブラウザのデータを消したり、機種を変えたりすると消えるので、ときどき書き出してください。'));
    var box = el('div', 'kvs');
    box.appendChild(kv('明細', Store.recs().length + ' 件'));
    // ブラウザが1つのサイトに許す量は、機種によって250万〜500万文字ほど
    box.appendChild(kv('保存している量', '約 ' + (Math.round(Store.size() / 1000) / 10) + ' 万文字（上限の目安 250万）'));
    s3.appendChild(box);
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
      UI.confirmSheet('すべて削除しますか', 'この端末に入っている明細・分類・イベントを全部消します。',
        '削除する', function () {
          Store.clearAll();
          UI.undoToast('削除しました');
        });
    }));

    var s4 = section(host, 'ツカイミチについて');
    s4.appendChild(el('p', 'sheet-note',
      'ザイムに記録した支出を、推し活・生活・娯楽という自分の軸で見直すためのアプリです。' +
      'ブラウザだけで動くので、共有メニューから「ホーム画面に追加」を選ぶと、' +
      'アプリのように開けます。'));
  }

  function kv(k, v) {
    var row = el('div', 'kv');
    row.appendChild(el('span', 'kv-k', k));
    row.appendChild(el('span', 'kv-v', v));
    return row;
  }

  function section(host, title) {
    var sec = el('section', 'group');
    sec.appendChild(el('div', 'group-head')).appendChild(el('span', 'group-name', title));
    host.appendChild(sec);
    return sec;
  }

  function backup() {
    var name = 'tsukaimichi-' + UI.today() + '.json';
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
        pickMonth();
        render();
        UI.undoToast('復元しました');
      } catch (e) {
        UI.toast('読み込めませんでした（' + e.message + '）');
      }
      input.value = '';
    };
    reader.readAsText(f);
  }

  /* 今月に明細がなければ、明細のあるいちばん新しい月を出す。
     CSVは月が締まってから取り込むことが多く、今月を出すと空に見えてしまう */
  function pickMonth() {
    var now = UI.today().slice(0, 7);
    var months = Model.months();
    month = (months.length && months.indexOf(now) < 0) ? months[0] : now;
  }

  /* ── 起動 ─────────────────────────────── */

  function start() {
    Store.onError(function () {
      UI.toast('保存できませんでした。端末の空きが足りないかもしれません。');
    });
    Store.init();
    var saved = Store.settings().view;
    if (VIEWS.some(function (v) { return v.key === saved; })) current = saved;
    pickMonth();

    document.getElementById('fab').addEventListener('click', function () {
      // 過去の月を見ているときは、その月の日付から入力を始める
      var now = UI.today();
      Entry.add({ date: now.slice(0, 7) === month ? now : month + '-01' });
    });

    Store.subscribe(render);
    render();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* 使えなくても動く */ });
      });
    }
  }

  return {
    start: start, go: go, render: render,
    showMonth: showMonth, openList: openList, openEvent: openEvent, afterImport: afterImport
  };
})();

document.addEventListener('DOMContentLoaded', App.start);
