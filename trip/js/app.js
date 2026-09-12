/* ─────────────────────────────────────────
   app.js — 画面の切り替えと、設定タブ

   タブは 行程 / 持ちもの / 旅行 / 設定 の4つ。
   行程が1枚目。旅行の一覧や設定は、組み立ての邪魔にならない奥へ置く。

   画面を切り替えたらスクロール位置を先頭に戻す。前の画面の途中の位置が
   残っていると、開いた瞬間に何の画面か分からなくなるため。
   ───────────────────────────────────────── */

var App = (function () {
  'use strict';

  /* 予定編集シートの並び替え対象。種別・予定名は無いと予定が成立しないので
     ここには含めず、常に先頭に固定する（item.js を参照）。 */
  var ITEM_ORDER_LABELS = {
    kind: '記録のしかた（期間・点）',
    datetime: '日付・開始時刻',
    duration: '所要時間・終了時刻・費用',
    place: '場所・路線',
    memo: 'メモ'
  };

  var TABS = [
    { key: 'plan', label: '行程', icon: 'plan' },
    { key: 'gear', label: '持ちもの', icon: 'gear' },
    { key: 'trips', label: '旅行', icon: 'trips' },
    { key: 'settings', label: '設定', icon: 'settings' }
  ];

  var tab = 'plan';
  var host = null;
  /* いま表に出ている画面の受け口。受け口そのものは start() で1度だけ張り、
     ここを差し替えて振り分ける。描画のたびに addEventListener すると、
     同じ処理が二重三重に走って予定が重複して増える。 */
  var active = null;

  function showTab(next) {
    tab = next;
    renderCurrent();
    host.scrollTop = 0;
  }

  function renderCurrent() {
    host.className = 'view view-' + tab;
    if (tab === 'plan') {
      Plan.render(host);
      active = { click: Plan.onClick };
    } else if (tab === 'gear') {
      Gear.render(host);
      active = { click: Gear.onClick, change: Gear.onChange, keydown: Gear.onKeydown };
    } else if (tab === 'trips') {
      Trips.render(host);
      active = { click: Trips.onClick };
    } else {
      renderSettings(host);
      active = {
        click: onSettingsClick,
        change: onSettingsChange,
        keydown: onSettingsKeydown
      };
    }
    renderTabbar();
  }

  function renderTabbar() {
    document.getElementById('tabbar').innerHTML = TABS.map(function (t) {
      return '<button type="button" data-tab="' + t.key + '" ' +
        'aria-current="' + (t.key === tab) + '">' +
        UI.icon(t.icon, 20) + '<span>' + t.label + '</span></button>';
    }).join('');
  }

  /* 予定を保存したあと、その日のページを開いた状態にする。
     保存で走る再描画のほうが先なので、日を決めてからもう一度描き直す。 */
  function goToDay(day) {
    Plan.goToDay(day);
    if (tab !== 'plan') { showTab('plan'); return; }
    renderCurrent();
  }

  /* ── 設定 ───────────────────────── */

  function renderSettings(el) {
    var trip = Store.current();
    if (!trip) return;

    var html = '<div class="panel-head"><h2>設定</h2><p>' +
      UI.esc(trip.title) + '</p></div>';

    html += '<div class="card"><h3>この旅行</h3>' +
      '<div class="addrow"><input type="text" id="setTitle" value="' +
        UI.esc(trip.title) + '" placeholder="旅行名"></div>' +
      '<div class="addrow">' +
        '<input type="date" id="setStart" value="' + trip.start + '">' +
        '<input type="date" id="setEnd" value="' + trip.end + '">' +
      '</div>' +
      '<div class="addrow"><button type="button" class="btn-primary btn-wide" ' +
        'id="setSave">この内容で保存</button></div>' +
      '</div>';

    html += '<div class="card"><h3>予定の種別と色</h3><ul class="list">' +
      Model.CATS.map(function (c) {
        var n = trip.items.filter(function (i) { return i.cat === c.key; }).length;
        return '<li class="list-row static">' +
          '<span class="list-main"><i class="sw c-' + c.key + '"></i>' +
          '<span class="list-text"><b>' + c.label + '</b><small>' + n + '件</small></span></span>' +
          '</li>';
      }).join('') + '</ul></div>';

    html += '<div class="card"><h3>予定入力フォームの並び順</h3><ul class="list">' +
      orderItemsHtml() + '</ul></div>' +
      '<p class="note">「種別」と「予定名」は予定として必ず要るので、いちばん上に' +
      '固定しています。それ以外はここで並び替えられます。</p>';

    html += '<div class="card"><h3>持ちもののカテゴリ</h3><ul class="list">' +
      trip.gearCats.map(function (c, i) {
        var n = trip.gear.filter(function (g) { return g.cat === c; }).length;
        return '<li class="list-row cat-row">' +
          '<span class="order">' +
            '<button type="button" data-cat-up="' + i + '"' +
              (i === 0 ? ' disabled' : '') + ' aria-label="上へ">' + UI.icon('up', 13) + '</button>' +
            '<button type="button" data-cat-down="' + i + '"' +
              (i === trip.gearCats.length - 1 ? ' disabled' : '') +
              ' aria-label="下へ">' + UI.icon('down', 13) + '</button>' +
          '</span>' +
          '<span class="list-main static"><span class="list-text"><b>' + UI.esc(c) + '</b>' +
            '<small>' + n + '件</small></span></span>' +
          '<button type="button" class="list-x" data-cat-del="' + UI.esc(c) + '" ' +
            'aria-label="削除">' + UI.icon('close', 15) + '</button>' +
          '</li>';
      }).join('') + '</ul>' +
      '<div class="addrow"><input type="text" id="catName" placeholder="カテゴリを足す">' +
        '<button type="button" class="btn-primary" id="catAdd">追加</button></div>' +
      '</div>' +
      '<p class="note">カテゴリを消しても持ちものは残り、「その他」に移ります。</p>';

    html += '<div class="card"><h3>バックアップ</h3>' +
      '<div class="addrow"><button type="button" class="btn-wide" id="backupSave">' +
        'すべての旅行を書き出す</button></div>' +
      '<div class="addrow">' +
        '<label class="btn-wide as-button" for="backupFile">書き出したファイルを読み込む</label>' +
        '<input type="file" id="backupFile" accept="application/json,.json" hidden>' +
      '</div></div>' +
      '<p class="note">記録はこの端末のブラウザの中だけにあります。' +
      '端末をまたいだ同期はしません。機種変更のときや、消えると困るときは' +
      '書き出しておいてください。読み込むと、いまの内容は置き換わります' +
      '（読み込んだ直後なら取り消せます）。</p>';

    html += '<button type="button" class="btn-wide btn-danger" id="wipe">' +
      'この旅行の予定と持ちものを消す</button>';

    el.innerHTML = html;
  }

  function onSettingsClick(e) {
    var trip = Store.current();

    {
      if (e.target.closest && e.target.closest('#setSave')) {
        var start = document.getElementById('setStart').value;
        var end = document.getElementById('setEnd').value;
        if (!start || !end) return;
        Store.updateTrip(trip.id, {
          title: document.getElementById('setTitle').value.trim() || '旅行',
          start: start,
          end: end
        });
        Plan.resetDay();
        UI.toast('保存しました');
        return;
      }

      var up = e.target.closest ? e.target.closest('[data-cat-up]') : null;
      if (up) { swapCat(+up.dataset.catUp, -1); return; }

      var down = e.target.closest ? e.target.closest('[data-cat-down]') : null;
      if (down) { swapCat(+down.dataset.catDown, 1); return; }

      var orderUp = e.target.closest ? e.target.closest('[data-item-order-up]') : null;
      if (orderUp) { swapItemOrder(+orderUp.dataset.itemOrderUp, -1); return; }

      var orderDown = e.target.closest ? e.target.closest('[data-item-order-down]') : null;
      if (orderDown) { swapItemOrder(+orderDown.dataset.itemOrderDown, 1); return; }

      var del = e.target.closest ? e.target.closest('[data-cat-del]') : null;
      if (del) {
        var name = del.dataset.catDel;
        Store.removeGearCat(name);
        UI.toast('カテゴリ「' + name + '」を消しました', '取り消す',
          function () { Store.undo(); });
        return;
      }

      if (e.target.closest && e.target.closest('#catAdd')) { addCat(); return; }

      if (e.target.closest && e.target.closest('#backupSave')) { saveBackup(); return; }

      if (e.target.closest && e.target.closest('#wipe')) {
        Store.clearCurrentContents();
        UI.toast('この旅行の中身を消しました', '取り消す', function () { Store.undo(); });
      }
    }
  }

  function onSettingsKeydown(e) {
    if (e.key === 'Enter' && e.target.id === 'catName') addCat();
  }

  function onSettingsChange(e) {
    if (e.target.id === 'backupFile' && e.target.files && e.target.files[0]) {
      loadBackup(e.target.files[0]);
    }
  }

  function orderItemsHtml() {
    var order = Store.itemOrder();
    return order.map(function (key, i) {
      return '<li class="list-row cat-row">' +
        '<span class="order">' +
          '<button type="button" data-item-order-up="' + i + '"' +
            (i === 0 ? ' disabled' : '') + ' aria-label="上へ">' + UI.icon('up', 13) + '</button>' +
          '<button type="button" data-item-order-down="' + i + '"' +
            (i === order.length - 1 ? ' disabled' : '') +
            ' aria-label="下へ">' + UI.icon('down', 13) + '</button>' +
        '</span>' +
        '<span class="list-main static"><span class="list-text"><b>' +
          UI.esc(ITEM_ORDER_LABELS[key] || key) + '</b></span></span>' +
        '</li>';
    }).join('');
  }

  function swapItemOrder(index, dir) {
    var list = Store.itemOrder();
    var to = index + dir;
    if (to < 0 || to >= list.length) return;
    var tmp = list[to];
    list[to] = list[index];
    list[index] = tmp;
    Store.setItemOrder(list);
  }

  function swapCat(index, dir) {
    var trip = Store.current();
    var list = trip.gearCats.slice();
    var to = index + dir;
    if (to < 0 || to >= list.length) return;
    var tmp = list[to];
    list[to] = list[index];
    list[index] = tmp;
    Store.setGearCats(list);
  }

  function addCat() {
    var input = document.getElementById('catName');
    var name = input.value.trim();
    if (!name) return;
    var trip = Store.current();
    if (trip.gearCats.indexOf(name) >= 0 || name === Gear.OTHER) {
      UI.toast('「' + name + '」はもうあります');
      return;
    }
    Store.setGearCats(trip.gearCats.concat([name]));
  }

  /* ── バックアップ ─────────────────────────
     localStorage は端末側の都合で消える。引き継ぎ手段がこれしかないので、
     書き出しと復元は必ず動く状態に保つ。 */

  function saveBackup() {
    var blob = new Blob([JSON.stringify(Store.exportObject(), null, 1)],
      { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'trip-' + UI.today() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    /* 押した直後に取り消すとダウンロードが始まらない端末があるので、少し置く */
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    UI.toast('書き出しました');
  }

  function loadBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data = null;
      try { data = JSON.parse(reader.result); } catch (err) { data = null; }
      if (!Store.importObject(data)) {
        UI.toast('このファイルは読み込めませんでした');
        return;
      }
      Plan.resetDay();
      showTab('trips');
      UI.toast('読み込みました', '取り消す', function () { Store.undo(); });
    };
    reader.readAsText(file);
  }

  /* ── 起動 ───────────────────────── */

  function start() {
    host = document.getElementById('viewHost');
    Store.init();
    Store.onChange(renderCurrent);

    document.getElementById('tabbar').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-tab]') : null;
      if (b) showTab(b.dataset.tab);
    });

    ['click', 'change', 'keydown'].forEach(function (type) {
      host.addEventListener(type, function (e) {
        if (active && active[type]) active[type](e);
      });
    });

    renderCurrent();
  }

  return {
    start: start,
    showTab: showTab,
    renderCurrent: renderCurrent,
    goToDay: goToDay
  };
})();

document.addEventListener('DOMContentLoaded', App.start);
