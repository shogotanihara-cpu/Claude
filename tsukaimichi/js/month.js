/* ─────────────────────────────────────────
   month.js — 「月」の画面（起動して最初に出る1枚目）

   このアプリで一番大事なのは「今月、どの軸にいくら使ったか」を見ること。
   だから1枚目には明細も分類の編集も出さず、3つの合計だけを置く。
   確認待ちの明細があるときだけ、その上に知らせを出す。
   ───────────────────────────────────────── */

var MonthView = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;

  /** 月を前後に送るバー。月・明細の両方で同じものを使う */
  function monthBar(ym) {
    var bar = el('div', 'monthbar');
    var prev = btn('iconbtn', '‹', function () { App.showMonth(UI.addMonths(ym, -1), true); });
    prev.setAttribute('aria-label', '前の月');
    var next = btn('iconbtn', '›', function () { App.showMonth(UI.addMonths(ym, 1), true); });
    next.setAttribute('aria-label', '次の月');
    bar.appendChild(prev);
    bar.appendChild(el('div', 'monthlabel', UI.fmtMonth(ym)));
    bar.appendChild(next);
    return bar;
  }

  function render(host, ym) {
    UI.clear(host);

    if (!Store.recs().length) {
      var empty = el('div', 'empty');
      empty.appendChild(el('div', 'empty-title', 'まだ明細がありません'));
      empty.appendChild(el('p', 'empty-note',
        'ザイムから書き出したCSVを取り込むか、右下の ＋ から手で入力します。'));
      empty.appendChild(Csv.fileButton('btn btn-primary', 'ザイムのCSVを取り込む'));
      host.appendChild(empty);
      return;
    }

    var waiting = Model.queue().length;
    if (waiting) {
      var note = btn('notice', '', function () { App.go('sort'); });
      note.appendChild(el('span', 'notice-main', '確認待ちが ' + waiting + ' 件あります'));
      note.appendChild(el('span', 'notice-sub', '仕分ける ›'));
      host.appendChild(note);
    }

    host.appendChild(monthBar(ym));

    var now = Model.summary(ym);
    var before = Model.summary(UI.addMonths(ym, -1));

    var hero = el('div', 'hero');
    hero.appendChild(el('div', 'hero-label', '支出の合計'));
    hero.appendChild(el('div', 'hero-amt', UI.yen(now.total)));
    hero.appendChild(el('div', 'hero-sub',
      before.count ? '前月比 ' + UI.diff(now.total - before.total) : now.count + ' 件'));
    host.appendChild(hero);
    host.appendChild(shareBar(now));

    Store.majors().forEach(function (m) {
      host.appendChild(catCard(m, now.cats[m.id], before.cats[m.id], before.count > 0, now.total, ym));
    });

    if (now.none.count) {
      var card = el('div', 'card card-none');
      var head = el('div', 'row row-tap');
      var main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', '未分類'));
      main.appendChild(el('div', 'row-sub', now.none.count + ' 件'));
      head.appendChild(main);
      head.appendChild(el('span', 'amt amt-big', UI.yen(now.none.sum)));
      head.addEventListener('click', function () { App.openList({ cat: 'none' }); });
      card.appendChild(head);
      host.appendChild(card);
    }

    host.appendChild(yearBlock(ym.slice(0, 4)));
  }

  /* 3分類の割合を1本の帯で見せる。数字を読まなくても偏りが分かるように */
  function shareBar(s) {
    var bar = el('div', 'share');
    if (s.total <= 0) return bar;
    Store.majors().forEach(function (m) {
      var v = Math.max(0, s.cats[m.id].sum);
      if (!v) return;
      var seg = el('span', 'share-seg');
      seg.style.flexGrow = v;
      seg.style.background = m.color;
      bar.appendChild(seg);
    });
    if (s.none.sum > 0) {
      var rest = el('span', 'share-seg share-none');
      rest.style.flexGrow = s.none.sum;
      bar.appendChild(rest);
    }
    return bar;
  }

  function catCard(m, c, prev, hasPrev, total, ym) {
    var card = el('div', 'card');
    card.style.setProperty('--c', m.color);

    var head = el('div', 'row row-tap row-head');
    head.appendChild(Cats.dot(m.color));
    var main = el('div', 'row-main');
    main.appendChild(el('div', 'row-title', m.name));
    var bits = [c.count + ' 件'];
    if (total > 0 && c.sum > 0) bits.push(Math.round(c.sum / total * 100) + '%');
    if (hasPrev) bits.push('前月比 ' + UI.diff(c.sum - prev.sum));
    main.appendChild(el('div', 'row-sub', bits.join(' ・ ')));
    head.appendChild(main);
    head.appendChild(el('span', 'amt amt-big', UI.yen(c.sum)));
    head.addEventListener('click', function () { App.openList({ cat: m.id }); });
    card.appendChild(head);

    Model.subRows(c).forEach(function (s) {
      var row = el('div', 'row row-tap row-subcat');
      row.appendChild(el('div', 'row-main', s.name));
      row.appendChild(el('span', 'amt', UI.yen(s.sum)));
      row.addEventListener('click', function () { App.openList({ cat: m.id, sub: s.id }); });
      card.appendChild(row);
    });

    if (c.auto) {
      // 自動で決まった数字が混じっていることを、破線の印で示す
      var foot = el('div', 'row row-foot');
      foot.appendChild(el('span', 'badge badge-auto', '自動'));
      foot.appendChild(el('span', 'row-sub', 'うち ' + c.auto + ' 件は自動の振り分けのまま'));
      card.appendChild(foot);
    }
    return card;
  }

  function yearBlock(year) {
    var s = Model.summary(year);
    var sec = el('section', 'group');
    var head = el('div', 'group-head');
    head.appendChild(el('span', 'group-name', year + '年の合計'));
    head.appendChild(el('span', 'group-count', UI.yen(s.total)));
    sec.appendChild(head);
    var rows = el('div', 'rows');
    Store.majors().forEach(function (m) {
      var row = el('div', 'row');
      row.appendChild(Cats.dot(m.color));
      row.appendChild(el('div', 'row-main', m.name));
      row.appendChild(el('span', 'amt', UI.yen(s.cats[m.id].sum)));
      rows.appendChild(row);
    });
    sec.appendChild(rows);
    return sec;
  }

  return { render: render, monthBar: monthBar };
})();
