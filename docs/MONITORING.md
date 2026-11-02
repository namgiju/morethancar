# 서비스 감시 (health check)

서비스가 멈춘 것을 사용자 제보보다 먼저 알기 위한 최소 감시다. 외부 uptime 감시 서비스가 아래 URL을 주기적으로 부르고,
200이 아니면 알림을 보낸다. 대시보드·지표 수집은 두지 않는다.

## health 경로

경로는 두 종류다. **생존 확인(liveness)**은 프로세스가 요청을 받는지만 보고 DB를 건드리지 않는다.
**준비 확인(readiness)**은 DB(와 board는 Redis)까지 확인하므로 부를 때마다 운영 Neon을 깨운다.

| 경로 | 종류 | 처리 | 확인하는 것 | 용도 |
|---|---|---|---|---|
| `/health` | 생존 | nginx가 직접 `200 ok` | nginx 프로세스만 | Compose `proxy` healthcheck(컨테이너 안) |
| `/api/health/live` | 생존 | core(Spring) | core가 요청을 받는지(기동·Flyway 완료 후에만 응답) | Compose `core` healthcheck, 잦은 외부 감시 |
| `/api/board/health/live` | 생존 | board(Node) | board가 요청을 받는지(Redis 연결 후에만 listen) | 잦은 외부 감시. 컨테이너 안에서는 `/health/live`(Compose `board` healthcheck) |
| `/api/health` | 준비 | core(Spring) | core가 요청을 받고 DB 연결을 하나 얻을 수 있는지 | 외부 감시(긴 주기) |
| `/api/board/health` | 준비 | board(Node) | board가 요청을 받고 DB(`SELECT 1`)와 Redis(`PING`)에 응답을 받는지 | 외부 감시(긴 주기) |

- nginx `/health`는 upstream을 부르지 않는다. core·board·DB가 모두 죽어도 200이다.
  proxy healthcheck가 upstream에 묶이면 DB 장애 때 proxy·cloudflared까지 unhealthy가 되므로 일부러 nginx만 본다.
- board의 `/health`(컨테이너 안)와 `/api/board/health`(nginx 경유)는 같은 준비 확인 핸들러다. Compose healthcheck는 쓰지 않는다.

## Neon 자동 정지(scale to zero)와 health

운영 DB(Neon)는 5분 동안 활동이 없으면 컴퓨트를 정지하고, 그동안은 CU-hours가 쌓이지 않는다(무료 한도 월 100 CU-hours,
최소 0.25 CU로 한 달 내내 켜져 있으면 약 180 CU-hours). 5분보다 짧은 간격으로 DB에 쿼리가 하나라도 가면 정지하지 못한다.
2026-10-27 확인 당시 Neon 컴퓨트가 12일째 한 번도 정지하지 않고 켜져 있었고(92.01 CU-hours 사용), 원인으로 확인한 설정은 다음과 같다.

| 원인 | 주기 | 조치 |
|---|---|---|
| core Compose healthcheck가 `GET /api/vehicles`(vehicles 테이블 조회) | 10초 | `/api/health/live`로 변경 |
| board Compose healthcheck가 `/health`(`SELECT 1`) | 10초 | `/health/live`로 변경 |
| core Hikari 최소 유휴 연결 2개. HikariCP 6.3은 유휴 연결마다 `keepaliveTime` 기본값 2분마다 확인 쿼리를 보내고, `max-lifetime` 30분마다 새로 연결한다 | 약 2분 | 운영 오버레이에서 최소 유휴 0, 유휴 60초 뒤 닫기 |
| UptimeRobot이 준비 확인 두 개와 메인 페이지(SSR이 API → DB 조회)를 부름 | 5분 | 감시 주기 조정(아래 "외부 감시 등록") — 운영자가 UptimeRobot에서 직접 바꾼다 |

- board(pg-pool 3.14)는 최소 유휴 0(기본값)이고 keepalive 쿼리가 없어 유휴 30초 뒤 연결을 모두 닫는다. 바꾸지 않았다.
- core·board에는 주기 작업(`@Scheduled`, `setInterval`)이 없다. 모터스포츠 수집 cron(`scripts/motorsport-import-cron.sh`, 하루 1회)은
  2026-10-27 기준 등록하지 않았다([MOTORSPORT-IMPORT.md](MOTORSPORT-IMPORT.md)). 등록하면 하루 한 번 DB를 깨우는 정도다.
