#!/bin/sh
# Compose 없이 개별 docker run으로 동일한 6개 서비스를 시연한다.
# 먼저 docker compose down으로 기존 컨테이너만 내린다. -v는 사용하지 않는다.
# sh scripts/assignment-run.sh --print-volume 은 사용할 DB 볼륨 이름만 출력하고 아무것도 만들지 않는다.
set -eu
cd "$(dirname "$0")/.."

# DB 볼륨은 docker compose가 이 폴더에서 쓰는 것과 같은 볼륨이어야 한다. 이름은
# <Compose 프로젝트 이름>_revcc_pg이고 프로젝트 이름은 폴더 이름(또는 COMPOSE_PROJECT_NAME)에서
# 오므로 고정하지 않고 Compose에게 직접 묻는다. --no-interpolate라 .env 값은 출력되지 않는다.
compose_config=$(docker compose config --no-interpolate)
PG_PROJECT=$(printf '%s\n' "$compose_config" | awk '/^name:/ { print $2; exit }')
PG_VOLUME=$(printf '%s\n' "$compose_config" | awk '
    /^volumes:/ { in_volumes = 1; next }
    in_volumes && /^  revcc_pg:/ { in_pg = 1; next }
    in_pg && /^    name:/ { print $2; exit }')
if [ -z "$PG_PROJECT" ] || [ -z "$PG_VOLUME" ]; then
    echo "Could not resolve the revcc_pg volume from docker compose config." >&2
    exit 1
fi
if [ "${1:-}" = "--print-volume" ]; then
    echo "$PG_VOLUME"
    exit 0
fi

# 기존 컨테이너를 자동 삭제하지 않고 충돌을 먼저 검사한다.
for service in proxy frontend core board redis postgres; do
    if docker container inspect "revcc-$service" >/dev/null 2>&1; then
        echo "revcc-$service already exists. Run docker compose down first (without -v)." >&2
        exit 1
    fi
done
docker network inspect revcc-network >/dev/null 2>&1 || docker network create --driver bridge revcc-network
# 새로 만들 때는 Compose 라벨을 붙여 이후 docker compose up이 같은 볼륨을 경고 없이 이어 쓰게 한다.
docker volume inspect "$PG_VOLUME" >/dev/null 2>&1 || docker volume create \
    --label "com.docker.compose.project=$PG_PROJECT" --label com.docker.compose.volume=revcc_pg "$PG_VOLUME"
echo "PostgreSQL volume: $PG_VOLUME"

# --network-alias는 프로그램 설정에 쓰인 postgres/redis/core 등의 DNS 이름을 제공한다.
# 영구 데이터는 Compose와 정확히 동일한 named volume에 저장한다.
docker run -d --name revcc-postgres --network revcc-network --network-alias postgres \
    -e POSTGRES_DB=revcc -e POSTGRES_USER=revcc -e "POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-revcc}" \
    -v "$PG_VOLUME":/var/lib/postgresql/data postgres:16
# Redis는 docker-compose.yml과 같은 방식으로 인증을 요구한다(비밀번호는 명령줄 인자 대신 설정 파일로 전달).
REDIS_PASSWORD="${REDIS_PASSWORD:-revcc-local-redis}"
export REDIS_PASSWORD
docker run -d --name revcc-redis --network revcc-network --network-alias redis \
    -e REDIS_PASSWORD -e REDISCLI_AUTH="$REDIS_PASSWORD" redis:7-alpine \
    sh -c 'printf "requirepass \"%s\"\n" "$REDIS_PASSWORD" > /tmp/redis.conf && exec redis-server /tmp/redis.conf'

# 고정 sleep만 쓰면 느린 PC에서 실패할 수 있으므로 실제 응답을 반복 확인한다.
wait_for() {
    attempts=0
    until "$@" >/dev/null 2>&1; do
        attempts=$((attempts + 1))
        if [ "$attempts" -ge 90 ]; then echo "Service readiness timeout: $*" >&2; exit 1; fi
        sleep 1
    done
}
wait_for docker exec revcc-postgres pg_isready -U revcc -d revcc
wait_for sh -c 'docker exec revcc-redis redis-cli ping | grep -q PONG'

docker run -d --name revcc-core --network revcc-network --network-alias core \
    -e SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/revcc \
    -e POSTGRES_USER=revcc -e "POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-revcc}" \
    -e REDIS_HOST=redis -e REDIS_PASSWORD -e "SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE:-false}" revcc-core:assignment
wait_for docker exec revcc-core curl -fsS http://localhost:8080/api/vehicles

docker run -d --name revcc-board --network revcc-network --network-alias board \
    -e PGHOST=postgres -e PGDATABASE=revcc -e PGUSER=revcc \
    -e "PGPASSWORD=${POSTGRES_PASSWORD:-revcc}" -e REDIS_URL=redis://redis:6379 -e REDIS_PASSWORD revcc-board:assignment
wait_for docker exec revcc-board node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

docker run -d --name revcc-frontend --network revcc-network --network-alias frontend \
    -e PORT=80 -e REVCC_API_ORIGIN=http://proxy revcc-frontend:next
# -p는 Nginx에만 사용한다. 나머지 서비스는 Docker 네트워크 내부에서만 접근한다.
docker run -d --name revcc-proxy --network revcc-network --network-alias proxy \
    -p "${REVCC_PORT:-8090}:80" revcc-proxy:assignment
wait_for docker exec revcc-proxy wget -qO- http://127.0.0.1/health
echo "Ready: http://localhost:${REVCC_PORT:-8090}"
