/* ─────────────────────────────────────────
   store.js — データ層（localStorage）

   タスク1件のかたち。親も子も同じ形で、parentId で木をつなぐ。

     {
       id, parentId, rootId, title, due, done, ownDone,
       order, memo, collapsed, createdAt, updatedAt
     }

     - parentId が null ならルート（＝親タスク）。ルートだけ color を持つ
     - due は null なら「子から自動算出」、値が入っていれば手入力での上書き
       （epoch ミリ秒。その日の 0:00 に丸めて持つ）
     - done は葉タスクの完了。枝タスクの完了は子から自動で決まる（model.js）
     - ownDone が true の枝は「子が全部終わっても自分の完了が要る」

   保存先は端末のブラウザ内だけ。サーバーには何も送らない。
   ───────────────────────────────────────── */

var Store = (function () {
  'use strict';

  var KEY = 'wake.v1';     // 既存アプリ（actionlog.v1）とは別の名前空間
  var VERSION = 1;

  /* 親タスクの色。並んだときに見分けやすい8色 */
  var PALETTE = [
    '#3f7fb5', '#2f8f78', '#c9584f', '#c08a3e',
    '#8a72a8', '#5a9367', '#a05d7a', '#6b7a8f'
  ];

  var state = null;
  var listeners = [];
  var undoStack = [];      // 取り消し用のスナップショット（1件だけ持つ）

  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function blank() {
    return {
      version: VERSION,
      tasks: [],
      settings: { showDone: false, filterRootId: null, view: 'now' }
    };
  }

  /**
   * 古い世代のデータを、消さずに足りないものだけ補って読み込む。
   * 今は VERSION 1 しかないが、後から項目が増えたときにここで面倒を見る。
   */
  function migrate(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var out = blank();
    if (Array.isArray(s.tasks)) {
      out.tasks = s.tasks.map(function (t) {
        return {
          id:        t.id || uid(),
          parentId:  t.parentId || null,
          rootId:    t.rootId || null,
          title:     String(t.title == null ? '' : t.title),
          due:       (typeof t.due === 'number') ? t.due : null,
          done:      !!t.done,
          ownDone:   !!t.ownDone,
          order:     (typeof t.order === 'number') ? t.order : 0,
          memo:      String(t.memo == null ? '' : t.memo),
          collapsed: !!t.collapsed,
          color:     t.color || null,
          createdAt: t.createdAt || Date.now(),
          updatedAt: t.updatedAt || Date.now()
        };
      });
    }
    if (s.settings && typeof s.settings === 'object') {
      if (typeof s.settings.showDone === 'boolean') out.settings.showDone = s.settings.showDone;
      if (typeof s.settings.filterRootId === 'string') out.settings.filterRootId = s.settings.filterRootId;
      if (typeof s.settings.view === 'string') out.settings.view = s.settings.view;
    }
    out.version = VERSION;
    return out;
  }

  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { raw = null; }
    state = raw ? migrate(raw) : blank();
    reindex();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // 容量超過など。保存できなかったことは黙って握りつぶさず、画面側に伝える
      notifyError(e);
    }
  }

  var errorHandler = null;
  function onError(fn) { errorHandler = fn; }
  function notifyError(e) { if (errorHandler) errorHandler(e); }

  function notify() {
    listeners.forEach(function (fn) { fn(); });
  }

  function commit() {
    reindex();
    save();
    notify();
  }

  /* ── 木の整合をとる ───────────────────────
     ・親をたどって rootId を振り直す
     ・迷子（親が消えている）はルートに昇格させる
     ・きょうだいの order を 0,1,2… に詰め直す
     ・ルートには色を必ず持たせ、ルート以外の色は落とす
     ───────────────────────────────────────── */
  function reindex() {
    var tasks = state.tasks;
    var byId = {};
    tasks.forEach(function (t) { byId[t.id] = t; });

    tasks.forEach(function (t) {
      if (t.parentId && !byId[t.parentId]) t.parentId = null;
    });

    // 親をたどって rootId を決める（循環していたらその場でルートに切り離す）
    tasks.forEach(function (t) {
      var seen = {}, cur = t;
      while (cur.parentId) {
        if (seen[cur.id]) { cur.parentId = null; break; }
        seen[cur.id] = true;
        var p = byId[cur.parentId];
        if (!p) { cur.parentId = null; break; }
        cur = p;
      }
      t.rootId = cur.id;
    });

    // きょうだいごとに order を詰め直す
    var groups = {};
    tasks.forEach(function (t) {
      var k = t.parentId || '#root';
      (groups[k] = groups[k] || []).push(t);
    });
    Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (a, b) {
        return (a.order - b.order) || (a.createdAt - b.createdAt);
      }).forEach(function (t, i) { t.order = i; });
    });

    // 色はルートだけが持つ
    var used = 0;
    tasks.forEach(function (t) {
      if (t.parentId) { t.color = null; return; }
      if (!t.color) t.color = PALETTE[used % PALETTE.length];
      used++;
    });

    // フィルタの対象が消えていたら「すべて」に戻す
    var f = state.settings.filterRootId;
    if (f && !(byId[f] && !byId[f].parentId)) state.settings.filterRootId = null;
  }

  /* ── 取り消し ─────────────────────────── */

  function pushUndo(label) {
    undoStack = [{ label: label, tasks: JSON.parse(JSON.stringify(state.tasks)) }];
  }

  function undo() {
    var snap = undoStack.pop();
    if (!snap) return false;
    state.tasks = snap.tasks;
    commit();
    return true;
  }

  function canUndo() { return undoStack.length > 0; }

  /* ── 読み出し ─────────────────────────── */

  function all() { return state.tasks; }

  function byId(id) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  /* ── 追加・更新・削除 ─────────────────── */

  function nextOrder(parentId) {
    var max = -1;
    state.tasks.forEach(function (t) {
      if ((t.parentId || null) === (parentId || null) && t.order > max) max = t.order;
    });
    return max + 1;
  }

  function make(parentId, title) {
    var now = Date.now();
    return {
      id: uid(), parentId: parentId || null, rootId: null,
      title: String(title || '').trim(), due: null, done: false, ownDone: false,
      order: nextOrder(parentId), memo: '', collapsed: false, color: null,
      createdAt: now, updatedAt: now
    };
  }

  function addRoot(title) {
    var t = make(null, title);
    state.tasks.push(t);
    commit();
    return t.id;
  }

  function addChild(parentId, title) {
    var t = make(parentId, title);
    state.tasks.push(t);
    var p = byId(parentId);
    if (p) p.collapsed = false;   // 追加した子が隠れていては意味がない
    commit();
    return t.id;
  }

  /** 改行区切りの一括追加。空行は捨てる */
  function addChildren(parentId, titles) {
    var made = [];
    titles.forEach(function (s) {
      var title = String(s || '').trim();
      if (!title) return;
      var t = make(parentId, title);
      t.order = nextOrder(parentId) + made.length;
      state.tasks.push(t);
      made.push(t.id);
    });
    if (!made.length) return [];
    var p = byId(parentId);
    if (p) p.collapsed = false;
    commit();
    return made;
  }

  function update(id, patch) {
    var t = byId(id);
    if (!t) return;
    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    t.updatedAt = Date.now();
    commit();
  }

  /** id とその子孫をすべて集める */
  function subtreeIds(id) {
    var out = [id], i = 0;
    while (i < out.length) {
      var cur = out[i++];
      state.tasks.forEach(function (t) {
        if (t.parentId === cur) out.push(t.id);
      });
    }
    return out;
  }

  function remove(id) {
    var t = byId(id);
    if (!t) return;
    pushUndo('削除');
    var kill = {};
    subtreeIds(id).forEach(function (x) { kill[x] = true; });
    state.tasks = state.tasks.filter(function (x) { return !kill[x.id]; });
    commit();
  }

  /** 配下の葉タスクをまとめて完了／未完了にする（枝のチェックを押したとき） */
  function setSubtreeDone(id, done) {
    pushUndo(done ? 'まとめて完了' : 'まとめて未完了');
    var ids = subtreeIds(id);
    var childOf = {};
    state.tasks.forEach(function (t) { if (t.parentId) childOf[t.parentId] = true; });
    ids.forEach(function (x) {
      var t = byId(x);
      if (!t) return;
      if (!childOf[x] || t.ownDone) { t.done = done; t.updatedAt = Date.now(); }
    });
    commit();
  }

  /** きょうだいの中で上下に動かす */
  function moveVert(id, dir) {
    var t = byId(id);
    if (!t) return;
    var sibs = state.tasks.filter(function (x) {
      return (x.parentId || null) === (t.parentId || null);
    }).sort(function (a, b) { return a.order - b.order; });
    var i = sibs.indexOf(t), j = i + dir;
    if (i < 0 || j < 0 || j >= sibs.length) return;
    var o = sibs[i].order; sibs[i].order = sibs[j].order; sibs[j].order = o;
    commit();
  }

  /** 降格（一つ上のきょうだいの子にする） */
  function indent(id) {
    var t = byId(id);
    if (!t) return;
    var sibs = state.tasks.filter(function (x) {
      return (x.parentId || null) === (t.parentId || null);
    }).sort(function (a, b) { return a.order - b.order; });
    var i = sibs.indexOf(t);
    if (i <= 0) return;
    var newParent = sibs[i - 1];
    t.parentId = newParent.id;
    t.order = nextOrder(newParent.id);
    newParent.collapsed = false;
    commit();
  }

  /** 昇格（親のきょうだいにする。深さ1なら独立した親タスクになる） */
  function outdent(id) {
    var t = byId(id);
    if (!t || !t.parentId) return;
    var p = byId(t.parentId);
    if (!p) return;
    t.parentId = p.parentId || null;
    t.order = p.order + 0.5;   // 親のすぐ下に置く（reindex で詰め直される）
    commit();
  }

  /* ── 設定 ─────────────────────────────── */

  function settings() { return state.settings; }

  function setSetting(k, v) {
    state.settings[k] = v;
    save();
    notify();
  }

  /* ── 書き出し・読み込み ───────────────── */

  function exportData() {
    return JSON.stringify(state, null, 2);
  }

  function importData(text) {
    var raw = JSON.parse(text);        // 壊れていれば例外。呼び出し側で受ける
    if (!raw || !Array.isArray(raw.tasks)) throw new Error('タスクが入っていません');
    pushUndo('復元');
    state = migrate(raw);
    commit();
  }

  function clearAll() {
    pushUndo('全消去');
    state.tasks = [];
    commit();
  }

  return {
    PALETTE: PALETTE,
    init: load,
    subscribe: function (fn) { listeners.push(fn); },
    onError: onError,
    all: all, byId: byId, subtreeIds: subtreeIds,
    addRoot: addRoot, addChild: addChild, addChildren: addChildren,
    update: update, remove: remove, setSubtreeDone: setSubtreeDone,
    moveVert: moveVert, indent: indent, outdent: outdent,
    settings: settings, setSetting: setSetting,
    exportData: exportData, importData: importData, clearAll: clearAll,
    pushUndo: pushUndo, undo: undo, canUndo: canUndo
  };
})();
