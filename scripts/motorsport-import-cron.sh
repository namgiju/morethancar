#!/usr/bin/env bash
# 모터스포츠 공식 일정 자동 수집 — 운영 EC2의 cron이 하루 한 번 실행한다(board-service src/motorsport-import).
#
#   crontab -e (서버 시간대 UTC):
#   30 18 * * * /home/ubuntu/rev.cc/scripts/motorsport-import-cron.sh    # 매일 03:30 KST
#
# - 저장소 경로는 이 스크립트 위치에서 구한다. cron의 PATH는 좁으므로 직접 지정한다.
# - 활성화한 출처만 실행한다(.env의 MOTORSPORT_IMPORT_SOURCES, 비어 있으면 아무것도 하지 않음).
# - 로그: ~/logs/motorsport-import.log. 1MB를 넘으면 마지막 512KB만 남긴다(무한히 늘지 않게).
# - 실패(종료 코드 ≠ 0)하면 기존 SMTP 설정으로 MOTORSPORT_ALERT_EMAIL에 알림 메일을 보낸다(scripts/send-alert-mail.py).
# - 같은 스크립트가 겹쳐 실행되면 뒤의 실행은 바로 끝낸다(flock). 출처별 DB 잠금도 따로 있다.
set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

ROOT=$(cd "$(dirname "$0")/.." && pwd)
LOG_DIR=${MOTORSPORT_IMPORT_LOG_DIR:-$HOME/logs}
LOG="$LOG_DIR/motorsport-import.log"
MAX_BYTES=1048576
KEEP_BYTES=524288
mkdir -p "$LOG_DIR"

command -v flock >/dev/null || { echo "$(date -u +%FT%TZ) flock이 없어 실행하지 않음" >>"$LOG"; exit 1; }
exec 9>"$LOG_DIR/.motorsport-import.lock"
flock -n 9 || { echo "$(date -u +%FT%TZ) 이전 실행이 아직 진행 중이라 건너뜀" >>"$LOG"; exit 0; }

cd "$ROOT" || exit 1
started=$(date -u +%FT%TZ)
output=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T board \
  node src/motorsport-import/cli.js --apply 2>&1)
status=$?
{
  echo "=== $started exit=$status"
  echo "$output"
} >>"$LOG"

if [ "$status" -ne 0 ]; then
  printf '모터스포츠 일정 자동 수집이 실패했습니다(종료 코드 %s, 시작 %s).\n관리자 화면: https://morethancar.kr/admin/motorsport?tab=stale\n서버 로그: %s\n\n%s\n' \
    "$status" "$started" "$LOG" "$output" |
    python3 -I "$ROOT/scripts/send-alert-mail.py" "[morethancar] 모터스포츠 일정 수집 실패" >>"$LOG" 2>&1
fi

size=$(wc -c <"$LOG")
if [ "$size" -gt "$MAX_BYTES" ]; then
  tail -c "$KEEP_BYTES" "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
exit "$status"
