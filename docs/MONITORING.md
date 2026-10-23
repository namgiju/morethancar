# 서비스 감시 (health check)

서비스가 멈춘 것을 사용자 제보보다 먼저 알기 위한 최소 감시다. 외부 uptime 감시 서비스가 아래 URL을 주기적으로 부르고,
200이 아니면 알림을 보낸다. 대시보드·지표 수집은 두지 않는다.

## health 경로

| 경로 | 처리 | 확인하는 것 | 용도 |
|---|---|---|---|
| `/health` | nginx가 직접 `200 ok` | nginx 프로세스만 | Compose `proxy` healthcheck(컨테이너 안). 외부 감시용이 아니다 |
| `/api/health` | core(Spring) | core가 요청을 받고 DB 연결을 하나 얻을 수 있는지 | 외부 감시 |
| `/api/board/health` | board(Node) | board가 요청을 받고 DB(`SELECT 1`)와 Redis(`PING`)에 응답을 받는지 | 외부 감시 |

- nginx `/health`는 upstream을 부르지 않는다. core·board·DB가 모두 죽어도 200이다.
  proxy healthcheck가 upstream에 묶이면 DB 장애 때 proxy·cloudflared까지 unhealthy가 되므로 일부러 nginx만 본다.
- board의 `/health`(컨테이너 안, Compose healthcheck)와 `/api/board/health`(nginx 경유)는 같은 핸들러다.
- 응답 본문은 `{"status":"ok"}`(200) 또는 `{"status":"unavailable"}`(503)뿐이다. DB 호스트·예외 메시지·환경변수는 싣지 않고,
  실패 원인은 각 서비스 로그에만 남긴다(`Health check failed` / `Health check database connection failed`).
- 확인은 3초로 끊는다. DB나 Redis가 응답하지 않아도 3초 뒤 503이다. 테이블은 읽지 않는다(core는 `Connection.isValid`, board는 `SELECT 1`).
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

운영에서는 여기에 Cloudflare 앞단 오류가 더해진다. Tunnel이 끊기거나 EC2가 멈추면 Cloudflare가 502/530 등을 낸다.
어느 경우든 "200이 아니면 장애"로 판정하면 된다.

## 외부 감시 등록

UptimeRobot, Better Stack 같은 무료 HTTP 감시 서비스 하나에 모니터 두 개를 만든다.

| 모니터 | URL | 기대 상태 | 메서드 |
|---|---|---|---|
| morethancar core | `https://morethancar.kr/api/health` | 200 | GET |
| morethancar board | `https://morethancar.kr/api/board/health` | 200 | GET |

설정값:

- **주기**: 5분(무료 플랜 기본). 더 짧게 할 필요는 없다.
- **요청 timeout**: 10~30초. 앱이 3초 안에 답하므로 이보다 길게 걸리면 그 자체가 장애다.
- **판정**: 상태 코드 200만 정상. 키워드 검사를 지원하면 본문에 `"status":"ok"`가 있는지도 본다.
  리다이렉트는 따라가지 않는다(https URL을 직접 넣는다).
- **알림 채널**: 운영자 이메일. 휴대폰 앱 푸시를 지원하면 같이 켠다. 복구(up) 알림도 받는다.
- **연속 실패 조건**: 지원하면 2회 연속 실패 뒤 알림으로 둔다. 재배포(`up -d --build`) 중 컨테이너 교체로
  잠깐 502가 날 수 있어서다.
- 같은 사이트의 메인 페이지(`https://morethancar.kr/`, 기대 200)를 세 번째 모니터로 둘 수 있다. frontend(Next.js) 장애는
  위 두 경로로는 잡히지 않는다.

등록 후 확인:

1. 두 모니터가 Up으로 바뀌는지 본다.
2. Cloudflare가 감시 서비스 요청을 막지 않는지 본다. Bot Fight Mode나 WAF 규칙이 challenge(403)를 내면 장애로 오인된다.
   그러면 Cloudflare Security Events에서 막힌 요청을 확인하고, 두 health 경로를 예외로 둔다.
3. 알림이 실제로 오는지 한 번 확인한다. 감시 서비스의 테스트 알림 기능을 쓰거나, 존재하지 않는 경로
   (예: `https://morethancar.kr/api/health-test-404`)로 임시 모니터를 만들어 down 알림을 받은 뒤 지운다.
   운영 서비스를 일부러 멈춰서 시험하지 않는다.

## 알림을 받았을 때

1. 어느 모니터가 실패했는지 본다. 둘 다면 DB·Tunnel·EC2 같은 공통 원인, 하나면 해당 서비스부터 본다.
2. 운영 서버에서 상태와 로그를 확인한다.
   ```sh
   docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
   docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 100 core   # 또는 board
   ```
3. 이후 판단은 [DEPLOYMENT.md의 장애 대응](DEPLOYMENT.md#장애-대응)을 따른다.
