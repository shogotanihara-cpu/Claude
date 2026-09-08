/* ─────────────────────────────────────────
   app.js — 画面制御
   ───────────────────────────────────────── */

(function () {
  'use strict';

  var TITLES = {
    timeline: 'タイムライン',
    summary: 'サマリー',
    search: '検索',
    settings: '設定'
  };

  var KIND_LABEL = { span: '期間で記録', point: '点で記録', scale: '体調（1〜5）で記録' };

  var app = {
    tab: 'timeline',
    day: UI.startOfDay(Date.now()),
    summaryMode: 'week',
    summaryAnchor: Date.now(),
    query: '',
    filters: []
  };

  /** 現在の summaryMode / summaryAnchor から表示範囲を求める */
  function summaryPeriod() {
    var mode = app.summaryMode;
    var anchor = app.summaryAnchor;

    if (mode === 'week') {
      var wFrom = UI.startOfWeekMonday(anchor);
      return { from: wFrom, to: UI.addDays(wFrom, 7), label: UI.fmtWeekLabel(wFrom) };
    }
    if (mode === 'month') {
      var mFrom = UI.startOfMonth(anchor);
      return { from: mFrom, to: UI.addMonths(mFrom, 1), label: UI.fmtMonthLabel(mFrom) };
    }
    var lastMonth = UI.startOfMonth(anchor);
    var qFrom = UI.addMonths(lastMonth, -2);
    return {
      from: qFrom, to: UI.addMonths(lastMonth, 1),
      label: UI.fmtMonthRangeLabel(qFrom, lastMonth)
    };
  }

  function shiftSummaryAnchor(dir) {
    if (app.summaryMode === 'week') {
      app.summaryAnchor = UI.addDays(app.summaryAnchor, dir * 7);
    } else {
      app.summaryAnchor = UI.addMonths(app.summaryAnchor, dir);
    }
  }

  /* ═════════ 画面切り替え ═════════ */

  function setTab(tab) {
    app.tab = tab;
    ['timeline', 'summary', 'search', 'settings'].forEach(function (t) {
      UI.el('view-' + t).hidden = (t !== tab);
    });
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.tab === tab);
    });
    UI.el('appbarTitle').textContent = TITLES[tab];
    UI.el('datebar').classList.toggle('is-hidden', tab !== 'timeline');
    UI.el('fab').hidden = (tab === 'settings');
    window.scrollTo(0, 0);
    render();
    if (tab === 'timeline') scrollTimeline();
  }

  var pendingScroll = false;
  function scrollTimeline() { pendingScroll = true; render(); }

  function render() {
    if (app.tab === 'timeline') renderTimeline();
    else if (app.tab === 'summary') renderSummary();
    else if (app.tab === 'search') renderSearch();
    else renderSettings();
  }

  /* ═════════ タイムライン ═════════ */

  function renderTimeline() {
    UI.el('dateText').textContent = UI.fmtDateFull(app.day);
    UI.el('datePicker').value = UI.dateInputValue(app.day);

    renderQuickBar();
    renderNudge();
    var result = Timeline.render(
      UI.el('timeline'), app.day, openEditor,
      function (ts) { openEditor(null, ts); },
      function (startTs, endTs, x, y) { openDragCategoryPicker(startTs, endTs, x, y); }
    );
    renderDayStats(result);

    if (pendingScroll) {
      pendingScroll = false;
      Timeline.scrollToRelevant(app.day, result.spans, result.points);
    }
  }

  /** ワンタップで記録するボタン列 */
  function renderQuickBar() {
    var box = UI.el('quickBar');
    var cats = Store.quickCategories();

    if (!cats.length) {
      box.innerHTML = '';
      box.hidden = true;
      return;
    }
    box.hidden = false;

    box.innerHTML = cats.map(function (c) {
      if (c.kind === 'span') {
        var run = Store.runningOf(c.id);
        if (run) {
          return '<button class="qb is-live" data-quick="' + c.id + '" style="background:' +
            c.color + ';color:' + UI.textOn(c.color) + '">' +
            '<span class="qb-dot"></span>' + UI.esc(c.name) +
            '<span class="qb-meta">' + UI.fmtDuration(Date.now() - run.start) + '</span>' +
            '</button>';
        }
        return '<button class="qb" data-quick="' + c.id + '">' +
          '<span class="qb-dot" style="background:' + c.color + '"></span>' + UI.esc(c.name) +
          '<span class="qb-sign">開始</span></button>';
      }
      return '<button class="qb" data-quick="' + c.id + '">' +
        '<span class="qb-dot" style="background:' + c.color + '"></span>' + UI.esc(c.name) +
        '<span class="qb-sign">' + (c.kind === 'scale' ? '記録' : '＋') + '</span></button>';
    }).join('');

    box.querySelectorAll('[data-quick]').forEach(function (b) {
      b.addEventListener('click', function () { quickTap(b.dataset.quick); });
    });
  }

  /** 記録し忘れているものがあれば、今日ぶんだけ知らせる */
  function renderNudge() {
    var box = UI.el('nudgeBox');
    var today = UI.startOfDay(Date.now());

    // 今日を見ているときだけ出す。閉じたらその日は出さない
    if (app.day !== today || Notify.isDismissedToday()) { box.innerHTML = ''; return; }

    var list = Notify.due();
    if (!list.length) { box.innerHTML = ''; return; }

    box.innerHTML = '<div class="nudge">' +
      '<div class="nudge-main">' +
        '<div class="nudge-title">まだ記録がありません</div>' +
        '<div class="nudge-list">' + list.map(function (r) {
          var name = r.catId ? Store.category(r.catId).name : '記録';
          return '<span>' + r.time + ' ' + UI.esc(name) + '</span>';
        }).join('') + '</div>' +
      '</div>' +
      '<button class="nudge-close" id="nudgeClose" aria-label="閉じる">×</button>' +
    '</div>';

    UI.el('nudgeClose').addEventListener('click', function () {
      Notify.dismissToday();
      renderNudge();
    });
  }

  /**
   * タイムラインをドラッグして期間を選んだ直後に出す、軽いカテゴリ選択。
   * 入力画面(シート)には遷移せず、チップを1回タップするだけで記録を確定する。
   */
  function openDragCategoryPicker(startTs, endTs, x, y) {
    var cats = Store.categories().filter(function (c) { return c.kind === 'span'; });
    if (!cats.length) { openEditor(null, startTs); return; }   // 期間カテゴリが無ければ通常の入力へ

    var scrim = document.createElement('div');
    scrim.className = 'drag-scrim';

    var pop = document.createElement('div');
    pop.className = 'drag-pop';
    pop.innerHTML =
      '<div class="drag-pop-time">' + UI.fmtTime(startTs) + '–' + UI.fmtTime(endTs) +
        '・' + UI.fmtDuration(endTs - startTs) + '</div>' +
      '<div class="drag-pop-chips">' + cats.map(function (c) {
        return '<button class="chip" data-cat="' + c.id + '" style="background:' + c.color +
          ';color:' + UI.textOn(c.color) + '">' + UI.esc(c.name) + '</button>';
      }).join('') + '</div>';

    document.body.appendChild(scrim);
    document.body.appendChild(pop);

    // 指を離した位置の近くに、画面外へはみ出さないよう置く
    var margin = 10;
    var rect = pop.getBoundingClientRect();
    var left = Math.min(Math.max(x - rect.width / 2, margin), window.innerWidth - rect.width - margin);
    var top = Math.min(Math.max(y - rect.height - 18, margin), window.innerHeight - rect.height - margin);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';

    function close() { scrim.remove(); pop.remove(); }
    scrim.addEventListener('click', close);
    pop.querySelectorAll('[data-cat]').forEach(function (b) {
      b.addEventListener('click', function () {
        var cat = Store.category(b.dataset.cat);
        Store.addLog({ catId: cat.id, type: 'span', start: startTs, end: endTs, memo: '', scale: null });
        UI.toast(cat.name + 'を記録しました');
        close();
      });
    });
  }

  function quickTap(catId) {
    var cat = Store.category(catId);
    var now = Date.now();
    app.day = UI.startOfDay(now);   // 記録した日を表示する

    if (cat.kind === 'scale') { openScaleSheet(catId, now, null); return; }

    if (cat.kind === 'span') {
      var run = Store.runningOf(catId);
      if (run) {
        // 押し間違いで開始した直後の再タップは、記録を作らず取り消す
        if (now - run.start < 60000) {
          Store.removeLog(run.id);
          UI.toast(cat.name + 'の開始を取り消しました');
          return;
        }
        Store.updateLog(run.id, { end: now });
        UI.toast(cat.name + 'を終了 ・ ' + UI.fmtDuration(now - run.start));
      } else {
        Store.addLog({ catId: catId, type: 'span', start: now, end: null, memo: '', scale: null });
        UI.toast(cat.name + 'を開始しました');
      }
      return;
    }

    Store.addLog({ catId: catId, type: 'point', start: now, end: null, memo: '', scale: null });
    UI.toast(cat.name + 'を記録しました');
  }

  function renderDayStats(result) {
    var box = UI.el('dayStats');
    var runBox = UI.el('runningBox');
    var html = '';

    Store.runningLogs().forEach(function (l) {
      var cat = Store.category(l.catId);
      html += '<div class="running-card" style="background:' + cat.color + ';color:' +
        UI.textOn(cat.color) + '">' +
        '<div class="rc-main">' +
          '<div class="rc-title">' + UI.esc(cat.name) + ' 記録中</div>' +
          '<div class="rc-time">' + UI.fmtTime(l.start) + ' から ' +
            UI.fmtDuration(Date.now() - l.start) + '</div>' +
        '</div>' +
        '<button class="rc-stop" data-stop="' + l.id + '">終了</button>' +
      '</div>';
    });

    var totals = {};
    result.spans.forEach(function (s) {
      totals[s.log.catId] = (totals[s.log.catId] || 0) + (s.to - s.from);
    });
    var chips = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; })
      .map(function (cid) {
        var cat = Store.category(cid);
        return '<div class="daystat"><span class="dot" style="background:' + cat.color + '"></span>' +
          UI.esc(cat.name) + ' <b>' + UI.fmtDuration(totals[cid]) + '</b></div>';
      }).join('');

    // 体調はその日の平均を出す
    var scales = result.points.filter(function (p) { return p.type === 'scale' && p.scale; });
    if (scales.length) {
      var sum = 0;
      scales.forEach(function (p) { sum += p.scale; });
      var avg = Math.round(sum / scales.length * 10) / 10;
      var si = Store.scaleInfo(Math.round(sum / scales.length));
      chips = '<div class="daystat"><span class="dot" style="background:' + si.color +
        '"></span>体調 <b>' + avg + '</b></div>' + chips;
    }

    var pts = result.points.filter(function (p) { return p.type === 'point'; });
    if (pts.length) {
      chips += '<div class="daystat">記録した出来事 <b>' + pts.length + '件</b></div>';
    }
    if (!chips) chips = '<div class="daystat">この日の記録はまだありません</div>';

    runBox.innerHTML = html;
    box.innerHTML = chips;

    runBox.querySelectorAll('[data-stop]').forEach(function (b) {
      b.addEventListener('click', function () {
        Store.updateLog(b.dataset.stop, { end: Date.now() });
        UI.toast('記録を終了しました');
      });
    });
  }

  /* ═════════ サマリー ═════════ */

  function renderSummary() {
    var period = summaryPeriod();
    UI.el('summaryLabel').textContent = period.label;
    Summary.render(UI.el('summaryBody'), period.from, period.to);

    var btn = UI.el('reportBtn');
    if (btn) {
      btn.onclick = function () { Report.open(period.from, period.to); };
    }
  }

  /* ═════════ 検索 ═════════ */

  function renderSearch() {
    var fbox = UI.el('searchFilters');
    fbox.innerHTML = Store.categories().map(function (c) {
      var on = app.filters.indexOf(c.id) >= 0;
      return '<button class="chip' + (on ? ' is-on' : '') + '" data-cat="' + c.id + '"' +
        (on ? ' style="background:' + c.color + ';color:' + UI.textOn(c.color) + '"' : '') + '>' +
        '<span class="dot" style="background:' + c.color + '"></span>' + UI.esc(c.name) + '</button>';
    }).join('');
    fbox.querySelectorAll('[data-cat]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.cat;
        var i = app.filters.indexOf(id);
        if (i >= 0) app.filters.splice(i, 1); else app.filters.push(id);
        renderSearch();
      });
    });

    var q = app.query.trim().toLowerCase();
    var results = Store.logs().filter(function (l) {
      if (app.filters.length && app.filters.indexOf(l.catId) < 0) return false;
      if (!q) return true;
      var cat = Store.category(l.catId);
      return (l.memo || '').toLowerCase().indexOf(q) >= 0 ||
             cat.name.toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return b.start - a.start; });

    var box = UI.el('searchResults');
    if (!results.length) {
      box.innerHTML = '<div class="empty">該当する記録はありません。</div>';
      return;
    }

    var html = '';
    var lastDay = null;
    var shown = results.slice(0, 300);

    shown.forEach(function (l) {
      var day = UI.startOfDay(l.start);
      if (day !== lastDay) {
        if (lastDay !== null) html += '</div>';
        html += '<div class="card"><div class="card-title">' + UI.fmtDateFull(day) + '</div>';
        lastDay = day;
      }
      var cat = Store.category(l.catId);
      var sub;
      if (l.type === 'span') {
        sub = UI.fmtTime(l.start) + '–' + (l.end ? UI.fmtTime(l.end) : '継続中') +
              '・' + UI.fmtDuration((l.end || Date.now()) - l.start);
      } else if (l.type === 'scale') {
        sub = UI.fmtTime(l.start) + '・' + Store.scaleInfo(l.scale).label;
      } else {
        sub = UI.fmtTime(l.start);
      }
      var mark = (l.type === 'scale' && l.scale)
        ? '<span class="dot" style="background:' + Store.scaleInfo(l.scale).color + '"></span>'
        : '<span class="dot" style="background:' + cat.color + '"></span>';
      html += '<button class="row" data-open="' + l.id + '">' + mark +
        '<div class="row-main">' +
          '<div class="row-title">' + UI.esc(cat.name) +
            (l.memo ? ' <span style="font-weight:400;color:var(--text-dim)">' + UI.esc(l.memo) + '</span>' : '') +
          '</div>' +
          '<div class="row-sub">' + sub + '</div>' +
        '</div></button>';
    });
    html += '</div>';
    if (results.length > shown.length) {
      html += '<div class="hint" style="text-align:center;padding:0 14px 12px">' +
        '他 ' + (results.length - shown.length) + ' 件（絞り込んでください）</div>';
    }

    box.innerHTML = html;
    box.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(b.dataset.open); });
    });
  }

  /* ═════════ 設定 ═════════ */

  function renderSettings() {
    var cats = Store.categories().map(function (c) {
      return '<button class="row" data-editcat="' + c.id + '">' +
        '<span class="swatch" style="background:' + c.color + '"></span>' +
        '<div class="row-main"><div class="row-title">' + UI.esc(c.name) +
          (c.quick ? ' <span style="font-size:10px;color:var(--accent);font-weight:700">ワンタップ</span>' : '') +
        '</div>' +
        '<div class="row-sub">' + KIND_LABEL[c.kind] + '・' + Store.categoryUsage(c.id) + '件</div></div>' +
        '<span style="color:var(--text-faint)">›</span></button>';
    }).join('');

    UI.el('settingsBody').innerHTML =
      '<div class="card">' +
        '<div class="card-title">カテゴリ</div>' + cats +
        '<div class="btn-row"><button class="btn btn-sub" id="addCatBtn">カテゴリを追加</button></div>' +
        '<p class="hint" style="margin-top:12px">「ワンタップ」にしたカテゴリは、タイムラインの上部に出て1回のタップで記録できます。</p>' +
      '</div>' +

      reminderCardHTML() +

      '<div class="card">' +
        '<div class="card-title">データ</div>' +
        '<p class="hint">記録はこの端末のブラウザ内だけに保存されます。' +
        '機種変更やブラウザのデータ削除で消えるため、ときどきバックアップを保存してください。' +
        'バックアップのファイルは、新しい端末で「復元」すればそのまま引き継げます。</p>' +
        '<div class="btn-row">' +
          '<button class="btn btn-sub" id="backupBtn">バックアップ</button>' +
          '<button class="btn btn-sub" id="restoreBtn">復元</button>' +
        '</div>' +
        '<input type="file" id="restoreFile" accept="application/json,.json" hidden>' +
        '<div class="btn-row"><button class="btn btn-sub" id="csvBtn">CSVで書き出す</button></div>' +
        '<p class="hint" style="margin-top:10px">CSVは表計算ソフトで開けます。' +
        'バックアップ（JSON）と違い、復元には使えません。</p>' +
        '<div class="btn-row"><button class="btn btn-danger" id="clearBtn">すべての記録を削除</button></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">使い方</div>' +
        '<p class="hint">' +
        '・上部のボタンで、睡眠の開始／終了、服薬、体調をワンタップで記録できます。<br>' +
        '・「期間」は睡眠のように長さがあるもの、「点」は服薬のようにその瞬間の記録、' +
        '「体調」は1〜5で今の状態を残すときに使います。<br>' +
        '・終了時刻を空にすると「継続中」として記録され、あとから終了できます。<br>' +
        '・終了時刻が開始より前のときは、日をまたいだものとして扱います（例 23:00→07:00）。<br>' +
        '・サマリーの「受診用レポート」から、期間をまとめた1枚を印刷・PDF保存できます。' +
        '</p>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">このアプリについて</div>' +
        '<p class="hint">記録の保存と表示のみを行います。診断や治療の判断は行いません。' +
        '体調の変化が気になるときは、記録を持って医療機関にご相談ください。</p>' +
      '</div>';

    UI.el('addCatBtn').addEventListener('click', function () { openCategoryEditor(null); });
    UI.el('settingsBody').querySelectorAll('[data-editcat]').forEach(function (b) {
      b.addEventListener('click', function () { openCategoryEditor(b.dataset.editcat); });
    });
    bindReminderCard();

    UI.el('csvBtn').addEventListener('click', function () {
      Exporter.downloadCSV();
      UI.toast('CSVを書き出しました');
    });

    UI.el('backupBtn').addEventListener('click', function () {
      var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'log-' + UI.dateInputValue(Date.now()) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });

    UI.el('restoreBtn').addEventListener('click', function () { UI.el('restoreFile').click(); });
    UI.el('restoreFile').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      if (!confirm('現在の記録をバックアップの内容で置き換えます。よろしいですか?')) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { Store.importJSON(reader.result); UI.toast('復元しました'); }
        catch (err) { alert('復元できませんでした: ' + err.message); }
      };
      reader.readAsText(file);
    });

    UI.el('clearBtn').addEventListener('click', function () {
      if (!confirm('すべての記録とカテゴリを削除します。元に戻せません。よろしいですか?')) return;
      Store.clearAll();
      UI.toast('削除しました');
    });
  }

  /* ═════════ リマインダー ═════════ */

  function reminderCardHTML() {
    var list = Store.reminders();
    var rows = list.length
      ? list.map(function (r) {
          var name = r.catId ? Store.category(r.catId).name : 'すべての記録';
          return '<button class="row" data-editrem="' + r.id + '">' +
            '<span class="row-val" style="width:52px">' + r.time + '</span>' +
            '<div class="row-main"><div class="row-title">' + UI.esc(name) + '</div>' +
            '<div class="row-sub">この時刻までに記録がなければ知らせます</div></div>' +
            '<span style="color:var(--text-faint)">›</span></button>';
        }).join('')
      : '<p class="hint">まだ設定されていません。</p>';

    var perm = Notify.permission();
    var permRow = '';
    if (list.length) {
      if (perm === 'granted') {
        permRow = '<p class="hint" style="margin-top:12px">' +
          'ブラウザ通知は<b>オン</b>です。ただしアプリを閉じている間は鳴りません。' +
          '確実に知らせてほしい場合は、下のボタンでカレンダーに登録してください。</p>';
      } else if (perm === 'unsupported') {
        permRow = '<p class="hint" style="margin-top:12px">' +
          'この環境ではブラウザ通知が使えません。カレンダーに登録してお使いください。</p>';
      } else if (perm === 'denied') {
        permRow = '<p class="hint" style="margin-top:12px">' +
          'ブラウザ通知はブロックされています。カレンダーに登録してお使いください。</p>';
      } else {
        permRow = '<div class="btn-row"><button class="btn btn-sub" id="permBtn">ブラウザ通知を許可する</button></div>';
      }
    }

    return '<div class="card">' +
      '<div class="card-title">リマインダー</div>' + rows +
      '<div class="btn-row"><button class="btn btn-sub" id="addRemBtn">リマインダーを追加</button></div>' +
      permRow +
      (list.length
        ? '<div class="btn-row"><button class="btn btn-sub" id="icsBtn">カレンダーに登録</button></div>' +
          '<p class="hint" style="margin-top:10px">' +
          'カレンダーに登録すると、アプリを閉じていても端末の標準アプリが毎日知らせてくれます。' +
          'iPhone で確実に知らせてほしい場合はこちらをお使いください。</p>'
        : '') +
      '</div>';
  }

  function openReminderEditor(id) {
    var rem = null;
    if (id) {
      Store.reminders().forEach(function (r) { if (r.id === id) rem = r; });
    }
    var cats = Store.categories();

    var opts = '<option value="">すべての記録</option>' + cats.map(function (c) {
      return '<option value="' + c.id + '"' +
        (rem && rem.catId === c.id ? ' selected' : '') + '>' + UI.esc(c.name) + '</option>';
    }).join('');

    UI.openSheet(
      '<h2>' + (rem ? 'リマインダーを編集' : 'リマインダーを追加') + '</h2>' +
      '<div class="field"><label>時刻</label>' +
        '<input type="time" id="rTime" value="' + (rem ? rem.time : '21:00') + '"></div>' +
      '<div class="field"><label>対象</label>' +
        '<select id="rCat">' + opts + '</select>' +
        '<p class="hint" style="margin-top:8px">選んだカテゴリの記録が、その日まだ1件もないときに知らせます。</p>' +
      '</div>' +
      '<button class="btn" id="rSave">保存</button>' +
      (rem ? '<div class="btn-row"><button class="btn btn-danger" id="rDel">削除</button></div>' : '') +
      '<div class="btn-row"><button class="btn btn-sub" id="rCancel">キャンセル</button></div>',
      function (root) {
        root.querySelector('#rSave').addEventListener('click', function () {
          var time = root.querySelector('#rTime').value;
          if (!time) { alert('時刻を入力してください。'); return; }
          var catId = root.querySelector('#rCat').value || null;
          if (rem) Store.updateReminder(rem.id, { time: time, catId: catId });
          else Store.addReminder(time, catId);
          Notify.schedule();
          UI.toast('保存しました');
          UI.closeSheet();
        });
        if (rem) {
          root.querySelector('#rDel').addEventListener('click', function () {
            Store.removeReminder(rem.id);
            Notify.schedule();
            UI.toast('削除しました');
            UI.closeSheet();
          });
        }
        root.querySelector('#rCancel').addEventListener('click', UI.closeSheet);
      }
    );
  }

  function bindReminderCard() {
    var body = UI.el('settingsBody');

    body.querySelectorAll('[data-editrem]').forEach(function (b) {
      b.addEventListener('click', function () { openReminderEditor(b.dataset.editrem); });
    });
    UI.el('addRemBtn').addEventListener('click', function () { openReminderEditor(null); });

    var permBtn = UI.el('permBtn');
    if (permBtn) {
      permBtn.addEventListener('click', function () {
        Notify.request(function (res) {
          if (res === 'granted') { Notify.schedule(); UI.toast('通知を許可しました'); }
          else UI.toast('通知は許可されませんでした');
          renderSettings();
        });
      });
    }

    var icsBtn = UI.el('icsBtn');
    if (icsBtn) {
      icsBtn.addEventListener('click', function () {
        Exporter.downloadICS();
        UI.toast('カレンダー用のファイルを書き出しました');
      });
    }
  }

  /* ═════════ 体調の記録（ワンタップからの近道） ═════════ */

  function scaleOptionsHTML() {
    return Store.SCALE.map(function (s) {
      return '<button class="sp" data-scale="' + s.v + '">' +
        '<span class="sp-mark"></span>' +
        '<span class="sp-label">' + s.v + '<br>' + UI.esc(s.label) + '</span></button>';
    }).join('');
  }

  /** スケール選択の見た目を塗り直す。色は JS 側で明示的に当てる */
  function paintScale(root, sel) {
    root.querySelectorAll('[data-scale]').forEach(function (b) {
      var v = +b.dataset.scale;
      var info = Store.scaleInfo(v);
      var on = (v === sel);
      b.classList.toggle('is-on', on);
      b.style.background = on ? info.color : '';
      b.style.borderColor = on ? 'transparent' : '';
      b.querySelector('.sp-mark').style.borderColor = on ? 'transparent' : info.color;
      b.querySelector('.sp-mark').style.background = on ? 'rgba(255,255,255,.92)' : '';
      b.querySelector('.sp-label').style.color = on ? '#fff' : '';
    });
  }

  function openScaleSheet(catId, ts, log) {
    var cat = Store.category(catId);

    UI.openSheet(
      '<h2>' + UI.esc(cat.name) + 'を記録</h2>' +
      '<div class="field"><label>いまの状態</label>' +
        '<div class="scalepick" id="spRow">' + scaleOptionsHTML() + '</div></div>' +
      '<div class="field"><label>メモ</label>' +
        '<textarea id="spMemo" placeholder="任意">' + UI.esc(log ? log.memo : '') + '</textarea></div>' +
      '<button class="btn" id="spSave">保存</button>' +
      '<div class="btn-row"><button class="btn btn-sub" id="spCancel">キャンセル</button></div>',
      function (root) {
        var sel = log ? log.scale : null;
        paintScale(root, sel);
        root.querySelectorAll('[data-scale]').forEach(function (b) {
          b.addEventListener('click', function () {
            sel = +b.dataset.scale;
            paintScale(root, sel);
          });
        });

        root.querySelector('#spSave').addEventListener('click', function () {
          if (!sel) { alert('状態を選んでください。'); return; }
          var memo = root.querySelector('#spMemo').value.trim();
          app.day = UI.startOfDay(ts);
          if (log) Store.updateLog(log.id, { scale: sel, memo: memo });
          else Store.addLog({ catId: catId, type: 'scale', start: ts, end: null, memo: memo, scale: sel });
          UI.toast('記録しました');
          UI.closeSheet();
        });
        root.querySelector('#spCancel').addEventListener('click', UI.closeSheet);
      }
    );
  }

  /* ═════════ 記録の追加・編集 ═════════ */

  function lastUsedCatId(cats) {
    var logs = Store.logs();
    var latest = null;
    logs.forEach(function (l) { if (!latest || l.start > latest.start) latest = l; });
    if (latest && cats.some(function (c) { return c.id === latest.catId; })) return latest.catId;
    return cats[0] && cats[0].id;
  }

  /**
   * @param {string|null} id            編集する記録のID。新規なら null
   * @param {number} [prefillStart]     タイムライン上の空欄をタップして開いた場合の開始時刻
   */
  function openEditor(id, prefillStart) {
    var log = id ? Store.getLog(id) : null;
    var cats = Store.categories();
    var now = Date.now();
    var isToday = UI.startOfDay(now) === app.day;

    var catId = log ? log.catId : lastUsedCatId(cats);
    var type = log ? log.type : Store.category(catId).kind;
    var start = log ? log.start :
      (prefillStart !== undefined ? prefillStart : (isToday ? now : app.day + 9 * UI.HOUR));
    var end = log ? log.end : null;
    // 時間帯を指定して開いたときは、具体的な開始〜終了を入力してもらう
    // （「継続中」の既定チェックは、いま現在から始める場合だけにする）
    var open = log ? (log.type === 'span' && !log.end) : (prefillStart === undefined && isToday);

    var html =
      '<h2>' + (log ? '記録を編集' : '記録を追加') + '</h2>' +

      '<div class="field"><label>種類</label>' +
        '<div class="seg" style="margin:0">' +
          '<button class="seg-btn" data-type="span">期間</button>' +
          '<button class="seg-btn" data-type="point">点</button>' +
          '<button class="seg-btn" data-type="scale">体調</button>' +
        '</div>' +
      '</div>' +

      '<div class="field"><label>カテゴリ</label>' +
        '<div class="chiprow" id="catChips" style="padding:0"></div>' +
      '</div>' +

      '<div class="field" id="scaleField"><label>状態</label>' +
        '<div class="scalepick" id="spRow">' + scaleOptionsHTML() + '</div></div>' +

      '<div class="field"><label>日付</label>' +
        '<input type="date" id="fDate" value="' + UI.dateInputValue(start) + '"></div>' +

      '<div class="field-2">' +
        '<div class="field"><label id="lblStart">開始</label>' +
          '<input type="time" id="fStart" value="' + UI.timeInputValue(start) + '"></div>' +
        '<div class="field" id="endField"><label>終了</label>' +
          '<input type="time" id="fEnd" value="' + (end ? UI.timeInputValue(end) : '') + '"></div>' +
      '</div>' +

      '<div class="field" id="openField">' +
        '<label class="check"><input type="checkbox" id="fOpen"' + (open ? ' checked' : '') + '>' +
        '終了時刻はあとで入力する（継続中）</label></div>' +

      '<div class="field"><label>メモ</label>' +
        '<textarea id="fMemo" placeholder="任意">' + UI.esc(log ? log.memo : '') + '</textarea></div>' +

      '<button class="btn" id="saveBtn">保存</button>' +
      (log ? '<div class="btn-row"><button class="btn btn-danger" id="delBtn">削除</button></div>' : '') +
      '<div class="btn-row"><button class="btn btn-sub" id="cancelBtn">キャンセル</button></div>';

    UI.openSheet(html, function (root) {
      var cur = { type: type, catId: catId, scale: log ? log.scale : null };

      function paintChips() {
        root.querySelector('#catChips').innerHTML = cats.map(function (c) {
          var on = c.id === cur.catId;
          return '<button class="chip' + (on ? ' is-on' : '') + '" data-cat="' + c.id + '"' +
            (on ? ' style="background:' + c.color + ';color:' + UI.textOn(c.color) + '"' : '') + '>' +
            '<span class="dot" style="background:' + c.color + '"></span>' + UI.esc(c.name) + '</button>';
        }).join('');
        root.querySelectorAll('#catChips [data-cat]').forEach(function (b) {
          b.addEventListener('click', function () {
            cur.catId = b.dataset.cat;
            if (!log) setType(Store.category(cur.catId).kind);
            paintChips();
          });
        });
      }

      function setType(t) {
        cur.type = t;
        root.querySelectorAll('[data-type]').forEach(function (b) {
          b.classList.toggle('is-on', b.dataset.type === t);
        });
        root.querySelector('#endField').style.display = (t === 'span') ? '' : 'none';
        root.querySelector('#openField').style.display = (t === 'span') ? '' : 'none';
        root.querySelector('#scaleField').style.display = (t === 'scale') ? '' : 'none';
        root.querySelector('#lblStart').textContent = (t === 'span') ? '開始' : '時刻';
      }

      paintChips();
      setType(cur.type);
      paintScale(root, cur.scale);

      root.querySelectorAll('[data-type]').forEach(function (b) {
        b.addEventListener('click', function () { setType(b.dataset.type); });
      });
      root.querySelectorAll('[data-scale]').forEach(function (b) {
        b.addEventListener('click', function () {
          cur.scale = +b.dataset.scale;
          paintScale(root, cur.scale);
        });
      });

      root.querySelector('#fOpen').addEventListener('change', function () {
        root.querySelector('#fEnd').disabled = this.checked;
      });
      root.querySelector('#fEnd').disabled = root.querySelector('#fOpen').checked;

      root.querySelector('#saveBtn').addEventListener('click', function () {
        var dateStr = root.querySelector('#fDate').value;
        var startTs = UI.parseDateTime(dateStr, root.querySelector('#fStart').value);
        var endTs = null;

        if (cur.type === 'span' && !root.querySelector('#fOpen').checked) {
          var endStr = root.querySelector('#fEnd').value;
          if (!endStr) { alert('終了時刻を入力するか、「継続中」にチェックしてください。'); return; }
          endTs = UI.parseDateTime(dateStr, endStr);
          if (endTs <= startTs) endTs += UI.DAY;   // 日をまたぐ記録
        }
        if (cur.type === 'scale' && !cur.scale) { alert('状態を選んでください。'); return; }

        var payload = {
          catId: cur.catId,
          type: cur.type,
          start: startTs,
          end: cur.type === 'span' ? endTs : null,
          scale: cur.type === 'scale' ? cur.scale : null,
          memo: root.querySelector('#fMemo').value.trim()
        };

        app.day = UI.startOfDay(startTs);
        if (log) { Store.updateLog(log.id, payload); UI.toast('保存しました'); }
        else { Store.addLog(payload); UI.toast('記録しました'); }
        UI.closeSheet();
      });

      if (log) {
        root.querySelector('#delBtn').addEventListener('click', function () {
          if (!confirm('この記録を削除しますか?')) return;
          Store.removeLog(log.id);
          UI.toast('削除しました');
          UI.closeSheet();
        });
      }
      root.querySelector('#cancelBtn').addEventListener('click', UI.closeSheet);
    });
  }

  /* ═════════ カテゴリの編集 ═════════ */

  function openCategoryEditor(id) {
    var cat = id ? Store.category(id)
                 : { name: '', color: Store.PALETTE[0], kind: 'span', quick: false };

    var colors = Store.PALETTE.map(function (c) {
      return '<button class="colorpick' + (c === cat.color ? ' is-on' : '') +
        '" data-color="' + c + '" style="background:' + c + '"></button>';
    }).join('');

    var html =
      '<h2>' + (id ? 'カテゴリを編集' : 'カテゴリを追加') + '</h2>' +
      '<div class="field"><label>名前</label>' +
        '<input type="text" id="cName" value="' + UI.esc(cat.name) + '" placeholder="例: 頭痛"></div>' +
      '<div class="field"><label>色</label><div class="colorgrid" id="cColors">' + colors + '</div></div>' +
      '<div class="field"><label>記録の方法</label>' +
        '<div class="seg" style="margin:0">' +
          '<button class="seg-btn" data-kind="span">期間</button>' +
          '<button class="seg-btn" data-kind="point">点</button>' +
          '<button class="seg-btn" data-kind="scale">体調</button>' +
        '</div>' +
        '<p class="hint" style="margin-top:8px" id="kindHint"></p>' +
      '</div>' +
      '<div class="field">' +
        '<label class="check"><input type="checkbox" id="cQuick"' + (cat.quick ? ' checked' : '') + '>' +
        'タイムライン上部のワンタップ記録に出す</label></div>' +
      '<button class="btn" id="cSave">保存</button>' +
      (id ? '<div class="btn-row"><button class="btn btn-danger" id="cDel">削除</button></div>' : '') +
      '<div class="btn-row"><button class="btn btn-sub" id="cCancel">キャンセル</button></div>';

    UI.openSheet(html, function (root) {
      var cur = { color: cat.color, kind: cat.kind };

      var HINTS = {
        span: '睡眠のように、始まりと終わりがあるもの。ワンタップで開始／終了できます。',
        point: '服薬のように、その瞬間を残すもの。ワンタップで1件記録します。',
        scale: '体調のように、そのときの状態を1〜5で残すもの。'
      };

      function setKind(k) {
        cur.kind = k;
        root.querySelectorAll('[data-kind]').forEach(function (b) {
          b.classList.toggle('is-on', b.dataset.kind === k);
        });
        root.querySelector('#kindHint').textContent = HINTS[k];
      }
      setKind(cur.kind);

      root.querySelectorAll('[data-color]').forEach(function (b) {
        b.addEventListener('click', function () {
          cur.color = b.dataset.color;
          root.querySelectorAll('[data-color]').forEach(function (o) {
            o.classList.toggle('is-on', o === b);
          });
        });
      });
      root.querySelectorAll('[data-kind]').forEach(function (b) {
        b.addEventListener('click', function () { setKind(b.dataset.kind); });
      });

      root.querySelector('#cSave').addEventListener('click', function () {
        var name = root.querySelector('#cName').value.trim();
        if (!name) { alert('名前を入力してください。'); return; }
        var quick = root.querySelector('#cQuick').checked;
        if (id) Store.updateCategory(id, { name: name, color: cur.color, kind: cur.kind, quick: quick });
        else Store.addCategory(name, cur.color, cur.kind, quick);
        UI.toast('保存しました');
        UI.closeSheet();
      });

      if (id) {
        root.querySelector('#cDel').addEventListener('click', function () {
          var n = Store.categoryUsage(id);
          var msg = n ? 'このカテゴリの記録 ' + n + ' 件も一緒に削除されます。よろしいですか?'
                      : 'このカテゴリを削除しますか?';
          if (!confirm(msg)) return;
          Store.removeCategory(id);
          UI.toast('削除しました');
          UI.closeSheet();
        });
      }
      root.querySelector('#cCancel').addEventListener('click', UI.closeSheet);
    });
  }

  /* ═════════ 起動 ═════════ */

  function bind() {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.dataset.tab); });
    });

    UI.el('prevDay').addEventListener('click', function () {
      app.day = UI.addDays(app.day, -1); scrollTimeline();
    });
    UI.el('nextDay').addEventListener('click', function () {
      app.day = UI.addDays(app.day, 1); scrollTimeline();
    });
    UI.el('todayBtn').addEventListener('click', function () {
      app.day = UI.startOfDay(Date.now()); scrollTimeline();
    });
    UI.el('datePicker').addEventListener('change', function () {
      if (this.value) { app.day = UI.parseDateTime(this.value, '00:00'); scrollTimeline(); }
    });

    UI.el('fab').addEventListener('click', function () { openEditor(null); });
    UI.el('scrim').addEventListener('click', UI.closeSheet);

    UI.el('rangeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) return;
      app.summaryMode = b.dataset.mode;
      this.querySelectorAll('.seg-btn').forEach(function (o) {
        o.classList.toggle('is-on', o === b);
      });
      renderSummary();
    });

    UI.el('summaryPrev').addEventListener('click', function () { shiftSummaryAnchor(-1); renderSummary(); });
    UI.el('summaryNext').addEventListener('click', function () { shiftSummaryAnchor(1); renderSummary(); });
    UI.el('summaryToday').addEventListener('click', function () {
      app.summaryAnchor = Date.now(); renderSummary();
    });

    UI.el('searchInput').addEventListener('input', function () {
      app.query = this.value;
      renderSearch();
    });

    // 左右スワイプで日移動
    var sx = 0, sy = 0;
    UI.el('view-timeline').addEventListener('touchstart', function (e) {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    UI.el('view-timeline').addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) {
        app.day = UI.addDays(app.day, dx < 0 ? 1 : -1);
        scrollTimeline();
      }
    });

    Store.onChange(render);

    // 記録中の経過時間を1分ごとに更新。
    // ただしタイムラインをドラッグ操作中に再描画すると、その場でリスナーが
    // 付け替わってジェスチャーが黙って中断されてしまうので、その間はスキップする
    // （次の周期でまた試すだけなので、経過時間の表示が少し遅れる程度で済む）
    setInterval(function () {
      if (app.tab !== 'timeline' || !Store.runningLogs().length) return;
      var tl = UI.el('timeline');
      if (tl && tl.dataset.tlBusy) return;
      renderTimeline();
    }, 60000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    setTab('timeline');
    Notify.schedule();
  });
})();
