# 운영 배포

운영은 `docker-compose.yml` 위에 운영 오버레이 `docker-compose.prod.yml`을 얹어 실행한다.
운영 서버에서는 **항상 두 파일을 함께 지정한다.**

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait
```

`-f` 없이 실행하면 운영 하드닝이 전혀 적용되지 않는다. 그리고 로컬에 `docker-compose.override.yml`이 있으면 Compose가 그 파일을 자동으로 병합한다.
`ps`, `logs`, `down` 등 이후 명령도 같은 `-f` 조합으로 실행해야 같은 설정을 대상으로 한다.

## 구성

외부 진입은 Cloudflare Named Tunnel 하나뿐이다.

```text
사용자 → morethancar.kr(Cloudflare DNS·HTTPS) → Named Tunnel → cloudflared → proxy(nginx) → frontend / core / board
```

- DB는 Neon PostgreSQL이다. 로컬 `postgres` 서비스와 `revcc_pg` 볼륨은 병합 결과에서 제거된다.
  `!reset`/`!override`를 쓰므로 Docker Compose 2.24 이상이 필요하다.
- proxy의 호스트 포트(`REVCC_PORT`)는 게시하지 않는다. Docker가 게시한 포트는 ufw 등 호스트 방화벽을 우회해 열리므로,
  남겨 두면 Cloudflare를 거치지 않는 경로가 생긴다.
- 네트워크를 역할별로 나눈다.

  | 네트워크 | 서비스 | 외부 통신 |
  |---|---|---|
  | `edge` | proxy, frontend | 불가(internal) |
  | `app` | proxy, core, board | 가능(Neon·Kakao·SMTP) |
  | `data` | core, board, redis | 불가(internal) |
  | `tunnel` | cloudflared(고정 주소 `172.16.238.2`), proxy | — |

  frontend와 proxy는 redis에 닿지 않고, redis와 frontend는 외부로 나가지 못한다.
- nginx는 `172.16.238.2`에서 온 요청만 `CF-Connecting-IP`로 실제 사용자 IP를 복원한다. 이 값은 `nginx/default.conf`의
  `set_real_ip_from`과 같아야 한다.
- core는 `SPRING_PROFILES_ACTIVE=prod`로 실행되어 세션 쿠키가 항상 `Secure`로 나간다. HTTPS는 Cloudflare에서 종단한다.
- 모든 서비스가 `restart: unless-stopped`다. 프로세스가 죽거나 호스트가 재부팅되면 다시 올라온다.
  `docker compose stop`/`down`으로 멈춘 서비스는 다시 올리지 않는다. healthcheck가 unhealthy라는 것만으로는 재시작하지 않는다.
- nginx(로컬·운영 공통)
  - `server_tokens off`, upstream 응답 대기 30초
  - `/api` rate limit: IP당 초당 20·순간 200. 로그인·가입·아이디 확인·비밀번호 재설정·카카오는 IP당 분당 30·순간 30. 초과하면 JSON 429를 보낸다.
  - HSTS(`max-age=300`)는 Cloudflare를 거친 HTTPS 요청에만 붙인다.

## 환경변수

운영 서버의 저장소 루트 `.env`에 둔다. 항목 설명은 [.env.example](../.env.example)을 참고한다.

아래 값이 하나라도 없으면 기동 자체가 실패한다. 로컬 기본값이 운영에 섞이지 않게 하기 위해서다.

| 변수 | 용도 |
|---|---|
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Neon 접속(`DB_PORT` 기본값 5432) |
| `REDIS_PASSWORD` | 세션 저장소 비밀번호. 영문·숫자로 만든다(예: `openssl rand -hex 32`) |
| `KAKAO_REDIRECT_URI` | 운영 도메인의 https 카카오 콜백 URL |
| `PASSWORD_RESET_URL` | 비밀번호 재설정 메일 링크(`https://morethancar.kr/password-reset`) |
| `WITHDRAWAL_HMAC_SECRET` | 회원 탈퇴 재가입 제한 키(32자 이상). 바꾸기 전에 [member-withdrawal.md](member-withdrawal.md)를 확인한다 |
| `CLOUDFLARE_TUNNEL_TOKEN` | Named Tunnel 토큰. 비밀번호처럼 다룬다 |

DB 커넥션 풀은 core 10 + board 10이다. 평시에는 최대 20개를 쓰고, 재배포 중 구·신 컨테이너가 겹쳐도 40개다.
연결을 5초 안에 얻지 못하거나 쿼리가 15초 안에 끝나지 않으면 요청은 503으로 끝난다. 조정 변수는 `.env.example`을 참고한다.

## Cloudflare Named Tunnel 준비 (최초 1회)

1. Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel → **Cloudflared**를 선택하고 이름을 정한다.
2. 설치 명령에 나오는 토큰(`--token` 뒤의 긴 값)을 운영 `.env`의 `CLOUDFLARE_TUNNEL_TOKEN`에 넣는다.
   설치 명령 자체는 실행하지 않는다. compose의 `cloudflared` 서비스가 같은 일을 한다.
