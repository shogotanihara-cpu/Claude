#!/usr/bin/env python3
# ─────────────────────────────────────────────
# 熱千めらの新しいアーカイブを拾い、文字起こしを保存する
#
# vidIQ はクレジット制（月125）なので、毎日使う「新着の検知」と
# 「文字起こし」は無料の経路（YouTube の RSS と字幕）でまかなう。
# 有料の呼び出しは、既出チェックと週次の競合調査だけに残す。
#
# 使い方:
#   python3 -I fetch_archives.py <出力フォルダ> [--hours 48] [--skip ID,ID,...]
#   --skip には、制作ボードに既に載っている動画IDを渡す（二重に出さないため）
# 出力:
#   <出力フォルダ>/<動画ID>.txt  … 「分:秒 発言」の行
#   標準出力に JSON（id / title / published / minutes）
#   無料で文字起こしを取れなかったアーカイブは "blocked": true で返す
# ─────────────────────────────────────────────
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import urllib.request

CHANNEL_ID = 'UC8eitCE9Z6EwUCs-VUi1blg'  # Mela Ch. 熱千めら
RSS = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + CHANNEL_ID
# 本人のショート動画や歌ってみたは切り抜きの元にしないので、短いものは捨てる
MIN_MINUTES = 20


def ensure_lib():
    try:
        import youtube_transcript_api  # noqa: F401
    except ImportError:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-q',
                        'youtube-transcript-api'], check=True)


def recent_entries(hours):
    xml = urllib.request.urlopen(RSS, timeout=30).read().decode('utf-8')
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)
    out = []
    for m in re.finditer(r'<entry>.*?<yt:videoId>(.*?)</yt:videoId>.*?'
                         r'<title>(.*?)</title>.*?<published>(.*?)</published>',
                         xml, re.S):
        vid, title, pub = m.groups()
        if dt.datetime.fromisoformat(pub) >= since:
            out.append({'id': vid, 'title': title, 'published': pub})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('outdir')
    ap.add_argument('--hours', type=int, default=48)
    ap.add_argument('--skip', default='')
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    ensure_lib()
    from youtube_transcript_api import YouTubeTranscriptApi
    api = YouTubeTranscriptApi()
    skip = set(filter(None, a.skip.split(',')))
    found = []
    for e in recent_entries(a.hours):
        if e['id'] in skip:
            continue
        try:
            rows = api.fetch(e['id'], languages=['ja']).to_raw_data()
        except Exception as ex:
            # IpBlocked は YouTube 側の一時的な遮断。無料では取れないので、
            # 配信アーカイブらしいもの（タイトルに【】がある）だけ印をつけて返し、
            # vidIQ の文字起こしに回すかどうかは呼び出し側が残高を見て決める。
            # それ以外（配信中・字幕生成待ち・非公開）は次の回で拾い直す
            name = type(ex).__name__
            print('skip %s: %s' % (e['id'], name), file=sys.stderr)
            if name == 'IpBlocked' and '【' in e['title']:
                e['blocked'] = True
                found.append(e)
            continue
        minutes = int(rows[-1]['start'] // 60) if rows else 0
        if minutes < MIN_MINUTES:
            continue
        with open(os.path.join(a.outdir, e['id'] + '.txt'), 'w') as f:
            for r in rows:
                s = int(r['start'])
                f.write('%d:%02d %s\n' % (s // 60, s % 60, r['text']))
        e['minutes'] = minutes
        found.append(e)
    print(json.dumps(found, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
