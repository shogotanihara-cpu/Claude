/* ─────────────────────────────────────────
   events.js — 「イベント」の画面

   イベントは分類とは別の軸。「生活／外食」の明細が、同時に
   「○○ライブ遠征」にも属せる。遠征1回にいくらかかったかを見るためのもの。

   月の集計には影響しない。イベントに入れても、分類は動かさない。

   期間を決めると、その間の明細が候補として並ぶ。事前に買ったチケットなど
   期間の外の明細は、明細のシートからイベントを選んで入れる。

   自分で作るほかに、明細の並びから「この日はイベントでは」と提案もする。
   提案は押すまで何も変えない。違っていれば「ちがう」で消える。
   ───────────────────────────────────────── */

var EventsView = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;

  function render(host, openId) {
    UI.clear(host);
    var ev = openId ? Store.eventById(openId) : null;
    if (ev) detail(host, ev);
    else list(host);
  }

  /* ── 一覧 ─────────────────────────────── */

  function list(host) {
    var events = Store.events().slice().sort(function (a, b) {
      return (a.from || '') < (b.from || '') ? 1 : -1;
    });

    if (!events.length) {
      var empty = el('div', 'empty');
      empty.appendChild(el('div', 'empty-title', 'イベントはまだありません'));
      empty.appendChild(el('p', 'empty-note',
        'ライブ遠征や旅行など、ひとまとまりの出費を束ねて合計を見られます。月の集計とは別の軸です。'));
      empty.appendChild(btn('btn btn-primary', '＋ イベントを作る', function () { form(null); }));
      host.appendChild(empty);
      suggestSection(host);
      bookingSection(host);
      return;
    }

    var rows = el('div', 'rows');
    events.forEach(function (e) {
      var s = Model.summaryOf(Model.eventRecs(e.id));
      var row = el('div', 'row row-tap');
      var main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', e.name));
      main.appendChild(el('div', 'row-sub', UI.fmtRange(e.from, e.to) + ' ・ ' + s.count + ' 件'));
      row.appendChild(main);
      row.appendChild(el('span', 'amt amt-big', UI.yen(s.total)));
      row.addEventListener('click', function () { App.openEvent(e.id); });
      rows.appendChild(row);
    });
    host.appendChild(rows);
    host.appendChild(btn('btn btn-wide btn-gap', '＋ イベントを作る', function () { form(null); }));
    suggestSection(host);
    bookingSection(host);
  }

  /* ── 提案 ─────────────────────────────── */

  var SHOW = 5;   // 一度に出す提案の数。取り込み直後は十数件出るので、新しいものから少しずつ

  function suggestSection(host) {
    var all = Model.suggestions();
    if (!all.length) return;
    var sec = group(host, 'イベントかもしれない日', all.length + ' 件');
    sec.appendChild(el('p', 'sheet-note',
      '新幹線・関西以外の地名・旅行の明細がある日です。連続した日は1つにまとめています。期間は作るときに直せます。'));
    all.slice(0, SHOW).forEach(function (s) { sec.appendChild(suggestCard(s)); });
    if (all.length > SHOW) {
      sec.appendChild(el('p', 'sheet-note center', 'ほか ' + (all.length - SHOW) + ' 件。上から答えると続きが出ます。'));
    }
  }

  /* 予約やチケットは、払った日とイベントの日がずれる。日付から期間を決められないので、
     期間の提案とは別に並べて、どのイベントのものかを選んでもらう */
  function bookingSection(host) {
    var all = Model.bookings();
    if (!all.length) return;
    var sec = group(host, '予約・チケットの支払い', all.length + ' 件');
    sec.appendChild(el('p', 'sheet-note',
      '旅行サイトやチケットサイトの支払いです。イベントを開くと、その前の支払いをまとめて入れられます。'));
    all.slice(0, SHOW).forEach(function (r) { sec.appendChild(bookingCard(r)); });
    if (all.length > SHOW) {
      sec.appendChild(el('p', 'sheet-note center', 'ほか ' + (all.length - SHOW) + ' 件。'));
    }
  }

  function bookingCard(r) {
    var c = el('div', 'qcard qcard-suggest');
    var top = el('div', 'qcard-top');
    var main = el('div', 'row-main');
    main.appendChild(el('div', 'row-title', Model.title(r)));
    var memo = (r.memo || r.item || '').split('\n')[0];
    main.appendChild(el('div', 'row-sub', UI.fmtDate(r.date) + ' に支払い' + (memo ? ' ・ ' + memo : '')));
    main.addEventListener('click', function () { Entry.open(r.id); });
    top.appendChild(main);
    top.appendChild(el('span', 'amt amt-big' + (r.amt < 0 ? ' amt-minus' : ''), UI.yen(r.amt)));
    c.appendChild(top);

    var row = el('div', 'qbtns');
    row.appendChild(btn('qbtn', 'ちがう', function () {
      Store.skipSuggestion('b:' + r.id);
      UI.undoToast('この支払いはもう出しません');
    }));
    row.appendChild(btn('qbtn qbtn-go', 'イベントに入れる', function () { chooseEvent(r); }));
    c.appendChild(row);
    return c;
  }

  /* 支払いをどのイベントに入れるか選ぶ。支払いより後に始まるイベントを、近い順に先頭へ */
  function chooseEvent(r) {
    UI.sheet('どのイベントに入れますか', function (body, close) {
      body.appendChild(el('p', 'sheet-note', Model.title(r) + ' ・ ' + UI.fmtDate(r.date) + ' に支払い ・ ' + UI.yen(r.amt)));
      var after = [], before = [];
      Store.events().forEach(function (e) {
        ((e.to || e.from || '') >= r.date ? after : before).push(e);
      });
      after.sort(function (a, b) { return (a.from || '') < (b.from || '') ? -1 : 1; });
      before.sort(function (a, b) { return (a.from || '') < (b.from || '') ? 1 : -1; });
      var events = after.concat(before);
      if (events.length) {
        var rows = el('div', 'rows');
        events.forEach(function (e) {
          var row = el('div', 'row row-tap');
          var main = el('div', 'row-main');
          main.appendChild(el('div', 'row-title', e.name));
          main.appendChild(el('div', 'row-sub', UI.fmtRange(e.from, e.to)));
          row.appendChild(main);
          row.addEventListener('click', function () {
            close();
            Store.setEvent([r.id], e.id);
            UI.undoToast(e.name + ' に入れました');
          });
          rows.appendChild(row);
        });
        body.appendChild(rows);
      }
      body.appendChild(btn('btn btn-wide', '＋ 新しいイベントを作る', function () {
        form(null, { from: '', to: '', hints: [r], booking: true });
      }));
    });
  }

  function suggestCard(s) {
    var c = el('div', 'qcard qcard-suggest');
    var top = el('div', 'qcard-top');
    var main = el('div', 'row-main');
    main.appendChild(el('div', 'row-title', UI.fmtRange(s.from, s.to)));
    // なぜ提案したのかを先に書く。理由が分からない提案は、合っているか判断できない
    main.appendChild(el('div', 'row-sub', s.why.join('・') + '（' + s.hints.length + ' 件） ・ ' +
      s.shops.slice(0, 3).join('、') + (s.shops.length > 3 ? ' ほか' : '')));
    top.appendChild(main);
    top.appendChild(el('span', 'amt amt-big', UI.yen(s.hintTotal)));
    c.appendChild(top);

    var row = el('div', 'qbtns');
    row.appendChild(btn('qbtn', 'ちがう', function () {
      Store.skipSuggestion(s.key);
      UI.undoToast('この期間はもう提案しません');
    }));
    var yes = btn('qbtn qbtn-go', 'イベントにする', function () { form(null, s); });
    row.appendChild(yes);
    c.appendChild(row);
    return c;
  }

  /* ── 1件の中身 ────────────────────────── */

  function detail(host, ev) {
    var back = btn('backbtn', '‹ イベント一覧', function () { App.openEvent(null); });
    host.appendChild(back);

    var members = Model.eventRecs(ev.id);
    var s = Model.summaryOf(members);

    var hero = el('div', 'hero');
    hero.appendChild(el('div', 'hero-label', ev.name));
    hero.appendChild(el('div', 'hero-amt', UI.yen(s.total)));
    hero.appendChild(el('div', 'hero-sub', UI.fmtRange(ev.from, ev.to) + ' ・ ' + s.count + ' 件'));
    host.appendChild(hero);

    var cats = el('div', 'rows');
    Store.majors().forEach(function (m) {
      var row = el('div', 'row');
      row.appendChild(Cats.dot(m.color));
      row.appendChild(el('div', 'row-main', m.name));
      row.appendChild(el('span', 'amt', UI.yen(s.cats[m.id].sum)));
      cats.appendChild(row);
    });
    host.appendChild(cats);

    var tools = el('div', 'sheet-actions tools');
    tools.appendChild(btn('btn', '名前・期間を変える', function () { form(ev); }));
    tools.appendChild(btn('btn', '＋ 手で入力', function () {
      Entry.add({ ev: ev.id, date: ev.from || UI.today() });
    }));
    host.appendChild(tools);

    var sec = group(host, '入っている明細', members.length + ' 件');
    if (!members.length) {
      sec.appendChild(el('p', 'sheet-note', 'まだ入っていません。下の候補から選ぶか、明細のシートでこのイベントを選びます。'));
    } else {
      var rows = el('div', 'rows');
      members.forEach(function (r) {
        rows.appendChild(Entry.row(r, { showDate: true, action: {
          label: '外す',
          run: function (x) { Store.setEvent([x.id], null); UI.undoToast('イベントから外しました'); }
        } }));
      });
      sec.appendChild(rows);
    }

    var cand = Model.eventCandidates(ev);
    if (ev.from) {
      var sec2 = group(host, '期間内の候補', cand.length + ' 件');
      if (!cand.length) {
        sec2.appendChild(el('p', 'sheet-note', '期間内で、まだどのイベントにも入っていない明細はありません。'));
      } else {
        sec2.appendChild(btn('btn btn-wide btn-all', '候補 ' + cand.length + ' 件をすべて入れる', function () {
          Store.setEvent(cand.map(function (r) { return r.id; }), ev.id);
          UI.undoToast(cand.length + ' 件を入れました');
        }));
        var rows2 = el('div', 'rows');
        cand.forEach(function (r) {
          rows2.appendChild(Entry.row(r, { showDate: true, action: {
            label: '入れる',
            run: function (x) { Store.setEvent([x.id], ev.id); }
          } }));
        });
        sec2.appendChild(rows2);
      }
    } else {
      host.appendChild(el('p', 'sheet-note', '期間を決めると、その間の明細が候補として並びます。'));
    }

    var adv = Model.eventAdvance(ev);
    if (adv.length) {
      var sec3 = group(host, '事前の支払いかもしれない明細', adv.length + ' 件');
      sec3.appendChild(el('p', 'sheet-note', 'はじまりの120日前までの、旅行サイト・チケットサイトの支払いです。'));
      var rows3 = el('div', 'rows');
      adv.forEach(function (r) {
        rows3.appendChild(Entry.row(r, { showDate: true, action: {
          label: '入れる',
          run: function (x) { Store.setEvent([x.id], ev.id); }
        } }));
      });
      sec3.appendChild(rows3);
    }
  }

  function group(host, name, count) {
    var sec = el('section', 'group');
    var head = el('div', 'group-head');
    head.appendChild(el('span', 'group-name', name));
    head.appendChild(el('span', 'group-count', count));
    sec.appendChild(head);
    host.appendChild(sec);
    return sec;
  }

  /* ── 作成・編集 ───────────────────────── */

  /** hint を渡すと、提案の期間を入れた状態で開く。作ると手がかりの明細が最初から入る */
  function form(ev, hint) {
    UI.sheet(ev ? 'イベントを編集' : 'イベントを作る', function (body, close) {
      var name = UI.field(body, '名前', UI.input('text', ev ? ev.name : '', '例: 幕張ライブ遠征'));
      var pair = el('div', 'pair');
      var a = el('div'), b = el('div');
      var from = UI.field(a, 'はじまり', UI.input('date', ev ? ev.from : (hint ? hint.from : '')));
      var to = UI.field(b, 'おわり', UI.input('date', ev ? ev.to : (hint && hint.to !== hint.from ? hint.to : '')));
      pair.appendChild(a);
      pair.appendChild(b);
      body.appendChild(pair);
      body.appendChild(el('p', 'sheet-note', !hint ? '日帰りなら「はじまり」だけで構いません。'
        : hint.booking ? 'この支払いを入れた状態で作ります。イベントの日（支払った日ではなく、行った日）を入れてください。'
        : '手がかりの明細 ' + hint.hints.length + ' 件を入れた状態で作ります。同じ期間のほかの明細は、作ったあと候補に並びます。'));

      var actions = el('div', 'sheet-actions');
      if (ev) {
        actions.appendChild(btn('btn btn-danger', '削除', function () {
          close();
          Store.removeEvent(ev.id);
          App.openEvent(null);
          UI.undoToast('イベントを削除しました（明細は残ります）');
        }));
      }
      actions.appendChild(btn('btn btn-primary', ev ? '保存' : '作る', function () {
        if (!name.value.trim()) { name.focus(); return; }
        var f = { name: name.value, from: from.value, to: to.value };
        // 前後が逆に入っていたら入れ替える。エラーで止めるより直してしまう
        if (f.from && f.to && f.to < f.from) { var t = f.from; f.from = f.to; f.to = t; }
        if (!f.from && f.to) { f.from = f.to; f.to = ''; }
        close();
        if (ev) { Store.updateEvent(ev.id, f); return; }
        if (!hint) { App.openEvent(Store.addEvent(f)); return; }
        // 期間を狭めて作った場合は、その中に収まる明細だけを入れる
        var end = f.to || f.from;
        // 予約の支払いは期間の外にあるのが普通なので、日付で落とさない
        var ids = hint.hints.filter(function (r) {
          return hint.booking || !f.from || (r.date >= f.from && r.date <= end);
        }).map(function (r) { return r.id; });
        App.openEvent(Store.addEventWith(f, ids));
        UI.undoToast('イベントを作り、' + ids.length + ' 件を入れました');
      }));
      body.appendChild(actions);
      if (!ev) setTimeout(function () { name.focus(); }, 250);
    });
  }

  return { render: render };
})();
