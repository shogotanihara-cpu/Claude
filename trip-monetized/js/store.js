/* ─────────────────────────────────────────
   store.js — データ層（localStorage）

   旅行1件のかたち。旅行が予定と持ちものを丸ごと抱える。

     {
       id, title, start, end,        // start/end は "YYYY-MM-DD"
       items: [ 予定 ],
       gear:  [ 持ちもの ],
       gearCats: [ "貴重品", ... ],  // 持ちものカテゴリの並び順そのもの
       createdAt, updatedAt
     }

   予定1件。

     { id, kind, cat, title, day, time, dur, cost, place, memo }

     - kind は 'span'（期間）か 'point'（時刻だけ）。開場・開演のように
       「その時刻であること」自体が情報の予定を point にする
     - day と time が両方 null なら「行き先候補」。まだ時刻を決めていない
       行きたい場所で、あとから空いている時間帯に置く
     - dur は分。point では常に 0

   持ちもの1件。

     { id, name, cat, done, linkId }

     - linkId は予定のid。「開場 で使う」のように予定と結びつける
     - cat が gearCats に無い名前なら「その他」の扱いになる（カテゴリを
       消しても持ちものは消えない）

   保存先は端末のブラウザ内だけ。サーバーには何も送らない。

   これは収益版モックアップ。保存キーは本物のシオリ（trip.v1）とは別にして
   ある。同じオリジンで両方を開いても localStorage 上は完全に別物として
   扱われ、互いのデータには一切触れない。
   ───────────────────────────────────────── */

