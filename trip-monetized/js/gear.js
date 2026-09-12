/* ─────────────────────────────────────────
   gear.js — 持ちもの画面

   持ちものは時間に紐づかない。だからタイムラインに混ぜず、独立したタブにする。
   そのうえで、予定と結びつけられるようにしてある（「開場 で使う」）。
   結びつけた予定を消しても持ちものは残る（store.js が結びつきだけ外す）。

   カテゴリの並び順は旅行ごとのデータ（gearCats）そのもの。
   増減と並べ替えは設定タブから行う。
   ───────────────────────────────────────── */

var Gear = (function () {
  'use strict';

  var OTHER = 'その他';

  /* 収益版モックアップだけの導線。よく忘れるものに絞って1〜2点だけ出す。
     数を絞るのは、持ちものチェックという本来の作業の邪魔にならないため。
     カテゴリ名を初期値（DEFAULT_GEAR_CATS）に決め打ちしているのは、
     モックアップとして「どの持ちものカテゴリに出すか」を分かりやすくする
     ためで、本番実装では ASP（アフィリエイト提携先）のリンクに差し替える。 */
  var AFFILIATE_ITEMS = [
    {
      cat: '貴重品',
      label: 'パスポートケース（忘れ物防止に人気）',
      url: 'https://affiliate.example/product/passport-case?tag=osimock-22'
    },
    {
      cat: '現場グッズ',
      label: '折りたたみクッション（現場の定番）',
      url: 'https://affiliate.example/product/stadium-cushion?tag=osimock-22'
    }
  ];

  function affiliateCard(trip) {
    var items = AFFILIATE_ITEMS.filter(function (a) {
      return trip.gearCats.indexOf(a.cat) >= 0;
    });
    if (!items.length) return '';

    var html = '<div class="card ad-card"><h3>よく忘れるものを見る' +
      '<span class="ad-pr-tag">PR</span></h3>';
    items.forEach(function (a) {
      html += '<a class="ad-link" href="' + UI.esc(a.url) + '" target="_blank" rel="noopener">' +
        '<span>' + UI.esc(a.label) + '<span class="ad-pr-tag" style="margin-left:6px">PR</span></span>' +
        '<span class="ad-link-arrow">' + UI.icon('next', 14) + '</span>' +
        '</a>';
    });
    html += '</div>';
    return html;
  }

  /* gearCats に無い cat はすべて「その他」に寄せる。
     カテゴリを消したときに持ちものが行方不明にならないようにするため。 */
  function bucketOf(trip, g) {
    var c = g.cat || OTHER;
    return trip.gearCats.indexOf(c) >= 0 ? c : OTHER;
  }

  function buckets(trip) {
    return trip.gearCats.concat([OTHER]);
  }

  function render(host) {
    var trip = Store.current();
    if (!trip) return;

    var done = trip.gear.filter(function (g) { return g.done; }).length;
    var list = buckets(trip);

    var html = '<div class="panel-head"><h2>持ちもの</h2>' +
      '<p>' + trip.title + '</p></div>';

    html += '<div class="card card-stat"><b>' + done + ' / ' + trip.gear.length +
      '</b><span>チェック済み</span></div>';

    if (!trip.gear.length) {
      html += '<div class="card"><p class="empty">持ちものはまだありません。<br>' +
        '下の欄から足してください。</p></div>';
    }

    list.forEach(function (cat) {
      var rows = trip.gear.filter(function (g) { return bucketOf(trip, g) === cat; });
      if (!rows.length) return;
      html += '<div class="card"><h3>' + UI.esc(cat) + '</h3><ul class="list">';
      rows.forEach(function (g) {
        var link = g.linkId ? Store.itemById(g.linkId) : null;
        html += '<li class="list-row gear-row' + (g.done ? ' done' : '') + '">' +
          '<button type="button" class="list-main" data-gear-toggle="' + g.id + '">' +
            '<span class="check">' + UI.icon('check', 13) + '</span>' +
            '<span class="list-text"><b>' + UI.esc(g.name) + '</b>' +
            (link ? '<small>' + UI.esc(link.title) + ' で使う</small>' : '') +
            '</span>' +
          '</button>' +
          '<select class="cat-select" data-gear-cat="' + g.id + '" aria-label="カテゴリ">' +
            list.map(function (c) {
              return '<option value="' + UI.esc(c) + '"' +
                (c === cat ? ' selected' : '') + '>' + UI.esc(c) + '</option>';
            }).join('') +
          '</select>' +
          '<button type="button" class="list-x" data-gear-del="' + g.id + '" ' +
            'aria-label="削除">' + UI.icon('close', 15) + '</button>' +
          '</li>';
      });
      html += '</ul></div>';
    });

    html += affiliateCard(trip);

    html += '<div class="card"><h3>持ちものを足す</h3>' +
      '<div class="addrow">' +
        '<input type="text" id="gearName" placeholder="例：双眼鏡">' +
        '<select id="gearCat" aria-label="カテゴリ">' +
          list.map(function (c) {
            return '<option value="' + UI.esc(c) + '">' + UI.esc(c) + '</option>';
          }).join('') +
        '</select>' +
        '<button type="button" class="btn-primary" id="gearAdd">追加</button>' +
      '</div></div>';

    html += '<button type="button" class="btn-wide" id="toGearCats">カテゴリを編集</button>' +
      '<p class="note">項目をタップでチェック。まん中の欄でカテゴリを移せます。' +
      'カテゴリ自体の増減と並べ替えは設定タブから。</p>';

    host.innerHTML = html;
  }

  /* 受け口は app.js が1度だけ張る */
  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-gear-toggle]') : null;
    if (t) { Store.toggleGear(t.dataset.gearToggle); return; }

    var d = e.target.closest ? e.target.closest('[data-gear-del]') : null;
    if (d) {
      var trip = Store.current();
      var g = trip.gear.filter(function (x) { return x.id === d.dataset.gearDel; })[0];
      Store.removeGear(d.dataset.gearDel);
      UI.toast('「' + (g ? g.name : '') + '」を削除しました', '取り消す',
        function () { Store.undo(); });
      return;
    }

    if (e.target.closest && e.target.closest('#gearAdd')) { add(); return; }
    if (e.target.closest && e.target.closest('#toGearCats')) { App.showTab('settings'); return; }
  }

  function onChange(e) {
    var sel = e.target.closest ? e.target.closest('[data-gear-cat]') : null;
    if (!sel) return;
    var trip = Store.current();
    var g = trip.gear.filter(function (x) { return x.id === sel.dataset.gearCat; })[0];
    if (!g) return;
    Store.saveGear({ id: g.id, name: g.name, cat: sel.value, done: g.done, linkId: g.linkId });
  }

  function onKeydown(e) {
    if (e.key === 'Enter' && e.target.id === 'gearName') add();
  }

  function add() {
    var input = document.getElementById('gearName');
    var name = input.value.trim();
    if (!name) return;
    Store.saveGear({
      name: name,
      cat: document.getElementById('gearCat').value || OTHER,
      done: false,
      linkId: null
    });
  }

  return {
    render: render,
    onClick: onClick,
    onChange: onChange,
    onKeydown: onKeydown,
    OTHER: OTHER
  };
})();
