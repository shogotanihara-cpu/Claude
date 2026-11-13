/* ─────────────────────────────────────────
   store.js — データ層（localStorage）

   明細1件のかたち（メモリ上）。

     {
       id, date, amt, shop, item, memo,
       zcat, zsub,          ザイムのカテゴリ／内訳（取り込んだものだけ）
       cat, sub,            大分類の id ／小分類の id（どちらも null あり）
       ok,                  手で分類を決めた（＝もう自動では動かさない）
       ask,                 自動で仮置きしたが、確認してほしい
       off,                 集計に含めない
       ev,                  イベントの id（分類とは別の軸）
       h                    ザイムの元の行の指紋（取り込んだものだけ）
     }

     - date は "YYYY-MM-DD" の文字列。時刻は持たない
     - amt は円。値引きや返金はマイナスのまま持つ（足せば差し引きになる）
     - sub が入っていれば cat は必ずその小分類の親（reindex が保つ）

   数千件を localStorage に入れるので、保存するときだけ項目名を1〜2文字に
   縮め、空の項目は書かない（pack / unpack）。メモリ上は読める名前のまま。

   保存先は端末のブラウザ内だけ。サーバーには何も送らない。
   ───────────────────────────────────────── */

var Store = (function () {
  'use strict';

  var KEY = 'tsukaimichi.v1';    // 他のアプリ（actionlog.v1 / wake.v1 など）とは別の名前空間
  var VERSION = 1;

  /* 大分類は3つで固定。増減はできないが、名前は変えられる */
  var MAJORS = [
    { id: 'oshi', name: '推し活', color: '#d4628f' },
    { id: 'life', name: '生活',   color: '#3f8fb0' },
    { id: 'fun',  name: '娯楽',   color: '#c08a3e' }
  ];

  /* イベントの手がかりにする言葉の初期値。設定で足したり消したりできる。
       ride  … 新幹線。乗った日に付くことが多いので、その日を「現地にいた日」とみなす
       book  … 旅行サイト・航空券・チケットサイト。払った日とイベントの日がずれる
       place … 関西以外の地名。お店の名前に入っていれば、その日は現地にいた
     地名はカタカナと漢字だけにしてある。カード明細の末尾に付く「（TOKYO）」は
     お店の本社の場所で、自販機や通販にも付くので手がかりにならない。 */
  var WORDS = {
    ride: ['スマートEX', 'スマートイーエツクス', 'EX予約', 'エクスプレス予約', '新幹線', 'シンカンセン'],
    book: ['楽天トラベル', 'EXPEDIA', 'エクスペディア', 'じゃらん', '一休', 'BOOKING.COM', 'AGODA',
           'トラベルパートナー', 'ANA国内線', '全日空', 'JAL', '日本航空', 'ピーチアビエーション',
           'ジェットスター', 'スカイマーク',
           'ローチケ', 'ローソンチケット', 'イープラス', 'チケットぴあ', 'チケット', 'TICKET',
           'SPWN', 'ZAIKO', 'パスマーケット', 'LIVEPOCKET'],
    place: ['東京', 'トウキョウ', '横浜', 'ヨコハマ', '川崎', 'カワサキ', '幕張', 'マクハリ', '千葉',
            '大宮', 'オオミヤ', '埼玉', 'サイタマ', '渋谷', 'シブヤ', '新宿', 'シンジュク',
            '池袋', 'イケブクロ', '秋葉原', 'アキハバラ', 'アキバ', '品川', 'シナガワ',
            '六本木', 'ロッポンギ', '有明', 'アリアケ', 'お台場', '立川', 'タチカワ',
            '羽田', 'ハネダ', '成田', 'ナリタ', 'JR東日本', 'JRヒガシニホン',
            '仙台', 'センダイ', '札幌', 'サッポロ', '函館', 'ハコダテ', '北海道', '新潟', 'ニイガタ',
            '金沢', 'カナザワ', '長野', 'ナガノ', '静岡', 'シズオカ', '名古屋', 'ナゴヤ', '伊勢',
            '岡山', 'オカヤマ', '広島', 'ヒロシマ', '博多', 'ハカタ', '福岡', 'フクオカ',
            '熊本', 'クマモト', '那覇', '沖縄', 'オキナワ']
  };

  function cleanWords(list, fallback) {
    if (!Array.isArray(list)) return fallback.slice();
    var seen = {}, out = [];
    list.forEach(function (w) {
      w = String(w == null ? '' : w).trim();
      if (!w || seen[w]) return;
      seen[w] = true;
      out.push(w);
    });
    return out;
  }

  var state = null;
  var listeners = [];
  var undoStack = [];      // 取り消し用のスナップショット（1件だけ持つ）
  var index = {};          // id → 明細
  var lastSize = 0;        // 直近に保存した文字数（設定画面で見せる）

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function blank() {
    return {
      version: VERSION,
      majors: MAJORS.map(function (m) { return { id: m.id, name: m.name, color: m.color }; }),
      subs: [],            // { id, major, name, order }
      map: {},             // "カテゴリ/内訳" → { cat, sub, ask, ev }
      learn: {},           // "お店|内訳" → { "s:小分類id" か "c:大分類id" : 回数 }
      recs: [],
      events: [],          // { id, name, from, to }
      gone: {},            // 消したザイム明細の指紋 → 件数（再取り込みで復活させない）
      skip: {},            // 「ちがう」と答えた提案（期間は "はじまり|おわり"、明細は "b:id"）
      words: { ride: WORDS.ride.slice(), book: WORDS.book.slice(), place: WORDS.place.slice() },
      settings: { view: 'month' }
    };
  }

  /* ── 保存用の詰め替え ─────────────────── */

  var FIELDS = [
    ['id', 'i'], ['date', 'd'], ['amt', 'a'], ['shop', 's'], ['item', 't'], ['memo', 'm'],
    ['zcat', 'zc'], ['zsub', 'zs'], ['cat', 'c'], ['sub', 'u'],
    ['ok', 'k'], ['ask', 'q'], ['off', 'x'], ['ev', 'e'], ['h', 'h']
  ];
  var FLAGS = { ok: true, ask: true, off: true };

  function pack(r) {
    var o = {};
    FIELDS.forEach(function (f) {
      var v = r[f[0]];
      if (FLAGS[f[0]]) { if (v) o[f[1]] = 1; return; }
      if (v === null || v === undefined || v === '') return;
      o[f[1]] = v;
    });
    return o;
  }

  function unpack(o) {
    var r = {};
    FIELDS.forEach(function (f) {
      var name = f[0];
      // 短い名前でも長い名前でも読めるようにしておく（手で書いた JSON を戻す場合に備えて）
      var v = (o[f[1]] !== undefined) ? o[f[1]] : o[name];
      if (FLAGS[name]) { r[name] = !!v; return; }
      if (name === 'amt') { r.amt = Math.round(Number(v)) || 0; return; }
      if (name === 'shop' || name === 'item' || name === 'memo' || name === 'zcat' || name === 'zsub') {
        r[name] = (v == null) ? '' : String(v);
        return;
      }
      r[name] = (v == null || v === '') ? null : String(v);
    });
    if (!r.id) r.id = uid('r');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) r.date = '1970-01-01';
    return r;
  }

  function serialize() {
    var out = {};
    Object.keys(state).forEach(function (k) { out[k] = state[k]; });
    out.recs = state.recs.map(pack);
    return out;
  }

  /**
   * 古い世代のデータを、消さずに足りないものだけ補って読み込む。
   * 今は VERSION 1 しかないが、後から項目が増えたときにここで面倒を見る。
   */
  function migrate(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var out = blank();

    if (Array.isArray(s.majors)) {
      out.majors.forEach(function (m) {
        s.majors.forEach(function (x) {
          if (x && x.id === m.id && typeof x.name === 'string' && x.name.trim()) m.name = x.name.trim();
        });
      });
    }
    if (Array.isArray(s.subs)) {
      out.subs = s.subs.filter(function (x) { return x && x.id; }).map(function (x) {
        return {
          id: String(x.id), major: String(x.major || 'life'),
          name: String(x.name == null ? '' : x.name),
          order: (typeof x.order === 'number') ? x.order : 0
        };
      });
    }
    if (s.map && typeof s.map === 'object') {
      Object.keys(s.map).forEach(function (k) {
        var e = s.map[k] || {};
        // ev は後から足した項目。持っていない古いデータでは、旅行だけを手がかりにする
        out.map[k] = {
          cat: e.cat || null, sub: e.sub || null, ask: !!e.ask,
          ev: (typeof e.ev === 'boolean') ? e.ev : /\/旅行$/.test(k)
        };
      });
    }
    if (s.learn && typeof s.learn === 'object') {
      Object.keys(s.learn).forEach(function (k) {
        var e = s.learn[k], o = {};
        if (!e || typeof e !== 'object') return;
        Object.keys(e).forEach(function (t) { if (e[t] > 0) o[t] = Math.floor(e[t]); });
        out.learn[k] = o;
      });
    }
    if (Array.isArray(s.recs)) out.recs = s.recs.filter(function (x) { return x; }).map(unpack);
    if (Array.isArray(s.events)) {
      out.events = s.events.filter(function (x) { return x && x.id; }).map(function (x) {
        return { id: String(x.id), name: String(x.name || ''), from: x.from || '', to: x.to || '' };
      });
    }
    if (s.gone && typeof s.gone === 'object') {
      Object.keys(s.gone).forEach(function (k) { if (s.gone[k] > 0) out.gone[k] = Math.floor(s.gone[k]); });
    }
    // words は後から足した項目。持っていない古いデータには初期値を入れる
    if (s.words && typeof s.words === 'object') {
      ['ride', 'book', 'place'].forEach(function (k) { out.words[k] = cleanWords(s.words[k], WORDS[k]); });
    }
    if (s.skip && typeof s.skip === 'object') {
      Object.keys(s.skip).forEach(function (k) { if (s.skip[k]) out.skip[k] = 1; });
    }
    if (s.settings && typeof s.settings === 'object') {
      if (typeof s.settings.view === 'string') out.settings.view = s.settings.view;
    }
    out.version = VERSION;
    return out;
  }

  function load() {
    var text = null, raw = null;
    try { text = localStorage.getItem(KEY); raw = JSON.parse(text); } catch (e) { raw = null; }
    lastSize = text ? text.length : 0;
    state = raw ? migrate(raw) : blank();
    reindex();
  }

  var errorHandler = null;
  function onError(fn) { errorHandler = fn; }

  function save() {
    try {
      var text = JSON.stringify(serialize());
      localStorage.setItem(KEY, text);
      lastSize = text.length;
    } catch (e) {
      // 容量超過など。保存できなかったことは黙って握りつぶさず、画面側に伝える
      if (errorHandler) errorHandler(e);
    }
  }

  function notify() { listeners.forEach(function (fn) { fn(); }); }

  function commit() {
    reindex();
    save();
    notify();
  }

  /* ── 整合をとる ───────────────────────────
     ・小分類の親が大分類3つのどれかであること。order は 0,1,2… に詰める
     ・明細の sub が消えていたら外す。sub があれば cat はその親に合わせる
     ・明細の ev が消えていたら外す
     ・対応表も同じ決まりで直す
     画面側で気をつけるのではなく、変更のたびにここで直す。
     ───────────────────────────────────────── */
  function reindex() {
    var majorOk = {};
    state.majors.forEach(function (m) { majorOk[m.id] = true; });

    var subBy = {};
    var groups = {};
    state.subs.forEach(function (s) {
      if (!majorOk[s.major]) s.major = 'life';
      subBy[s.id] = s;
      (groups[s.major] = groups[s.major] || []).push(s);
    });
    Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (a, b) { return a.order - b.order; })
        .forEach(function (s, i) { s.order = i; });
    });

    var evOk = {};
    state.events.forEach(function (e) { evOk[e.id] = true; });

    function fix(o) {
      if (o.sub && !subBy[o.sub]) o.sub = null;
      if (o.sub) o.cat = subBy[o.sub].major;
      if (o.cat && !majorOk[o.cat]) o.cat = null;
    }

    index = {};
    state.recs.forEach(function (r) {
      fix(r);
      if (r.ev && !evOk[r.ev]) r.ev = null;
      if (!r.cat && r.ok) r.ok = false;     // 分類のない「確定」はありえない
      index[r.id] = r;
    });
    Object.keys(state.map).forEach(function (k) { fix(state.map[k]); });
  }

  /* ── 取り消し ─────────────────────────── */

  function pushUndo() {
    var snap = serialize();
    delete snap.settings;                   // いま見ている画面まで巻き戻さない
    undoStack = [JSON.stringify(snap)];
  }

  function undo() {
    var snap = undoStack.pop();
    if (!snap) return false;
    var settings = state.settings;
    state = migrate(JSON.parse(snap));
    state.settings = settings;
    commit();
    return true;
  }

  /* ── 自動の振り分け ───────────────────────
     上にあるものほど優先する。
       1. 手で決めた履歴（同じお店 × 同じザイム内訳）の多数決
       2. ザイムのカテゴリの対応表
       3. どちらにも当たらなければ未分類（確認待ち）
     ───────────────────────────────────────── */

  function learnKey(r) {
    var who = r.shop && r.shop !== '-' ? r.shop : r.item;
    if (!who) return null;
    return who + '|' + (r.zsub || '');
  }

  function mapKey(zcat, zsub) { return (zcat || '') + '/' + (zsub || ''); }

  function targetOf(cat, sub) { return sub ? 's:' + sub : (cat ? 'c:' + cat : null); }

  function resolveTarget(t) {
    var id = t.slice(2);
    if (t.charAt(0) === 's') {
      var s = subById(id);
      return s ? { cat: s.major, sub: s.id } : null;
    }
    return majorById(id) ? { cat: id, sub: null } : null;
  }

  /**
   * 履歴から決められるなら { cat, sub }、決められなければ null。
   * 1回だけの修正で決め打ちすると、たまたまの1件に引きずられる。
   * 2回以上あって、3分の2以上が同じ行き先のときだけ採用する。
   * （行き先がばらつくお店は割れるので、対応表に戻る）
   */
  function learned(r) {
    var k = learnKey(r), e = k && state.learn[k];
    if (!e) return null;
    var total = 0, top = null, topN = 0;
    Object.keys(e).forEach(function (t) {
      total += e[t];
      if (e[t] > topN) { topN = e[t]; top = t; }
    });
    if (topN < 2 || topN * 3 < total * 2) return null;
    return resolveTarget(top);
  }

  function classify(r) {
    var hit = learned(r);
    if (hit) return { cat: hit.cat, sub: hit.sub, ask: false };
    var m = r.h ? state.map[mapKey(r.zcat, r.zsub)] : null;
    if (m && m.cat) return { cat: m.cat, sub: m.sub || null, ask: !!m.ask };
    return { cat: null, sub: null, ask: true };
  }

  /** 手で決めていない明細を、いまの履歴と対応表で振り直す。変わった件数を返す */
  function reclassify() {
    var changed = 0;
    state.recs.forEach(function (r) {
      if (r.ok) return;
      var c = classify(r);
      if (r.cat !== c.cat || r.sub !== c.sub) changed++;
      r.cat = c.cat; r.sub = c.sub; r.ask = c.ask;
    });
    return changed;
  }

  function bump(r, cat, sub, n) {
    var k = learnKey(r), t = targetOf(cat, sub);
    if (!k || !t) return;
    var e = state.learn[k] = state.learn[k] || {};
    e[t] = (e[t] || 0) + n;
    if (e[t] <= 0) delete e[t];
    if (!Object.keys(e).length) delete state.learn[k];
  }

  /* 手で分類を決める。履歴に1票入れる（決め直しなら前の票を引く） */
  function decide(r, cat, sub) {
    if (r.ok) bump(r, r.cat, r.sub, -1);
    r.cat = cat; r.sub = sub || null;
    r.ok = !!cat; r.ask = false;
    if (r.ok) bump(r, r.cat, r.sub, 1);
  }

  /** 大分類だけを選んだとき、いまの小分類がその下にあるなら残す */
  function keepSub(r, cat) {
    var s = r.sub ? subById(r.sub) : null;
    return (s && s.major === cat) ? s.id : null;
  }

  /**
   * 明細の分類を手で決める。sub を省くと、大分類だけを選んだものとして扱う。
   * 学習した結果ほかの明細も動いたら、その件数を返す。
   */
  function setClass(ids, cat, sub) {
    pushUndo();
    ids.forEach(function (id) {
      var r = index[id];
      if (!r) return;
      decide(r, cat, sub === undefined ? keepSub(r, cat) : sub);
    });
    var moved = reclassify();
    commit();
    return moved;
  }

  /* ── 読み出し ─────────────────────────── */

  function recs() { return state.recs; }
  function rec(id) { return index[id] || null; }
  function majors() { return state.majors; }
  function majorById(id) {
    for (var i = 0; i < state.majors.length; i++) if (state.majors[i].id === id) return state.majors[i];
    return null;
  }
  function subById(id) {
    for (var i = 0; i < state.subs.length; i++) if (state.subs[i].id === id) return state.subs[i];
    return null;
  }
  function subsOf(major) {
    return state.subs.filter(function (s) { return s.major === major; })
      .sort(function (a, b) { return a.order - b.order; });
  }
  function events() { return state.events; }
  function eventById(id) {
    for (var i = 0; i < state.events.length; i++) if (state.events[i].id === id) return state.events[i];
    return null;
  }
  function mapping() { return state.map; }

  /* ── 明細 ─────────────────────────────── */

  function clean(f) {
    return {
      date: f.date,
      amt: Math.round(Number(f.amt)) || 0,
      shop: String(f.shop || '').trim(),
      item: String(f.item || '').trim(),
      memo: String(f.memo || '').trim()
    };
  }

  /** 手入力で1件足す。分類を選んでいれば確定、選んでいなければ確認待ちに入る */
  function addRec(f) {
    var c = clean(f);
    var r = {
      id: uid('r'), date: c.date, amt: c.amt, shop: c.shop, item: c.item, memo: c.memo,
      zcat: '', zsub: '', cat: null, sub: null, ok: false, ask: true,
      off: !!f.off, ev: f.ev || null, h: null
    };
    state.recs.push(r);
    index[r.id] = r;
    if (f.cat) decide(r, f.cat, f.sub || null);
    else { var a = classify(r); r.cat = a.cat; r.sub = a.sub; r.ask = a.ask; }
    commit();
    return r.id;
  }

  /**
   * 明細を書き換える。分類が変わっていたら「手で決めた」ことにする。
   * 学習でほかの明細が動いた件数を返す。
   */
  function saveRec(id, f) {
    var r = index[id];
    if (!r) return 0;
    pushUndo();
    var c = clean(f);
    // お店を書き換えると履歴の鍵が変わるので、先に古い票を引いておく
    var wasOk = r.ok, oldCat = r.cat, oldSub = r.sub;
    if (wasOk) { bump(r, oldCat, oldSub, -1); r.ok = false; }
    r.date = c.date; r.amt = c.amt; r.shop = c.shop; r.item = c.item; r.memo = c.memo;
    r.off = !!f.off;
    r.ev = f.ev || null;
    var cat = f.cat || null, sub = f.sub || null;
    var touched = (cat !== oldCat || sub !== oldSub);
    if (cat && (touched || wasOk || f.confirm)) decide(r, cat, sub);
    else { r.cat = cat; r.sub = sub; if (!cat) r.ask = true; }
    var moved = reclassify();
    commit();
    return moved;
  }

  function removeRec(id) {
    var r = index[id];
    if (!r) return;
    pushUndo();
    if (r.ok) bump(r, r.cat, r.sub, -1);
    // 同じCSVをもう一度入れても戻ってこないよう、指紋を控えておく
    if (r.h) state.gone[r.h] = (state.gone[r.h] || 0) + 1;
    state.recs = state.recs.filter(function (x) { return x.id !== id; });
    commit();
  }

  function setEvent(ids, evId) {
    pushUndo();
    ids.forEach(function (id) { if (index[id]) index[id].ev = evId || null; });
    commit();
  }

  /* ── ザイムCSVの取り込み ──────────────── */

  /* cyrb53。元の行の内容から短い指紋を作る（行そのものを持つと保存量が倍になる） */
  function hash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function fingerprint(row) {
    return hash([row.date, row.amt, row.shop, row.item, row.memo, row.zcat, row.zsub].join('\u001f'));
  }

  /**
   * 取り込む行のうち、まだ入っていないものを選ぶ。
   * ザイムのCSVには明細のIDがない。しかも「同じ日・同じ区間の電車に2回乗った」
   * のように、まったく同じ内容の行が正しく複数あることがある。
   * そこで「あるか無いか」ではなく件数で比べ、足りない分だけを新規とする。
   * 指紋は取り込んだ時点の内容で作るので、このアプリで日付やメモを直しても、
   * 再取り込みで二重にはならない。
   */
  function planImport(rows) {
    var have = {};
    state.recs.forEach(function (r) { if (r.h) have[r.h] = (have[r.h] || 0) + 1; });
    Object.keys(state.gone).forEach(function (h) { have[h] = (have[h] || 0) + state.gone[h]; });
    var seen = {}, fresh = [];
    rows.forEach(function (row) {
      var h = fingerprint(row);
      seen[h] = (seen[h] || 0) + 1;
      if (seen[h] > (have[h] || 0)) fresh.push({ row: row, h: h });
    });
    return { fresh: fresh, dup: rows.length - fresh.length };
  }

  /* はじめて見るザイムのカテゴリを、とりあえずどの大分類に置くか */
  function guessMajor(zcat, zsub) {
    if (zsub === 'ホロライブ') return 'oshi';
    if (zsub === '旅行') return 'oshi';
    if (zcat === 'エンタメ' || zcat === '趣味・娯楽' || zcat === '娯楽') return 'fun';
    return 'life';
  }

  /**
   * はじめて見るザイムのカテゴリに、対応表の行と小分類を用意する。
   * 小分類はザイムの内訳の名前をそのまま借りる。ザイム側で付けた名前が
   * いちばん馴染んでいるはずで、あとから改名・付け替えできる。
   */
  function ensureMap(zcat, zsub) {
    var k = mapKey(zcat, zsub);
    if (state.map[k]) return;
    var major = guessMajor(zcat, zsub);
    var name = zsub;
    if (!name || name === '-') name = zcat;
    else if (name === 'その他' && zcat !== 'その他') name = zcat + 'その他';
    var sub = null;
    if (name && name !== '-') {
      var found = state.subs.filter(function (s) { return s.major === major && s.name === name; })[0];
      sub = found ? found.id : makeSub(major, name).id;
    }
    // 旅行は推し活のことが多いが、いつもではない。仮置きして毎回確かめてもらう
    // 同じ理由で、旅行の明細が固まっている日は「イベントかもしれない」と提案する手がかりにする
    state.map[k] = { cat: major, sub: sub, ask: zsub === '旅行', ev: zsub === '旅行' };
  }

  function applyImport(fresh) {
    if (!fresh.length) return 0;
    pushUndo();
    fresh.forEach(function (x) {
      var row = x.row;
      ensureMap(row.zcat, row.zsub);
      var r = {
        id: uid('r'), date: row.date, amt: row.amt, shop: row.shop, item: row.item, memo: row.memo,
        zcat: row.zcat, zsub: row.zsub, cat: null, sub: null, ok: false, ask: false,
        off: !!row.off, ev: null, h: x.h
      };
      var c = classify(r);
      r.cat = c.cat; r.sub = c.sub; r.ask = c.ask;
      state.recs.push(r);
    });
    commit();
    return fresh.length;
  }

  /* ── 分類 ─────────────────────────────── */

  function makeSub(major, name) {
    var s = { id: uid('s'), major: major, name: name, order: state.subs.length + 1000 };
    state.subs.push(s);
    return s;
  }

  function addSub(major, name) {
    name = String(name || '').trim();
    if (!name) return null;
    var s = makeSub(major, name);
    commit();
    return s.id;
  }

  function renameMajor(id, name) {
    var m = majorById(id);
    name = String(name || '').trim();
    if (!m || !name) return;
    m.name = name;
    commit();
  }

  /** 小分類の名前・親を変える。親を変えると、中の明細も一緒に動く（reindex） */
  function updateSub(id, patch) {
    var s = subById(id);
    if (!s) return;
    pushUndo();
    if (typeof patch.name === 'string' && patch.name.trim()) s.name = patch.name.trim();
    if (patch.major && patch.major !== s.major) { s.major = patch.major; s.order = 100000; }
    commit();
  }

  function moveSub(id, dir) {
    var s = subById(id);
    if (!s) return;
    var sibs = subsOf(s.major), i = sibs.indexOf(s), j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    var o = sibs[i].order; sibs[i].order = sibs[j].order; sibs[j].order = o;
    commit();
  }

  /** 小分類を消す。中の明細は消さず、大分類の直下に残す */
  function removeSub(id) {
    if (!subById(id)) return;
    pushUndo();
    state.subs = state.subs.filter(function (s) { return s.id !== id; });
    commit();
  }

  /** 対応表の1行を変える。手で決めていない明細は、新しい対応で振り直す */
  function setMap(key, cat, sub, ask, ev) {
    pushUndo();
    state.map[key] = { cat: cat || null, sub: sub || null, ask: !!ask, ev: !!ev };
    reindex();
    var moved = reclassify();
    commit();
    return moved;
  }

  /* ── イベント ─────────────────────────── */

  function addEvent(f) {
    var e = { id: uid('e'), name: String(f.name || '').trim(), from: f.from || '', to: f.to || '' };
    state.events.push(e);
    commit();
    return e.id;
  }

  function updateEvent(id, f) {
    var e = eventById(id);
    if (!e) return;
    e.name = String(f.name || '').trim() || e.name;
    e.from = f.from || '';
    e.to = f.to || '';
    commit();
  }

  /** イベントを作り、同時に明細を入れる（提案から作るとき）。取り消すと両方戻る */
  function addEventWith(f, ids) {
    pushUndo();
    var e = { id: uid('e'), name: String(f.name || '').trim(), from: f.from || '', to: f.to || '' };
    state.events.push(e);
    ids.forEach(function (id) { if (index[id]) index[id].ev = e.id; });
    commit();
    return e.id;
  }

  /** この明細が、イベントの提案の手がかりになるか（対応表で印のついたカテゴリか） */
  function isEventHint(r) {
    var m = r.h ? state.map[mapKey(r.zcat, r.zsub)] : null;
    return !!(m && m.ev);
  }

  /** 提案に「ちがう」と答えた。同じ期間はもう提案しない */
  function skipSuggestion(key) {
    pushUndo();
    state.skip[key] = 1;
    commit();
  }

  function skipped(key) { return !!state.skip[key]; }

  function words() { return state.words; }

  /** 手がかりの言葉を入れ替える。w を省くと初期値に戻す */
  function setWords(w) {
    pushUndo();
    w = w || WORDS;
    // 中身を書き換えずに丸ごと差し替える（Model が「変わった」と気づけるように）
    state.words = {
      ride: cleanWords(w.ride, WORDS.ride), book: cleanWords(w.book, WORDS.book),
      place: cleanWords(w.place, WORDS.place)
    };
    commit();
  }

  /** イベントを消す。入っていた明細は消さず、所属だけ外れる（reindex） */
  function removeEvent(id) {
    pushUndo();
    state.events = state.events.filter(function (e) { return e.id !== id; });
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

  function exportData() { return JSON.stringify(serialize()); }

  function importData(text) {
    var raw = JSON.parse(text);        // 壊れていれば例外。呼び出し側で受ける
    if (!raw || !Array.isArray(raw.recs)) throw new Error('明細が入っていません');
    pushUndo();
    var settings = state.settings;
    state = migrate(raw);
    state.settings = settings;
    commit();
  }

  function clearAll() {
    pushUndo();
    var settings = state.settings;
    state = blank();
    state.settings = settings;
    commit();
  }

  return {
    init: load,
    subscribe: function (fn) { listeners.push(fn); },
    onError: onError,
    recs: recs, rec: rec, majors: majors, majorById: majorById,
    subById: subById, subsOf: subsOf, events: events, eventById: eventById,
    mapping: mapping, classify: classify,
    addRec: addRec, saveRec: saveRec, removeRec: removeRec,
    setClass: setClass, setEvent: setEvent,
    planImport: planImport, applyImport: applyImport,
    addSub: addSub, renameMajor: renameMajor, updateSub: updateSub,
    moveSub: moveSub, removeSub: removeSub, setMap: setMap,
    addEvent: addEvent, addEventWith: addEventWith, updateEvent: updateEvent, removeEvent: removeEvent,
    isEventHint: isEventHint, skipSuggestion: skipSuggestion, skipped: skipped,
    words: words, setWords: setWords,
    settings: settings, setSetting: setSetting,
    exportData: exportData, importData: importData, clearAll: clearAll,
    undo: undo, size: function () { return lastSize; }
  };
})();
