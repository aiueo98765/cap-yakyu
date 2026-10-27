# -*- coding: utf-8 -*-
"""index.orig.html（本番そのまま）に build/ の差分をあてて index.html を作る。
   何度でも流せる。あてる所が見つからなければ その場で止まる（静かに壊さない）。"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
B = ROOT / 'build'
NL = chr(10)
src = (ROOT / 'index.orig.html').read_text(encoding='utf-8')

def rd(name):
    return (B / name).read_text(encoding='utf-8').rstrip(NL)

def between(s, start, end, new, label):
    """start と end の あいだ だけを new にする（start・end は残す）"""
    i = s.find(start)
    if i < 0: sys.exit('[build] 見つからない(始): ' + label)
    j = s.find(end, i + len(start))
    if j < 0: sys.exit('[build] 見つからない(終): ' + label)
    return s[:i + len(start)] + new + s[j:]

def region(s, start, end, new, label):
    """start の所から end の直前までを まるごと new にする（new の中に start も書く）"""
    i = s.find(start)
    if i < 0: sys.exit('[build] 見つからない(始): ' + label)
    j = s.find(end, i + len(start))
    if j < 0: sys.exit('[build] 見つからない(終): ' + label)
    return s[:i] + new + s[j:]

def sub1(s, old, new, label):
    n = s.count(old)
    if n != 1: sys.exit('[build] %d 個みつかった（1つでないと困る）: %s' % (n, label))
    return s.replace(old, new)

out = src

# ---- 差しかえる区画
out = between(out, '<style>' + NL, NL + '</style>', rd('style.css'), 'CSS')
out = between(out, '<body>' + NL, '<script type="module">', rd('body.html') + NL, 'BODY')
out = between(out, '// ===== [SEC:SETTINGS] =====' + NL, '// ===== [SEC:MATCH] =====', rd('settings.js') + NL * 2, 'SETTINGS')
out = between(out, '// ===== [SEC:NET] =====' + NL, '// ===== [SEC:INIT] =====', rd('net.js') + NL * 2, 'NET')
out = between(out, '// ===== [SEC:INIT] =====' + NL, 'async function init() {', rd('init.js') + NL, 'INIT')
out = region(out, 'function lineHTML() {', '// 強さを選んで対戦：選んだチーム・強さと、', rd('result.js') + NL, 'RESULT')

# ---- 1行ずつの手直し
exec((B / 'patch.py').read_text(encoding='utf-8'))

(ROOT / 'index.html').write_text(out, encoding='utf-8', newline='')   # 改行は LF のまま（本番に合わせる）
print('[build] ok  %d bytes  (元 %d)' % (len(out.encode('utf-8')), len(src.encode('utf-8'))))
