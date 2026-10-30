#!/usr/bin/env bash
# Neon 자동 정지(scale to zero)를 막는 설정이 compose에 다시 들어오지 않았는지 확인한다(docs/MONITORING.md).
#  - core/board healthcheck는 DB를 건드리지 않는 생존 확인 경로만 부른다.
#  - 운영 병합 결과에서 core Hikari 최소 유휴 연결이 0이다(유휴 연결의 keepalive 쿼리가 Neon을 깨운다).
#  - 로컬 compose는 계속 로컬 postgres 서비스를 쓴다.
# 실제 .env는 읽지 않는다. 운영 필수 변수는 가짜 값으로 채워 병합 결과만 본다. Docker 데몬은 필요 없다.
#
# 운영 서버의 실제 .env 값까지 확인하려면 서버에서(비밀값이 찍히지 않는 줄만 고른다):
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml config | grep -E 'DB_POOL_MIN_IDLE|DB_IDLE_TIMEOUT_MS|/health'
set -euo pipefail
cd "$(dirname "$0")/.."

render() {
  env -i PATH="$PATH" HOME="$HOME" \
    DB_HOST=db.invalid DB_NAME=x DB_USER=x DB_PASSWORD=x REDIS_PASSWORD=x \
    WITHDRAWAL_HMAC_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx KAKAO_REDIRECT_URI=https://x.invalid/cb \
    PASSWORD_RESET_URL=https://x.invalid/reset CLOUDFLARE_TUNNEL_TOKEN=x \
    docker compose --env-file /dev/null "$@" config --format json
}

check() {
  python3 -I -c '
import json, sys
label, cfg = sys.argv[1], json.load(sys.stdin)
svc = cfg["services"]
errors = []
live = {"core": "/api/health/live", "board": "/health/live"}
for name, path in live.items():
    test = " ".join(svc[name]["healthcheck"]["test"])
    if path not in test:
        errors.append(f"{name} healthcheck가 생존 확인 경로({path})를 쓰지 않는다: {test}")
if label == "prod":
    env = svc["core"]["environment"]
    min_idle = env.get("DB_POOL_MIN_IDLE")
    if str(min_idle) != "0":
        errors.append(f"운영 core DB_POOL_MIN_IDLE={min_idle} (0이어야 Neon이 정지할 수 있다)")
    if "postgres" in svc:
        errors.append("운영 병합 결과에 로컬 postgres 서비스가 남아 있다")
else:
    if "postgres:5432" not in svc["core"]["environment"]["SPRING_DATASOURCE_URL"] or svc["board"]["environment"]["PGHOST"] != "postgres":
        errors.append("로컬 compose가 로컬 postgres 서비스를 쓰지 않는다")
for e in errors:
    print(f"FAIL [{label}] {e}")
if errors:
    sys.exit(1)
print(f"OK [{label}] healthcheck는 생존 확인만" + (", core 최소 유휴 0" if label == "prod" else ", 로컬 postgres 사용"))
' "$1"
}

render -f docker-compose.yml | check local
render -f docker-compose.yml -f docker-compose.prod.yml | check prod
