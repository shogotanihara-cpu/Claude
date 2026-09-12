/* ─────────────────────────────────────────
   item.js — 予定1件の編集シートと、行き先候補のシート

   予定の入り口はここ1つにまとめる。タイムラインのブロックをタップしても、
   行き先候補から開いても、追加ボタンからでも同じシートが出る。
   画面ごとに似たフォームを持つと、項目を足すたび直す場所が増えるため。

   終了時刻は「開始＋所要」で自動的に決まる。手で入れる欄は作らず、
   自動で決まったことが分かる見た目（破線のバッジ）で見せる。
   ───────────────────────────────────────── */

var Item = (function () {
  'use strict';

  var editingId = null;
  var kind = 'span';
  var cat = 'see';

  /* ── 予定の編集シート ───────────────────────── */

  function open(id, presetDay, presetTime, presetCat) {
    var trip = Store.current();
    if (!trip) return;

    var it = id ? Store.itemById(id) : null;
    editingId = it ? it.id : null;
    kind = it ? it.kind : 'span';
    cat = it ? it.cat : (presetCat || 'see');

    var days = Model.daysOf(trip);
    var day = it ? it.day : (presetDay || days[0]);
    var time = it ? it.time : (presetTime || suggestTime(trip, presetDay || days[0]));

    var body =
      '<p class="form-error" id="itemError" role="alert"></p>' +

      field('種別', catPicker()) +

      field('予定名',
        '<input type="text" id="itemName" placeholder="例：物販に並ぶ" ' +
        'value="' + UI.esc(it ? it.title : '') + '">') +

      field('記録のしかた',
        '<div class="pick" id="kindPick">' +
          pickBtn('span', '期間', kind === 'span') +
          pickBtn('point', '点（時刻だけ）', kind === 'point') +
        '</div>' +
        '<p class="form-hint">開場・開演のように、その時刻であること自体が' +
        '大事な予定は「点」にすると右の列に並びます。</p>') +

      '<div class="form-pair">' +
        field('日付',
          '<select id="itemDay">' +
            '<option value=""' + (day ? '' : ' selected') + '>（行き先候補）</option>' +
            days.map(function (d) {
              return '<option value="' + d + '"' + (d === day ? ' selected' : '') + '>' +
                UI.dateLabel(d) + '</option>';
            }).join('') +
          '</select>') +
        field('開始時刻',
          '<input type="time" id="itemTime" value="' + UI.esc(time || '') + '">') +
      '</div>' +

      '<div class="form-pair" id="durRow"' + (kind === 'point' ? ' hidden' : '') + '>' +
        field('所要時間（分）',
          '<input type="number" id="itemDur" min="0" max="1440" step="5" ' +
          'value="' + (it ? (+it.dur || 0) : 60) + '">') +
        field('費用（円）',
          '<input type="number" id="itemCost" min="0" step="100" ' +
          'value="' + (it ? (+it.cost || 0) : 0) + '">') +
      '</div>' +

      '<div class="form-pair" id="costRow"' + (kind === 'point' ? '' : ' hidden') + '>' +
        field('費用（円）',
          '<input type="number" id="itemCostPoint" min="0" step="100" ' +
          'value="' + (it ? (+it.cost || 0) : 0) + '">') +
      '</div>' +

      '<p class="auto-line" id="endLine"></p>' +

      field('場所・路線',
        '<input type="text" id="itemPlace" placeholder="例：日本ガイシホール" ' +
        'value="' + UI.esc(it ? it.place : '') + '">') +

      field('メモ',
        '<textarea id="itemMemo" rows="3" ' +
        'placeholder="座席番号、持ちもの、混雑の傾向など">' +
        UI.esc(it ? it.memo : '') + '</textarea>') +

      (it ? '<button type="button" class="btn-danger" id="itemDelete">この予定を削除</button>' : '');

    var foot =
      (it ? '<button type="button" class="btn-quiet" id="itemToCand">行き先候補へ</button>' : '') +
      '<button type="button" class="btn-primary" id="itemSave">保存</button>';

    UI.openSheet(it ? '予定を編集' : '予定を追加', body, foot,
      { click: onEditorClick, input: onEditorInput });
    refreshEnd();

    if (!it) {
      setTimeout(function () {
        var el = document.getElementById('itemName');
        if (el) el.focus();
      }, 260);
    }
  }

  /* 前の予定の終わりから30分あけた時刻を初期値にする。
     旅程を上から積んでいくとき、毎回時刻を打ち直さずに済ませるため。 */
  function suggestTime(trip, day) {
    var spans = Model.spansOf(Model.scheduled(trip, day));
    if (!spans.length) return '10:00';
    var last = spans[spans.length - 1];
    return UI.fromMin(Math.min(23 * 60 + 30, UI.toMin(last.time) + (+last.dur || 0) + 30));
  }

  function field(label, inner) {
    return '<div class="form-row"><label>' + UI.esc(label) + '</label>' + inner + '</div>';
  }

  function pickBtn(value, label, on) {
    return '<button type="button" data-kind="' + value + '" aria-pressed="' + (!!on) + '">' +
      UI.esc(label) + '</button>';
  }

  function catPicker() {
    return '<div class="pick pick-cat" id="catPick">' +
      Model.CATS.map(function (c) {
        return '<button type="button" data-cat="' + c.key + '" ' +
          'aria-pressed="' + (c.key === cat) + '">' +
          '<i class="sw c-' + c.key + '"></i>' + c.label + '</button>';
      }).join('') + '</div>';
  }

  function onEditorClick(e) {
    var c = e.target.closest ? e.target.closest('[data-cat]') : null;
    if (c) {
      cat = c.dataset.cat;
      var all = document.querySelectorAll('[data-cat]');
      for (var i = 0; i < all.length; i++) {
        all[i].setAttribute('aria-pressed', all[i].dataset.cat === cat);
      }
      return;
    }
    var k = e.target.closest ? e.target.closest('[data-kind]') : null;
    if (k) { setKind(k.dataset.kind); return; }
    if (e.target.closest && e.target.closest('#itemSave')) { commit(); return; }
    if (e.target.closest && e.target.closest('#itemDelete')) { destroy(); return; }
    if (e.target.closest && e.target.closest('#itemToCand')) { toCandidate(); return; }
  }

  function onEditorInput(e) {
    if (e.target.id === 'itemTime' || e.target.id === 'itemDur') refreshEnd();
  }

  function setKind(next) {
    kind = next;
    var btns = document.querySelectorAll('[data-kind]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].dataset.kind === kind);
    }
    /* 点には所要時間が無い。欄ごと隠して、費用だけの行に差し替える */
    document.getElementById('durRow').hidden = (kind === 'point');
    document.getElementById('costRow').hidden = (kind !== 'point');
    refreshEnd();
  }

  function refreshEnd() {
    var line = document.getElementById('endLine');
    if (!line) return;
    var t = document.getElementById('itemTime').value;
    if (kind === 'point' || !t) { line.hidden = true; return; }
    var dur = Math.max(0, +document.getElementById('itemDur').value || 0);
    line.hidden = false;
    line.innerHTML = '終了 <b>' + UI.fromMin(UI.toMin(t) + dur) + '</b>' +
      '<span class="auto-badge">自動</span>';
  }

  function currentCost() {
    var el = (kind === 'point')
      ? document.getElementById('itemCostPoint')
      : document.getElementById('itemCost');
    return Math.max(0, +el.value || 0);
  }

  function commit() {
    var err = document.getElementById('itemError');
    var name = document.getElementById('itemName').value.trim();
    if (!name) {
      err.textContent = '予定名を入れてください。';
      document.getElementById('itemName').focus();
      return;
    }
    var day = document.getElementById('itemDay').value;
    var time = document.getElementById('itemTime').value;
    if (day && !time) {
      err.textContent = '日付を決めるなら時刻も要ります。時刻をあとで決めるなら、日付を「行き先候補」にしてください。';
      return;
    }

    Store.saveItem({
      id: editingId || undefined,
      kind: kind,
      cat: cat,
      title: name,
      day: day || null,
      time: day ? time : null,
      dur: (kind === 'point') ? 0 : Math.max(0, +document.getElementById('itemDur').value || 0),
      cost: currentCost(),
      place: document.getElementById('itemPlace').value.trim(),
      memo: document.getElementById('itemMemo').value.trim()
    });

    if (day) App.goToDay(day);
    UI.closeSheet();
  }

  function destroy() {
    var it = Store.itemById(editingId);
    if (!it) return;
    Store.removeItem(editingId);
    UI.closeSheet();
    UI.toast('「' + it.title + '」を削除しました', '取り消す', function () { Store.undo(); });
  }

  function toCandidate() {
    var it = Store.itemById(editingId);
    if (!it) return;
    Store.saveItem({
      id: it.id, kind: it.kind, cat: it.cat, title: it.title,
      day: null, time: null, dur: it.dur, cost: it.cost, place: it.place, memo: it.memo
    });
    UI.closeSheet();
    UI.toast('「' + it.title + '」を行き先候補に戻しました');
  }

  /* ── 行き先候補のシート ─────────────────────────
     時刻の決まっていない行きたい場所を溜めておく場所。ここから「置く」を
     押してタイムラインをタップすると、その時間に入る。
     日をまたいで動かすときも、いったんここへ戻すのがいちばん確実。 */

  function openCandidates() {
    var trip = Store.current();
    if (!trip) return;
    var list = Model.candidates(trip);

    var body;
    if (!list.length) {
      body = '<p class="empty">行き先候補はまだありません。<br>' +
        '行きたい場所を時刻を決めずに入れておくと、<br>' +
        'あとから空いている時間帯に置けます。</p>';
    } else {
      body = '<ul class="list">' + list.map(function (i) {
        var bits = [Model.catLabel(i.cat)];
        if (i.dur) bits.push(UI.fmtDur(i.dur));
        if (+i.cost) bits.push(UI.yen(i.cost));
        return '<li class="list-row">' +
          '<button type="button" class="list-main" data-cand-edit="' + i.id + '">' +
            '<i class="sw c-' + i.cat + '"></i>' +
            '<span class="list-text"><b>' + UI.esc(i.title) + '</b>' +
            '<small>' + UI.esc(bits.join(' ・ ')) + '</small></span>' +
          '</button>' +
          '<button type="button" class="list-act" data-cand-place="' + i.id + '">置く</button>' +
          '</li>';
      }).join('') + '</ul>' +
      '<p class="form-hint">「置く」を押してから、タイムラインの置きたい時間をタップします。</p>';
    }

    UI.openSheet('行き先候補', body,
      '<button type="button" class="btn-primary" id="candAdd">行き先を足す</button>',
      { click: onCandidateClick });
  }

  function onCandidateClick(e) {
    var edit = e.target.closest ? e.target.closest('[data-cand-edit]') : null;
    if (edit) { open(edit.dataset.candEdit); return; }

    var place = e.target.closest ? e.target.closest('[data-cand-place]') : null;
    if (place) {
      var id = place.dataset.candPlace;
      UI.closeSheet();
      Plan.startPlacing(id);
      return;
    }

    if (e.target.closest && e.target.closest('#candAdd')) {
      UI.closeSheet();
      /* シートが閉じきってから開き直す。重ねると閉じるアニメに巻き込まれる */
      setTimeout(function () { openBlankCandidate(); }, 220);
    }
  }

  function openBlankCandidate() {
    open(null);
    var sel = document.getElementById('itemDay');
    if (sel) sel.value = '';
    var t = document.getElementById('itemTime');
    if (t) t.value = '';
    refreshEnd();
  }

  return {
    open: open,
    openCandidates: openCandidates
  };
})();
