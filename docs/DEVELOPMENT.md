# 개발 환경

## 환경변수

로컬 Docker 실행은 `.env` 없이도 `docker-compose.yml`의 로컬 기본값으로 동작한다.
카카오 로그인·지도, 메일 발송 같은 외부 연동은 프로젝트 루트 `.env`에 값을 넣어야 동작한다.
항목과 설명은 [.env.example](../.env.example)을 참고한다.

```sh
cp .env.example .env
```

`.env`의 `DB_*`(운영 Neon DB)는 `docker-compose.prod.yml`에서만 읽는다. 로컬 실행은 항상 Compose의 `postgres` 서비스를 쓴다.

## 전체 스택 (Docker)

```sh
docker compose up -d --build --wait
```

- 웹: http://localhost:8090 (nginx proxy가 frontend·core·board로 나눠 보낸다)
- 포트는 `.env`의 `REVCC_PORT`로 바꿀 수 있다.
- 운영 배포는 [DEPLOYMENT.md](DEPLOYMENT.md)를 따른다. 이 명령에는 운영 오버레이가 적용되지 않는다.

컨테이너 상태 확인:

```sh
docker compose ps
docker exec revcc-proxy nginx -t
docker exec revcc-redis redis-cli ping
docker exec revcc-postgres psql -U revcc -d revcc -c '\dt'
```

PostgreSQL 데이터는 named volume(`<프로젝트 이름>_revcc_pg`)에 남는다. 데이터를 지우는 `docker compose down -v`나 `docker volume rm`은 쓰지 않는다.

## 개별 실행

컨테이너 밖에서 Spring·Node·Next.js를 직접 띄울 때 사용한다.

### DB

PostgreSQL은 `127.0.0.1:5433`, Redis는 `127.0.0.1:6379`로 연다.

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
```

Redis는 비밀번호를 요구한다. 로컬 기본값은 `revcc-local-redis`다(`.env`의 `REDIS_PASSWORD`로 바꿨다면 그 값을 쓴다).

### Spring Boot (core)

```sh
cd backend
REDIS_PASSWORD=revcc-local-redis mvn spring-boot:run
```

- API: http://localhost:8080/api/vehicles
- DB 기본값은 `jdbc:postgresql://localhost:5433/revcc`(사용자·비밀번호 `revcc`)이다. 기동할 때 Flyway가 스키마를 적용한다([DATABASE-MIGRATIONS.md](DATABASE-MIGRATIONS.md)).

### Node.js (board)

```sh
cd board-service
npm ci
PGHOST=localhost PGPORT=5433 PGDATABASE=revcc PGUSER=revcc PGPASSWORD=revcc \
  REDIS_PASSWORD=revcc-local-redis npm start
```

- API: http://localhost:3001 (`/health`로 확인)
- board는 DDL을 실행하지 않는다. core를 먼저 한 번 기동해 스키마를 만든다.

### Next.js (frontend)

```sh
cd frontend
npm install
npm run dev
```

- 웹: http://localhost:3000
- `/api/*` 요청은 `REVCC_API_ORIGIN`(기본값 `http://localhost:8090`)으로 보낸다. 화면만 개발할 때는 전체 스택을 Docker로 띄운 상태에서 실행한다.

## 테스트

CI(`.github/workflows/ci.yml`)와 같은 명령이다.

```sh
cd backend && mvn test
cd board-service && npm test
```

Spring 통합 테스트(`MemberFlowIntegrationTest`, `PasswordResetServiceTest`)는 `REVCC_TEST_DB_PORT`, `REVCC_TEST_REDIS_PORT`가 있을 때만 실행된다.

board 시스템 테스트(`scripts/*-system.mjs`)는 임시 PostgreSQL에서 실행한다. 운영 DB에는 연결하지 않는다.

```sh
scripts/run-board-system.sh                            # 전부
scripts/run-board-system.sh scripts/market-system.mjs  # 일부만
```

## 모터스포츠 일정 수집기

DB 없이 출처 해석만 확인한다. 실행·반영 방법은 [MOTORSPORT-IMPORT.md](MOTORSPORT-IMPORT.md)를 참고한다.

```sh
cd board-service
node src/motorsport-import/cli.js --source all --no-db
```
