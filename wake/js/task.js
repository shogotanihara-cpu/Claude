/* ─────────────────────────────────────────
   task.js — タスク1件に対する操作（追加・編集・完了）

   どの画面からも同じシートが開くようにして、覚えることを1つにする。
   ───────────────────────────────────────── */

var Task = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;

  /* ── 完了の切り替え ───────────────────── */

  /**
   * 葉タスクはそのまま反転。枝タスクは配下の葉をまとめて反転する。
   * （枝の完了は自動で決まるので、枝を直接いじる代わりに中身を動かす）
   */
  function toggle(id) {
    var t = Model.get(id);
    if (!t) return;
    var now = Model.done(id);
    if (Model.isLeaf(id)) {
      Store.pushUndo('完了');
      Store.update(id, { done: !now });
      if (!now) UI.toast('「' + short(t.title) + '」を完了にしました', '取り消す', undo);
    } else {
      Store.setSubtreeDone(id, !now);
      UI.toast(!now
        ? '「' + short(t.title) + '」を配下ごと完了にしました'
        : '「' + short(t.title) + '」を未完了に戻しました', '取り消す', undo);
    }
  }

  function undo() {
    if (Store.undo()) UI.toast('取り消しました');
  }

  function short(s) {
    s = String(s || '');
    return s.length > 14 ? s.slice(0, 14) + '…' : s;
  }

  /* ── 追加（1行に1つ。まとめて入れられる） ── */

  function promptAdd(parentId) {
    var parent = parentId ? Model.get(parentId) : null;
    var title = parent ? '「' + short(parent.title) + '」を分解する' : '親タスクを追加';

    UI.sheet(title, function (body, close) {
      body.appendChild(el('p', 'sheet-note',
        parent ? '1行に1つ。思いつくままに書くと、まとめて子タスクになります。'
               : '1行に1つ。あとからいくらでも分解できます。'));

      var ta = el('textarea', 'input input-area');
      ta.rows = 5;
      ta.placeholder = parent ? '書類をそろえる\n記入する\n投函する' : '確定申告を出す';
      body.appendChild(ta);

      var row = el('div', 'sheet-actions');
      row.appendChild(btn('btn btn-ghost', 'やめる', close));
      row.appendChild(btn('btn btn-primary', '追加', function () {
        var lines = ta.value.split('\n');
        var made = parentId ? Store.addChildren(parentId, lines) : addRoots(lines);
        close();
        if (made.length) UI.toast(made.length + '件を追加しました');
      }));
      body.appendChild(row);

      setTimeout(function () { ta.focus(); }, 60);
    });
  }

  function addRoots(lines) {
    var made = [];
    lines.forEach(function (s) {
      var title = String(s || '').trim();
      if (title) made.push(Store.addRoot(title));
    });
    return made;
  }

  /* ── 編集シート ───────────────────────── */

  function open(id) {
    var t = Model.get(id);
    if (!t) return;
    var isRoot = !t.parentId;
    var leaf = Model.isLeaf(id);

    UI.sheet(leaf ? 'タスク' : (isRoot ? '親タスク' : '中くらいのタスク'), function (body, close) {
      /* どの木のどこにいるか */
      var path = Model.ancestors(id).map(function (a) { return a.title; });
      if (path.length) {
        var bc = el('p', 'sheet-path');
        bc.appendChild(dot(Model.colorOf(id)));
        bc.appendChild(el('span', null, path.join(' › ')));
        body.appendChild(bc);
      }

      /* タイトル */
      var name = el('input', 'input');
      name.type = 'text';
      name.value = t.title;
      name.addEventListener('change', function () {
        var v = name.value.trim();
        if (v) Store.update(id, { title: v });
      });
      body.appendChild(label('やること'));
      body.appendChild(name);

      /* 期限 */
      body.appendChild(label('期限'));
      var auto = Model.dueIsAuto(id);
      var quick = el('div', 'chips');
      [
        { text: '今日',   at: function () { return UI.today(); } },
        { text: '明日',   at: function () { return UI.addDays(UI.today(), 1); } },
        { text: '今週末', at: nextSaturday },
        { text: '来週',   at: nextMonday }
      ].forEach(function (q) {
        quick.appendChild(btn('chip', q.text, function () {
          setDue(id, q.at());
          close(); open(id);
        }));
      });
      quick.appendChild(btn('chip chip-off', 'なし', function () {
        setDue(id, null); close(); open(id);
      }));
      body.appendChild(quick);

      var dateIn = el('input', 'input');
      dateIn.type = 'date';
      dateIn.value = t.due != null ? UI.dateValue(t.due) : '';
      dateIn.addEventListener('change', function () {
        setDue(id, UI.parseDateValue(dateIn.value));
        close(); open(id);
      });
      body.appendChild(dateIn);

      if (auto) {
        body.appendChild(el('p', 'sheet-note',
          '自動：' + UI.fmtDate(Model.due(id)) + '（子タスクのうち、いちばん遅い期限）。' +
          'ここに日付を入れると、そちらが優先されます。'));
      }

      /* メモ */
      body.appendChild(label('メモ'));
      var memo = el('textarea', 'input input-area');
      memo.rows = 2;
      memo.value = t.memo;
      memo.addEventListener('change', function () { Store.update(id, { memo: memo.value }); });
      body.appendChild(memo);

      /* 親タスクの色 */
      if (isRoot) {
        body.appendChild(label('色'));
        var sw = el('div', 'swatches');
        Store.PALETTE.forEach(function (c) {
          var b = btn('swatch' + (c === t.color ? ' on' : ''), '', function () {
            Store.update(id, { color: c }); close(); open(id);
          });
          b.style.background = c;
          b.setAttribute('aria-label', '色を変える');
          sw.appendChild(b);
        });
        body.appendChild(sw);
      }

      /* 枝タスクの完了の決め方 */
      if (!leaf) {
        var p = Model.progress(id);
        body.appendChild(label('完了'));
        body.appendChild(el('p', 'sheet-note',
          '子タスク ' + p.done + '／' + p.total + ' 完了。' +
          (t.ownDone ? '自分でも完了にする設定です。' : '子が全部終わると自動で完了になります。')));
        var sw2 = el('label', 'switch');
        var cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !!t.ownDone;
        cb.addEventListener('change', function () {
          Store.update(id, { ownDone: cb.checked }); close(); open(id);
        });
        sw2.appendChild(cb);
        sw2.appendChild(el('span', null, '子が全部終わっても、自分で完了にする'));
        body.appendChild(sw2);
      }

      /* 操作 */
      body.appendChild(label('操作'));
      var acts = el('div', 'actions-grid');
      acts.appendChild(btn('btn btn-primary', '＋ 分解する', function () {
        close(); promptAdd(id);
      }));
      acts.appendChild(btn('btn', Model.done(id) ? '未完了に戻す' : '完了にする', function () {
        close(); toggle(id);
      }));
      acts.appendChild(btn('btn', '↑ 上へ', function () { Store.moveVert(id, -1); close(); }));
      acts.appendChild(btn('btn', '↓ 下へ', function () { Store.moveVert(id, 1); close(); }));
      if (!isRoot) {
        acts.appendChild(btn('btn', '⇤ ひとつ上の階層へ', function () { Store.outdent(id); close(); }));
      }
      acts.appendChild(btn('btn', '⇥ ひとつ下の階層へ', function () { Store.indent(id); close(); }));
      body.appendChild(acts);

      var n = Store.subtreeIds(id).length - 1;
      body.appendChild(btn('btn btn-danger btn-wide', '削除', function () {
        close();
        UI.confirmSheet('削除しますか', '「' + t.title + '」' +
          (n > 0 ? 'と、その中の ' + n + ' 件' : '') + 'を削除します。',
          '削除する', function () {
            Store.remove(id);
            UI.toast('削除しました', '取り消す', undo);
          });
      }));
    });
  }

  function setDue(id, ts) {
    Store.update(id, { due: ts });
  }

  /** 今週末＝直近の土曜（今日が土曜なら今日） */
  function nextSaturday() {
    var t = UI.today(), wd = new Date(t).getDay();
    return UI.addDays(t, (6 - wd + 7) % 7);
  }

  /** 来週＝次の月曜（今日が月曜なら7日後） */
  function nextMonday() {
    var t = UI.today(), wd = new Date(t).getDay();
    var n = (8 - wd) % 7;
    return UI.addDays(t, n === 0 ? 7 : n);
  }

  /* ── 部品 ─────────────────────────────── */

  function label(text) { return el('div', 'field-label', text); }

  function dot(color) {
    var d = el('span', 'dot');
    d.style.background = color;
    return d;
  }

  /** 期限バッジ。自動算出のときは薄く出す */
  function dueBadge(id) {
    var d = Model.due(id);
    var info = UI.dueLabel(d);
    if (d == null) return null;
    var b = el('span', 'due due-' + info.tone + (Model.dueIsAuto(id) ? ' due-auto' : ''), info.text);
    if (Model.dueIsAuto(id)) b.title = '子タスクから自動で決まった期限';
    return b;
  }

  /** チェックボックス。枝タスクは「自動」であることが分かる見た目にする */
  function checkbox(id) {
    var isDone = Model.done(id);
    var leaf = Model.isLeaf(id);
    var b = btn('check' + (isDone ? ' on' : '') + (leaf ? '' : ' check-auto'),
      isDone ? '✓' : '', function (ev) {
        ev.stopPropagation();
        toggle(id);
      });
    b.setAttribute('aria-label', isDone ? '未完了に戻す' : '完了にする');
    return b;
  }

  return {
    toggle: toggle, open: open, promptAdd: promptAdd,
    dueBadge: dueBadge, checkbox: checkbox, dot: dot, short: short
  };
})();