var Store = (function () {
  'use strict';

  var KEY = 'tripmonetized.v1';   // 本物のシオリ（trip.v1）とは別の名前空間
  var VERSION = 1;

  /* 持ちものカテゴリの初期値。遠征を想定した並び */
  var DEFAULT_GEAR_CATS = ['貴重品', '現場グッズ', '電子機器', '衣類', '現地で買う'];

  var state = null;
  var listeners = [];
  var undoSnapshot = null;   // 取り消し用。直前の1件だけ持つ

  /* データ層が表示層に依存しないよう、日付の道具はここにも小さく持つ。
     ui.js の同名関数と揃えてあるが、読み込み順に縛られたくないので分けている。 */
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function blank() {
    return { version: VERSION, trips: [], currentId: null };
  }

  /* ── 読み込みと世代移行 ───────────────────────── */

  /* 既存の記録は消さず、足りないものを足すだけ。
     世代が上がっても、古い端末で書かれたデータをそのまま開けるようにする。 */
  function migrate(raw) {
    var s = (raw && typeof raw === 'object') ? raw : {};
    var out = blank();

    out.trips = Array.isArray(s.trips) ? s.trips.map(normalizeTrip) : [];
    out.currentId = s.currentId || null;

    if (!out.trips.length) out.trips.push(newTripObject('新しい旅行'));
    if (!findTrip(out.trips, out.currentId)) out.currentId = pickDefault(out.trips).id;

    out.version = VERSION;
    return out;
  }

  function normalizeTrip(t, n) {
    var o = (t && typeof t === 'object') ? t : {};
    var start = o.start || today();
    var end = o.end || start;
    return {
      id: o.id || uid('p'),
      title: o.title || ('旅行' + (n + 1)),
      start: start,
      end: (end < start) ? start : end,
      items: Array.isArray(o.items) ? o.items.map(normalizeItem) : [],
      gear: Array.isArray(o.gear) ? o.gear.map(normalizeGear) : [],
      gearCats: (Array.isArray(o.gearCats) && o.gearCats.length)
        ? o.gearCats.filter(function (c) { return typeof c === 'string' && c.trim(); })
        : DEFAULT_GEAR_CATS.slice(),
      createdAt: o.createdAt || Date.now(),
      updatedAt: o.updatedAt || Date.now()
    };
  }

  function normalizeItem(i, n) {
    var o = (i && typeof i === 'object') ? i : {};
    var kind = (o.kind === 'point') ? 'point' : 'span';
    var day = o.day || null;
    return {
      id: o.id || uid('i'),
      kind: kind,
      cat: o.cat || 'etc',
      title: o.title || '（無題）',
      day: day,
      time: day ? (o.time || '09:00') : null,
      dur: (kind === 'point') ? 0 : Math.max(0, +o.dur || 0),
      cost: Math.max(0, +o.cost || 0),
      place: o.place || '',
      memo: o.memo || ''
    };
  }

  function normalizeGear(g, n) {
    var o = (g && typeof g === 'object') ? g : {};
    return {
      id: o.id || uid('g'),
      name: o.name || '（無題）',
      cat: o.cat || 'その他',
      done: !!o.done,
      linkId: o.linkId || null
    };
  }

  function newTripObject(title) {
    var d = today();
    return {
      id: uid('p'),
      title: title || '新しい旅行',
      start: d,
      end: d,
      items: [],
      gear: [],
      gearCats: DEFAULT_GEAR_CATS.slice(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function findTrip(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* 開く旅行を決める。今日が期間に入っているもの → 次に近いこれから →
     いちばん新しい記録、の順。旅行が増えたとき毎回選び直させないため。 */
  function pickDefault(list) {
    var t = today();
    var during = list.filter(function (x) { return x.start <= t && x.end >= t; });
    if (during.length) return during[0];
    var future = list.filter(function (x) { return x.start > t; })
      .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    if (future.length) return future[0];
    return list.slice().sort(function (a, b) { return a.start > b.start ? -1 : 1; })[0];
  }

  /* ── 保存 ───────────────────────── */

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* 容量超過やプライベートモード。画面は動かしたままにしたいので握りつぶす */
    }
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) listeners[i]();
  }

  function commit() {
    var t = current();
    if (t) t.updatedAt = Date.now();
    persist();
    emit();
  }

  /* 取り消せるようにする。破壊的な操作の前にだけ呼ぶ */
  function snapshot() {
    undoSnapshot = JSON.stringify(state);
  }

  /* ── 公開する操作 ───────────────────────── */

  function init() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    state = migrate(raw);
    persist();
  }

  function onChange(fn) { listeners.push(fn); }

  function trips() { return state.trips; }

  function current() { return findTrip(state.trips, state.currentId); }

  function setCurrent(id) {
    if (!findTrip(state.trips, id)) return;
    state.currentId = id;
    commit();
  }

  function addTrip(title) {
    var t = newTripObject(title);
    state.trips.push(t);
    state.currentId = t.id;
    commit();
    return t.id;
  }

  function updateTrip(id, patch) {
    var t = findTrip(state.trips, id);
    if (!t) return;
    for (var k in patch) if (patch.hasOwnProperty(k)) t[k] = patch[k];
    if (t.end < t.start) t.end = t.start;
    commit();
  }

  function removeTrip(id) {
    snapshot();
    state.trips = state.trips.filter(function (t) { return t.id !== id; });
    if (!state.trips.length) state.trips.push(newTripObject('新しい旅行'));
    if (!findTrip(state.trips, state.currentId)) state.currentId = pickDefault(state.trips).id;
    commit();
  }

  /* 予定の追加と更新をひとつにまとめる。idがあれば置き換え、なければ足す */
  function saveItem(item) {
    var t = current();
    if (!t) return null;
    var body = normalizeItem(item);
    var hit = false;
    t.items = t.items.map(function (i) {
      if (i.id !== body.id) return i;
      hit = true;
      return body;
    });
    if (!hit) t.items.push(body);
    commit();
    return body.id;
  }

  function removeItem(id) {
    var t = current();
    if (!t) return;
    snapshot();
    t.items = t.items.filter(function (i) { return i.id !== id; });
    /* 予定が消えたら、それに紐づいた持ちものの結びつきも外す。
       画面側で気をつける作りにせず、データ層で整合を保つ。 */
    t.gear.forEach(function (g) { if (g.linkId === id) g.linkId = null; });
    commit();
  }

  function itemById(id) {
    var t = current();
    if (!t) return null;
    return t.items.filter(function (i) { return i.id === id; })[0] || null;
  }

  function saveGear(g) {
    var t = current();
    if (!t) return null;
    var body = normalizeGear(g);
    var hit = false;
    t.gear = t.gear.map(function (x) {
      if (x.id !== body.id) return x;
      hit = true;
      return body;
    });
    if (!hit) t.gear.push(body);
    commit();
    return body.id;
  }

  function removeGear(id) {
    var t = current();
    if (!t) return;
    snapshot();
    t.gear = t.gear.filter(function (g) { return g.id !== id; });
    commit();
  }

  function toggleGear(id) {
    var t = current();
    if (!t) return;
    t.gear.forEach(function (g) { if (g.id === id) g.done = !g.done; });
    commit();
  }

  function setGearCats(list) {
    var t = current();
    if (!t) return;
    t.gearCats = list.slice();
    commit();
  }

  /* カテゴリを消しても持ちものは残す。行き場のなくなったものは
     「その他」に落ちる（gearCats に無い cat は その他 扱い）。 */
  function removeGearCat(name) {
    var t = current();
    if (!t) return;
    snapshot();
    t.gearCats = t.gearCats.filter(function (c) { return c !== name; });
    t.gear.forEach(function (g) { if (g.cat === name) g.cat = 'その他'; });
    commit();
  }

  function clearCurrentContents() {
    var t = current();
    if (!t) return;
    snapshot();
    t.items = [];
    t.gear = [];
    commit();
  }

  function canUndo() { return !!undoSnapshot; }

  function undo() {
    if (!undoSnapshot) return;
    try {
      state = migrate(JSON.parse(undoSnapshot));
    } catch (e) {
      return;
    }
    undoSnapshot = null;
    commit();
  }

  /* ── 書き出しと復元 ─────────────────────────
     localStorage は端末側の都合で消えることがある。
     引き継ぎ手段はこれだけなので必ず用意する。 */

  function exportObject() {
    return JSON.parse(JSON.stringify(state));
  }

  function importObject(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.trips)) return false;
    snapshot();
    state = migrate(raw);
    commit();
    return true;
  }

  return {
    init: init,
    onChange: onChange,
    trips: trips,
    current: current,
    setCurrent: setCurrent,
    addTrip: addTrip,
    updateTrip: updateTrip,
    removeTrip: removeTrip,
    saveItem: saveItem,
    removeItem: removeItem,
    itemById: itemById,
    saveGear: saveGear,
    removeGear: removeGear,
    toggleGear: toggleGear,
    setGearCats: setGearCats,
    removeGearCat: removeGearCat,
    clearCurrentContents: clearCurrentContents,
    canUndo: canUndo,
    undo: undo,
    exportObject: exportObject,
    importObject: importObject,
    defaultGearCats: function () { return DEFAULT_GEAR_CATS.slice(); }
  };
})();
