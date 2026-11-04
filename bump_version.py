#!/usr/bin/env python3
"""배포 전에 실행: index.html과 모든 js import 주소의 ?v= 값을 한꺼번에 올린다.

GitHub Pages는 파일을 최대 10분 캐시한다. 버전이 없으면 브라우저가 옛 게임 파일과
새 파일을 섞어 써서 고친 내용이 안 보이거나 화면이 깨질 수 있다.
사용: python3 bump_version.py   (값은 날짜+시각으로 자동)
"""
import pathlib, re, time

root = pathlib.Path(__file__).resolve().parent
v = time.strftime('%Y%m%d%H%M')

idx = root / 'index.html'
s = idx.read_text()
s = re.sub(r'(href="css/app\.css)(\?v=[\w]+)?"', rf'\1?v={v}"', s)
s = re.sub(r'(src="js/main\.js)(\?v=[\w]+)?"', rf'\1?v={v}"', s)
idx.write_text(s)

n = 0
for f in (root / 'js').rglob('*.js'):
    t = f.read_text()
    t2 = re.sub(r"""(from\s+['"](?:\.{1,2}/)[^'"?]+\.js)(\?v=[\w]+)?(['"])""", rf'\1?v={v}\3', t)
    if t2 != t:
        f.write_text(t2); n += 1
print(f'version {v}: index.html + {n} js files')
