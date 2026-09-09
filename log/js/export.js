/* ─────────────────────────────────────────
   export.js — CSV と カレンダー(.ics) の書き出し
   ───────────────────────────────────────── */

var Exporter = (function () {
  'use strict';

  var TYPE_LABEL = { span: '期間', point: '点', scale: '体調' };

  /* ── CSV ──────────────────────────────── */

  function cell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function dateCell(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + UI.pad(d.getMonth() + 1) + '-' + UI.pad(d.getDate());
  }

  /**
   * ログをCSVにする。表計算ソフトで開くことを想定し、
   * 日付と時刻は分けて、長さは分で入れる。
   * 先頭のBOMは Excel が文字化けしないようにするためのもの。
   */
  function logsCSV(from, to) {
    var logs = Store.logs().slice();
    if (from !== undefined && to !== undefined) {
      logs = logs.filter(function (l) { return l.start >= from && l.start < to; });
    }
    logs.sort(function (a, b) { return a.start - b.start; });

    var head = ['日付', '開始', '終了', '長さ(分)', '種類', 'カテゴリ', '体調', 'メモ'];
    var rows = logs.map(function (l) {
      var cat = Store.category(l.catId);
      var lenMin = '';
      var endCell = '';
      if (l.type === 'span' && l.end) {
        lenMin = Math.round((l.end - l.start) / UI.MIN);
        // 日をまたぐ場合は「翌」を付けて、開始日の列と食い違わないようにする
        var crossed = UI.startOfDay(l.end) > UI.startOfDay(l.start);
        endCell = (crossed ? '翌 ' : '') + UI.fmtTime(l.end);
      }
      return [
        dateCell(l.start),
        UI.fmtTime(l.start),
        endCell,
        lenMin,
        TYPE_LABEL[l.type] || l.type,
        cat.name,
        l.type === 'scale' && l.scale ? l.scale : '',
        l.memo || ''
      ];
    });

    return '﻿' + [head].concat(rows).map(function (r) {
      return r.map(cell).join(',');
    }).join('\r\n');
  }

  function downloadCSV(from, to) {
    var name = 'log-' + UI.dateInputValue(Date.now()) + '.csv';
    UI.download(name, logsCSV(from, to), 'text/csv');
  }

  /* ── カレンダー(.ics) ─────────────────── */

  function icsTime(ts) {
    var d = new Date(ts);
    return d.getFullYear() + UI.pad(d.getMonth() + 1) + UI.pad(d.getDate()) + 'T' +
           UI.pad(d.getHours()) + UI.pad(d.getMinutes()) + '00';
  }

  function icsStamp() {
    var d = new Date();
    return d.getUTCFullYear() + UI.pad(d.getUTCMonth() + 1) + UI.pad(d.getUTCDate()) + 'T' +
           UI.pad(d.getUTCHours()) + UI.pad(d.getUTCMinutes()) + UI.pad(d.getUTCSeconds()) + 'Z';
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;')
                    .replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  /**
   * リマインダーを毎日くり返す予定として書き出す。
   * タイムゾーン指定なしの「浮動時間」にしてあるので、
   * 端末のローカル時刻でそのまま鳴る。
   */
  function remindersICS() {
    var stamp = icsStamp();
    var today = UI.startOfDay(Date.now());

    var events = Store.reminders().map(function (r) {
      var p = r.time.split(':');
      var at = today + (+p[0]) * UI.HOUR + (+p[1]) * UI.MIN;
      var title = r.catId ? Store.category(r.catId).name + 'を記録' : '今日の記録をつける';
      return [
        'BEGIN:VEVENT',
        'UID:' + r.id + '@log.local',
        'DTSTAMP:' + stamp,
        'DTSTART:' + icsTime(at),
        'DURATION:PT5M',
        'RRULE:FREQ=DAILY',
        'SUMMARY:' + icsEscape(title),
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:' + icsEscape(title),
        'TRIGGER:PT0M',
        'END:VALARM',
        'END:VEVENT'
      ].join('\r\n');
    });

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//log//reminders//JP',
      'CALSCALE:GREGORIAN'
    ].concat(events).concat(['END:VCALENDAR']).join('\r\n');
  }

  function downloadICS() {
    UI.download('log-reminders.ics', remindersICS(), 'text/calendar');
  }

  return {
    logsCSV: logsCSV,
    downloadCSV: downloadCSV,
    remindersICS: remindersICS,
    downloadICS: downloadICS
  };
})();