- 실제 사용자·검색엔진 크롤러 요청도 DB를 깨운다. 이건 정상 사용량이다.
- 대가: 정지 상태에서 첫 요청은 Neon 재기동(보통 1초 안팎)과 새 연결 시간만큼 느려진다. core·board의 연결 대기 5초 안에 들어오는 범위다.
- 설정이 다시 바뀌지 않았는지는 `scripts/compose-idle-check.sh`로 확인한다(실제 `.env`를 읽지 않고 병합 결과만 본다).
- 응답 본문은 `{"status":"ok"}`(200) 또는 `{"status":"unavailable"}`(503)뿐이다. DB 호스트·예외 메시지·환경변수는 싣지 않고,
  실패 원인은 각 서비스 로그에만 남긴다(`Health check failed` / `Health check database connection failed`).
- 준비 확인은 3초로 끊는다. DB나 Redis가 응답하지 않아도 3초 뒤 503이다. 테이블은 읽지 않는다(core는 `Connection.isValid`, board는 `SELECT 1`).
  다만 Neon이 정지해 있으면 연결 자체가 컴퓨트를 깨운다.
- 두 경로 모두 nginx `/api` rate limit(IP당 초당 20)을 받는다. 감시 주기(분 단위)로는 걸리지 않는다.

## 장애별 응답

로컬 Compose(`http://localhost:8090`)에서 서비스를 하나씩 멈춰 확인한 값이다(2026-10-23).

| 상황 | `/health` | `/api/health` | `/api/board/health` |
|---|---|---|---|
| 정상 | 200 | 200 | 200 |
| DB 중지 | 200 | 503 | 503 |
| Redis 중지 | 200 | 200 | 503(3초) |
| core·board 컨테이너 중지 | 200 | 504(5초) | 502 |
| DB 재시작 직후 | 200 | 503(3초, 풀 재연결 중) → 수 초 뒤 200 | 200 |

생존 확인(`/api/health/live`, `/api/board/health/live`)은 DB·Redis가 멈춰도 200이고, 컨테이너가 멈추면 위 준비 확인과 같이 504/502다
(DB·Redis 중지는 2026-10-27 로컬 Compose에서 확인, 컨테이너 중지 응답은 nginx 동작상 같은 값으로 추정).

운영에서는 여기에 Cloudflare 앞단 오류가 더해진다. Tunnel이 끊기거나 EC2가 멈추면 Cloudflare가 502/530 등을 낸다.
어느 경우든 "200이 아니면 장애"로 판정하면 된다.

## 외부 감시 등록

2026-10-23 등록한 운영 설정: **UptimeRobot** 무료 플랜(운영자 GitHub 계정으로 로그인)에 준비 확인 두 개(`/api/health`, `/api/board/health`)와
메인 페이지(`https://morethancar.kr/`)를 5분 주기로 등록했다. 알림은 계정 이메일로 장애(down)·복구(up) 모두 받는다. 무료 플랜은 상태 코드를
고를 수 없고 2xx·3xx를 정상으로 본다(아래 URL 모두 리다이렉트 없이 200을 낸다).

이 세 모니터는 모두 5분마다 DB를 깨운다(메인 페이지도 SSR이 API를 거쳐 DB를 읽는다). Neon이 5분 비활동으로 정지할 틈이 없으므로
아래처럼 바꾼다(권장, 2026-10-27 — 운영자가 UptimeRobot에서 직접 바꿔야 하고 이 저장소 변경만으로는 반영되지 않는다).
다른 서비스로 옮길 때도 같은 값을 쓴다.

2026-11-02 적용 상태: 기존 세 모니터의 URL만 바꿨다 — `/api/health` → `/api/health/live`, `/api/board/health` → `/api/board/health/live`,
`/` → `/login`(모두 5분 주기 유지, 이름도 URL과 같게 바꿈). 아래 표의 준비 확인 60분 모니터 두 개는 **아직 등록하지 않았다**.
그래서 지금은 DB 장애를 외부 감시가 잡지 못한다(사용자가 503을 받아도 알림이 오지 않는다).

