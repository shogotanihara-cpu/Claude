/* ─────────────────────────────────────────
   csv.js — ザイムのCSVを読む

   ザイムの書き出しは次の列を持つ（2026年10月時点の実物で確認）。

     日付, 方法, カテゴリ, カテゴリの内訳, 支払元, 入金先, 品目, メモ, お店,
     通貨, 収入, 支出, 振替, 残高調整, 通貨変換前の金額, 集計の設定

     - 文字コードは Shift_JIS。UTF-8 で書き出した場合にも備えて両方試す
     - メモの中に改行が入ることがあるので、行で切らずに引用符を追って読む
     - 方法が payment の行だけが支出。income / transfer / balance は対象外
     - 値引きや返金は、支出がマイナスの行として入っている

   列は位置ではなく見出しの名前で探す。ザイムが列を足しても壊れないように。
   ───────────────────────────────────────── */

var Csv = (function () {
  'use strict';

  var el = UI.el, btn = UI.btn;

  /** 引用符と、その中の改行・カンマに対応した素朴な読み取り。行の配列を返す */
  function parse(text) {
    var rows = [], row = [], cell = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quoted) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i++; }
          else quoted = false;
        } else cell += ch;
        continue;
      }
      if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || r[0] !== ''; });
  }

  function decode(buffer) {
    var text;
    try {
      // fatal を付けると、UTF-8 として読めないバイトで例外になる。それを合図に切り替える
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (e) {
      text = new TextDecoder('shift_jis').decode(buffer);
    }
    return text.replace(/^﻿/, '');
  }

  function normDate(s) {
    var m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(String(s || '').trim());
    if (!m) return null;
    return m[1] + '-' + (m[2].length < 2 ? '0' : '') + m[2] + '-' + (m[3].length < 2 ? '0' : '') + m[3];
  }

  /* 「QUICPay利用（QP/…）」と「QUICPay利用(QP/…)」のように、お店と品目が
     全角・半角だけ違う同じ文字列で入っていることが多い。比べるときだけ揃える */
  function fold(s) { return s.normalize ? s.normalize('NFKC') : s; }

  function dash(s) {
    s = String(s == null ? '' : s).trim();
    return s === '-' ? '' : s;
  }

  /**
   * 読んだ表を、取り込める形の行にする。
   * 返り値 { rows, other, from, to }。other は支出ではないので飛ばした行数。
   */
  function toRows(table) {
    if (!table.length) throw new Error('中身が空です');
    var head = table[0].map(function (h) { return h.trim(); });
    function col(name) { return head.indexOf(name); }
    var cDate = col('日付'), cAmt = col('支出');
    if (cDate < 0 || cAmt < 0) throw new Error('「日付」「支出」の列が見つかりません。ザイムのCSVではないようです');
    var cHow = col('方法'), cCat = col('カテゴリ'), cSub = col('カテゴリの内訳');
    var cItem = col('品目'), cMemo = col('メモ'), cShop = col('お店'), cOff = col('集計の設定');

    function at(r, c) { return c < 0 ? '' : String(r[c] == null ? '' : r[c]); }

    var rows = [], other = 0, from = null, to = null;
    table.slice(1).forEach(function (r) {
      var date = normDate(at(r, cDate));
      var amt = parseInt(at(r, cAmt).replace(/[,¥\s]/g, ''), 10);
      if (!date || !amt || (cHow >= 0 && at(r, cHow).trim() !== 'payment')) { other++; return; }
      var shop = dash(at(r, cShop)), item = dash(at(r, cItem));
      // 品目がお店と同じなら持たない。同じ文字を2回保存するだけになる
      if (item && fold(item) === fold(shop)) item = '';
      rows.push({
        date: date, amt: amt, shop: shop, item: item,
        memo: at(r, cMemo).trim(),
        zcat: dash(at(r, cCat)), zsub: dash(at(r, cSub)),
        off: at(r, cOff).trim() === '集計に含めない'
      });
      if (!from || date < from) from = date;
      if (!to || date > to) to = date;
    });
    return { rows: rows, other: other, from: from, to: to };
  }

  /* ── 取り込みの流れ ───────────────────── */

  /** ファイルを選ぶボタン。押すとすぐ読み、内訳を見せてから取り込む */
  function fileButton(cls, label) {
    var wrap = el('label', cls + ' btn-file');
    wrap.appendChild(el('span', null, label));
    var file = el('input');
    file.type = 'file';
    file.accept = '.csv,text/csv';
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (f) read(f);
      file.value = '';
    });
    wrap.appendChild(file);
    return wrap;
  }

  function read(f) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        preview(toRows(parse(decode(reader.result))));
      } catch (e) {
        UI.toast('読み込めませんでした（' + e.message + '）');
      }
    };
    reader.onerror = function () { UI.toast('ファイルを開けませんでした'); };
    reader.readAsArrayBuffer(f);
  }

  function line(host, label, value) {
    var row = el('div', 'kv');
    row.appendChild(el('span', 'kv-k', label));
    row.appendChild(el('span', 'kv-v', value));
    host.appendChild(row);
  }

  /* 取り込む前に件数を見せる。何千件も入るので、押す前に中身が分かるようにする */
  function preview(parsed) {
    var plan = Store.planImport(parsed.rows);
    UI.sheet('ザイムのCSVを取り込む', function (body, close) {
      if (!parsed.rows.length) {
        body.appendChild(el('p', 'sheet-note', '支出の行が見つかりませんでした。'));
        return;
      }
      var box = el('div', 'kvs');
      line(box, '期間', UI.fmtRange(parsed.from, parsed.to));
      line(box, '新しく入る支出', plan.fresh.length + ' 件');
      line(box, '取り込み済み', plan.dup + ' 件');
      line(box, '対象外（収入・振替など）', parsed.other + ' 件');
      body.appendChild(box);
      body.appendChild(el('p', 'sheet-note',
        '取り込み済みの明細は飛ばします。このアプリで直した分類やメモは上書きしません。' +
        'ザイムで「集計に含めない」にしてある支出は、こちらでも集計の外に置きます。'));
      var row = el('div', 'sheet-actions');
      row.appendChild(btn('btn btn-ghost', 'やめる', close));
      var go = btn('btn btn-primary', plan.fresh.length + ' 件を取り込む', function () {
        close();
        var n = Store.applyImport(plan.fresh);
        App.afterImport(parsed.to);
        UI.undoToast(n + ' 件を取り込みました');
      });
      go.disabled = !plan.fresh.length;
      row.appendChild(go);
      body.appendChild(row);
    });
  }

  return { parse: parse, decode: decode, toRows: toRows, fileButton: fileButton };
})();
