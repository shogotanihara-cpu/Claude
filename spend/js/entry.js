/* ─────────────────────────────────────────
   entry.js — 明細1件のシート（手入力・編集）と、一覧に並べる1行

   手入力と編集で同じシートを使う。日付と金額が先頭。
   記録が続くかどうかは入力の速さで決まるので、金額にすぐ指が届くようにする。
   ───────────────────────────────────────── */

var Entry = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;

  /* ── 一覧の1行 ────────────────────────── */

  /**
   * 明細の1行。opts.action を渡すと、右端にボタンを付ける（イベントの出し入れ用）。
   * 自動で振り分けたままのものには破線の「自動」を付けて、手で決めたものと見分ける。
   */
  function row(r, opts) {
    opts = opts || {};
    var node = el('div', 'row row-tap' + (r.off ? ' row-off' : ''));
    var m = r.cat ? Store.majorById(r.cat) : null;
    var bar = el('span', 'bar');
    bar.style.background = m ? m.color : 'var(--line)';
    node.appendChild(bar);

    var main = el('div', 'row-main');
    main.appendChild(el('div', 'row-title', Model.title(r)));
    var sub = el('div', 'row-sub');
    var bits = [];
    if (opts.showDate) bits.push(UI.fmtDate(r.date));
    bits.push(Model.classLabel(r));
    if (r.off) bits.push('集計外');
    var memo = (r.memo || r.item || '').split('\n')[0];
    if (memo && memo !== Model.title(r)) bits.push(memo);
    sub.textContent = bits.join(' ・ ');
    main.appendChild(sub);
    node.appendChild(main);

    if (!r.ok && !r.off) node.appendChild(el('span', 'badge badge-auto', r.cat ? '自動' : '未分類'));
    node.appendChild(el('span', 'amt' + (r.amt < 0 ? ' amt-minus' : ''), UI.yen(r.amt)));

    main.addEventListener('click', function () { open(r.id); });
    if (opts.action) {
      node.appendChild(btn('minibtn', opts.action.label, function () { opts.action.run(r); }));
    }
    return node;
  }

  /* ── シート ───────────────────────────── */

  function open(id) {
    var r = Store.rec(id);
    if (r) form(r);
  }

  /** 新しく手で入力する。preset で月やイベントを先に入れておける */
  function add(preset) {
    preset = preset || {};
    form(null, preset);
  }

  function form(r, preset) {
    var isNew = !r;
    preset = preset || {};
    UI.sheet(isNew ? '支出を入力' : '明細', function (body, close) {
      var top = el('div', 'pair');
      var dateBox = el('div');
      var date = UI.field(dateBox, '日付', UI.input('date', r ? r.date : (preset.date || UI.today())));
      var amtBox = el('div');
      var amt = UI.field(amtBox, '金額（円）', UI.input('number', r ? r.amt : ''));
      amt.inputMode = 'numeric';
      top.appendChild(dateBox);
      top.appendChild(amtBox);
      body.appendChild(top);

      if (isNew) {
        // 今日か昨日のことを入れる場面がほとんど。ピッカーを開かずに済ませる
        var quick = el('div', 'chips chips-tight');
        [['今日', 0], ['昨日', -1], ['おととい', -2]].forEach(function (q) {
          quick.appendChild(btn('chip', q[0], function () { date.value = UI.addDays(UI.today(), q[1]); }));
        });
        body.appendChild(quick);
      }

      var shop = UI.field(body, 'お店', UI.input('text', r ? r.shop : ''));
      var item = UI.field(body, '品目', UI.input('text', r ? r.item : ''));
      var memo = UI.field(body, 'メモ', UI.input('area', r ? r.memo : ''));

      body.appendChild(el('div', 'field-label', '分類'));
      var value = { cat: r ? r.cat : null, sub: r ? r.sub : null };
      var picked = false;
      Cats.picker(body, value, function () { picked = true; });
      if (r && !r.ok && r.cat) {
        body.appendChild(el('p', 'sheet-note',
          '自動で振り分けた仮の分類です。チップを押すと確定します' +
          (r.zcat ? '（ザイムでは ' + r.zcat + (r.zsub ? '／' + r.zsub : '') + '）。' : '。')));
      } else if (r && r.zcat) {
        body.appendChild(el('p', 'sheet-note', 'ザイムでは ' + r.zcat + (r.zsub ? '／' + r.zsub : '')));
      }

      var events = Store.events();
      var ev = null;
      if (events.length) {
        ev = el('select', 'input');
        var none = el('option', null, '入れない');
        none.value = '';
        ev.appendChild(none);
        events.forEach(function (e) {
          var o = el('option', null, e.name);
          o.value = e.id;
          ev.appendChild(o);
        });
        ev.value = (r ? r.ev : preset.ev) || '';
        UI.field(body, 'イベント', ev);
      }

      var sw = el('label', 'switch');
      var off = el('input');
      off.type = 'checkbox';
      off.checked = r ? r.off : false;
      sw.appendChild(off);
      sw.appendChild(el('span', null, '集計に含めない'));
      body.appendChild(sw);

      var actions = el('div', 'sheet-actions');
      if (!isNew) {
        actions.appendChild(btn('btn btn-danger', '削除', function () {
          close();
          Store.removeRec(r.id);
          UI.undoToast('削除しました');
        }));
      }
      actions.appendChild(btn('btn btn-primary', isNew ? '追加' : '保存', function () {
        var n = parseInt(amt.value, 10);
        if (!UI.isDate(date.value)) { date.focus(); return; }
        if (!n) { amt.focus(); return; }
        var f = {
          date: date.value, amt: n, shop: shop.value, item: item.value, memo: memo.value,
          cat: value.cat, sub: value.sub, ev: ev ? ev.value : (preset.ev || null),
          off: off.checked, confirm: picked
        };
        close();
        if (isNew) {
          Store.addRec(f);
          App.showMonth(Model.monthOf(f.date));
          UI.toast('追加しました');
        } else {
          var moved = Store.saveRec(r.id, f);
          UI.undoToast(moved ? '保存しました。同じお店の ' + moved + ' 件も振り直しました' : '保存しました');
        }
      }));
      body.appendChild(actions);

      if (isNew) setTimeout(function () { amt.focus(); }, 250);
    });
  }

  return { row: row, open: open, add: add };
})();
