/* ─────────────────────────────────────────
   trips.js — 旅行の一覧

   旅行が1つしかないうちは要らない画面だが、2つ目を作った瞬間に
   「どれを見ているのか」が分からなくなる。だから独立したタブにしてある。

   並びは「これからの旅行」と「旅の記録」の2つ。終了日が過ぎたものは
   自動で記録側へ移る。準備するものと見返すものは、探し方が違うため。

   旅行の削除だけは2段階にしてある。中身（予定・持ちもの）ごと消える
   いちばん範囲の広い操作なので、他の削除（持ちもの・カテゴリ）より
   一段重くしてある。1回目のタップでは何も消さず、その行の削除ボタンが
   「本当に削除」に変わるだけ。2回目のタップで実際に削除する。
   ───────────────────────────────────────── */

var Trips = (function () {
  'use strict';

  var hostEl = null;
  var armedId = null;   // 「本当に削除」に変わっている旅行のid
  var armTimer = null;

  function render(host) {
    hostEl = host;
    var all = Store.trips();
    var current = Store.current();
    var t = UI.today();

    var upcoming = all.filter(function (x) { return x.end >= t; })
      .sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
    var past = all.filter(function (x) { return x.end < t; })
      .sort(function (a, b) { return a.start > b.start ? -1 : a.start < b.start ? 1 : 0; });

    var html = '<div class="panel-head"><h2>旅行</h2>' +
      '<p>タップするとその旅程に切り替わります</p></div>';

    html += section('これからの旅行', upcoming, current, '予定している旅行はまだありません。');
    html += section('旅の記録', past, current, '終わった旅行がここに並びます。');
    html += '<button type="button" class="btn-wide btn-primary" id="tripAdd">' +
      '新しい旅行をつくる</button>';
    html += '<p class="note">名前と日付は設定タブで変えられます。</p>';

    host.innerHTML = html;
  }

  function section(title, list, current, emptyText) {
    var html = '<div class="card"><h3>' + UI.esc(title) + '</h3>';
    if (!list.length) return html + '<p class="empty">' + emptyText + '</p></div>';

    html += '<ul class="list">';
    list.forEach(function (trip) {
      var st = Model.tripStatus(trip);
      var nights = Model.daysOf(trip).length;
      var doneGear = trip.gear.filter(function (g) { return g.done; }).length;
      var cand = Model.candidates(trip).length;

      var bits = [range(trip), nights === 1 ? '日帰り' : nights + '日間',
        '予定' + trip.items.length + '件'];
      if (cand) bits.push('候補' + cand + '件');
      if (trip.gear.length) bits.push('持ちもの' + doneGear + '/' + trip.gear.length);

      var armed = trip.id === armedId;

      html += '<li class="list-row trip-row' +
        (current && trip.id === current.id ? ' current' : '') + '">' +
        '<button type="button" class="list-main" data-trip="' + trip.id + '">' +
          '<span class="badge ' + st.key + '">' + st.label + '</span>' +
          '<span class="list-text"><b>' + UI.esc(trip.title) + '</b>' +
          '<small>' + UI.esc(bits.join(' ・ ')) + '</small></span>' +
        '</button>' +
        (armed
          ? '<button type="button" class="trip-del-confirm" data-trip-del="' + trip.id + '">' +
              '本当に削除</button>'
          : '<button type="button" class="list-x" data-trip-del="' + trip.id + '" ' +
              'aria-label="削除">' + UI.icon('close', 15) + '</button>') +
        '</li>';
    });
    return html + '</ul></div>';
  }

  function range(trip) {
    return trip.start === trip.end
      ? UI.dateLabel(trip.start)
      : UI.dateLabel(trip.start) + '–' + UI.dateLabel(trip.end);
  }

  /* 1回目のタップ。他の行が武装中なら、そちらは自動で解ける
     （常に1行だけが「本当に削除」になる）。少し待っても2回目が
     来なければ自動で解除する。うっかり後で押して即消えるのを防ぐため。 */
  function arm(id) {
    armedId = id;
    clearTimeout(armTimer);
    armTimer = setTimeout(function () {
      armedId = null;
      /* この間にタブが切り替わっていたら、他画面の描画を巻き込まない */
      if (hostEl && hostEl.classList.contains('view-trips')) render(hostEl);
    }, 3000);
    render(hostEl);
  }

  function disarm() {
    armedId = null;
    clearTimeout(armTimer);
  }

  /* 受け口は app.js が1度だけ張る */
  function onClick(e) {
    var del = e.target.closest ? e.target.closest('[data-trip-del]') : null;
    if (del) {
      var id = del.dataset.tripDel;
      if (armedId === id) {
        disarm();
        var trip = Store.trips().filter(function (x) { return x.id === id; })[0];
        Store.removeTrip(id);
        UI.toast('「' + (trip ? trip.title : '') + '」を削除しました', '取り消す',
          function () { Store.undo(); });
      } else {
        arm(id);
      }
      return;
    }

    var pick = e.target.closest ? e.target.closest('[data-trip]') : null;
    if (pick) {
      disarm();
      Store.setCurrent(pick.dataset.trip);
      Plan.resetDay();
      App.showTab('plan');
      return;
    }

    if (e.target.closest && e.target.closest('#tripAdd')) {
      disarm();
      Store.addTrip('新しい旅行');
      Plan.resetDay();
      App.showTab('settings');
      return;
    }

    /* 削除以外の場所をタップしたら、武装中の行があれば見た目を戻す */
    if (armedId !== null) { disarm(); render(hostEl); }
  }

  return { render: render, onClick: onClick };
})();
