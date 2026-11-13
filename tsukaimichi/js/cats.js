/* ─────────────────────────────────────────
   cats.js — 分類まわりの部品と編集

   ・分類を選ぶチップ（明細の編集と、対応表の編集で同じものを使う）
   ・大分類の改名、小分類の追加・改名・付け替え・並べ替え・削除
   ・ザイムのカテゴリ → 分類 の対応表

   構造の編集は設定画面の中に置く。1枚目に出すのは金額で、構造ではない。
   ───────────────────────────────────────── */

var Cats = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;

  function dot(color) {
    var d = el('span', 'dot');
    d.style.background = color;
    return d;
  }

  /**
   * 大分類と小分類を選ぶチップ。value は { cat, sub }。
   * 選ぶたびに onChange(value) を呼ぶ。同じチップを押し直しても呼ぶ
   * （「いまの仮置きのままでよい」という確定の合図に使うため）。
   */
  function picker(host, value, onChange) {
    var wrap = el('div', 'picker');
    host.appendChild(wrap);

    function draw() {
      UI.clear(wrap);
      var majors = el('div', 'chips');
      Store.majors().forEach(function (m) {
        var on = value.cat === m.id;
        var c = btn('chip chip-cat' + (on ? ' on' : ''), '', function () {
          if (!on) value.sub = null;
          value.cat = m.id;
          draw();
          onChange(value);
        });
        c.style.setProperty('--c', m.color);
        c.appendChild(dot(m.color));
        c.appendChild(el('span', null, m.name));
        majors.appendChild(c);
      });
      wrap.appendChild(majors);

      if (!value.cat) return;
      var subs = Store.subsOf(value.cat);
      if (!subs.length) return;
      var row = el('div', 'chips chips-sub');
      row.appendChild(subChip('なし', null));
      subs.forEach(function (s) { row.appendChild(subChip(s.name, s.id)); });
      wrap.appendChild(row);
    }

    function subChip(name, id) {
      var on = (value.sub || null) === id;
      return btn('chip chip-sub' + (on ? ' on' : ''), name, function () {
        value.sub = id;
        draw();
        onChange(value);
      });
    }

    draw();
  }

  /* ── 設定画面：分類 ───────────────────── */

  function renderSection(host) {
    Store.majors().forEach(function (m) {
      var card = el('div', 'card');
      card.style.setProperty('--c', m.color);

      var head = el('div', 'row row-head');
      head.appendChild(dot(m.color));
      var main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', m.name));
      head.appendChild(main);
      head.appendChild(btn('minibtn', '名前を変える', function () { renameMajor(m); }));
      card.appendChild(head);

      Store.subsOf(m.id).forEach(function (s) {
        var row = el('div', 'row row-tap');
        var body = el('div', 'row-main');
        body.appendChild(el('div', 'row-title', s.name));
        row.appendChild(body);
        row.appendChild(el('span', 'row-arrow', '編集'));
        row.addEventListener('click', function () { editSub(s.id); });
        card.appendChild(row);
      });

      var add = el('div', 'row');
      add.appendChild(btn('linkbtn', '＋ 小分類を追加', function () { addSub(m); }));
      card.appendChild(add);
      host.appendChild(card);
    });
  }

  function nameSheet(title, value, okLabel, onOk) {
    UI.sheet(title, function (body, close) {
      var name = UI.field(body, '名前', UI.input('text', value));
      var row = el('div', 'sheet-actions');
      row.appendChild(btn('btn btn-ghost', 'やめる', close));
      row.appendChild(btn('btn btn-primary', okLabel, function () {
        if (!name.value.trim()) { name.focus(); return; }
        close();
        onOk(name.value);
      }));
      body.appendChild(row);
      setTimeout(function () { name.focus(); }, 250);
    });
  }

  function renameMajor(m) {
    nameSheet('大分類の名前', m.name, '保存', function (v) { Store.renameMajor(m.id, v); });
  }

  function addSub(m) {
    nameSheet(m.name + ' に小分類を追加', '', '追加', function (v) { Store.addSub(m.id, v); });
  }

  function editSub(id) {
    var s = Store.subById(id);
    if (!s) return;
    UI.sheet('小分類を編集', function (body, close) {
      var name = UI.field(body, '名前', UI.input('text', s.name));

      body.appendChild(el('div', 'field-label', '大分類'));
      var major = s.major;
      var chips = el('div', 'chips');
      function drawMajors() {
        UI.clear(chips);
        Store.majors().forEach(function (m) {
          var c = btn('chip chip-cat' + (major === m.id ? ' on' : ''), '', function () {
            major = m.id;
            drawMajors();
          });
          c.style.setProperty('--c', m.color);
          c.appendChild(dot(m.color));
          c.appendChild(el('span', null, m.name));
          chips.appendChild(c);
        });
      }
      drawMajors();
      body.appendChild(chips);
      body.appendChild(el('p', 'sheet-note', '大分類を変えると、この小分類に入っている明細も一緒に移ります。'));

      var grid = el('div', 'actions-grid');
      grid.appendChild(btn('btn btn-primary', '保存', function () {
        close();
        var moved = (major !== s.major);
        Store.updateSub(id, { name: name.value, major: major });
        if (moved) UI.undoToast('大分類を移しました');
      }));
      grid.appendChild(btn('btn', '上へ', function () { Store.moveSub(id, -1); }));
      grid.appendChild(btn('btn', '下へ', function () { Store.moveSub(id, 1); }));
      body.appendChild(grid);

      body.appendChild(btn('btn btn-danger btn-wide', 'この小分類を削除', function () {
        close();
        Store.removeSub(id);
        UI.undoToast('小分類を削除しました（明細は残ります）');
      }));
    });
  }

  /* ── 設定画面：ザイムとの対応表 ───────── */

  function mapLabel(e) {
    var m = e.cat ? Store.majorById(e.cat) : null;
    if (!m) return '未分類';
    var s = e.sub ? Store.subById(e.sub) : null;
    return (s ? m.name + '／' + s.name : m.name) + (e.ask ? '（毎回確かめる）' : '');
  }

  function openMap() {
    UI.sheet('ザイムのカテゴリとの対応', function (body) {
      var map = Store.mapping();
      var keys = Object.keys(map).sort();
      if (!keys.length) {
        body.appendChild(el('p', 'sheet-note', 'CSVを取り込むと、ザイムのカテゴリがここに並びます。'));
        return;
      }
      body.appendChild(el('p', 'sheet-note',
        'ザイムのカテゴリごとに、まずどこへ振り分けるかを決めます。' +
        '変えると、手で分類を決めていない明細がまとめて動きます。'));
      var rows = el('div', 'rows');
      keys.forEach(function (k) {
        var e = map[k];
        var row = el('div', 'row row-tap');
        var bar = el('span', 'bar');
        var m = e.cat ? Store.majorById(e.cat) : null;
        bar.style.background = m ? m.color : 'var(--line)';
        row.appendChild(bar);
        var main = el('div', 'row-main');
        main.appendChild(el('div', 'row-title', k.replace('/', '／')));
        main.appendChild(el('div', 'row-sub', '→ ' + mapLabel(e)));
        row.appendChild(main);
        row.addEventListener('click', function () { editMap(k); });
        rows.appendChild(row);
      });
      body.appendChild(rows);
    });
  }

  function editMap(key) {
    var e = Store.mapping()[key];
    if (!e) return;
    UI.sheet(key.replace('/', '／'), function (body, close) {
      body.appendChild(el('div', 'field-label', '振り分け先'));
      var value = { cat: e.cat, sub: e.sub };
      picker(body, value, function () {});

      var sw = el('label', 'switch');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = e.ask;
      sw.appendChild(cb);
      sw.appendChild(el('span', null, '仮置きにして、毎回「仕分け」で確かめる'));
      body.appendChild(sw);

      var sw2 = el('label', 'switch');
      var cb2 = el('input');
      cb2.type = 'checkbox';
      cb2.checked = !!e.ev;
      sw2.appendChild(cb2);
      sw2.appendChild(el('span', null, 'この明細が固まっている日を、イベントとして提案する'));
      body.appendChild(sw2);

      var row = el('div', 'sheet-actions');
      row.appendChild(btn('btn btn-ghost', '戻る', openMap));
      row.appendChild(btn('btn btn-primary', '保存', function () {
        var moved = Store.setMap(key, value.cat, value.sub, cb.checked, cb2.checked);
        openMap();
        UI.undoToast(moved ? moved + ' 件の明細を振り直しました' : '対応を変えました');
      }));
      body.appendChild(row);
    });
  }

  /* ── 設定画面：イベントの手がかりにする言葉 ── */

  var WORD_GROUPS = [
    ['ride', '新幹線', 'この言葉がある日は、現地にいた日とみなします。'],
    ['place', '関西以外の地名', 'お店の名前にこの地名があれば、その日は現地にいたとみなします。明細の末尾の（TOKYO）のような英字は見ません。'],
    ['book', '旅行サイト・チケットサイト', '払った日とイベントの日がずれるので、「予約・チケットの支払い」として別に並べます。']
  ];

  /* 1行に1つ。チップを1つずつ足すより、まとめて貼ったり消したりするほうが速い */
  function openWords() {
    UI.sheet('イベントの手がかりにする言葉', function (body, close) {
      body.appendChild(el('p', 'sheet-note',
        'お店・品目・メモにこの言葉が入っている明細を、イベントの提案の手がかりにします。1行に1つ。' +
        'ひらがなとカタカナ、全角と半角、小さい「ョ」と大きい「ヨ」は区別しません。'));
      var words = Store.words();
      var areas = {};
      WORD_GROUPS.forEach(function (g) {
        var a = UI.field(body, g[1], UI.input('area', words[g[0]].join('\n')));
        a.rows = 6;
        areas[g[0]] = a;
        body.appendChild(el('p', 'sheet-note', g[2]));
      });
      var row = el('div', 'sheet-actions');
      row.appendChild(btn('btn btn-ghost', '初期値に戻す', function () {
        close();
        Store.setWords(null);
        UI.undoToast('初期値に戻しました');
      }));
      row.appendChild(btn('btn btn-primary', '保存', function () {
        var next = {};
        WORD_GROUPS.forEach(function (g) { next[g[0]] = areas[g[0]].value.split('\n'); });
        close();
        Store.setWords(next);
        UI.undoToast('保存しました');
      }));
      body.appendChild(row);
    });
  }

  return { dot: dot, picker: picker, renderSection: renderSection, openMap: openMap, openWords: openWords };
})();
