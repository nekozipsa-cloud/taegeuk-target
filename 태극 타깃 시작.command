#!/bin/bash
# 더블클릭하면 로컬 서버를 켜고 브라우저에서 게임을 엽니다. 카메라 허용을 눌러 주세요.
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:8010/?t=$(date +%s)") &
python3 serve.py 8010