3. Public Hostname: `morethancar.kr`(경로 비움) → Service `HTTP`, URL `proxy:80`. DNS CNAME은 Cloudflare가 만든다.
   morethancar.kr을 서버 IP로 가리키던 A/AAAA 레코드가 있으면 지운다.
4. SSL/TLS → Edge Certificates에서 **Always Use HTTPS**를 켠다. nginx도 `X-Forwarded-Proto: http`이면 301로 보낸다.
   Cloudflare의 HSTS 설정은 켜지 않는다. nginx가 이미 보내므로 둘 다 켜면 값이 겹친다.
5. Rules → Transform Rules의 **Remove visitor IP headers**는 켜지 않는다. 켜면 `CF-Connecting-IP`가 사라져
   모든 사용자가 rate limit 버킷 하나를 같이 쓰게 된다.

## 배포 절차

운영 서버의 저장소 디렉터리에서 실행한다.

1. 반영될 변경(특히 `backend/src/main/resources/db/migration`의 새 파일)을 미리 확인한다.
2. 새 Flyway 마이그레이션이 있으면 먼저 DB를 백업한다([DATABASE-MIGRATIONS.md](DATABASE-MIGRATIONS.md)).
   - 과거 배포에서는 `pg_dump -Fc`로 백업했고, Neon 서버가 PostgreSQL 18이라 16 버전 `pg_dump`는 실패했다.
   - 정해진 백업·복원 명령은 문서화되어 있지 않다(미검증).
3. 병합 결과를 실행 전에 확인한다.
   ```sh
   docker compose -f docker-compose.yml -f docker-compose.prod.yml config --services   # postgres가 없고 cloudflared가 있어야 한다
   docker compose -f docker-compose.yml -f docker-compose.prod.yml config | grep -E 'SPRING_PROFILES_ACTIVE|KAKAO_REDIRECT_URI'
   ```
   필수 환경변수가 하나라도 없으면 이 단계에서 오류가 난다. `config` 전체 출력에는 `.env`의 비밀번호가 그대로 찍히므로
   공유하거나 로그에 남기지 않는다.
4. 반영하고 기동한다.
   ```sh
   git pull --ff-only
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait
   ```
   새 마이그레이션은 core가 기동할 때 적용된다. core 로그에서 적용된 버전을 확인한다.

## 배포 후 확인

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps             # 모든 서비스 healthy, cloudflared 포함
docker compose -f docker-compose.yml -f docker-compose.prod.yml port proxy 80  # 게시된 포트가 없어야 한다(오류가 정상)
curl -sI https://morethancar.kr/ | grep -i strict-transport-security          # max-age=300
curl -s https://morethancar.kr/api/health https://morethancar.kr/api/board/health  # 둘 다 {"status":"ok"}
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs proxy | tail  # 첫 칸이 실제 사용자 IP(172.16.238.2가 아님)
```

nginx의 IP 신뢰 경계·rate limit·HSTS 동작은 `scripts/nginx-forwarded-check.sh`로 확인할 수 있다.
임시 컨테이너를 띄우므로 운영 스택이 떠 있지 않은 PC에서 실행한다.

## 장애 대응

위 설정에서 나오는 확인 지점이다. 정리된 장애 대응 절차는 아직 없다.
외부 감시와 health 경로(`/health`, `/api/health`, `/api/board/health`)의 차이는 [MONITORING.md](MONITORING.md)에 있다.

- **로그인이 안 됨**: 쿠키가 `Secure`이므로 HTTPS로 접속했는지 확인한다. Cloudflare의 Always Use HTTPS와 Tunnel 상태(`cloudflared` healthy)를 본다.
- **모든 사용자가 429를 받음**: Cloudflare의 Remove visitor IP headers가 켜져 있거나, proxy 로그의 첫 칸이 `172.16.238.2`라면 실제 IP 복원이 깨진 것이다.
- **503 응답**: DB 연결 대기(5초)나 쿼리 시간(15초)을 넘긴 경우다. Neon 상태와 커넥션 수를 확인한다.
- **서비스가 unhealthy로 남음**: Docker는 healthcheck 실패만으로 재시작하지 않는다. `logs`로 원인을 확인한 뒤 해당 서비스를 다시 올린다.
- **메일이 발송되지 않음**: 서버 아웃바운드에서 SMTP 포트(587)가 막혀 있지 않은지 확인한다.

## 되돌리기

검증된 롤백 절차는 아직 없다. 실제로 롤백을 실행한 기록도 없다.

- 앱과 DB는 따로 되돌려야 한다. 이미지나 코드를 이전 버전으로 돌려도 DB 스키마와 데이터는 돌아가지 않는다.
- Flyway는 적용된 마이그레이션을 자동으로 되돌리지 않는다. 이전 코드가 새 스키마에서 동작하는지는 마이그레이션마다 따로 확인해야 한다.
- 스키마까지 되돌려야 하면 배포 전 백업으로 복원해야 한다. 복원 절차는 문서화되어 있지 않다.
- 기능별 되돌리기 범위는 해당 문서를 따른다(예: [MOTORSPORT-IMPORT.md](MOTORSPORT-IMPORT.md#되돌리기)).
