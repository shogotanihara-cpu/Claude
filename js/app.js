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

  var app = {
    tab: 'timeline',
    day: UI.startOfDay(Date.now()),
    summaryMode: 'week',      // 'week' | 'month' | 'quarter'
    summaryAnchor: Date.now(), // この日を含む週・月・3ヶ月を表示する
    query: '',
    filters: []          // 絞り込み中のカテゴリID
  };

  /** 現在の summaryMode / summaryAnchor から表示範囲を求める */
  function summaryPeriod() {
    var mode = app.summaryMode;
    var anchor = app.summaryAnchor;

    if (mode === 'week') {
      var from = UI.startOfWeekMonday(anchor);
      return { from: from, to: UI.addDays(from, 7), label: UI.fmtWeekLabel(from) };
    }
    if (mode === 'month') {
      var from = UI.startOfMonth(anchor);
      return { from: from, to: UI.addMonths(from, 1), label: UI.fmtMonthLabel(from) };
    }
    // quarter: アンカーの月を含む直近3ヶ月（アンカー月 + その前2ヶ月）
    var lastMonth = UI.startOfMonth(anchor);
    var from = UI.addMonths(lastMonth, -2);
    return { from: from, to: UI.addMonths(lastMonth, 1), label: UI.fmtMonthRangeLabel(from, lastMonth) };
  }

  /** 前後の週・月・3ヶ月に移動する（dir は -1 か 1） */
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

  /* ═════════ 描画 ═════════ */

  function render() {
    if (app.tab === 'timeline') renderTimeline();
    else if (app.tab === 'summary') renderSummary();
    else if (app.tab === 'search') renderSearch();
    else renderSettings();
  }

  function renderTimeline() {
    UI.el('dateText').textContent = UI.fmtDateFull(app.day);
    UI.el('datePicker').value = UI.dateInputValue(app.day);

    var result = Timeline.render(UI.el('timeline'), app.day, openEditor);
    renderDayStats(result);

    if (pendingScroll) {
      pendingScroll = false;
      Timeline.scrollToRelevant(app.day, result.spans, result.points);
    }
  }

  function renderDayStats(result) {
    var box = UI.el('dayStats');
    var runBox = UI.el('runningBox');
    var html = '';

    /* 継続中のログ */
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

    /* その日のカテゴリ別合計 */
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

    if (result.points.length) {
      chips += '<div class="daystat">記録した出来事 <b>' + result.points.length + '件</b></div>';
    }
    if (!chips) {
      chips = '<div class="daystat">この日の記録はまだありません</div>';
    }

    runBox.innerHTML = html;
    box.innerHTML = chips;

    runBox.querySelectorAll('[data-stop]').forEach(function (b) {
      b.addEventListener('click', function () {
        Store.updateLog(b.dataset.stop, { end: Date.now() });
        UI.toast('記録を終了しました');
      });
    });
  }

  function renderSummary() {
    var period = summaryPeriod();
    UI.el('summaryLabel').textContent = period.label;
    Summary.render(UI.el('summaryBody'), period.from, period.to);
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
      var sub = l.type === 'point'
        ? UI.fmtTime(l.start)
        : UI.fmtTime(l.start) + '–' + (l.end ? UI.fmtTime(l.end) : '継続中') +
          '・' + UI.fmtDuration((l.end || Date.now()) - l.start);
      html += '<button class="row" data-open="' + l.id + '">' +
        '<span class="dot" style="background:' + cat.color + '"></span>' +
        '<div class="row-main">' +
          '<div class="row-title">' + UI.esc(cat.name) +
            (l.memo ? ' <span style="font-weight:400;color:var(--text-dim)">' + UI.esc(l.memo) + '</span>' : '') +
          '</div>' +
          '<div class="row-sub">' + sub + '</div>' +
        '</div></button>';
    });
    html += '</div>';
    if (results.length > shown.length) {
      html += '<div class="hint" style="text-align:center;padding:0 12px 12px">' +
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
        '<div class="row-main"><div class="row-title">' + UI.esc(c.name) + '</div>' +
        '<div class="row-sub">' + (c.kind === 'point' ? '点で記録' : '期間で記録') +
        '・' + Store.categoryUsage(c.id) + '件</div></div>' +
        '<span style="color:var(--text-faint)">›</span></button>';
    }).join('');

    UI.el('settingsBody').innerHTML =
      '<div class="card">' +
        '<div class="card-title">カテゴリ</div>' + cats +
        '<div class="btn-row" style="margin-top:12px">' +
          '<button class="btn btn-sub" id="addCatBtn">カテゴリを追加</button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">データ</div>' +
        '<p class="hint">記録はこの端末のブラウザ内だけに保存されます。' +
        '機種変更やブラウザのデータ削除で消えるため、ときどきバックアップを保存してください。</p>' +
        '<div class="btn-row" style="margin-top:12px">' +
          '<button class="btn btn-sub" id="backupBtn">バックアップを保存</button>' +
          '<button class="btn btn-sub" id="restoreBtn">復元</button>' +
        '</div>' +
        '<input type="file" id="restoreFile" accept="application/json,.json" hidden>' +
        '<div class="btn-row"><button class="btn btn-danger" id="clearBtn">すべての記録を削除</button></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title">使い方</div>' +
        '<p class="hint">' +
        '・＋ボタンから記録を追加します。<br>' +
        '・「期間」は睡眠や仕事など始まりと終わりがあるもの、「点」は服薬などその瞬間の出来事に使います。<br>' +
        '・終了時刻を空にすると「継続中」として記録され、あとから終了できます。<br>' +
        '・終了時刻が開始より前のときは、日をまたいだものとして扱います（例 23:00→07:00）。<br>' +
        '・ブラウザの共有メニューから「ホーム画面に追加」すると、アプリのように起動できます。' +
        '</p>' +
      '</div>';

    UI.el('addCatBtn').addEventListener('click', function () { openCategoryEditor(null); });
    UI.el('settingsBody').querySelectorAll('[data-editcat]').forEach(function (b) {
      b.addEventListener('click', function () { openCategoryEditor(b.dataset.editcat); });
    });

    UI.el('backupBtn').addEventListener('click', function () {
      var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'actionlog-' + UI.dateInputValue(Date.now()) + '.json';
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
        try {
          Store.importJSON(reader.result);
          UI.toast('復元しました');
        } catch (err) {
          alert('復元できませんでした: ' + err.message);
        }
      };
      reader.readAsText(file);
    });

    UI.el('clearBtn').addEventListener('click', function () {
      if (!confirm('すべての記録とカテゴリを削除します。元に戻せません。よろしいですか?')) return;
      Store.clearAll();
      UI.toast('削除しました');
    });
  }

  /* ═════════ 記録の追加・編集 ═════════ */

  /** 直近に使ったカテゴリを既定値にする（なければ先頭） */
  function lastUsedCatId(cats) {
    var logs = Store.logs();
    var latest = null;
    logs.forEach(function (l) {
      if (!latest || l.start > latest.start) latest = l;
    });
    if (latest && Store.categories().some(function (c) { return c.id === latest.catId; })) {
      return latest.catId;
    }
    return cats[0] && cats[0].id;
  }

  function openEditor(id) {
    var log = id ? Store.getLog(id) : null;
    var cats = Store.categories();
    var now = Date.now();
    var isToday = UI.startOfDay(now) === app.day;

    var type = log ? log.type : 'span';
    var catId = log ? log.catId : lastUsedCatId(cats);
    var start = log ? log.start : (isToday ? now : app.day + 9 * UI.HOUR);
    var end = log ? log.end : null;
    var open = log ? (log.type === 'span' && !log.end) : isToday;

    var html =
      '<h2>' + (log ? '記録を編集' : '記録を追加') + '</h2>' +

      '<div class="field"><label>種類</label>' +
        '<div class="seg" style="margin:0">' +
          '<button class="seg-btn' + (type === 'span' ? ' is-on' : '') + '" data-type="span">期間</button>' +
          '<button class="seg-btn' + (type === 'point' ? ' is-on' : '') + '" data-type="point">点</button>' +
        '</div>' +
      '</div>' +

      '<div class="field"><label>カテゴリ</label>' +
        '<div class="chiprow" id="catChips" style="padding:0"></div>' +
      '</div>' +

      '<div class="field"><label>日付</label>' +
        '<input type="date" id="fDate" value="' + UI.dateInputValue(start) + '">' +
      '</div>' +

      '<div class="field-2">' +
        '<div class="field"><label id="lblStart">開始</label>' +
          '<input type="time" id="fStart" value="' + UI.timeInputValue(start) + '"></div>' +
        '<div class="field" id="endField"><label>終了</label>' +
          '<input type="time" id="fEnd" value="' + (end ? UI.timeInputValue(end) : '') + '"></div>' +
      '</div>' +

      '<div class="field" id="openField">' +
        '<label class="check"><input type="checkbox" id="fOpen"' + (open ? ' checked' : '') + '>' +
        '終了時刻はあとで入力する（継続中）</label>' +
      '</div>' +

      '<div class="field"><label>メモ</label>' +
        '<textarea id="fMemo" placeholder="任意">' + UI.esc(log ? log.memo : '') + '</textarea>' +
      '</div>' +

      '<button class="btn" id="saveBtn">保存</button>' +
      (log ? '<div class="btn-row"><button class="btn btn-danger" id="delBtn">削除</button></div>' : '') +
      '<div class="btn-row"><button class="btn btn-sub" id="cancelBtn">キャンセル</button></div>';

    UI.openSheet(html, function (root) {
      var cur = { type: type, catId: catId };

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
            // カテゴリの既定の記録方法に合わせて種類も切り替える
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
        var isSpan = (t === 'span');
        root.querySelector('#endField').style.display = isSpan ? '' : 'none';
        root.querySelector('#openField').style.display = isSpan ? '' : 'none';
        root.querySelector('#lblStart').textContent = isSpan ? '開始' : '時刻';
      }

      paintChips();
      setType(cur.type);

      root.querySelectorAll('[data-type]').forEach(function (b) {
        b.addEventListener('click', function () { setType(b.dataset.type); });
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

        var payload = {
          catId: cur.catId,
          type: cur.type,
          start: startTs,
          end: cur.type === 'span' ? endTs : null,
          memo: root.querySelector('#fMemo').value.trim()
        };

        if (log) { Store.updateLog(log.id, payload); UI.toast('保存しました'); }
        else { Store.addLog(payload); UI.toast('記録しました'); }

        app.day = UI.startOfDay(startTs);
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
    var cat = id ? Store.category(id) : { name: '', color: Store.PALETTE[0], kind: 'span' };

    var colors = Store.PALETTE.map(function (c) {
      return '<button class="colorpick' + (c === cat.color ? ' is-on' : '') +
        '" data-color="' + c + '" style="background:' + c + '"></button>';
    }).join('');

    var html =
      '<h2>' + (id ? 'カテゴリを編集' : 'カテゴリを追加') + '</h2>' +
      '<div class="field"><label>名前</label>' +
        '<input type="text" id="cName" value="' + UI.esc(cat.name) + '" placeholder="例: 読書"></div>' +
      '<div class="field"><label>色</label><div class="colorgrid" id="cColors">' + colors + '</div></div>' +
      '<div class="field"><label>既定の記録方法</label>' +
        '<div class="seg" style="margin:0">' +
          '<button class="seg-btn' + (cat.kind === 'span' ? ' is-on' : '') + '" data-kind="span">期間</button>' +
          '<button class="seg-btn' + (cat.kind === 'point' ? ' is-on' : '') + '" data-kind="point">点</button>' +
        '</div>' +
      '</div>' +
      '<button class="btn" id="cSave">保存</button>' +
      (id ? '<div class="btn-row"><button class="btn btn-danger" id="cDel">削除</button></div>' : '') +
      '<div class="btn-row"><button class="btn btn-sub" id="cCancel">キャンセル</button></div>';

    UI.openSheet(html, function (root) {
      var cur = { color: cat.color, kind: cat.kind };

      root.querySelectorAll('[data-color]').forEach(function (b) {
        b.addEventListener('click', function () {
          cur.color = b.dataset.color;
          root.querySelectorAll('[data-color]').forEach(function (o) {
            o.classList.toggle('is-on', o === b);
          });
        });
      });
      root.querySelectorAll('[data-kind]').forEach(function (b) {
        b.addEventListener('click', function () {
          cur.kind = b.dataset.kind;
          root.querySelectorAll('[data-kind]').forEach(function (o) {
            o.classList.toggle('is-on', o === b);
          });
        });
      });

      root.querySelector('#cSave').addEventListener('click', function () {
        var name = root.querySelector('#cName').value.trim();
        if (!name) { alert('名前を入力してください。'); return; }
        if (id) Store.updateCategory(id, { name: name, color: cur.color, kind: cur.kind });
        else Store.addCategory(name, cur.color, cur.kind);
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

    UI.el('summaryPrev').addEventListener('click', function () {
      shiftSummaryAnchor(-1); renderSummary();
    });
    UI.el('summaryNext').addEventListener('click', function () {
      shiftSummaryAnchor(1); renderSummary();
    });
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

    // 継続中の表示を1分ごとに更新
    setInterval(function () {
      if (app.tab === 'timeline' && Store.runningLogs().length) renderTimeline();
    }, 60000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    setTab('timeline');
  });
})();
