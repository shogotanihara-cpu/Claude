/* ─────────────────────────────────────────
   notify.js — 記録忘れのリマインダー

   ブラウザだけで動くアプリには、決まった時刻に確実に通知を出す手段がない。
   （閉じている間に通知を出すには Web Push とサーバーが必要で、
     iOS ではとくに制約が大きい）

   そこで3段構えにしている:
     1. アプリ内での声かけ … 開いたときに未記録を知らせる。必ず動く
     2. ブラウザ通知      … アプリを開いている間だけ鳴る。環境しだい
     3. カレンダーに登録   … 端末標準のカレンダーに任せる。確実に鳴る
   ───────────────────────────────────────── */

var Notify = (function () {
  'use strict';

  var DISMISS_KEY = 'actionlog.nudge';
  var timers = [];

  /* ── ブラウザ通知 ─────────────────────── */

  function supported() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /** 'granted' | 'denied' | 'default' | 'unsupported' */
  function permission() {
    return supported() ? Notification.permission : 'unsupported';
  }

  function request(cb) {
    if (!supported()) { cb('unsupported'); return; }
    try {
      var p = Notification.requestPermission(function (res) { cb(res); });
      if (p && typeof p.then === 'function') p.then(function (res) { cb(res); });
    } catch (e) {
      cb('denied');
    }
  }

  function atToday(time) {
    var p = String(time).split(':');
    return UI.startOfDay(Date.now()) + (+p[0] || 0) * UI.HOUR + (+p[1] || 0) * UI.MIN;
  }

  function nextOccurrence(time) {
    var at = atToday(time);
    return at > Date.now() ? at : at + UI.DAY;
  }

  function titleOf(r) {
    return r.catId ? Store.category(r.catId).name + 'を記録しましょう' : '今日の記録をつけましょう';
  }

  function clear() {
    timers.forEach(function (t) { clearTimeout(t); });
    timers = [];
  }

  /**
   * 通知の予約を組み直す。
   * setTimeout なので、アプリを閉じると止まる（それが Web の限界）。
   */
  function schedule() {
    clear();
    if (permission() !== 'granted') return;

    Store.reminders().forEach(function (r) {
      function fire() {
        try {
          new Notification('ログ', {
            body: titleOf(r),
            tag: 'reminder-' + r.id,
            icon: 'icons/icon-192.png'
          });
        } catch (e) { /* 通知が出せない環境では黙って諦める */ }
        timers.push(setTimeout(fire, UI.DAY));
      }
      timers.push(setTimeout(fire, Math.max(nextOccurrence(r.time) - Date.now(), 0)));
    });
  }

  /* ── アプリ内での声かけ ───────────────── */

  /** 設定時刻を過ぎていて、その日まだ記録がないリマインダー */
  function due() {
    var now = Date.now();
    var today = UI.startOfDay(now);
    var logs = Store.logs();

    return Store.reminders().filter(function (r) {
      if (now < atToday(r.time)) return false;
      return !logs.some(function (l) {
        if (UI.startOfDay(l.start) !== today) return false;
        return r.catId ? l.catId === r.catId : true;
      });
    });
  }

  function isDismissedToday() {
    try {
      return localStorage.getItem(DISMISS_KEY) === UI.dateInputValue(Date.now());
    } catch (e) { return false; }
  }

  function dismissToday() {
    try { localStorage.setItem(DISMISS_KEY, UI.dateInputValue(Date.now())); } catch (e) {}
  }

  return {
    supported: supported,
    permission: permission,
    request: request,
    schedule: schedule,
    clear: clear,
    due: due,
    titleOf: titleOf,
    isDismissedToday: isDismissedToday,
    dismissToday: dismissToday
  };
})();
