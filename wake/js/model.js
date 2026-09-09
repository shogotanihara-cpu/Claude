/* ─────────────────────────────────────────
   model.js — 木の計算

   このアプリの考え方の中心は「葉タスク＝それ以上分解されていない末端＝
   いま実行できる単位」。画面はどれも、この計算結果の見せ方を変えたもの。

     期限 … 手入力があればそれ。なければ子の中で最も遅い期限（自動）
     完了 … 葉は自分の done。枝は子が全部完了したら完了（自動）
            ownDone が立っている枝だけは、加えて自分の done も要る

   Store が変わるたびに計算結果を捨てて、次に聞かれたときに作り直す。
   ───────────────────────────────────────── */

var Model = (function () {
  'use strict';

  var cache = null;

  function fresh() {
    return { byId: null, byParent: null, due: {}, done: {}, prog: {} };
  }
  function invalidate() { cache = fresh(); }
  invalidate();

  function idx() {
    if (cache.byId) return cache;
    var byId = {}, byParent = { '#root': [] };
    Store.all().forEach(function (t) {
      byId[t.id] = t;
      var k = t.parentId || '#root';
      (byParent[k] = byParent[k] || []).push(t);
    });
    Object.keys(byParent).forEach(function (k) {
      byParent[k].sort(function (a, b) { return a.order - b.order; });
    });
    cache.byId = byId;
    cache.byParent = byParent;
    return cache;
  }

  function get(id) { return idx().byId[id] || null; }
  function children(id) { return idx().byParent[id || '#root'] || []; }
  function roots() { return children(null); }
  function isLeaf(id) { return children(id).length === 0; }

  /** 期限。手入力があればそれ、なければ子の中で最も遅いもの。なければ null */
  function due(id) {
    if (id in cache.due) return cache.due[id];
    cache.due[id] = null;                   // 途中で自分を参照しても止まるように
    var t = get(id);
    if (!t) return null;
    var v = null;
    if (t.due != null) {
      v = t.due;
    } else {
      children(id).forEach(function (c) {
        var d = due(c.id);
        if (d != null && (v == null || d > v)) v = d;
      });
    }
    cache.due[id] = v;
    return v;
  }

  /** その期限が自動算出かどうか（バッジ表示用） */
  function dueIsAuto(id) {
    var t = get(id);
    return !!t && t.due == null && due(id) != null;
  }

  /** 完了しているか */
  function done(id) {
    if (id in cache.done) return cache.done[id];
    cache.done[id] = false;
    var t = get(id);
    if (!t) return false;
    var kids = children(id);
    var v;
    if (!kids.length) {
      v = !!t.done;
    } else {
      v = kids.every(function (c) { return done(c.id); });
      if (v && t.ownDone) v = !!t.done;
    }
    cache.done[id] = v;
    return v;
  }

  /** 配下の葉タスクの「完了数／全数」。進み具合の表示に使う */
  function progress(id) {
    if (id in cache.prog) return cache.prog[id];
    var out = { done: 0, total: 0 };
    cache.prog[id] = out;
    var kids = children(id);
    if (!kids.length) {
      out.total = 1;
      out.done = done(id) ? 1 : 0;
    } else {
      kids.forEach(function (c) {
        var p = progress(c.id);
        out.done += p.done;
        out.total += p.total;
      });
    }
    return out;
  }

  function depth(id) {
    var n = 0, t = get(id);
    while (t && t.parentId) { n++; t = get(t.parentId); }
    return n;
  }

  /** 祖先のタイトル（ルート → 直近の親）。「いま」画面のパンくずに使う */
  function ancestors(id) {
    var out = [], t = get(id);
    while (t && t.parentId) {
      t = get(t.parentId);
      if (t) out.unshift(t);
    }
    return out;
  }

  function rootOf(id) {
    var t = get(id);
    return t ? get(t.rootId) : null;
  }

  function colorOf(id) {
    var r = rootOf(id);
    return r && r.color ? r.color : '#6b7a8f';
  }

  /* ── 画面が使う集合 ───────────────────── */

  /** いま手をつけられる葉タスク。期限が近い順、期限なしは末尾 */
  function actionable(rootId, includeDone) {
    var out = [];
    Store.all().forEach(function (t) {
      if (!isLeaf(t.id)) return;
      if (rootId && t.rootId !== rootId) return;
      if (!includeDone && done(t.id)) return;
      out.push(t);
    });
    return sortByDue(out);
  }

  /**
   * 期限一覧・カレンダーに出す集合。
   * 葉タスクに加えて、期限を手で入れた枝タスク（＝節目）も出す。
   * 枝の自動期限まで出すと、同じ日付が親子で二重に並んでしまうため。
   */
  function dated(rootId, includeDone) {
    var out = [];
    Store.all().forEach(function (t) {
      var leaf = isLeaf(t.id);
      if (!leaf && t.due == null) return;
      if (rootId && t.rootId !== rootId) return;
      if (!includeDone && done(t.id)) return;
      out.push(t);
    });
    return sortByDue(out);
  }

  function sortByDue(list) {
    return list.sort(function (a, b) {
      var da = due(a.id), db = due(b.id);
      if (da == null && db == null) return cmpTree(a, b);
      if (da == null) return 1;
      if (db == null) return -1;
      if (da !== db) return da - db;
      return cmpTree(a, b);
    });
  }

  /** 同じ期限のときは、木の並び（ルート順 → 深さ → 並び順）でそろえる */
  function cmpTree(a, b) {
    var ra = get(a.rootId), rb = get(b.rootId);
    var oa = ra ? ra.order : 0, ob = rb ? rb.order : 0;
    if (oa !== ob) return oa - ob;
    if (a.rootId !== b.rootId) return a.rootId < b.rootId ? -1 : 1;
    var da = depth(a.id), db = depth(b.id);
    if (da !== db) return da - db;
    return a.order - b.order;
  }

  Store.subscribe(invalidate);

  return {
    invalidate: invalidate,
    get: get, children: children, roots: roots, isLeaf: isLeaf,
    due: due, dueIsAuto: dueIsAuto, done: done, progress: progress,
    depth: depth, ancestors: ancestors, rootOf: rootOf, colorOf: colorOf,
    actionable: actionable, dated: dated, sortByDue: sortByDue
  };
})();