| 모니터 | URL | 주기 | 깨우는 것 |
|---|---|---|---|
| morethancar core live | `https://morethancar.kr/api/health/live` | 5분 | 없음(DB 미접속) |
| morethancar board live | `https://morethancar.kr/api/board/health/live` | 5분 | 없음(DB 미접속) |
| morethancar web | `https://morethancar.kr/login` | 5분 | 없음(API를 부르지 않는 화면) |
| morethancar core | `https://morethancar.kr/api/health` | 60분 | DB |
| morethancar board | `https://morethancar.kr/api/board/health` | 60분 | DB |

- 생존 확인 3개는 프로세스·Tunnel·frontend 장애를 5분 안에 잡는다. DB 장애는 준비 확인 2개가 최대 60분 늦게 잡는다.
  그 사이 실제 사용자는 503을 받으므로, DB 장애를 더 빨리 알아야 하면 준비 확인 주기를 줄이되
  N분 주기면 대략 "5분 + 재기동" / N 만큼 컴퓨트가 켜져 있다(30분 주기 ≈ 20%, 0.25 CU 기준 월 약 36 CU-hours, 60분 주기 ≈ 10%, 약 18 CU-hours).
  5분 이하 주기는 정지를 완전히 막는다.
- 메인 페이지(`/`) 모니터는 지우거나 `/login`으로 바꾼다. `/login`은 Compose `frontend` healthcheck와 같은 경로다.

설정값:

- **주기**: 위 표. 준비 확인은 5분보다 충분히 길게 둔다.
- **요청 timeout**: 10~30초. 앱이 3초 안에 답하므로 이보다 길게 걸리면 그 자체가 장애다.
- **판정**: 상태 코드 200만 정상. 키워드 검사를 지원하면 본문에 `"status":"ok"`가 있는지도 본다.
  리다이렉트는 따라가지 않는다(https URL을 직접 넣는다).
- **알림 채널**: 운영자 이메일. 휴대폰 앱 푸시를 지원하면 같이 켠다. 복구(up) 알림도 받는다.
- **연속 실패 조건**: 지원하면 2회 연속 실패 뒤 알림으로 둔다. 재배포(`up -d --build`) 중 컨테이너 교체로
  잠깐 502가 날 수 있어서다.
- 같은 사이트의 메인 페이지(`https://morethancar.kr/`, 기대 200)를 세 번째 모니터로 둘 수 있다. frontend(Next.js) 장애는
  위 두 경로로는 잡히지 않는다.

등록 후 확인:

1. 모든 모니터가 Up으로 바뀌는지 본다.
2. Cloudflare가 감시 서비스 요청을 막지 않는지 본다. Bot Fight Mode나 WAF 규칙이 challenge(403)를 내면 장애로 오인된다.
   그러면 Cloudflare Security Events에서 막힌 요청을 확인하고, health 경로를 예외로 둔다.
3. 알림이 실제로 오는지 한 번 확인한다. 존재하지 않는 경로(예: `https://morethancar.kr/api/health-alert-test`, 404)로
   임시 모니터를 만들어 down 알림을 받고, 그 모니터의 URL을 200을 내는 주소로 바꿔 up 알림을 받은 뒤 지운다.
   UptimeRobot은 이미 등록된 URL과 같은 주소로는 저장하지 않으므로 `https://morethancar.kr/api/health?alert-test=1`처럼
   쿼리 문자열을 붙인다. 운영 서비스를 일부러 멈춰서 시험하지 않는다.

## 알림을 받았을 때

1. 어느 모니터가 실패했는지 본다. 둘 다면 DB·Tunnel·EC2 같은 공통 원인, 하나면 해당 서비스부터 본다.
2. 운영 서버에서 상태와 로그를 확인한다.
   ```sh
   docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
   docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 100 core   # 또는 board
   ```
3. 이후 판단은 [DEPLOYMENT.md의 장애 대응](DEPLOYMENT.md#장애-대응)을 따른다.
