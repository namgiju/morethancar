# morethancar 다음 구현 작업 (진행 관리 파일)

> 2026-10-23 공개용 정리: 운영 서버 IP·보안 그룹·SSH 키 경로·백업 경로는 `<…>` 자리표시자로 바꿨다. "당시 Docker 실행 문서"는 삭제한 `docs/DOCKER-SUBMISSION.md`를 가리킨다. 운영 내용은 [DEPLOYMENT.md](../DEPLOYMENT.md), 로컬 개발 내용은 [DEVELOPMENT.md](../DEVELOPMENT.md)로 옮겼다.

> **새 세션 규칙: 이 파일 하나만 읽고 작업을 시작할 것.**
> `REVCC_AUDIT.md`는 2026-09-29에 완료된 감사 원본이다 — **재분석하지 말고 수정하지도 말 것**.
> 이 파일은 그 감사 결과와 이후 완료된 P0 작업을 요약해, 다음 STEP을 바로 구현할 수 있게 만든 실행 파일이다.

---

## 1. 현재 브랜치와 프로젝트 상태

- **브랜치(2026-10-19 사용자 결정)**: 통합 기준은 `main`이다. 코드 변경은 최신 `main`에서 기능별 브랜치를 만들어 진행하고 `main`으로 합친다. push·PR·병합 시점은 사용자 지시를 따른다.
  - 이전 규칙(기록): "`docker-assignment` 브랜치에서만 작업, 다른 브랜치로 전환하지 말 것" — 2026-10-19에 위 기준으로 대체했다.
  - **브랜치 규칙 현황 확인(2026-10-19, 위 결정 전 기록)**: 위 규칙을 바꾸기로 한 결정 기록은 이 파일·`MORETHANCAR_EV_TASKS.md`·커밋 메시지 어디에도 없다. 실제 이력은 규칙과 다르다 — `origin/docker-assignment`의 마지막 커밋은 `f76aa09`(2026-10-07)이고 `d0347ae`로 main에 머지된 뒤 갱신되지 않았다. 2026-10-11 `406f2db`부터는 main에 직접 커밋·push했고(2026-10-19 기준 `docker-assignment..main` 46커밋), EV 허브는 `codex/ev-policy-hub` → PR #2(`57d0327`)로 main에 들어갔다. 운영 EC2도 main을 `git pull`한다(EV 문서 STEP 10). CI(`.github/workflows/ci.yml`)는 `docker-assignment`·`main` 두 브랜치의 push/PR에서 모두 돈다. 어느 브랜치를 기준으로 할지는 사용자가 정한다 — 같은 날 사용자가 `main` 통합 + 기능 브랜치로 정했고, §5 2·10번과 §7 명령을 그 기준으로 고쳤다. `.github/workflows/ci.yml`의 `docker-assignment` 트리거는 남아 있지만 동작에는 영향이 없다(정리는 별도 판단).
- **개발 기준 경로: 저장소 루트(이 파일이 있는 디렉터리).** 2026-10-19부터 새 MacBook에 새로 클론한 저장소(`$HOME/morethancar`)를 기준으로 쓴다. 이전 Mac의 `~/Projects/revcc-site`(2026-10-02~)와 그 전의 `~/Desktop/revcc-site`(Desktop 하위 접근이 비정상적으로 느려 옮겼음)는 더 이상 기준이 아니다 — 이 문서에서 그 경로가 나오면 당시 기록으로 읽는다. 코드·설정·스크립트에 절대경로를 하드코딩하지 않는다(항상 저장소 기준 상대경로 또는 환경변수 사용).
- 이 파일 작성 시점 기준 `git status`: P0 변경사항 + `REVCC_AUDIT.md` + 이 파일이 커밋 대상으로 대기 중이었고, 이번 세션에서 **P0 변경사항 + REVCC_AUDIT.md + REVCC_NEXT_TASKS.md를 함께 커밋·push했다** (아래 "완료된 작업"의 commit hash 참고). 이 파일 이름은 2026-10-12 `3e6ddc7`에서 `MORETHANCAR_NEXT_TASKS.md`로 바뀌었다.
- 프로젝트 구조: `backend`(Spring Boot, `core`), `board-service`(Node/Express, `board`), `nginx`(proxy), `docker-compose*.yml` 3종(기본·`dev`·`prod`, 2026-10-11 `override`·`garage` 삭제) — Next.js 전환과 무관하게 그대로 유지한다. 전환을 이유로 이미 있는 API를 다시 만들지 않는다. 화면 작업 전에는 항상 기존 API와 기존 호출 코드(`frontend/lib/*`, `board-service/src/*`, `backend/src/main/java/com/revcc/app/*`)부터 조사한다.
- **새 MacBook 개발 환경(2026-10-19 준비)**:
  - Docker Desktop(엔진 29.8.2, CLI는 `~/.docker/bin/docker` → 앱 내부 바이너리). 저장소 루트에서 `docker compose up -d --build --wait` → `http://localhost:8090` 6개 서비스 healthy 확인. 로컬 DB 볼륨은 compose 프로젝트 이름(=폴더 이름)을 따라 `morethancar_revcc_pg`로 새로 만들어졌다(§5 "발견된 추가 이슈"의 2026-10-19 항목 참고).
  - 직접 개발 도구(버전은 Dockerfile·CI와 같음): Homebrew(`/opt/homebrew`), Node 22.23.3(Homebrew `node@22`, keg-only라 `~/.zprofile`에서 PATH 추가), JDK Temurin 23.0.2+7(Homebrew에 JDK 23이 없어 Adoptium 배포본을 `~/Library/Java/JavaVirtualMachines/temurin-23.jdk`에 설치, `JAVA_HOME=$(/usr/libexec/java_home -v 23)`), Maven 3.9.9(Homebrew는 3.10만 있어 Apache 배포본을 `~/.local/opt/apache-maven-3.9.9`에 설치, `~/.local/bin/mvn`).
  - 비밀 파일 위치(값은 문서에 남기지 않음): 운영 SSH 키 `<SSH 키 경로>`(파일 400, `~/.ssh` 700). 이전 Mac에서 가져온 env 원본 `~/.config/morethancar/imported.env`(파일 600, 디렉터리 700 — 운영 DB 접속 정보가 들어 있어 로컬 `.env`로 옮기지 않음). 저장소 `.env`(600, git 무시)는 로컬 compose 전용이다 — 원본에서 카카오 로그인(`KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`)·카카오 지도(`KAKAO_MAP_KEY`)·SMTP(`SMTP_HOST`/`SMTP_USERNAME`/`SMTP_PASSWORD`/`SMTP_FROM`)만 옮겼고, `DB_*`·`CLOUDFLARE_TUNNEL_TOKEN` 같은 운영 전용 값은 없다.
  - 아직 안 한 것: 이 Mac에서 `mvn test`·`npm ci`·`npm test` 실행, 카카오 개발자 콘솔에 로컬 Redirect URI(`http://localhost:8090/api/auth/kakao/callback`)·Web 도메인(`http://localhost:8090`) 등록 여부 확인.
- 프론트엔드: `frontend`(Next.js) 하나다. 레거시 정적 HTML/CSS/JS(`assignment-frontend`)는 모든 화면을 Next.js로 옮긴 뒤 2026-10-11에 삭제했다(git 이력에서 참고 가능). **새 UI/페이지는 특별한 이유가 없으면 `frontend`(Next.js)에 구현한다.** 전환은 기존 기능을 깨지 않는 방식으로 화면 단위로 하나씩 진행한다.
- 인증 구조: 커스텀 쿠키+Redis 세션(Spring Security 미사용). `SharedSessionService`가 세션을 만들고 `revcc:session:<token>` 키로 Redis에 저장, Node가 같은 키를 직접 읽음. Next.js 전환에서도 이 인증/세션/API 계약을 임의로 바꾸지 않는다.

## 2. 완료된 작업 (P0, 2026-09-29)

### P0-1. Kakao OAuth state/CSRF 대응 — 완료
- 신규: `backend/src/main/java/com/revcc/app/KakaoStateService.java` — state를 Redis(`revcc:oauth:state:<state>`, TTL 5분)에 저장하고 동일 값을 `REVCC_OAUTH_STATE` HttpOnly 쿠키(path=`/api/auth/kakao`, `app.session.secure` 연동 Secure, SameSite=Lax)로 브라우저에 바인딩. 검증은 `GETDEL`로 원자적 1회 소비.
- 변경: `KakaoOAuthService.authorizeUrl(String state)` — 인가 URL에 `&state=` 추가.
- 변경: `AuthController.kakaoLogin()`/`kakaoCallback()` — state 발급/쿠키 설정, 콜백에서 `code`+`state`+쿠키 3자 대조 검증. 실패(없음/불일치/만료/재사용) 시 원인 구분 없이 400, 검증 성공/실패 모두 state 쿠키 즉시 폐기.
- Kakao 콜백 URL 하드코딩 점검: 기존에 이미 `KAKAO_REDIRECT_URI` 환경변수로 되어 있었음(로컬 기본값만 `localhost:8090`). `docker-compose.prod.yml`에 `KAKAO_REDIRECT_URI:?...` 필수화를 추가해 운영에서 값 누락 시 `localhost` 기본값으로 조용히 넘어가지 못하고 기동 자체가 실패하도록 막음.

### P0-2. Cloudflare/TLS 운영 대응 — 완료 (코드 범위만)
- `nginx/default.conf`: `X-Forwarded-Proto`를 `/api/(board|parts)`, `/api/` 프록시 구간에 전달(map으로 로컬은 `$scheme` 대체, 앞단이 있으면 그 값 그대로). 앞단이 "원요청은 http였다"고 알려준 경우에만 301 `https://` 리다이렉트 — 로컬 개발(`http://localhost:8090`)은 헤더 자체가 없어 절대 영향받지 않음(컨테이너로 직접 검증 완료).
- Spring `forward-headers-strategy: framework`(기존), Node `trust proxy: 1`(기존) — 코드 변경 없이 이미 X-Forwarded-Proto를 올바르게 해석할 준비가 되어 있었음.
- `REVCC_SESSION` 쿠키 Secure는 기존에 이미 `application-prod.yml`에서 하드코딩(override 불가)되어 있어 추가 변경 불필요.
- **채택한 아키텍처**: Cloudflare(또는 Cloudflare Tunnel)가 TLS 종단을 맡고 Docker Nginx는 내부에서 평문 80만 리슨(A안). Let's Encrypt/certbot을 nginx에 직접 붙이는 B안은 대규모 구조 변경이라 채택하지 않음.
- **코드 밖에서 별도로 필요한 운영 작업(이번 범위 아님, 기록만)**: Cloudflare SSL/TLS 모드를 Full 또는 Full(strict)로 설정, Always Use HTTPS, Cloudflare Tunnel 또는 Origin Certificate 구성. 이건 인프라/대시보드 작업이라 코드 변경으로 처리할 수 없음.

### 관련 테스트 결과 (2026-09-29)
- Spring `mvn test` (backend/): **77개 실행, 실패 0, 오류 0** (통합테스트 2클래스 9개는 기존과 동일하게 실 DB/Redis 미설정으로 skip — 정상)
- Node `npm test` (board-service/, `node --test`): **9개 실행, 실패 0** (app/community/rate-limit/session-revocation 4개 파일, board-service 코드는 이번에 변경 없음)
- 신규 보안 테스트: `KakaoStateServiceTest`(정상/없음/불일치/만료/재사용/형식오류 + 쿠키 속성), `KakaoOAuthServiceTest`(state가 URL에 실제로 실리는지), `AuthControllerTest`에 state 없음/불일치 시 카카오 API·세션 생성이 전혀 호출되지 않는지 검증하는 테스트 2건 추가.

---

## 3. 남아 있는 P1/P2/P3 목록

### P1 (배포 전 수정)
- **P1-1**: 비밀번호 최소 길이 제한 없음 (`AuthController.java:155` `Credentials.password`, `PasswordResetController.java:16` `ResetRequest.password`)
- **P1-2**: 전역 요청 본문 크기 제한 없음 → 대용량 JSON 메모리 고갈 DoS (`backend/src/main/resources/application.yml`, `application-prod.yml`)
- **P1-3**: 스키마 소유권 3원화(Hibernate `ddl-auto:update` + `backend/migrations/*.sql` + board-service 매 부팅 `schema.sql`) — 마이그레이션 이력 관리 부재
- **P1-4**: 부품 장터(`board-service/src/market.js`)에 관리자 모더레이션 기능 전무 → 사기/어뷰징 매물 삭제 불가
- **P1-5**: `docker-compose.override.yml` 자동적용 때문에 당시 Docker 실행 문서가 안내하던 방식(`docker compose up -d --build --wait`)으로 실행하면 `docker-compose.prod.yml` 하드닝이 전혀 적용되지 않음
- **P1-6**: board-service `admin.js`/`admin-access.js`, `market.js` 인가 로직에 대한 자동 테스트 전무(회귀 보호 없음)
- **P1-7**: CI 파이프라인 부재(`.github/workflows` 디렉터리 자체가 없음, 확인됨) — 1000줄+ 기존 테스트가 전혀 자동 실행되지 않음

### P2 (빠른 시일 내 개선, P1 완료 후 착수)
- P2-1: 비밀번호 재설정 요청에서 계정 존재여부 열거 가능(의도된 트레이드오프로 보이나 재확인 필요)
- P2-2: Rate limit이 IP 기준만 존재 + Spring `RateLimitFilter` 메모리 누수(만료 버킷 미정리)
- P2-3: board-service 서버측 HTML sanitize 부재(현재 프론트 textContent로 완화)
- P2-4: 부품장터 글 작성(POST)·조회수 증가·신고 엔드포인트에 rate limit 없음
- P2-5: Redis 무인증 + Docker 네트워크 미분리(단일 flat bridge)
- P2-6: 로컬 postgres 컨테이너 약한 기본 크리덴셜(`POSTGRES_PASSWORD:-revcc`)
- P2-7: Hikari/pg 커넥션 풀 전혀 튜닝 안 됨
- P2-8: 전 서비스에 `restart:` 정책 없음
- P2-9: `.env.example`이 실제 사용되는 다수 환경변수를 누락
- P2-10: nginx에 요청 rate limit(`limit_req_zone`) 없음, HSTS 헤더 없음
- P2-11: 회원 삭제 시 게시글/댓글 FK가 RESTRICT라 사실상 탈퇴 불가능 + 방명록 CASCADE 부작용

### P3 (장기 개선, P1/P2 완료 후 착수)
- P3-1: 일부 admin 목록 페이지네이션 없음
- P3-2: `moderation_logs` 테이블 인덱스 없음
- P3-3: `garage/index.html` orphan 페이지, `app.js` 부품 호환성 데드코드
- P3-4: `/api/board/admin/logs` 고아 API
- P3-5: 문서-코드 불일치(당시 Docker 실행 문서, AUTH-UI.md)
- P3-6: 카카오 닉네임 동기화 레이스(uncaught exception → 500)
- P3-7: `VehicleController`의 dev용 `@CrossOrigin` 죽은 코드
- P3-8: 모니터링/알림 스택 부재
- P3-9: XSS 회귀 방지용 자동 테스트 없음

각 항목의 상세 근거/코드 라인은 필요할 때만 `REVCC_AUDIT.md`의 해당 섹션(§2-B, §5, §6, §13, §15)을 찾아서 참고 — 미리 전체를 다시 읽지 말 것.

---

## 4. 다음 작업 순서

> **2026-10-01 전환**: "기능·보안 요구사항을 최대한 완벽하게 구현하는 단계"에서 "실제로 공개하고 사용자를 받아 보는 단계"로 바꾼다. 현재 규모는 회원 약 33명, 게시글 약 21개, 매물 0건이다. STEP 10-impl-C까지 완료했고 main에도 반영했다(`82de6b3`). 목표는 완벽한 인프라·보안·DB 설계가 아니라 **실제로 배포 가능한 서비스 → 사용자를 받음 → 실제 사용 데이터를 확인 → 필요한 부분을 개선**이다.

### 완료

```
[x] STEP 1: P1-1 비밀번호 최소 길이 + P1-2 요청 body 크기 제한 + P1-5 운영 배포 문서 수정
[x] STEP 2: P1-4 부품장터 관리자 모더레이션 + P1-6 admin/market 인가 테스트
[x] STEP 3: P1-7 GitHub Actions CI
[x] STEP 4: P1-3 Flyway/Liquibase 기반 DB migration 정리
[x] STEP 5-A: P2-2 외부 X-Forwarded-For 신뢰 문제 해결 + limiter 만료 버킷 정리
[x] STEP 5-B: P2-2 계정 단위 로그인 제한 + P2-4 board 누락 엔드포인트 rate limit (+ admin-system.mjs 정합화)
[x] STEP 6: P2-3 서버측 XSS 방어 (B안: 입력 시 HTML 태그 제거)
[x] STEP 7-A: P2-5 Redis 인증 + P2-6 DB credential 정리
[x] STEP 7-B: P2-5 Docker 네트워크 분리 (prod 오버레이에만 적용)
[x] STEP 8: P2-7 + P2-8 + P2-9 운영 안정성 (커넥션 풀, restart 정책, .env.example)
[x] STEP 9: P2-10 Nginx 하드닝 (Cloudflare Named Tunnel 실제 IP 복원 포함)
[x] STEP 10: P2-11 회원탈퇴/FK 정책 — 결정 완료(2026-09-30, soft withdrawal). 구현은 아래 STEP 10-impl
[x] STEP 10-impl-A: 탈퇴 상태 기반(스키마 V3) + 탈퇴 계정 차단·표시 + 관리자 복구 차단 + 마지막 관리자 보호
[x] STEP 10-impl-B: 본인 글 soft delete + 이미지 공개 범위 제한 + image_ids orphan 방지
[x] STEP 10-impl-C: 일반 계정 탈퇴(비밀번호 재확인) + 데이터 처리 + 매물·방명록·차고 처리 + 재가입 제한 + 탈퇴 UI
```

### 지금 할 것 (위에서부터 순서대로)

```
[x] NOW-1: UI/UX 개선 및 Next.js 전환 — 메인대문/커뮤니티/내차고/인증/장터/관리자 포팅 전부 완료(2026-10-06). 로고 교체(morethancarLogo.png) + 공용 헤더 레이아웃(로고 확대·좌측 고정, 검색 확대·중앙, nav·로그인 우측 고정) + `/` 페이지 누락된 SiteFooter 추가까지 이어서 완료.
[x] NOW-2: 실제 운영 배포 준비 (production secret/env, Compose 실행 조건, 오래된 인스턴스 정리) — 근거(문서 기록): 2026-10-13 EC2에서 prod 오버레이로 기동 성공(필수 env가 없으면 기동 거부), 배포 전 Neon Flyway V7 확인 + pg_dump 백업·복원 검증. 기록 없는 NOW-2-3의 2번(카카오 콘솔 운영 설정)은 아래 NOW-2-3에 남김
[x] NOW-3: 실제 배포 (Cloudflare Named Tunnel + 현재 production compose) — 근거(문서 기록): 2026-10-13 `57d0327`, 2026-10-16 `98eb6ec` EC2 배포, cloudflared 포함 6개 서비스 healthy, morethancar.kr 실접속 200. 배포 후 확인 일부와 이후 커밋 반영 여부는 아래 NOW-3에 남김
[x] NOW-4: 최소 운영 안정성 (Kakao HttpClient timeout, 최소 health monitoring/알림) — NOW-4-1·NOW-4-2 완료(2026-10-23, 운영 `790654a` + UptimeRobot 감시·이메일 알림 수신 확인)
[~] MOTORSPORT-IMPORT: 모터스포츠 공식 일정 자동 수집(2026-10-20) — `dcf475d` 운영 배포(V9, 수집 계정 id 4, 출처 비활성). 출처 이용 조건 금지(F1·NASCAR)/불명확(르망·슈퍼레이스·인제)이라 활성화·첫 등록·cron은 사용자 결정 대기. 인제는 운영 EC2에서 접속 불가. WRC 미지원(EC2에서는 200). 실패 메일 알림은 쓰지 않음(관리자 상태·로그만). 2026-10-20에는 EC2에서 smtp.gmail.com:587에 연결되지 않았으나 2026-10-23 재확인에서 EC2·core 컨테이너 모두 587 연결 성공, 같은 날 운영 일반 계정으로 재설정 메일 수신까지 확인(보안 그룹 규칙 자체는 미확인, LATER-2 참고). 상세 docs/MOTORSPORT-IMPORT.md
[ ] LATER-1: 카카오 회원 탈퇴 최소 구현 (배포 이후 제품 완성도 작업, 구 STEP 10-impl-D 축소)
[x] LATER-2: 비밀번호 재설정 응답 통일 (작은 보안 정리, 구 STEP 11 축소) — 2026-10-23 PR #15 운영 배포(`76e8985`), 운영 일반 계정으로 메일 수신·재설정 성공 확인
[ ] LATER-5: 운영 성능 메모 — SSR 내부 API 호출이 nginx rate limit을 frontend IP 하나로 공유, `/_next/static` no-store (2026-10-06, 실제 429·속도 문제가 보이면 착수)
[ ] LATER-4: 차량 기록/타임라인 — 자동 연결·사진 기록·기록 보존부터, timeline read API·UI·회고 모션은 마지막 (2026-10-06 계획, 아래 "차량 기록/타임라인" 참고)
```

- **NOW-1 UI/UX 개선 및 Next.js 전환**
  - 실제 사용자가 커뮤니티, 내 차고, 장터를 편하게 쓰는 데 집중한다.
  - 기존 backend API(core·board)를 불필요하게 다시 만들지 않는다. 화면 계층만 바꾸고, API 변경은 화면에 꼭 필요한 만큼만 한다.
  - 저장소에 있던 Next.js "My Garage" 프로토타입(`frontend/`, `docker-compose.garage.yml`의 garage-ui)을 재사용하는 쪽으로 정했다(새로 시작하지 않음).
  - 전환 범위와 순서(어느 화면부터 바꿀지, 기존 `assignment-frontend`와 공존할지)는 착수 시 짧게 정하고 시작한다. 큰 설계 문서를 먼저 만들지 않는다.
  - **남은 진행 순서(2026-10-05 사용자 확정)** — 메인 대문, 커뮤니티 STEP 2-0~2-5, 내 차고 STEP 3-0~3-6 구현은 끝났다. 남은 작업은 아래 순서대로 한다:
    ```
    [x] 1. /home 최종 UI 검증 — STEP 3-6에서 남긴 Chrome 클릭 검증(사진 교체·제거 미리보기, 중첩 다이얼로그, 인증 계정의 인장 설명 표시) (2026-10-05, 아래 STEP 3-6 다음 항목)
    [x] 2. 커뮤니티 STEP 2-6 — 기존 assignment-frontend 커뮤니티와 기능 동등성 최종 검증 (2026-10-06, 아래 STEP 2-6 기록)
    [x] 3. 로그인/회원가입 /auth Next.js 포팅 — STEP 4-1 /login [x] · 4-2 /signup [x] · 4-3 /password-reset + 최종 동등성 검증 [x] (2026-10-06, 아래 "인증 영역 Next.js 포팅" 참고)
    [x] 4. 장터 /parts Next.js 포팅 — STEP 5-0~5-4 완료 (2026-10-06, 아래 "부품장터 Next.js 포팅" 참고)
    [x] 5. 관리자 /admin Next.js 포팅 — STEP 6-0~6-5 구현 완료 (2026-10-06, 아래 "관리자 Next.js 포팅" 참고)
    ```
    - `/auth`를 `/parts`보다 먼저 하는 이유: 장터도 로그인 상태와 사용자 권한을 쓰므로, 공통 인증 화면을 먼저 Next로 옮기는 편이 자연스럽다.
    - 각 포팅(3~5)은 커뮤니티·내 차고와 같은 방식으로 진행한다: 착수 시 legacy 기능을 파일·API 단위로 조사 → 공통 타입/API 계층(`-0`) → 화면 단위 STEP → 마지막 STEP에서 legacy와 기능 동등성 검증.
  - **진행 상황(2026-10-02)**: 메인 대문(`frontend/app/page.tsx` + `frontend/components/home/*` + `frontend/lib/*`)을 Next.js로 구현하고 실제 API 연동까지 검증 완료. 더미 데이터 없음 — 확인된 실제 API: `GET /api/board/posts`(오늘의 인기글 + 실시간 인기 TOP10, 둘 다 같은 엔드포인트를 기간/limit만 다르게 호출), `GET /api/board/garage`(오늘의 차고), `GET /api/parts/listings`(장터 새 매물), `GET /api/board/me`(세션). 레이아웃은 제공받은 레퍼런스 이미지(`references/badges/대문ver3.png`)를 따라 1440px 데스크톱 기준으로 다시 맞췄다: 넓은 container(1600px), Header(로고/검색 확대, nav 한 줄 고정), Hero(차량이 오른쪽을 차지하도록 crop, 높이 축소), 메인 그리드는 왼쪽 "오늘의 인기글"(2열 이미지 카드) + 오른쪽 "실시간 인기" TOP10, "오늘의 차고"·"장터 새 매물"은 첫 화면을 차지하지 않도록 본문 아래 별도 2열 섹션으로 이동. CTA 텍스트가 안 보이던 색상 specificity 버그, header nav 줄바꿈, container 정렬 불일치도 함께 수정.
    실행 방법: 저장소 루트에서 `docker compose up`(기존 Docker/nginx/백엔드, `localhost:8090`) + `frontend/`에서 `npm run dev`(Next.js, `localhost:3000`)를 같이 띄운다 — `next.config.ts`의 rewrite가 `/api/*`를 8090으로 넘겨준다.
    확인 상태: 1440px은 실제 브라우저 스크린샷으로 확인(Chrome 확장 연결). 1024/768은 CSS 계산과 컴파일된 미디어쿼리 값으로만 확인했고 스크린샷 미확인(이 세션의 `resize_window` 도구가 실제 뷰포트를 바꾸지 못하는 결함이 있었음 — `window.innerWidth`가 요청값과 무관하게 고정됨, 재확인 필요). "오늘의 인기글"이 `period=today`에서 빈 상태로 보이는 건 버그가 아니라 DB에 오늘(KST) 작성된 글이 없어서다(정상 동작).
    나머지 화면(`/home`, `/community`, `/parts` 등)은 아직 `assignment-frontend` 그대로이며, 다음 STEP에서 화면 단위로 이어서 옮긴다.
  - **커뮤니티 Next.js 이전**: 착수 전 `assignment-frontend`의 커뮤니티 기능(목록/상세/작성자 정보/댓글·대댓글/신고/글쓰기·수정/이미지/작성자→차고 이동 등)을 파일·API 단위로 조사하고, STEP을 `2-0`(공통 타입/API 계층) → `2-1`(목록) → `2-2`(상세) → `2-3`(좋아요·북마크·댓글·신고) → `2-4`(글쓰기·수정) → `2-5`(작성자 프로필·차고 연결, 내 활동, 알림) → `2-6`(기존 커뮤니티와 기능 동등성 검증)으로 나눴다. 조사 결과 "기간 필터"는 커뮤니티 목록 기능이 아니라 홈 전용(`period=today|week`, 이미 위에서 이전 완료)이라 커뮤니티 STEP 범위에서 뺐다. `frontend/`는 아직 어떤 docker-compose에도 서비스로 등록돼 있지 않다(로컬 `npm run dev` 전용) — 커뮤니티 코드를 옮겨도 실제 운영 라우팅 연결은 NOW-3와 별도로 판단한다.
    - **[x] STEP 2-0 (2026-10-02)**: 이후 화면이 공통으로 쓸 타입/API 계층만 추가. 신규 `frontend/lib/community-types.ts`(`CommunityPost`/`CommunityComment`/`CommunityReport`/`CommunityMember`/`MemberVehicle`/`CommunityBadge`/`LinkedVehicle`/`PublicMemberId` — 전부 board-service의 실제 응답 필드만 반영, 없는 필드 추가 안 함), `frontend/lib/community-api.ts`(`fetchPosts`/`fetchPost`/`fetchMember`/`setPostLike`/`setPostBookmark`/`fetchComments`/`createComment`/`deleteComment`/`reportPost`/`fetchMyReports` — 전부 기존 `/api/board/*` 호출, 새 API 없음, `lib/home-api.ts`와 동일한 클라이언트 전용 `credentials:'same-origin'` 패턴). 화면/라우트는 아직 없음(미사용 코드, 다음 STEP에서 소비). `npx tsc --noEmit`과 `npm run build` 통과, 홈/차고 라우트 구성 변화 없음 확인.
    - **세션 개인화 이슈(STEP 2-1 착수 시 결정 필요)**: 커뮤니티 목록/상세는 홈과 달리 `liked`/`bookmarked`/수정·삭제 버튼 노출이 요청자 세션에 따라 달라진다. 현재 `lib/server-api.ts`(서버 컴포넌트, 쿠키 미전달)로는 이걸 정확히 못 그린다. 추천안은 My Garage처럼 목록/상세를 전체 클라이언트 컴포넌트로 만드는 것(이미 검증된 패턴). SSR이 꼭 필요하면 들어온 요청의 쿠키를 그대로 board-service에 전달하는 새 서버 fetch 패턴을 추가해야 하는데, 이번 STEP에서는 어느 쪽도 아직 정하지 않았다.
    - **[x] STEP 2-1 (2026-10-05 기록)**: 구현 `8ac87b2`, 사이드바 버튼·제목 크기 수정 `6168b57`, 레이아웃 폭(1800px)·열 간격 후속 수정은 이 기록과 같은 commit. 세션 개인화 이슈는 클라이언트 컴포넌트 방식으로 결정(`components/community/community-list.tsx` 전체 `'use client'`). 아래 범위 그대로 구현: `/community` 라우트, 카테고리·정렬·검색·차종·활동 범위(`scope`, 비로그인 시 호출 없이 안내) 필터를 URL과 동기화, "더 보기" 페이지네이션, 인기글 사이드바(`components/home/popular-list.tsx` 재사용), 미니 내 차고 카드(`my-garage-mini.tsx`), 최근 본 글(`lib/recent-posts.ts`, 기존 키 `revcc:recent-posts:v1` 공유, 읽기만), 공용 푸터 `components/footer/site-footer.tsx`.
    - **[x] STEP 2-2 (2026-10-05)**: 게시글 상세 화면. 리팩터 `8223d90`(목록의 헤더·세션 로직을 `community-header.tsx`·`use-community-session.ts`로 분리, 목록 동작 변화 없음), 구현 `2871513`. 라우트 `app/community/[category]/[id]/page.tsx`(카테고리·id 형식이 틀리면 Next 404, nginx의 기존 상세 정규식과 같은 패턴), 본체는 클라이언트 컴포넌트 `components/community/post-detail.tsx`. 기존 `app.js`의 `showPostDetailPage`/`renderPostDetail`과 `post-context.js`를 포팅했고 새 API는 없다(`lib/community-api.ts`에 기존 `POST /posts/:id/view` 래퍼 `recordPostView`만 추가). 구성: 글+댓글 병렬 조회 → 페이지 로드당 1회 조회수 증가 → URL category가 실제와 다르면 `history.replaceState`로 canonical 교정 → 최근 본 글 기록(`rememberRecentPost`, 404면 `forgetRecentPost`). 왼쪽 `author-card.tsx`(작성자 카드, 탈퇴 작성자는 이름만), 본문 `post-article.tsx`(제목·메타·본문·사진·액션·작성자의 인장), `comment-section.tsx`(댓글 수, 작성 폼, 답글 대상 UI, 1단계 답글), 오른쪽 `post-context.tsx`(관련 차종·차종 인기글·같은 카테고리 최신글, 현재 글 제외 5개), 공용 `member-link.tsx`·`badge-list.tsx`, 스타일 `post-detail.module.css`(대략적인 레이아웃만, 세부 CSS는 사용자가 직접 조정 예정). 버튼 노출 규칙은 기존과 같다: 수정=작성자, 삭제=작성자 또는 ADMIN, 신고=작성자가 아닌 사람, 댓글 삭제=댓글 작성자 또는 ADMIN, 답글=삭제되지 않은 최상위 댓글. **변경(mutation)은 아직 연결하지 않았다**: 비로그인은 기존과 같은 로그인 안내, 로그인 상태는 "준비 중" 안내만 한다(추천·북마크·댓글·답글·신고·삭제 = STEP 2-3, 수정 = STEP 2-4). 링크 복사는 동작한다. 검증(Playwright, live 스택 = Neon, 글 119/116/18): 실제 데이터 표시, 없는 글 404 화면과 최근 본 글 정리, 잘못된 경로 404, canonical 교정, 로딩·에러·다시 시도, 비로그인/작성자/타인/관리자별 버튼·추천/북마크 상태·댓글 삭제 버튼 수, 탈퇴 작성자, `/community` → 상세 → 뒤로가기(필터 유지) → "목록으로" 링크, 콘솔 에러 없음(작업 중 발견한 hydration 경고 수정 포함) 70/70 통과. 로그인 상태는 Neon에 계정을 만들지 않으려고 `/api/board/me` 응답을 가로챈 fixture로 확인했고, 조회수는 실제 1회만 올렸다. `npx tsc --noEmit`, `next build` 통과.
      - 기존 상세 대비 남은 차이(다음 STEP으로): ~~mutation과 관리자 삭제 사유 입력 창(2-3)~~ → STEP 2-3에서 완료, ~~수정 에디터(2-4)~~ → STEP 2-4에서 완료, ~~작성자 이름·보유 차량 링크 임시 주소, 헤더의 "내 활동"·알림 목록 버튼, `/community#post-{id}` 옛 링크 호환~~ → STEP 2-5에서 완료. 운영 nginx는 여전히 `/community/*`를 `assignment-frontend`로 보낸다(Next 배포 연결은 NOW-3에서 판단).
    - **[x] STEP 2-3 (2026-10-05)**: 상세 화면 인터랙션을 기존 board-service API에 연결. 구현 `8e3c1e5`. 새 API·백엔드 변경 없음(`lib/community-api.ts`에 기존 `DELETE /posts/:id` 래퍼 `deletePost`만 추가). 동작은 기존 `app.js`의 `renderPostDetail`/`requestContentDeletion`/`openReport`와 같다.
      - 추천·북마크: `PUT {active: 현재의 반대}`(서버가 멱등). 종류별로 한 번에 요청 하나만 보내고 버튼을 잠근다(ref로 막아 연속 클릭에도 요청 1회). 서버 응답의 `active`로만 화면을 바꾸고, 이어서 글을 다시 읽어 카운트를 맞춘다. 재조회는 마지막 것만 반영(ticket).
      - 댓글·답글: `POST /posts/:id/comments`(`parentId`). 저장 중에는 등록 버튼을 잠그고 입력창을 읽기 전용으로 둔다(검증 중 발견: 저장 중 새로 입력한 내용이 앞 요청 완료 시 지워지던 문제). 성공하면 댓글 목록과 글을 다시 읽고 입력창·답글 대상을 비운다. 실패하면 입력 내용을 유지한다.
      - 삭제: 본인 글·댓글은 확인 창만 띄우고 사유 없이 삭제. 남의 글·댓글은 관리자에게만 버튼이 보이고 "관리자 콘텐츠 삭제" 사유 입력 창(필수, 500자)을 띄운다(기존 기능 복원, 사유는 `moderation_logs`에 기록). 글 삭제 후에는 그 카테고리 목록으로 이동하고, 댓글 삭제 후에는 목록을 다시 읽는다.
      - 신고: "게시글 신고" 사유 입력 창. 처리 대기 중 재신고는 서버가 사유를 갱신하고, 이미 처리된 신고는 409 메시지를 보여준다.
      - 공통 `components/community/community-dialog.tsx`(native `<dialog>`, 확인형·사유형). 요청 중에는 닫기·재제출이 막히고, 실패하면 창을 연 채 서버 메시지를 보여준다. 실패 시 이전 상태를 그대로 두고 상단 알림에 서버 메시지를 표시하며, 401이면 "로그인이 만료되었어요" 안내.
      - 비로그인 사용자는 기존과 같이 요청 없이 "로그인 후 이용할 수 있어요" 안내. 수정 버튼은 STEP 2-4까지 "준비 중" 안내만 한다.
      - 댓글 신고는 포팅 범위에서 제외(신규 기능, 2026-10-05 사용자 결정) — "보류" 목록의 향후 개선사항 참고.
      - 검증: Neon을 건드리지 않으려고 임시 스택(postgres:16 빈 DB + Flyway, redis, 현재 이미지의 core·board·proxy, 컨테이너 안 소스 복사본으로 띄운 별도 Next dev)에서 임시 계정 3개(작성자, 일반 회원, DB에서 ADMIN 지정)로 Playwright 73/73 통과(같은 스크립트 2회 실행). 확인 항목: 비로그인 추천·북마크·댓글·답글·신고(요청 0건), 추천·북마크 ON/OFF와 새로고침 후 유지, 저장한 글 scope 반영, 더블클릭 시 PUT·POST 1회, API 500 시 상태 유지·오류 표시·버튼 복구, 세션 만료(401) 시 상태 유지, 댓글·답글 작성과 카운트·목록 반영, 답글 알림, 본인 댓글 삭제(확인·취소), 게시글 신고(빈 사유 차단, 실패 시 창 유지, 성공 후 내 신고 목록), 본인 글 삭제 후 목록 이동과 404, 관리자 댓글·글 삭제(사유 필수, Esc 취소), 일반 회원의 타인 글·댓글 삭제 API 403, STEP 2-2 회귀(canonical, 목록→상세→뒤로가기, "목록으로" 링크, 잘못된 경로 404, 콘솔 에러 없음). DB에서 `moderation_logs` 사유, `deleted_reason`(AUTHOR/ADMIN), `community_reports`도 확인했다. 임시 스택과 계정 정보는 검증 후 삭제했다. `npx tsc --noEmit`, `next build` 통과. 프론트 단위 테스트는 없고, 백엔드는 바뀌지 않아 board/core 테스트는 돌리지 않았다(경량화 원칙, CI가 전체 실행).
    - **[x] STEP 2-4 (2026-10-05)**: 글쓰기·수정. 리팩터 `c1512eb`(목록의 왼쪽 메뉴·오른쪽 사이드바·카테고리 상수를 `community-left-nav.tsx`·`community-sidebar.tsx`·`categories.ts`로 분리, 목록의 글쓰기 링크에 현재 게시판 전달, 옛 `/community?category=…#write-post` 링크를 새 경로로 이동), 구현 `78cbe1f`. 라우트 `/community/new`(`?category=` 미리 선택)와 `/community/{category}/{id}/edit`가 같은 클라이언트 컴포넌트 `components/community/post-editor.tsx`를 쓴다(수정 여부는 `postId` 유무로만 구분). 기존 `post-editor.js`를 포팅했고 API 계약 변경은 없다(`lib/community-api.ts`에 기존 `POST/PUT /api/board/posts`, `GET /api/board/garage/mine`, `POST /api/board/images` 래퍼만 추가).
      - 필드와 제한은 기존과 같다: 게시판, 제목 150자, 내 차량 연결(선택, 목록을 불러오기 전에는 등록 버튼 잠금, 실패 시 "다시 확인"), 본문 5000자, 사진 JPG/PNG/WebP 장당 3MB·최대 3장(업로드 상태, 미리보기 제거, 수정 시 기존 사진 표시). `vehicleId`는 항상 보낸다(null이면 연결 해제). 텍스트로만 저장된 옛 차종은 차량 연결을 바꾸지 않으면 그대로 둔다.
      - 권한: 비로그인은 "글을 작성하려면 로그인이 필요합니다" + 돌아올 경로를 붙인 로그인 링크. 수정은 USER·ADMIN 모두 작성자 본인만 가능(서버 PUT 조건과 같음). 남의 글 수정 주소로 들어오면 폼 없이 "본인이 작성한 글만 수정할 수 있어요" + 글로 돌아가기 링크를 보여준다(기존은 글로 바로 이동, 안내가 보이도록 바꿈). 수정 주소의 category가 실제와 다르면 canonical로 교정한다. 상세의 수정 버튼과 옛 `/community/{category}/{id}#write-post` 링크는 `/edit`로 이동한다.
      - 상태 처리: 제출 중에는 폼 전체를 잠그고 ref로 중복 제출을 막는다. 공백만 있는 제목·본문은 안내하고 요청을 보내지 않는다. 실패하면 서버 메시지를 보여주고 입력을 유지한다(401은 로그인 만료 안내). 성공하면 저장된 글의 canonical 주소로 이동한다. 변경 사항이 있거나 처리 중이면 취소·페이지 안 링크·헤더 검색·왼쪽 메뉴 이동 시 확인 창을 띄우고, 새로고침·탭 닫기에는 브라우저 기본 경고를 띄운다. 로그인 계정이 바뀌면 에디터를 다시 불러온다.
      - 검증: Neon을 건드리지 않는 compose 프로젝트 `revcc-s24`(postgres:16 tmpfs + Flyway, redis, 현재 이미지의 core·board·proxy, 소스 복사본으로 띄운 Next dev)에서 임시 계정 3개(작성자 차량 1대, 일반 회원 차량 없음, ADMIN)로 Playwright 실행. 에디터 67/67: 비로그인 접근(작성·수정), 게시판 미리 선택, 차량 목록, 필수값(빈 제목은 요청 없음, 공백 제목 안내), 글자 수, 사진 업로드·제거·최대 3장·형식 오류, API 실패 시 입력 유지, 더블클릭+Enter 시 POST 1회, 작성 후 상세 이동과 저장값, 상세에서 수정 진입, 초기값(제목·본문·게시판·차량·사진), 새로고침 시 저장값 복원, 변경 후 취소·헤더 링크 확인 창, 수정 저장 후 바뀐 게시판 주소로 이동·반영(차량 해제·사진 제거 포함), 변경 없는 취소, canonical 교정, 옛 `#write-post` 링크 2종, 일반 회원·관리자의 타인 글 수정 차단(화면·API 403·수정 버튼 없음, 관리자 삭제 버튼은 유지), 옛 텍스트 차종 보존, 차량 없는 회원 안내, 없는 글·잘못된 주소, 목록(필터·글쓰기 링크·사이드바)·상세(추천·북마크·댓글·신고·뒤로가기·본인 삭제) 회귀. STEP 2-3 검증 스크립트 전체도 같은 스택에서 73/73(수정 버튼 기대값만 에디터 이동으로 바꿈). `npx tsc --noEmit`, `next build` 통과. 정리는 `docker compose -p revcc-s24 down`과 이 스택의 Redis 익명 볼륨 1개만 지정 삭제했다(전역 prune 사용 안 함).
      - 세부 CSS로 남긴 것: 오른쪽 사이드바 카드 사이 간격이 넓다(`app/globals.css`의 전역 `section` margin 영향으로 보임). 모바일 폭에서 공용 헤더가 가로로 넘친다(기존 헤더).
    - **[x] STEP 2-5 (2026-10-05)**: 작성자 프로필·차고 연결, 내 활동, 알림. 구현 `d0490f8`. API 계약 변경 없음(`lib/community-api.ts`에 기존 알림·방명록·공개 차고 API 래퍼만 추가).
      - 회원 차고 `/community/members/{id}`(`member-profile.tsx`, 기존 `#member-{id}` 모달 = `app.js openMember`): "{이름} 님의 차고" 차량 카드(`GET /api/board/garage?owner=`, 사진·연식·트림·기록 수, 카드 → 차량 화면), 방명록(`guestbook.tsx` = `guestbook-ui.js`, 20개씩 "더 보기", 로그인 시 작성, 삭제는 작성자·방명록 주인만), 최근 작성한 이야기(`PostRow` 재사용). 탈퇴·없는 회원은 서버 404 메시지를 보여준다.
      - 공개 차량 `/community/cars/{id}`(`vehicle-public.tsx`, 기존 `#car-{id}` 모달 = `vehicle-ui.js openCar`): 소유자 링크, 연식·트림, 사진, 소개, 정비·튜닝·부품 기록(주행거리·비용).
      - **내 차고 본체는 포팅하지 않았다**: 기존 모달의 차량 등록·수정·삭제, 기록 추가·삭제(`vehicleForm`/`recordForm`)는 개인 차고(`/home`) 기능이라 이번 범위에서 뺐다. 본인 차고·차량에서는 대신 "내 차고에서 … 관리 →"(`/home`) 링크를 보여준다.
      - 공용 헤더(`community-header.tsx`): 로그인 시 "내 활동" 패널(내가 쓴 글·댓글 남긴 글·저장한 글 → `/community?scope=…`, 내 차고, 내 신고 내역 = `GET /api/board/reports`, 상태 접수됨/처리 완료/반려)과 알림 패널(목록을 보여준 뒤 `PUT /notifications/read`로 모두 읽음, 배지 0으로). 비로그인 시 두 버튼은 기존처럼 숨긴다. 공용 모달 `community-panel.tsx`, 단일 칼럼 페이지 틀 `community-page.tsx`(+`useNotice`).
      - 링크 연결: 작성자 이름(`member-link.tsx`)·목록 작성자(`post-row.tsx`)·작성자 카드 보유 차량·홈 "오늘의 차고"가 새 화면으로 이동한다(`lib/format.ts`의 `memberUrl`/`carUrl`). 옛 `/community#member-{id}`·`#car-{id}`·`#post-{id}` 링크는 목록 화면이 새 주소로 넘긴다(같은 페이지 안 hash 변경도 처리, 없는 글은 서버 메시지 표시) — STEP 2-2 기록의 `#post-{id}` 호환 항목도 이걸로 처리됐다.
      - 검증: compose 프로젝트 `revcc-s25`(postgres·redis 모두 tmpfs, 볼륨 없음)에서 임시 계정 3개. STEP 2-5 Playwright 54/54(회원 차고 카드·최근 글·방명록 21개와 더 보기, 차량 화면 사진·기록·빈 상태, 본인만 보이는 관리 링크, 없는 회원·차량, 잘못된 주소 404, 방명록 작성·더블클릭 1회·실패 시 입력 유지·본인 글만 삭제·주인은 모두 삭제·타인 삭제 API 403, 상세·작성자 카드·목록에서 새 화면 이동, 비로그인 헤더, 알림 배지·목록·읽음 처리(서버 확인)·Esc 닫기, 내 활동 링크·내 신고 내역·활동 범위 이동, 옛 hash 링크 4종). 검증 중 같은 페이지 안 hash 변경이 처리되지 않던 문제를 찾아 `hashchange` 처리로 고쳤고, 깨끗한 DB로 다시 띄워 재검증했다. 회귀: STEP 2-3 스크립트 73/73, STEP 2-4 스크립트 67/67(목록·상세·추천·북마크·댓글·삭제·신고·글쓰기·수정 포함). `npx tsc --noEmit`, `next build` 통과. 정리는 `docker compose -p revcc-s25 down`만 했고 볼륨 변화는 없었다.
    - **[x] STEP 2-6 (2026-10-06) — 기능 동등성 최종 검증, 신규 기능 없음**: legacy `community/index.html`이 쓰는 스크립트(`app.js`의 커뮤니티 경로, `community-list.js`, `post-context.js`, `post-editor.js`, `member-card.js`, `my-garage-card.js`, `vehicle-ui.js`, `guestbook-ui.js`)의 API 호출·핸들러·안내 문구를 Next `/community`와 항목별로 대조했다. `app.js`에만 있는 `/categories/summary`·`/stats/summary`·주간 인기글·`/parts/compatibility`·`/api/vehicles`는 홈(`index.html`)·부품 화면 전용이라 커뮤니티 범위가 아니다.
      - **발견·수정 1건**: legacy는 창 포커스·bfcache 복귀(`pageshow`) 때 세션을 다시 확인한다(`app.js` focus/pageshow 핸들러). Next `use-community-session.ts`는 첫 진입 때 한 번만 확인해서, 다른 탭에서 로그인·로그아웃해도 헤더·목록·상세·에디터가 바뀌지 않았다(STEP 2-4의 "계정이 바뀌면 에디터 초기화"도 사실상 동작하지 않음). 같은 훅에 `focus`/`pageshow(persisted)` 재확인을 추가했다. 같은 사용자면 세션 객체를 그대로 유지해 재조회가 생기지 않게 했고, 재확인이 실패하면 현재 상태를 유지한다(첫 확인 실패만 비로그인 처리, 기존과 같음). 알림 수 조회 실패가 세션을 지우던 부분도 legacy처럼 무시하도록 분리했다.
      - **남긴 차이(의도된 UX로 판단, 수정 안 함)**: 왼쪽 게시판 탭을 누르면 Next는 활동 범위(`scope`)를 해제한다(legacy는 유지). 반대로 활동 범위를 누르면 Next는 게시판 선택을 유지한다(legacy는 해제). 두 화면 모두 범위+게시판 조합 자체는 가능하다. 로그아웃 시 "로그아웃되었습니다." 안내 문구가 없다. 인기글이 비었을 때 문구가 다르다(홈과 공용 컴포넌트). legacy의 포커스 시 같은 사용자 scope 목록 재조회는 넣지 않았다.
      - 검증: Neon을 건드리지 않는 임시 스택(postgres 16 tmpfs + Flyway V1~V5, redis, 현재 이미지의 core·board·proxy, 소스 복사본 Next dev, 시드 글 24개, 임시 계정 작성자·회원·ADMIN)에서 Playwright로 실제 화면을 눌러 커뮤니티 회귀 57항목 확인(56 통과, 나머지 1건 "최근 본 글"은 같은 글이 인기글·최근 본 글 양쪽에 있어 링크 1개를 기대한 스크립트 오류였고 상태 덤프로 정상 확인): 목록(20개+더 보기, 카테고리·정렬·검색·초기화와 URL 동기화, 검색 요약, 빈 결과 문구, 비로그인 scope 안내, 인기글·최근 본 글), 글쓰기(게시판 미리 선택, 차량 연결, 사진)·수정(수정됨, 잘못된 category 교정)·삭제(카테고리 목록 이동, 404 문구, 최근 본 글 정리), 상세 권한별 버튼, 추천·북마크(새로고침 후 유지), 조회수, 댓글·답글(답글엔 답글 없음), 신고와 내 신고 내역, scope(저장한 글·댓글 남긴 글·전체 글 보기), 알림 배지·목록·읽음, 작성자→회원 차고→공개 차량 이동, 관리자 사유 입력 삭제, 포커스 재확인(같은 사용자 재조회 0회, 다른 탭 로그아웃/로그인 반영, 에디터 로그인 안내). 같은 훅을 쓰는 `/home` 스크립트 60/60 재통과, `tsc --noEmit`·`next build` 통과. 콘솔 오류는 비로그인 `/me` 401, 삭제 글 404 같은 예상 응답뿐이다.
      - 미검증: 실제 Chrome 확장 클릭(Playwright Chromium으로 대체), 1440px 외 화면 폭, 실제 bfcache 복귀(`pageshow` 경로는 코드로만 확인, 포커스 경로는 실제로 확인), 카카오 로그인 계정.
    - **`/home` 최종 UI 검증 (2026-10-05)**: STEP 3-6에서 남긴 항목을 위와 같은 임시 스택에서 Playwright로 확인(60항목). 차량 사진 업로드·교체·제거의 미리보기와 저장 결과, 기록 삭제 확인창이 차량 다이얼로그 위에 겹쳐 뜨는 경우, 인증 계정의 "인증 오너" 인장(설명 포함), 3-1~3-5 핵심 흐름(등록 2단계, 인증 신청·승인·반려 후 재신청, 대표 차량, 수정, 기록, 프로필, 방명록, 탈퇴). 발견·수정 1건: 기록 삭제 확인창에서 Esc를 누르면 React가 cancel 이벤트를 바깥 다이얼로그 `onCancel`까지 전달해 차량 다이얼로그까지 닫혔다 → `vehicle-manage-dialog.tsx`가 자기 자신의 cancel만 처리하도록 수정.
    - **내 차고(`/home`) Next.js 포팅 — STEP 3-0~3-6 전부 완료(2026-10-05)**: 차량 등록·수정·삭제, 정비·튜닝·부품 기록 관리, 차량 인증(신청+재신청), 프로필 설정, 방명록, 회원 탈퇴까지 코드/API 레벨로는 legacy `assignment-frontend/home`과 동등하다(STEP 3-6에서 항목별 대조 완료). 커뮤니티 STEP 2-x 범위가 아니다. 남은 것은 Chrome UI 클릭 검증(세션 내내 확장 연결 불가로 미완료, 다음 세션 최우선)과, legacy `/home` 제거·nginx 라우팅 전환 여부 판단(NOW-3 실제 배포에서 다룸 — 그 전까지 legacy `/home`이 계속 서비스되므로 지금 급하지 않음)뿐이다.
      - **조사 결과(2026-10-05)**: `/home`은 두 개의 별도 API를 함께 쓴다 — Spring core `/api/garage/vehicles`(`GarageVehicleController`, 같은 `owner_vehicles` 테이블의 manufacturer/licensePlate/verification 컬럼, 등록·수정·삭제·오너 인증 신청)와 board-service `/api/board/garage`(`community.js`, 같은 테이블의 model/trim/bio/imageId/records 컬럼, 공개 프로필·기록). 두 서비스가 같은 테이블에 직접 쓰는 구조(JPA `@Table(name="owner_vehicles")`)이고 id가 같다 — 새 동기화 코드 불필요, 기존 계약 그대로 각각 호출. 저장소의 오래된 "My Garage" 프로토타입(`frontend/app/(owners)/*`, `components/garage/*`, `lib/garage-api.ts`)은 core API만 다루고 licensePlate·인증·board 필드·방명록·알림·탈퇴가 전혀 없어(현재 core API가 필수로 요구하는 licensePlate조차 폼에 없음) 그대로 재사용할 수 없고 세션/레이아웃 패턴만 참고했다. STEP 2-x에서 만든 `use-community-session.ts`/`community-header.tsx`+`header-panels.tsx`/`guestbook.tsx`/`badge-list.tsx`/`member-link.tsx`/`community-dialog.tsx`/`lib/format.ts`는 그대로 재사용한다(단 `community-page.tsx`는 "커뮤니티 목록으로" 백링크+단일 칼럼 전제라 `/home`의 대시보드형 그리드에는 안 맞아 재사용하지 않고 전용 페이지 틀을 새로 만든다). home.js의 "내 커뮤니티 활동"(쓴 글/댓글 단 글/최근 활동 탭+더보기)은 STEP 2-1/2-5에서 이미 구현된 헤더의 "내 활동" 패널(`/community?scope=mine|commented|bookmarks`)과 완전히 동일 기능이라 재구현하지 않고 링크로 대체하기로 결정(2026-10-05, 중복 구현 생략).
      - `[x]` **STEP 3-0 (2026-10-05)**: 공통 타입/API 계층만 추가, 화면·라우트 없음(미사용 코드, STEP 3-1부터 소비). `frontend/lib/community-types.ts`에 `OwnerVehicle`/`OwnerVehicleInput`(core `/api/garage/vehicles`, `GarageVehicleResponse`/`Request` 그대로), `VehicleProfileInput`/`VehicleRecordInput`/`VehicleRecordKind`(board `/api/board/garage` 그대로), `MemberProfileInput`(`PUT /api/board/profile`), `WithdrawInfo`/`WithdrawInput`(core `/api/auth/withdraw`, `WithdrawalService.info()` 반환값 그대로) 추가. `frontend/lib/community-api.ts`에 `fetchMyGarageVehicles`/`createOwnerVehicle`/`updateOwnerVehicle`/`deleteOwnerVehicle`/`submitVehicleVerification`(core 5종), `createVehicleProfile`/`updateVehicleProfile`/`deleteVehicleProfile`/`createVehicleRecord`/`deleteVehicleRecord`(board 5종), `updateMemberProfile`/`setRepresentativeVehicle`, `fetchWithdrawInfo`/`withdrawAccount` 추가 — 전부 기존 엔드포인트 그대로, 새 API 없음. 검증: `npx tsc --noEmit`, `next build` 통과(라우트 변화 없음, 기존 6개 라우트 그대로).
      - `[x]` **STEP 3-1 (2026-10-05)**: `/home` 라우트, `frontend/components/my-garage/my-garage.tsx`(+전용 `my-garage.module.css`). `CommunityHeader`/`SiteFooter`/`useCommunitySession`/`useNotice`(`community-page.tsx`에서 import)를 그대로 재사용하고, `community-page.tsx` 자체(단일 칼럼+백링크 전제)는 재사용하지 않고 대시보드 2열 그리드 전용 셸을 새로 작성했다. 비로그인 안내("내 차고를 이용하려면 로그인이 필요합니다" + 로그인 링크), 대표 차량 카드(사진 또는 placeholder, 제조사/모델/연식·트림, 인증 상태 chip verified/PENDING/REJECTED/전, 소개, STEP 2-5 공개 차량 페이지로 연결되는 "차량 상세 보기" 링크 — `carUrl` 재사용), 보유 차량 목록(각 행도 공개 차량 페이지로 연결), "대표 차량 설정"(`setRepresentativeVehicle` 호출 후 재조회, 대표 차량은 버튼 비활성화) 구현. 차량 없음 상태는 두 패널 모두 안내 텍스트만(등록은 STEP 3-2라 버튼 없음) — 수정·인증신청·기록관리 등 이후 STEP 기능은 넣지 않았다(스텁 버튼 없음). 데이터는 `fetchMyGarageVehicles`(core, STEP 3-0에서 추가)와 `fetchMember`(board, 기존)를 함께 조회해 대표 차량은 core 데이터로, 사진은 board의 `member.vehicles[].imageId`로 표시한다.
        검증: Neon을 건드리지 않으려고 로컬 전용 compose 프로젝트 `revcc-s31`(컨테이너명·네트워크를 메인 `revcc-site` 스택과 분리해 기존 로컬 개발 스택은 전혀 건드리지 않음, postgres 16 빈 DB에 `V1__baseline.sql`을 수동 적용 후 Flyway가 V2~V5 적용 — 이 레포의 Flyway가 `baseline-on-migrate`로 V1 SQL 자체를 건너뛰어 완전히 빈 DB에서는 스스로 부트스트랩이 안 되는 기존 이슈를 검증 과정에서 발견, 코드는 건드리지 않고 검증 환경에서만 수동으로 우회함 — 별도 보고 가치가 있으면 추후 P1-3에 참고)와 소스 복사본(`node_modules` 포함, 메인 `next dev` 프로세스와 분리)으로 띄운 Next dev에서 임시 계정 2개(차량 0대, 차량 2대)로 Chrome 확장을 통해 직접 확인: 로그인 필요 상태, 차량 없음 상태(양쪽 패널), 대표 차량 카드와 보유 차량 목록(사진 없음 placeholder 포함), "대표 차량 설정" 클릭 → 즉시 대표 차량 카드·버튼 비활성화 상태 반영, "차량 상세 보기" → `/community/cars/:id`(STEP 2-5) 정상 연결. 전체 커뮤니티 회귀는 범위 밖이라 실행하지 않음. `npx tsc --noEmit`, `next build` 통과(`/home`이 정적 라우트로 추가됨). 테스트 스택·볼륨·소스 복사본은 작업 후 전부 삭제했다.
        세부 CSS로 남긴 것: 반응형(모바일 1열) 외 세부 디자인은 최소화된 상태.
      - `[x]` **STEP 3-2 (2026-10-05)**: 차량 등록 2단계만 구현(사용자 지시로 범위를 명시적으로 좁힘 — 원래 계획에 있던 "오너 인증 재신청(반려 시)"은 이번 STEP에서 빠졌고 아직 미구현). `frontend/components/my-garage/vehicle-registration-dialog.tsx`(신규, native `<dialog>`, `community-dialog.tsx`의 confirm/reason 스펙에 안 맞는 2단계 커스텀 폼이라 별도 컴포넌트로 작성) + `my-garage.module.css`에 다이얼로그 스타일 추가(`post-detail.module.css`의 `.dialog` 패턴을 기존 컨벤션대로 이 모듈에 최소 복제). "보유 차량" 패널 헤더에 "차량 등록" 버튼(`my-garage.tsx`) 하나만 진입점으로 둠 — legacy `home.js`처럼 대표 차량 빈 상태에 별도 버튼을 중복으로 두지 않음.
        1단계(`createOwnerVehicle`, STEP 3-0 API): 제조사·모델명·연식·차량번호 입력 → 성공 시 즉시 `onVehicleCreated` 콜백으로 부모의 `reloadKey`를 올려 목록을 다시 불러온다(다이얼로그가 2단계에 머물러 있어도 뒤의 "보유 차량"/"대표 차량" 패널이 바로 갱신됨 — 사용자가 2단계를 완료하지 않고 이탈해도 차량은 이미 반영됨). 2단계: 등록증 이미지 업로드 후 "인증 요청 제출"(`submitVehicleVerification`) 또는 "나중에 하기"(건너뛰기, 안내 문구만 표시). 제출 성공 시 한 번 더 `onVehicleCreated`로 재조회해 인증 상태 chip을 갱신한다.
        검증: STEP 3-1과 같은 방식(Neon 미접촉, 로컬 전용 compose 프로젝트 `revcc-s31` + 소스 복사본 Next dev, 이번에도 작업 후 전부 삭제)으로 임시 계정 1개를 만들어 Chrome으로 직접 확인: 1단계 제출 즉시 두 패널에 차량 반영(다이얼로그가 열려 있는 상태에서도), "나중에 하기" → 다이얼로그 닫힘 + 안내문구 + "인증 전" chip 유지, 두 번째 차량으로 실제 JPEG 파일(`file_upload` 도구로 업로드) 첨부 후 "인증 요청 제출" → 안내문구 + 대표 차량으로 전환해 확인하니 "인증 검토 중"(PENDING) chip으로 정상 반영. 전체 커뮤니티 회귀는 범위 밖이라 실행하지 않음. `npx tsc --noEmit`, `next build` 통과(라우트 변화 없음, `/home`은 이미 3-1에서 추가됨). Flyway 빈 DB 부트스트랩 문제(STEP 3-1에서 발견)는 이번 STEP에서도 수정하지 않고 검증 환경에서만 동일하게 수동 우회했다.
        남은 범위(다음 STEP으로): 차량 수정·삭제, 정비·튜닝·부품 기록 관리(STEP 3-3), 인증 반려 후 재신청 버튼(아직 미정 — 3-3 또는 별도 STEP에서 판단).
      - `[x]` **STEP 3-3 (2026-10-05)**: 차량 수정·삭제 + 정비·튜닝·부품 기록 추가·삭제. `frontend/components/my-garage/vehicle-manage-dialog.tsx`(신규) — 대표 차량 카드와 보유 차량 목록 각 행에 "수정" 버튼(`my-garage.tsx`)을 추가해 같은 다이얼로그로 연결. 새 공개 페이지나 새 백엔드 API 없이 STEP 3-0 API만 사용: `fetchPublicVehicle`로 초기 로드(모델/연식/트림/소개/사진/기록, legacy `editVehicle`/`openCar`와 동일한 소스), `updateVehicleProfile`(모델/연식/트림/소개/사진 — core 전용 필드인 제조사·차량번호·인증은 legacy `vehicleForm()`과 동일하게 이 폼에서 다루지 않음), `deleteVehicleProfile`(board 엔드포인트 하나로 충분 — core/board가 같은 `owner_vehicles` 행을 공유해 core `/api/garage/vehicles` 목록에서도 함께 사라짐, API 레벨 검증으로 확인), `createVehicleRecord`/`deleteVehicleRecord`. 차량 삭제·기록 삭제 확인은 새 모달을 만들지 않고 기존 `community-dialog.tsx`(`CommunityDialog`, kind:'confirm')를 그대로 재사용(중첩 `<dialog>`). 사진 교체는 기존 `uploadImage`(STEP 2-x) 재사용. 모든 변경 후 부모의 `onChanged`(`reloadKey` 증가)로 `/home`의 대표/보유 차량 패널을 즉시 재조회한다(차량 삭제 시 다이얼로그도 함께 닫힘, 기록 변경 시 다이얼로그는 열어둔 채 내부 목록만 재조회).
        검증: 이번엔 세션 중 Chrome 확장이 연결되지 않아 UI 클릭 검증은 못 했고, STEP 3-1/3-2와 같은 격리 로컬 스택(Neon 미접촉, 작업 후 전부 삭제)에서 다이얼로그가 호출하는 것과 동일한 API를 직접 호출해 확인했다: `PUT /api/board/garage/:id`(모델·연식·트림·소개 변경 → `GET`으로 반영 확인), `POST .../records` + `GET`으로 기록 반영 확인 + `DELETE .../records/:id` + `GET`으로 제거 확인, `DELETE /api/board/garage/:id` 후 core `GET /api/garage/vehicles`와 board `GET /api/board/members/:id`에서 모두 사라짐을 확인(같은 행이라는 가정을 API 레벨에서 직접 재확인). 전체 커뮤니티 회귀는 범위 밖이라 실행하지 않음. `npx tsc --noEmit`, `next build` 통과(라우트 변화 없음). **다음 세션에서 UI 클릭 검증(Chrome 확장)을 한 번 더 하는 게 좋다** — 특히 사진 교체 미리보기와 중첩 다이얼로그(기록 삭제 확인 중 차량 다이얼로그가 같이 안 닫히는지)는 코드 리뷰로만 확인했다.
      - `[x]` **STEP 3-4 (2026-10-05)**: 프로필 수정(한 줄 소개·아바타·커버) + 내 인장 표시. `frontend/components/my-garage/profile-edit-dialog.tsx`(신규) + `my-garage.tsx`에 "내 프로필" 패널(커버 배너·아바타·한 줄 소개·인장 목록, 그리드 위 전체 폭) 추가, 헤더에 "프로필 편집" 버튼. 새 API 없이 STEP 3-0의 `updateMemberProfile`(`PUT /api/board/profile`)만 사용, 이미지 업로드는 기존 `uploadImage`(STEP 2-x) 재사용. 이미지 교체/제거 우선순위는 legacy `editProfile()`과 동일: 새로 고른 파일 > "기존 이미지 제거" 체크 > 기존 이미지 유지. 내 인장은 새로 만들지 않고 STEP 2-5의 `components/community/badge-list.tsx`(`BadgeList`)를 그대로 재사용해 `member.badges`를 표시(STEP 3-1부터 이미 `fetchMember`로 받아오던 값, 추가 조회 없음). 커뮤니티 활동(내가 쓴 글 등) UI는 이미 헤더 "내 활동" 패널이 대체하므로 중복 구현하지 않음(STEP 2-1/2-5 결정 유지).
        검증: 이번 세션도 Chrome 확장이 계속 연결되지 않아(세션 내내 재연결 안 됨, 재시도에 추가 시간 쓰지 않음) UI 클릭 검증은 못 했다. STEP 3-1~3-3과 같은 격리 로컬 스택(Neon 미접촉, 작업 후 전부 삭제)에서 다이얼로그가 호출하는 것과 동일한 API를 직접 호출해 확인: 이미지 업로드(`POST /api/board/images`) → `PUT /api/board/profile`(bio+avatarImageId+coverImageId 설정) → `GET /api/board/members/:id`로 bio/avatarImageId/coverImageId/avatarUrl 반영 확인, 이어서 avatarImageId/coverImageId를 `null`로 보내는 제거 경로도 반영 확인. badges는 인증된 차량이 없는 계정이라 빈 배열 응답만 확인했고(`BadgeList`의 "표시할 인장이 없어요" 분기는 STEP 2-2에서 이미 검증된 코드라 재검증하지 않음), 실제 인증 완료 계정에서의 인장 노출은 미검증. 전체 커뮤니티 회귀는 범위 밖이라 실행하지 않음. `npx tsc --noEmit`, `next build` 통과(라우트 변화 없음).
        (2026-10-05 결정: STEP 3-3·3-4의 Chrome UI 클릭 검증은 더 미루지 않고 STEP 3-6에서 3-1~3-5 전체를 한 번에 묶어 진행하기로 함 — 아래 STEP 3-6 참고.)
      - `[x]` **STEP 3-5 (2026-10-05)**: 방명록 연결 + 회원 탈퇴. `my-garage.tsx`에 STEP 2-5의 `components/community/guestbook.tsx`(`Guestbook`)를 그대로 가져다 썼다(새 컴포넌트 없음) — `ownerId={member.id}`(본인), `viewer={session ?? null}`, `requireLogin`(member-profile.tsx와 동일한 패턴으로 새로 작성한 작은 콜백, `/home`은 항상 로그인 상태에서만 이 블록에 도달하므로 사실상 항상 true), `notify`(기존 `useNotice`). 그리드 아래 전체 폭에 배치. 새 API 없음 — `Guestbook` 내부가 이미 STEP 2-x의 `fetchGuestbook`/`createGuestbookEntry`/`deleteGuestbookEntry`를 쓴다.
        회원 탈퇴는 `frontend/components/my-garage/withdraw-dialog.tsx`(신규) — "내 프로필" 패널 헤더에 "회원 탈퇴" 버튼 추가. STEP 3-0의 `fetchWithdrawInfo`/`withdrawAccount`(`GET/POST /api/auth/withdraw`)만 사용, 새 API 없음. legacy `withdrawAccount()`와 동일한 안내 문구 4줄 + 서버가 돌려주는 차단 사유(admin/예약매물/카카오/전역 비활성)를 그대로 보여주고, 해당 없을 때만 비밀번호+동의 체크박스 폼을 띄운다. 성공 시 서버가 이미 세션 쿠키를 지우므로 추가 클라이언트 상태 정리 없이 `window.location.assign('/')`로 홈 이동(legacy `location.assign("/")`와 동일).
        검증: 이번에도 Chrome 미사용(사용자 지시로 재시도 안 함, UI 검증은 STEP 3-6에서 한 번에). STEP 3-1~3-4와 같은 격리 로컬 스택(Neon 미접촉, 작업 후 전부 삭제, 이번엔 `WITHDRAWAL_HMAC_SECRET` 테스트값을 추가해 탈퇴 가능 상태까지 확인)에서 컴포넌트가 호출하는 것과 동일한 API를 직접 호출: 방명록 — 빈 목록 확인 → 방문자 계정으로 작성(`POST`) → 목록 반영 확인 → 작성자 본인 삭제(`DELETE`) → 목록에서 제거 확인. 탈퇴 — `GET /api/auth/withdraw`가 차단 없는 계정에 `{admin:false,reservedListings:0,method:"PASSWORD",available:true}`를 반환해 `WithdrawDialog`의 `ready` 분기와 일치함을 확인, `POST /api/auth/withdraw`(비밀번호+confirm) 성공 후 응답에 세션 쿠키 만료 `Set-Cookie`가 실림과 이어진 `GET /api/auth/me`가 401이 되는 것까지 확인(= 성공 시 추가 로그아웃 처리 없이 바로 네비게이션해도 안전함을 검증). 차단 분기(admin/예약매물/카카오/비활성) 자체는 기존 백엔드 테스트(`WithdrawalServiceTest` 등, STEP 10-impl 시리즈)에서 이미 검증된 로직이라 재검증하지 않음. 전체 커뮤니티 회귀는 범위 밖이라 실행하지 않음. `npx tsc --noEmit`, `next build` 통과(라우트 변화 없음).
      - `[x]` **STEP 3-6 (2026-10-05) — 최종 검증·정리, 신규 기능 추가 아님**: legacy `home.js`/`vehicle-ui.js`와 지금의 `/home`(STEP 3-1~3-5)을 항목별로 코드 대조해 기능 누락 3건을 찾아 최소 수정했다.
        1. **오너 인증 재신청 경로가 아예 없었음(실사용에 영향 있는 누락)**: STEP 3-2에서 등록 플로우로만 범위를 좁히며 "나중에 하기"로 건너뛴 차량이나 반려된 차량을 다시 인증 신청할 방법이 빠져 있었다(STEP 3-2·3-3 기록에 "미정"으로만 남아 있었음). `vehicle-registration-dialog.tsx`가 선택적 `vehicleId` prop을 받으면 1단계(기본정보 등록)를 건너뛰고 바로 2단계(등록증 업로드)로 시작하도록 고쳐 같은 컴포넌트를 재사용했고(새 컴포넌트 없음), `my-garage.tsx`의 대표 차량 카드에 legacy와 동일한 조건(`!verified && status!=='PENDING'`)·동일한 라벨 분기(`REJECTED`→"인증 재신청", 그 외→"오너 인증 신청")로 버튼을 추가했다(legacy도 이 버튼은 대표 차량에만 있었음 — 보유 차량 각 행에는 없음, 그대로 일치).
        2. **"내 인장" 패널이 설명 문구 없는 compact 배지였음**: legacy home.js의 `#home-badge-list`는 `authorBadge(b)`를 compact 없이 호출해 설명까지 보여주는데, STEP 3-4에서 `BadgeList`에 `compact`를 잘못 넘겨 축약형으로 나오고 있었다. `compact` prop 제거로 수정.
        3. **차량 사진을 등록만 가능하고 제거할 방법이 없었음**: legacy의 `vehiclePreviews()`는 사진 옆에 제거(✕) 버튼이 있는데 STEP 3-3의 `vehicle-manage-dialog.tsx`에는 없었다. 미리보기 옆에 "사진 제거" 버튼을 추가해 `imageId`를 `null`로 되돌릴 수 있게 했다.
        나머지는 항목별 대조 결과 동등하다고 판단해 손대지 않았다: 등록 2단계·대표 차량 설정·차량 수정/삭제·기록 추가삭제·프로필 편집·방명록·탈퇴 플로우는 legacy와 1:1로 대응됨. 의도적으로 포팅하지 않은 항목(기존 결정 유지, 누락 아님): "내 커뮤니티 활동" 탭(헤더 "내 활동" 패널로 대체, STEP 2-1/2-5 결정), 차량 상세를 별도 모달로 다시 만드는 것(대신 STEP 2-5의 `/community/cars/:id`로 링크, STEP 3-3 결정).
        검증: 세션 내내 Chrome 확장이 연결되지 않아(재시도 지시 없음, 추가 재시도 안 함) 이번에도 UI 클릭 검증은 못 했다. 코드 대조에 더해, STEP 3-1~3-5와 같은 격리 로컬 스택(Neon 미접촉, 작업 후 전부 삭제)에서 이번에 고친 두 흐름을 API 레벨로 직접 재확인했다: ①차량을 인증 없이 등록(`POST /api/garage/vehicles`) → 나중에 같은 차량에 `POST /api/garage/vehicles/:id/verification` 호출(= 새 "인증 재신청" 버튼이 실제로 치는 요청과 동일) → `verificationStatus`가 `null`에서 `PENDING`으로 바뀜을 확인. ②`PUT /api/board/garage/:id`에 사진을 설정했다가(`imageId:1`) 다시 `imageId:null`로 보내 제거되는 것을 확인(= 새 "사진 제거" 버튼과 동일한 요청). 이어서 대표 차량 설정·`GET /api/board/members/:id` 응답 일관성까지 한 번 더 확인해 오늘 수정이 기존 플로우를 깨지 않았음을 재확인했다. `npx tsc --noEmit`, `next build` 통과(라우트 변화 없음).
        community 전체 회귀는 실행하지 않았다 — 이번 STEP에서 변경한 파일은 `frontend/components/my-garage/{my-garage,vehicle-registration-dialog,vehicle-manage-dialog}.tsx` 세 개뿐이고 전부 다른 어떤 페이지도 import하지 않는 `/home` 전용 파일이다(STEP 3-0에서 `community-api.ts`/`community-types.ts`에 추가한 타입·함수는 그 이후 한 번도 수정되지 않은 순수 추가분이라 재검증 불필요로 판단).
        **레거시와 비교한 전체 결론**: `assignment-frontend/home`(+`vehicle-ui.js`의 홈 쪽 경로)의 기능은 지금의 `/home`에 코드/API 레벨로는 전부 대응된다. 남은 미검증은 전부 "Chrome으로 실제로 눌러보지 못했다"는 한 가지 이유다 — 특히 사진 교체·제거의 실제 미리보기 동작, 중첩 다이얼로그(기록 삭제 확인 중 차량 다이얼로그 유지), 실제로 인증된 계정에서 인장이 설명과 함께 제대로 보이는지는 코드 리뷰로만 확인했다. **다음 세션에서 Chrome이 연결되면 가장 먼저 이 STEP 3-6 체크리스트(3-1~3-5 전체 시나리오)를 한 번에 돌려야 한다.** `assignment-frontend/home`을 실제로 걷어내고 nginx를 Next로 돌리는 결정은 이 STEP 범위가 아니며 NOW-3(실제 배포)에서 다룬다 — 그 전까지 legacy `/home`은 그대로 서비스되는 중이라 지금 당장 위험하지 않다.
    - **STEP 2-1 범위(원래 계획)**: 커뮤니티 목록 화면 — 카테고리 탭, 최신/인기 정렬, 검색(`q`), 차종 필터(`vehicle`), "더 보기" 페이지네이션(`page`/`limit=20`), 인기글 사이드바(`sort=popular&limit=5`), 최근 본 글(`localStorage`, 계정과 무관), 미니 내 차고 카드. 라우트는 `/community`(또는 동등한 경로) 하나만 만들고, 위 세션 개인화 이슈를 먼저 정한 뒤 `fetchPosts`를 호출하는 리스트 컴포넌트를 작성한다. 상세/글쓰기/댓글/신고/작성자 프로필은 이번 STEP 범위 아님(2-2 이후). 참고 파일: `assignment-frontend/js/community-list.js`, `assignment-frontend/js/app.js`(`refreshPosts`/`renderPost`/`search`), `assignment-frontend/community/index.html`.
  - **인증 영역 Next.js 포팅(2026-10-06 착수)**: "/auth"는 영역 이름일 뿐 새 라우트를 만들지 않는다. 사용자 URL은 기존 그대로 `/login`·`/signup`·`/password-reset`(legacy `auth/index.html`+`js/auth.js`, `auth/reset.html`+`js/password-reset.js`). 새 API·백엔드 변경 없음. nginx가 이 URL을 Next로 보내는 전환은 다른 화면과 같이 NOW-3에서 판단한다(그 전까지 운영은 legacy 화면).
    - 사용자 결정(2026-10-06): ①로그인 429(아이디 5회 실패 15분 잠금, IP 제한)는 legacy의 일반 오류 문구 대신 서버 메시지("로그인 시도가 너무 많습니다…")를 보여준다(서버 잠금·rate limit 로직은 그대로). ②이미 로그인한 사용자의 `/login` 접근은 legacy처럼 그대로 둔다(자동 이동 없음). ③`next` 허용 목록은 실제 Next 라우트 기준으로 넓힌다.
    - 조사로 확인한 범위 밖 사항: 카카오 로그인은 `/api/auth/kakao/login` 링크만 있고 callback이 ADMIN→`/admin`, 그 외→`/`로 고정(`next` 미지원), 실패 시 JSON 응답이 그대로 보인다 — 백엔드 동작이라 손대지 않는다.
    - **[x] STEP 4-1 `/login` (2026-10-06)**: `app/login/page.tsx`, `components/auth/{auth-shell,login-form,password-field}.tsx` + `auth.module.css`(4-2·4-3에서 같은 틀 재사용), `lib/auth-next.ts`(`safeNext`·`withNext`), `lib/auth-api.ts`(`login`·`fetchAuthMe`, 기존 `ApiError` 재사용). 동작은 `auth.js` 로그인 모드와 같다: 공백 입력 안내(요청 없음) → `POST /api/auth/login` → `GET /api/auth/me` → `next` 또는 ADMIN `/admin`·그 외 `/`(`location.replace`), 400/401 "아이디 또는 비밀번호가 올바르지 않습니다.", 그 밖 오류·네트워크 실패·`/me` 실패 문구, `?joined=1`·`?reset=1` 성공 안내, 비밀번호 보기/숨기기, 요청 중 폼 잠금(중복 제출 1회), 실패·이탈(`pagehide`) 시 비밀번호 비움, 상태 문구로 포커스 이동, 회원가입 링크에 `next` 유지, 카카오·비밀번호 찾기 링크. 변경점은 결정 ①(429는 서버 메시지, 메시지가 없으면 같은 뜻의 고정 문구). `safeNext`는 legacy 안전 규칙(`/` 시작, `//`·역슬래시·제어/공백 문자 거부, 같은 origin)을 유지하고 허용 경로에 `/community/new`, `/community/{카테고리}/{id}/edit`, `/community/members/{id}`, `/community/cars/{id}`를 추가했다(검색어·해시 유지).
      - 검증: Neon 미접촉 임시 스택에서 `safeNext` 단위 28케이스(허용 13, 거부 14 — 외부 origin, `//`, 역슬래시, 공백, 잘못된 카테고리·id, `/login` 등 — 와 경로 정규화 1) 통과. Playwright 29/29: 링크·제목, 보기/숨기기, 공백 입력, 성공 안내 2종, 오답 문구·더블클릭 1회·실패 후 비밀번호 비움과 잠금 해제, 일반 회원 `/`·관리자 `/admin`, `next`(`/community/new?category=drive`, `/community/members/2?x=1#h` 유지, `//evil.com/` → `/`), 로그인 상태에서 `/login` 그대로 표시, `/me` 실패·네트워크 실패·500 문구, 실제 계정 5회 실패 후 잠금 429 서버 메시지 표시, 본문 없는 429 대체 문구. `tsc --noEmit`·`next build` 통과.
      - 참고: `/signup`, `/password-reset` Next 라우트는 아직 없어 `next dev`(3000)에서는 해당 링크가 404다(4-2·4-3에서 추가). 카카오 실제 로그인은 미검증(키 없음).
    - **[x] STEP 4-2 `/signup` (2026-10-06)**: `app/signup/page.tsx`, `components/auth/signup-form.tsx`(4-1의 `auth-shell`/`password-field`/`auth.module.css` 틀 재사용, `password-field.tsx`에 `inputRef`·`required`·`disabled` 선택 prop만 추가해 포커스 이동과 비활성화를 지원 — 로그인 동작은 바뀌지 않음). `lib/auth-api.ts`에 기존 API 래퍼 `checkUsername`(`GET /api/auth/check-username`)·`signup`(`POST /api/auth/signup`)만 추가. 새 API·백엔드 변경 없음. `lib/auth-next.ts`는 그대로 재사용.
      - 동작은 `auth.js` 회원가입 모드와 같다: 아이디/이메일(선택)/비밀번호/비밀번호 확인 + 약관·개인정보 필수 동의(둘 다 UI 확인용, 서버로 전송 안 함). 아이디 입력이 바뀌면 중복확인 상태 무효화(세대 카운터로 늦게 도착한 응답 무시), 중복확인 429는 "요청이 많습니다. 잠시 후 다시 확인해주세요." 제출 시 검사 순서도 legacy와 동일: ①중복확인 안 함 → "아이디 중복확인을 해주세요."(포커스 이동) ②비밀번호 확인 불일치 ③8자 미만 ④UTF-8 72바이트 초과 ⑤공백만 입력 ⑥브라우저 기본 required 검증(아이디/비밀번호/비밀번호 확인/약관/개인정보 체크박스, 이 단계는 JS보다 먼저 브라우저가 막는다). 성공 시 자동 로그인하지 않고 `location.replace`로 `/login?joined=1`(또는 `next` 유지 시 `/login?next=…&joined=1`)로 이동. 409는 중복확인 무효화 후 "이미 사용 중인 아이디 또는 이메일입니다...", 400/그 외는 legacy와 같은 고정 문구. legacy에만 있던 사소한 디테일도 그대로 포팅: `/password-reset` 링크는 회원가입 화면에도 노출(legacy에 `signup-only`로 안 묶여 있어 양쪽에 다 보임).
      - 검증: Neon 미접촉 임시 스택(`docker-compose.yml` + 임시 override로 postgres/redis/core만, 프로젝트명 `revcc-s42`, 컨테이너명 분리, 기존 `revcc-*` 컨테이너와 충돌 없음, core는 host 18080으로 직접 노출해 nginx 없이 `/api/auth/*` 호출)에서 Chrome 확장으로 Playwright 없이 직접 클릭 검증: 폼 렌더링, 이미 가입된 아이디 중복확인("이미 사용 중인 아이디입니다"), 신규 아이디 중복확인("사용 가능한 아이디입니다")과 입력 변경 시 상태 초기화, 중복확인 생략 후 제출 시 안내+포커스, 8자 미만 비밀번호 오류(상태 유지 확인), 비밀번호 확인 불일치 오류, 정상 가입 → `/login?joined=1` 이동과 성공 안내(자동 로그인 없음, 아이디/비밀번호 입력란 비어있음 확인), 새로 만든 계정으로 실제 로그인 성공, `next` 파라미터가 회원가입↔로그인 전환 링크에 유지되고 가입 성공 후 `/login?next=…&joined=1`로 합쳐짐, check-username IP rate limit(10회/분 확인, 11번째부터 429)와 429 시 화면 문구. 스택은 검증 후 `docker compose -p revcc-s42 down -v`로 정리(기존 `revcc-*` 컨테이너는 건드리지 않음). `npx tsc --noEmit`, `next build` 통과.
      - 미검증: UTF-8 72바이트 초과 비밀번호(로직은 로그인과 동일 패턴, UI 조작으로 재확인 안 함), signup 쪽 409(동시 가입 레이스) 응답은 실제로 유발하지 않고 코드 경로만 확인, 카카오 가입(키 없음), 상세 CSS(아이디 입력+중복확인 버튼 줄, 체크박스 줄 간격 등 최소한의 레이아웃만 추가, 다듬지 않음).
    - **[x] STEP 4-3 `/password-reset` + 인증 영역 최종 동등성 검증 (2026-10-06)**: `app/password-reset/page.tsx`, `components/auth/password-reset-form.tsx`(4-1의 `auth-shell`/`auth.module.css` 재사용, `next` 처리 없음 — legacy도 없음). `lib/auth-api.ts`에 `requestPasswordReset`/`verifyPasswordReset`/`completePasswordReset`(기존 `POST /api/auth/password-reset/{request,verify,complete}` 래퍼)만 추가. 새 API·백엔드 변경 없음.
      - 동작은 `password-reset.js`와 같은 3단계 한 페이지 흐름: ①아이디+이메일 → 인증번호 요청(`CODE_SENT` 아니면 "발송 상태를 확인하지 못했습니다...") ②6자리 인증번호 확인 → `resetToken`(컴포넌트 상태에만 보관, URL·storage 미사용) ③새 비밀번호+확인 → 완료 후 자동 로그인 없이 `location.replace('/login?reset=1')`. 단계는 `stage` 상태(`email`/`code`/`password`)로 표현 — `code` 단계에서는 아이디·이메일 입력이 `readOnly`로 바뀌며 같이 보이고(재발송 가능), `password` 단계에서는 두 폼이 모두 사라지고 새 비밀번호 폼만 보인다(legacy의 `hidden` 토글과 동일한 가시성 규칙). 새 비밀번호 검증은 legacy와 동일하게 "8자 미만·불일치·UTF-8 72바이트 초과·공백만 입력"을 **하나의 메시지**로 합쳐 보여준다(/signup처럼 항목별로 나누지 않음 — legacy 원본이 그렇게 되어 있음). 포커스는 legacy의 `message()` 내부 `focus()`를 각 성공 핸들러가 바로 다음 줄에서 덮어쓰는 순서를 그대로 재현: 오류는 상태 메시지로, 성공은 그다음 단계의 첫 입력칸으로 포커스가 간다(재발송처럼 단계가 안 바뀌어도 매번 다시 포커스됨 — 메시지를 매번 새 객체로 설정해 effect가 항상 다시 실행되게 함). 오류 메시지 해석도 legacy의 `post()`를 그대로 옮김: request 단계의 `USERNAME_NOT_FOUND`/`IDENTITY_MISMATCH`/`SOCIAL_ACCOUNT`/`MAIL_UNAVAILABLE`만 서버 메시지를 그대로 쓰고, 그 외(429/503/나머지 400 등, verify·complete 단계 포함)는 legacy와 동일한 고정 문구 3종 중 하나. `pagehide`에서 아이디·이메일·인증번호·새 비밀번호·토큰을 전부 비우고(legacy의 `document.querySelectorAll('form').forEach(f=>f.reset())`와 동일 범위), bfcache 복원(`pageshow`의 `persisted`)이면 `location.reload()`로 전체 상태를 리셋(legacy와 동일 — 3단계 상태머신과 토큰이 뒤로가기로 부분 복원되는 것을 막음). "처음부터 다시 인증"·"로그인으로 돌아가기"는 Next `Link`가 아닌 일반 `<a>`(기존 로그인·회원가입 폼과 같은 관례) — 특히 "처음부터 다시 인증"은 같은 URL(`/password-reset`)로 가는 일반 `<a>`라 클릭 시 legacy처럼 완전한 브라우저 재진입이 되어 상태머신이 리셋된다(별도 JS 불필요).
      - 검증 환경: 이번 세션은 Chrome 확장이 연결되지 않아(재시도 포함 3회 실패) STEP 4-1/4-2처럼 실제 클릭 검증을 하지 못했다. 대신 Neon 미접촉 임시 스택(`revcc-s43`, postgres/redis/core + 이번에 추가한 `mailpit`(SMTP 캐처, 실제 메일 미발송·외부 전송 없음, `SMTP_AUTH=false`/`SMTP_STARTTLS=false`로 core가 여기로만 메일을 보내도록 격리)로 구성, core는 host 18080 직접 노출, Next는 `REVCC_API_ORIGIN=http://localhost:18080`로 로컬 `npm run dev`)에서 **API 레벨 end-to-end**로 검증했다: 테스트 계정 가입 → request → mailpit에서 실제 발송된 메일 본문의 6자리 코드 확인 → verify로 `resetToken` 획득 → complete → 새 비밀번호로 실제 로그인 성공(세션 쿠키 발급 확인). 오류 경로도 API로 직접 확인: `USERNAME_NOT_FOUND`/`IDENTITY_MISMATCH`(각 서버 메시지 그대로), request 쿨다운 재요청 시 429 `RATE_LIMITED`, verify 잘못된 코드(코드 없는 400 → 컴포넌트 로직상 고정 문구로 대체됨을 코드로 확인). `localhost:3000/api/...`(Next rewrite 경유)로도 같은 request 호출이 core까지 동일하게 도달함을 확인했고, `/password-reset` 초기 SSR에 1단계(아이디/이메일/"인증번호 받기 / 재발송") 요소만 있고 2·3단계 요소가 없음을 확인했다. `/login`·`/signup`은 이번 변경(`auth-api.ts` 추가, `password-field.tsx` prop 추가) 이후에도 정상 렌더링됨을 다시 확인(회귀 없음). UTF-8 72바이트 초과 비밀번호는 Node로 72바이트 초과를 만드는 실제 문자열을 만들어 로직 검증 + 서버(`/api/auth/signup`)에도 같은 규칙으로 거부됨을 확인(password-reset의 `reset()`도 백엔드 코드상 동일 규칙 사용, 서버 쪽은 이미 `PasswordResetServiceTest`로 커버됨). 카카오는 `/login`·`/signup`의 `href="/api/auth/kakao/login"` 연결만 코드로 확인(키 없어 실제 로그인 불가, password-reset 화면엔애초에 카카오 링크 없음 — 안내 문구만 있음). 스택은 검증 후 `docker compose -p revcc-s43 down -v`로 정리. `npx tsc --noEmit`, `next build` 통과.
      - 미검증(이번 세션 Chrome 미연결로 인한 공백): 실제 브라우저 클릭으로 3단계 전환·`readOnly` 전환·포커스 이동·버튼 비활성화를 눈으로 확인하지 못했다(로직은 코드 리뷰 + API 레벨 검증으로 교차 확인). `SOCIAL_ACCOUNT`(카카오 연동 계정 필요, DB 직접 조작 없이는 재현 어려움), `MAIL_UNAVAILABLE`(`ResetMailService.send()`가 `@Async`라 메일 발송 실패가 `request()`의 try-catch에 동기적으로 전파되지 않는 기존 백엔드 구조상 사실상 도달 불가능한 경로로 보임 — 이번 세션에서 새로 발견한 사실이며 프론트 포팅 범위 밖이라 백엔드는 건드리지 않았다), 429/503 relies on legacy와 동일한 고정 문구 로직이나 verify/complete 단계의 429는 직접 유발하지 않음(request 단계 429만 실제 확인).
  - **부품장터 Next.js 포팅(2026-10-06 착수, STEP 5)**: 착수 전 `assignment-frontend/parts/index.html` + `js/market.js`(678줄), board-service `market.js`(API)를 조사했다. 부품 호환성(`GET /api/parts/compatibility`)은 `/parts` 장터와 무관한 별개 기능(garage 상세용, 기존 P3-3 orphan 백로그)이라 범위에서 완전히 제외한다 — 새로 만들지도, 포팅하지도 않는다(2026-10-06 사용자 확인: "클라이언트들이 알아서 거래하게끔").
    - **legacy 기능**: 목록(카드·검색·카테고리/상태/지역/적용차종 필터·정렬 4종·scope `mine`/`favorites`·12개 페이지네이션), 상세(조회수 1회 증가·찜 토글·연락처는 로그인 시만 노출·링크 복사·본인 수정/삭제/판매상태 변경·관리자 삭제[사유 필수, `/admin` 전용 화면 없이 상세에 인라인]), 작성/수정(제목·설명·가격·카테고리·판매상태·적용차량[직접입력 또는 "내 등록 차량에서 가져오기" 텍스트 프리필]·지역·연락처·사진 최대 3장), 사이드바(인기 매물·MY GARAGE 미니카드·최근 본 매물 `localStorage`). 신고 기능 없음.
    - **API**: 전부 기존 board-service `/api/parts/listings*`(목록 GET, 생성 POST, 상세 GET, 수정 PUT, 상태변경 PATCH, 삭제 DELETE, 찜 PUT `/favorite`, 조회수 POST `/view`) + `/api/board/images`(사진 업로드, 커뮤니티와 공유) + `/api/board/members/:id`(내 차량 프리필). 새 API·DB 변경 없음.
    - **재사용 확정**: `components/community/community-header.tsx`·`footer/site-footer.tsx`·`use-community-session.ts`(이미 `/home`도 그대로 재사용 중인 공용 헤더/푸터/세션), `community/my-garage-mini.tsx`(legacy `my-garage-card.js`의 Next 포팅본), `community/community-dialog.tsx`(본인 삭제 확인·관리자 삭제 사유 다이얼로그), `lib/community-api.ts`의 `uploadImage`(동일 `/api/board/images`)·`fetchMember`(동일 `/api/board/members/:id`, `CommunityMember.vehicles` 타입 이미 일치), `lib/format.ts`의 `formatMoney`/`imageUrl`/`timeAgo`. `lib/home-types.ts`의 `Listing`은 홈 스포트라이트 전용 최소 타입이라 상세 화면엔 부족 — STEP 5-0에서 `lib/parts-types.ts`에 확장된 타입을 따로 둔다.
    - **사용자 결정(2026-10-06)**: ①상세 화면은 legacy의 해시 다이얼로그(`#listing-{id}`) 대신 community·member·vehicle과 같은 실제 라우트 `/parts/{id}`로 전환한다(구 `#listing-{id}`·`/parts#listing-{id}` 링크는 호환 리다이렉트 처리, `home/market-spotlight.tsx` 등 기존 크로스링크도 같이 갱신). ②작성/수정도 legacy의 다이얼로그 대신 community 글쓰기와 같은 실제 페이지 `/parts/new`·`/parts/{id}/edit`로 전환한다(이탈 확인·canonical 교정 등 post-editor 패턴 재사용).
    - **STEP 5 계획** (커뮤니티 2-0~2-6보다 단순한 단일 엔티티 CRUD라 최소화):
      ```
      [x] STEP 5-0: 공통 타입/API — lib/parts-types.ts, lib/parts-api.ts (기존 7개 API 래퍼만)
      [x] STEP 5-1: 목록 — /parts
      [x] STEP 5-2: 상세 — /parts/{id}, 찜·연락처·삭제·판매상태변경·관리자삭제, 구 해시 링크 호환
      [x] STEP 5-3: 작성/수정 — /parts/new, /parts/{id}/edit
      [x] STEP 5-4: legacy 기능 동등성 최종 검증
      ```
    - **[x] STEP 5-0 (2026-10-06)**: `lib/parts-types.ts`(`LISTING_CATEGORIES`/`LISTING_STATUSES` 상수 + `Listing`/`ListingDetail`/`ListingsPage`/`ListingFilters`/`ListingInput` 타입, 전부 board-service `market.js`의 실제 SQL 컬럼 alias만 반영), `lib/parts-api.ts`(`fetchListings`/`fetchListing`/`createListing`/`updateListing`/`setListingStatus`/`deleteListing`/`setListingFavorite`/`recordListingView` — 전부 기존 `/api/parts/listings*` 호출, 새 API 없음). `ApiError`는 새로 만들지 않고 `community-api.ts`의 것을 재사용(`vehicle-public.tsx`/`member-profile.tsx`와 같은 기존 import 관례). 화면/라우트는 아직 없음(미사용 코드, STEP 5-1부터 소비). `npx tsc --noEmit`, `next build` 통과(라우트 변화 없음 확인).
    - **[x] STEP 5-1~5-4 (2026-10-06, 한 번에 이어서 구현)**: 사용자 결정대로 목록·상세·작성/수정·최종 검증을 한 번의 작업으로 묶어 진행했다.
      - **공용 컴포넌트(신규)**: `components/parts/parts.module.css`(my-garage.module.css와 같은 관례로 `--accent`/`--line`/`--ink`/`--muted` 토큰을 자체 중복 정의, 리스트/상세/에디터 레이아웃), `parts-sidebar.tsx`(인기 매물·`MyGarageMini`(기존 컴포넌트 그대로 재사용)·최근 본 매물, `community-sidebar.tsx`와 같은 구조), `listing-card.tsx`(목록 카드). `lib/recent-listings.ts`는 `lib/recent-posts.ts`와 같은 패턴으로 `revcc:recent-listings:v1`(legacy와 같은 키) 관리. `lib/format.ts`에 `listingUrl(id) => /parts/{id}` 추가, `components/home/market-spotlight.tsx`의 구 `/parts#listing-{id}` 링크를 이걸로 교체(grep으로 프로젝트 내 다른 구 해시 링크 없음 확인).
      - **STEP 5-1 목록(`/parts`, `components/parts/parts-list.tsx`)**: 카테고리 좌측 내비(9종)·scope 바로가기(내 판매글/관심 매물, 비로그인 시 `/login?next=`)·검색/상태/지역/적용차종/정렬 필터(select는 변경 즉시 반영, 검색·지역·적용차종 텍스트는 "적용"/검색 버튼으로 커밋 — `community-list.tsx`가 이미 쓰는 draft/applied 분리 패턴과 동일), 필터는 URL과 동기화. 페이지네이션은 community의 "더 보기" 무한 추가 방식이 아니라 legacy와 동일한 숫자 페이지네이션(이전/최대 5페이지 창/다음, page>pages면 자동 보정)으로 별도 구현. 카드의 찜 버튼은 목록에서 바로 토글 가능(목록 재조회로 반영, 사이드바 인기 매물 위젯은 자체 독립 로드라 즉시 동기화하지 않음 — 다음 로드 때 자연히 반영되는 정도로 단순화). 구 `/parts#listing-{id}` 해시는 `hashchange`로 잡아 `/parts/{id}`로 리다이렉트.
      - **STEP 5-2 상세(`/parts/{id}`, `components/parts/listing-detail.tsx`)**: `post-detail.tsx`와 같은 구조(ticket 기반 비동기 로드, 세션 변경 시 재조회). 페이지 로드당 1회 조회수 증가, 찜 토글, 연락처는 로그인 시에만(서버가 애초에 `contact` 필드 자체를 비로그인·탈퇴 판매자에겐 내려주지 않음 — 옵셔널 타입으로 반영), 매물 링크 복사, 판매자 링크(`MemberLink` 대신 직접 `memberUrl()` 사용, 탈퇴 판매자는 `sellerId:null`이라 텍스트만), 본인 수정/삭제/판매상태 변경(select+저장 버튼), 관리자 삭제(`CommunityDialog`의 reason kind 재사용, `본인 여부`로 confirm/reason 분기는 `post-detail.tsx`의 `deletionDialog` 패턴을 그대로 옮김), 최근 본 매물 기록, 404 시 최근 본 매물에서 제거. 구 `#listing-{id}`는 목록 페이지에서만 처리(상세 페이지 자체는 이제 경로 기반이라 해시 불필요).
      - **STEP 5-3 작성/수정(`/parts/new`, `/parts/{id}/edit`, `components/parts/listing-editor.tsx`)**: `post-editor.tsx`와 같은 구조(dirty-leave 확인: beforeunload + 페이지 내 링크 클릭 가로채기, 제출 중복 방지용 `version` ref, 세션 변경 시 재초기화). 필드는 legacy와 동일: 제목/설명/가격(숫자, 0~2,000,000,000)/카테고리/판매상태/판매자 제공 적용 차량/거래 지역/연락 방법 + 사진 최대 3장(`uploadImage` 재사용). "내 등록 차량에서 적용 정보 가져오기"는 `fetchMember(session.id).vehicles`(community-api.ts, `/api/board/members/:id`)로 받아 텍스트만 프리필하는 legacy 방식 그대로(차량 FK 연결이 아님). 수정은 작성자 본인만(`existing.sellerId !== sessionKey`면 forbidden 안내), 성공 시 `/parts/{id}`로 이동. 커뮤니티 글쓰기와 달리 `?category=` 프리셀렉트는 legacy에 없어 포팅하지 않음(카테고리 기본값은 legacy와 같은 첫 번째 카테고리 `wheels`).
      - **검증 환경**: 이번 세션도 Chrome 확장이 연결되지 않음(재시도 + `list_connected_browsers` 빈 배열로 재확인). STEP 4-3과 달리 이번엔 board-service(`/api/parts/*`, `/api/board/*`)까지 필요해 nginx 프록시를 포함한 전체 스택을 임시로 띄웠다(`revcc-s5x`: postgres/redis/core/board/frontend(legacy, healthcheck용)/proxy, 전부 컨테이너명 분리, 기존 `revcc-*`와 충돌 없음, proxy만 host 18090 노출, Next는 `REVCC_API_ORIGIN=http://localhost:18090`로 로컬 `npm run dev`). Neon은 건드리지 않음.
      - **검증 결과(API 레벨 end-to-end + 라우트 상태코드 + 렌더 결과 확인, Chrome 클릭 불가로 Playwright/수동 클릭 대신 curl·jq·DB 직접 조회로 교차 확인)**: 회원 3명(판매자·구매자·DB에서 ADMIN 지정) + 판매자 차량 1대 등록 후, 매물 14개(카테고리·가격·지역·상태 다양화, 페이지네이션 확인용 13개 활성 + admin이 지운 것 등 포함) 생성. 확인 항목: 목록 검색/카테고리/상태/지역 필터 각각 정확한 부분집합 반환, 정렬 4종(최신/인기/낮은가격/높은가격) 순서 정확, scope=mine·favorites 정상 동작과 비로그인 401, 페이지네이션(13개·limit 12 → 1페이지 12개/2페이지 1개) 정확, 상세 조회 시 비로그인은 `contact` 키 자체가 응답에 없고 로그인(탈퇴 아닌 판매자)에게만 노출, 조회수 POST마다 1씩 증가, 찜 PUT 토글과 count 반영, 본인 PUT 수정·PATCH 상태변경 성공, 타인(구매자)의 PUT/PATCH/DELETE 전부 403, 관리자 DELETE+사유 성공(moderation_logs에 `LISTING_DELETE` 기록 확인) 및 사유 없는 관리자 삭제는 400, 본인 DELETE(사유 없이) 성공, 이미지 업로드(`/api/board/images`) → 매물 `imageIds`에 반영 → 이미지 재조회 200, 내 차량 프리필 데이터(`/api/board/members/:id`) 응답 형태가 에디터가 기대하는 그대로. 라우트: `/parts`·`/parts/{id}`(유효)·`/parts/{id}/edit`·`/parts/new` 전부 200, `/parts/0`·`/parts/abc`·`/parts/999999999999` 전부 404(`/parts/new`가 동적 `[id]` 라우트보다 우선 매칭되는 것도 확인). 홈 "장터 새 매물"이 새 `/parts/{id}` 링크를 실제로 쓰는 것과 구 해시 링크가 프로젝트 전체에 더 이상 없는 것(grep) 확인. `/`, `/community`, `/login`, `/signup`, `/password-reset`, `/home` 전부 정상 응답으로 회귀 없음 확인. Next dev 서버 로그에 에러 없음. `npx tsc --noEmit`, `next build` 통과(`/parts`, `/parts/{id}`(ƒ), `/parts/{id}/edit`(ƒ), `/parts/new`(○) 라우트 생성 확인). 스택은 검증 후 `docker compose -p revcc-s5x down -v`로 정리.
      - **수정한 문제**: 구현 중 발견해 즉시 고친 것 — `parts-api.ts`/`listing-detail.tsx`/`listing-editor.tsx`/`parts-list.tsx`가 `ApiError`를 `parts-api.ts`에서 재수출받으려다 `tsc` 오류(의도적으로 재수출을 안 만들었으므로) → 전부 `community-api.ts`에서 직접 import하도록 수정(기존 `vehicle-public.tsx` 관례와 통일). 그 외 기능적인 버그는 검증 중 발견되지 않았다.
      - **미검증(이번 세션 Chrome 미연결로 인한 공백, STEP 4-3과 동일한 제약)**: 실제 브라우저 클릭으로 필터 폼 상호작용·카드 레이아웃·다이얼로그 열고 닫기·버튼 비활성화·포커스 이동·반응형을 눈으로 확인하지 못했다. 구 `#listing-{id}` 해시 리다이렉트는 `community-list.tsx`의 이미 검증된 패턴을 그대로 옮긴 코드라 로직상 신뢰하나 클릭으로 직접 확인하지 않았다. 이미지 3장 초과 차단 메시지, dirty-leave 확인창(beforeunload/링크 가로채기), 사진 업로드 중 중복 제출 방지는 코드 리뷰로만 확인(post-editor.tsx와 100% 동일 패턴이라 위험도 낮음으로 판단). 탈퇴 판매자 매물(`sellerWithdrawn:true`, 연락처 비공개, closed 상태 비공개 목록) 시나리오는 실제 탈퇴 플로우를 거치지 않아 재현하지 않음(기존 백엔드 로직이라 별도 테스트 자산도 있음). 모바일/작은 화면 레이아웃은 전혀 확인하지 않음(CSS는 기본 완성도만 목표로 했다는 지시에 따름).
  - **관리자 Next.js 포팅(STEP 6-0~6-5 구현 완료, 2026-10-06)**: `assignment-frontend/admin/index.html` + `js/admin.js`(506줄)와 관련 backend(Spring `AdminController`/`AdminMemberController`, board-service `admin.js`/`admin-access.js`)를 조사해 아래 계획대로 전부 구현했다.
    - **legacy 구조**: 단일 페이지 `/admin`, 서버 라우트 없이 클라이언트 탭 전환(해시도 안 씀)으로 패널 7개를 보여준다 — 대시보드·회원 관리·게시글 관리·운영 로그·신고 관리·차량 인증 관리·인장 현황. 비로그인/비관리자는 "관리자만 볼 수 있어요" 안내(401/403 응답 시 동일 화면으로 전환).
    - **패널별 내용**:
      - 대시보드: 총 회원/차량/게시글 수, 신고 대기 수(새로고침 버튼)
      - 회원 관리: 검색(아이디/닉네임/이메일 중 선택)+상태 필터(전체/정상/정지/비활성/탈퇴), 페이지네이션(20개씩) 목록(ID/아이디/닉네임/이메일/가입일/상태/권한) → 행 클릭 시 상세 다이얼로그(닉네임·이메일·계정상태·정지종료일(datetime-local)·권한 수정 폼, 비밀번호 재설정 메일 발송 버튼, 최근 관리 기록 50건 리스트). 탈퇴 회원은 폼 전체 읽기 전용.
      - 게시글 관리: 검색+게시판 필터(free/maintenance/parts/drive), 목록(제목 링크·작성자·게시판·신고수·작성일)
      - 운영 로그: 검색, `moderation_logs` 목록(처리일시/관리자, 게시판>제목(#id), 삭제유형(게시글/댓글/답글/부품매물) #id·작성자, 사유+원문 펼쳐보기)
      - 신고 관리: 검색+상태 필터(대기/완료/반려), 목록(대상글 링크·신고자·사유·처리기록·검토버튼) → "검토" 다이얼로그(처리결과 select+메모 textarea, 제출 시 PATCH)
      - 차량 인증 관리: 신청 목록(사용자·차량번호·제조사/모델·연식·신청일·등록증 링크·상태칩·승인/거절 버튼)
      - 인장 현황: 인증 오너 뱃지 보유자 수(새로고침 버튼)
    - **API (전부 기존, 새 API 불필요)**:
      - Spring core `/api/admin/*`: `GET overview`(`{totalUsers,totalVehicles}`), `GET/POST vehicle-verifications`(+`/{id}/approve`,`/{id}/reject`), `GET /api/admin/members`(쿼리 `q,field,status,page`, 응답 `{items,total,page,pageSize}`), `GET/PATCH /api/admin/members/{id}`(PATCH body `{nickname,email,status,role,suspendedUntil}`, 서버가 마지막 관리자 보호·동시성 잠금·자기 자신 변경 금지까지 전부 처리 — 프론트는 서버 메시지만 그대로 노출하면 됨), `GET /api/admin/members/{id}/actions`(최근 50건), `POST /api/admin/members/{id}/password-reset`
      - 등록증 이미지: `GET /api/garage/vehicle-verifications/{id}/document` — 그냥 `<a href target=_blank>` 링크(쿠키 인증, fetch 불필요)
      - board-service `/api/board/admin/*`: `GET overview`(`{totalPosts,pendingReports}`), `GET posts`(쿼리 `q,category,page`), `GET reports`(쿼리 `q,status,page`), `PATCH reports/{id}`(body `{status,note}`), `GET logs`(쿼리 `q,page`), `GET badges`(`[{name,description,holders}]`)
      - **주의**: board-service에 `GET /api/board/admin/members`도 있지만 **legacy 프론트가 전혀 호출하지 않는 죽은 라우트**다(회원 관리는 Spring `/api/admin/members`만 씀) — 포팅 때 이 board-service 쪽 엔드포인트는 쓰지 않는다.
      - 장터 매물 관리자 삭제(STEP 5에서 이미 구현)는 별도 패널 없이 "운영 로그"의 `LISTING_DELETE` 항목으로 이미 같이 집계된다 — 추가 작업 불필요.
    - **재사용 가능한 기존 Next 코드**: `community-header.tsx`는 이미 ADMIN 세션일 때 `/admin` 링크를 보여준다(수정 불필요). `useCommunitySession`으로 세션·role 확인 그대로 재사용. `CommunityDialog`(confirm/reason 두 종류)는 "신고 검토"(상태 select+메모, select 필드가 있어 모양이 다름)나 "회원 상세"(필드 다수+액션로그 리스트)에는 그대로 못 쓴다 — 전용 다이얼로그 컴포넌트가 각각 필요. 목록 패널 4개(회원/게시글/로그/신고)는 전부 "검색+필터+페이지네이션+테이블" 모양이 같아 **공용 목록 컴포넌트 1개**로 묶을 수 있다(legacy `loadList()`의 범용 패턴과 동일).
    - **사용자 결정(2026-10-06)**: URL 구조는 **단일 페이지 `/admin` + 탭(쿼리스트링으로 상태 동기화)** 로 legacy와 동일하게 간다. `/parts`·`/community`처럼 서브 라우트로 쪼개지 않는다(관리자 전용 도구라 공유·북마크 가치가 낮다고 판단).
    - **STEP 계획 및 완료 현황**:
      ```
      [x] STEP 6-0: 공통 타입/API — lib/admin-types.ts, lib/admin-api.ts, lib/admin-format.ts
      [x] STEP 6-1: 대시보드 + 전체 셸(탭 네비 + ?panel= 동기화, 비관리자/비로그인 가드, 공용 목록 컴포넌트)
      [x] STEP 6-2: 회원 관리 (목록 + 상세 다이얼로그 + 수정 + 비밀번호 재설정 + 액션 로그, 탈퇴 회원 읽기 전용 분기)
      [x] STEP 6-3: 게시글 관리 + 운영 로그 + 신고 관리 (STEP 6-1의 공용 목록 컴포넌트 재사용, 신고 검토 전용 다이얼로그)
      [x] STEP 6-4: 차량 인증 관리 + 인장 현황
      [x] STEP 6-5: legacy 기능 동등성 검증 — 코드 레벨 전수 대조 + tsc/build + 익명 접근(비로그인 가드) 실제 확인까지 완료. ADMIN 세션이 필요한 조회·변경(회원 수정, 신고 검토, 차량 인증 승인/거절, 비밀번호 재설정, 인장/로그 조회 등)은 공유 Neon 개발 DB(실 회원 약 33명) 보호를 위해 **테스트 계정을 새로 만들지 않고 실행하지 않았다** — 사용자 결정(2026-10-06)에 따른 의도적 미검증. 아래 "구현/검증 결과" 참고.
      ```
    - **구현 파일**: `frontend/lib/admin-types.ts`(응답 타입), `frontend/lib/admin-api.ts`(API 래퍼, board-service의 죽은 `/api/board/admin/members`는 포함하지 않음), `frontend/lib/admin-format.ts`(날짜·카테고리·상태 라벨), `frontend/components/admin/`(`admin-app.tsx` 셸+가드+탭, `admin-list.tsx` 공용 목록(검색+필터+페이지네이션+테이블, `reload()`를 노출하는 `forwardRef` 핸들), `overview-panel.tsx`, `members-panel.tsx`+`member-dialog.tsx`, `posts-panel.tsx`, `logs-panel.tsx`, `reports-panel.tsx`+`report-dialog.tsx`, `vehicles-panel.tsx`, `tags-panel.tsx`, `admin.module.css`), `frontend/app/admin/page.tsx`.
    - **구현/검증 결과**:
      - URL은 계획대로 단일 페이지 `/admin` + `?panel=` 쿼리스트링 탭(기본값 `overview`, 나머지는 `members`/`posts`/`logs`/`reports`/`vehicles`/`tags`)으로 구현, legacy의 7개 패널과 1:1 대응.
      - 권한 가드: `useCommunitySession`으로 세션 확인 → 비로그인은 로그인 안내, 로그인했지만 `role !== 'ADMIN'`이면 legacy와 같은 "관리자만 볼 수 있어요" 안내. 패널 초기 로드(대시보드/차량 인증/인장 현황)와 공용 목록 컴포넌트가 401/403을 받으면 즉시 같은 거부 화면으로 전환(legacy `api()`의 전역 처리와 동등). 단, 회원 상세·신고 검토 다이얼로그의 제출(PATCH 등) 중 401/403은 다이얼로그 안에 에러 메시지로만 표시되고 전체 화면 전환까지는 하지 않는다 — legacy는 모든 호출을 하나의 `api()` 헬퍼로 묶어 이 경우도 전역 전환했던 것과의 사소한 차이(보안 경계 자체에는 영향 없음, 서버가 여전히 거부).
      - 새 backend API 없음 — `lib/admin-api.ts`의 모든 함수가 기존 15개 엔드포인트(Spring `/api/admin/*`, board-service `/api/board/admin/*`)만 호출하도록 코드 대조 완료. board-service의 `GET /api/board/admin/members`는 그대로 미사용.
      - `npx tsc --noEmit` 통과, `npm run build`(Next 16.3.4, Turbopack) 통과 — `/admin`이 정적 라우트로 생성됨.
      - 로컬 `docker compose up -d --build`(`localhost:8090`, Neon 연결) + `frontend/npm run dev`(`localhost:3000`)로 실행 확인: 비로그인 상태로 `/admin`, `/admin?panel=members` 접속 시 서버 에러 없이 로그인 안내 화면이 렌더링됨(curl로 200 + 해당 문구 확인). 같은 상태로 `/api/admin/overview`, `/api/admin/members`, `/api/admin/vehicle-verifications`, `/api/board/admin/{overview,posts,reports,logs,badges}`를 익명으로 호출해 전부 401이 돌아오는 것을 확인(엔드포인트 경로가 실제로 살아 있고 인증 가드가 걸려 있음을 재확인) — 이 과정에서 mutation은 전혀 수행하지 않음.
      - **의도적으로 미검증**: ADMIN 세션이 있어야 도달하는 모든 화면/동작 — 대시보드 통계 실제 표시, 회원 검색/필터/페이지네이션/상세/수정/비밀번호 재설정/액션 로그, 게시글 관리 목록, 운영 로그 목록, 신고 검토/처리, 차량 인증 승인/거절, 등록증 이미지 링크, 인장 현황, 탭 전환 후의 각 패널 실제 렌더링. 이 환경에 ADMIN 자격증명이 없고(사용자 결정에 따라 새로 만들지 않음), DB에 직접 조회해 기존 ADMIN 계정을 찾는 것도 샌드박스가 자격증명 노출로 차단해 시도하지 않았다. 코드 대조(legacy `js/admin.js` 라인 단위 비교)만으로 로직 동등성을 확인했고, 실제 화면 동작은 ADMIN 계정을 가진 사람이 직접 `localhost:3000/admin`에서 확인해야 한다(이미 `docker compose`+`npm run dev`가 떠 있어 바로 가능).
- **NOW-2 실제 운영 배포 준비**
  - **[x] NOW-2-1 운영 frontend를 Next.js로 교체 (2026-10-06)**: `docker-compose.prod.yml`의 `frontend`만 `./frontend`(Next standalone, 이미지 `revcc-frontend:next`)로 바꿨다. 서비스명·포트(`frontend:80`, `PORT=80`)를 유지해 nginx upstream은 그대로다. 기본 `docker-compose.yml`은 계속 레거시 `assignment-frontend`를 쓴다(2026-10-11 Next.js로 이전).
    - CSP: 기존 nginx CSP(`script-src 'self'`)는 App Router 인라인 스크립트를 막는다. Next `frontend/proxy.ts`가 요청마다 nonce CSP를 보내고(루트 layout `await connection()`으로 전 페이지 동적 렌더링), nginx는 upstream이 CSP를 보내지 않은 응답(API·정적 파일·레거시)에만 기존 strict CSP를 붙인다(`$revcc_csp` map). style은 인라인 `style={...}` 때문에 `'unsafe-inline'`.
    - 같이 고친 것: Dockerfile 최종 stage에 런타임 `REVCC_API_ORIGIN`이 없어 운영 SSR이 `localhost:8090`을 호출하던 문제. prod healthcheck는 `/login`(메인 `/`은 SSR이 proxy를 불러 proxy↔frontend 순환 대기).
    - 검증: 로컬 스택에 같은 frontend 설정을 임시 overlay로 올려 nginx 경유로 확인 — 경로별 CSP 헤더 1개(Next 경로 nonce / API·정적 strict), Playwright로 7개 페이지 hydration·CSP 위반 0건·로그인 토글 동작, `scripts/nginx-forwarded-check.sh` 전부 PASS, `docker compose config`(가짜 env) 병합 확인, tsc. 검증 후 로컬 8090은 레거시로 되돌림.
    - 알려진 제약 2건(SSR rate limit 공유, `/_next/static` no-store)은 LATER-5로 옮겼다.
  - **[x] NOW-2-2 morethancar.kr 기준 URL 정리 (2026-10-06)**: prod 오버레이가 `PASSWORD_RESET_URL`도 `:?`로 요구한다(없으면 재설정 메일에 `http://localhost:8090/password-reset` 링크가 나가던 문제). prod 오버레이·`.env.example`·당시 Docker 실행 문서의 도메인 예시를 `morethancar.kr`로 바꿨다. `docker compose config`(가짜 env)로 누락 시 실패·설정 시 병합 확인.
  - **[x] 레거시 HTML 프론트엔드 정리 (2026-10-11)**: `assignment-frontend/`(40개 파일), `prototype/`, `docker-compose.override.yml`(레거시 bind mount), `docker-compose.garage.yml`(HTML+Next 병행), 레거시 DOM 대상 브라우저 스크립트 14개(`scripts/*-browser.cjs`, `post-detail-live.cjs`)를 삭제했다. 기본 `docker-compose.yml`의 `frontend`도 `./frontend`(Next, `revcc-frontend:next`, `PORT=80`, healthcheck `/login`)로 바꿔 로컬·운영이 같은 화면을 쓴다. 운영 오버레이·nginx 라우팅·API·CI는 동작 변경 없음(주석만 수정). 레거시 기록 문서(`docs/AUTH-UI.md` 등 11개)에는 레거시 안내를 붙이고 유지했다. `frontend/` 소스의 `assignment-frontend/...` 포팅 출처 주석은 그대로 둔다. (commit 406f2db)
    - 통합 검증(2026-10-11, Windows Docker, 임시 postgres/redis·별도 프로젝트명·가짜 env — Neon/`.env`/기존 `revcc-*` 컨테이너 미사용): 기본 compose와 `docker-compose.yml`+`docker-compose.prod.yml`(cloudflared 제외, 운영 네트워크 구조 그대로) 두 조합 모두 6개 서비스 healthy. nginx 경유로 API(core/board/parts), JSON 외 요청 415, 가입→로그인→core·board 세션 공유, 글 작성→메인 SSR 반영, 주요 12개 페이지 200 + nonce CSP 1개, 정적 파일 strict CSP, 404 확인(각 59건 통과). `/community` 목록은 클라이언트 렌더링이라 SSR HTML에 글이 없는 것이 정상. prod 조합에서 proxy 호스트 포트 없음, frontend→redis/core 직접 접근 차단 확인. 코드 수정 없음.
  - **[x] 부품장터 잠정 보류 + 메인 리디자인 (2026-10-11)**: 부품장터는 메뉴·푸터·메인에서 빼고 `/parts`·`/parts/*`는 커뮤니티 "부품 이야기"로 307 이동(`next.config.ts`의 `PARTS_MARKET_ENABLED`, 코드·API·데이터 유지, `89f92fb`). 메인 `/`를 화이트 테마 레퍼런스(`references/badges/레퍼런스최종.png` 01번)로 다시 만들었다: 브랜드·TIMING BOARD(P1~P5, 실제 추천순)·방금 올라온 글 3열, 서비스 바로가기, 오늘의 차고, 모터스포츠 일정(데이터 없음 안내) (`8eae7e0`). 실제 데이터만 표시(순위 변동 없음, NEW=24시간 이내 작성, 통계는 `/api/board/stats/summary`). 다음: 커뮤니티 리디자인(레퍼런스 02번) + 공통 헤더 통일. 디자인 브리프는 `docs/design/MORETHANCAR_DESIGN_BRIEF.md`.
  - **[x] 공통 헤더 + 커뮤니티 목록 리디자인 (2026-10-11)**: 모든 페이지가 `components/common/site-header.tsx` 하나를 쓴다(내 활동·알림 패널 유지, `community-header.tsx`는 재export). 색상 토큰은 `components/common/theme.module.css`, TIMING BOARD는 `components/common/timing-board.tsx`로 메인·커뮤니티 공용(`d366341`). 커뮤니티 목록은 레퍼런스 02번 기준: 게시판 TIMING BOARD P1~P10(인기글 영역만), 일반 목록은 기존 정렬·검색·차종 필터 유지, 1180px 이하 게시판 칩 추가(`c23b68e`). 메인은 모서리 10px, 보드·최신글 높이 맞춤. 검증: 임시 스택(Neon 미사용)에서 Next 빌드 + Playwright(메인·커뮤니티: 필터/검색/정렬/내 활동/알림/추천/북마크/댓글, 1440·1024·390px 가로 넘침 0). 다음: 글 상세·글쓰기 본문 → 내 차고 순으로 같은 디자인 적용.
  - **[x] 글 상세·글쓰기·내 차고 리디자인 (2026-10-12, `b0eb352`)**: 커뮤니티 모든 화면(목록·상세·글쓰기/수정·공개 차고·공개 차량)과 `/home`이 페이지 루트에 `theme.module.css`를 얹는다. `community.module.css`의 `.shell` 옛 토큰을 지우고 `.secondary`를 테마 버튼으로 통일. 글 상세는 목록과 같은 폭(1320px, 240/본문/280) — 1180px 이하는 본문 위·작성자/관련글 2열, 760px 이하는 1열. 추천·북마크 눌림=라임, 카테고리·인증 표시=라임 칩, 인장 마크=검정+라임, 댓글 등록=라임 버튼, 확인 대화상자·내 활동/알림 패널도 같은 토큰. 글쓰기는 입력칸·사진 추가 타일·하단 버튼 줄 정리. 내 차고는 레퍼런스(`내차고레퍼런스.png`) 배치를 화이트 테마로: 왼쪽 프로필 카드(커버·아바타·인장·프로필 편집/회원 탈퇴), 오른쪽 대표 차량·보유 차량·방명록(패널로 감쌈), 대화상자 4종 토큰 통일. 기능·API 호출·문구 변경 없음(마크업 배치와 CSS만). 같이 고친 기존 버그: 사이드바 "최근 본 글"이 grid 항목 최소 폭 때문에 긴 제목에서 페이지 가로 넘침(278~358px)을 만들던 문제(`grid-template-columns: minmax(0, 1fr)`). `/garage`·`/vehicles/*`(옛 다크 프로토타입, 어디서도 링크되지 않음)는 범위 밖이라 그대로 둠. 검증: 임시 스택(postgres:16·redis·현재 소스 이미지, Neon 미사용) — Next 빌드(TypeScript 통과), Playwright로 상세(추천·북마크 왕복, 댓글·답글·삭제, 신고), 글쓰기(사진+차량 연결 등록 → 수정 → 삭제), 내 차고(대표 차량 변경, 기록 추가·삭제 시 차량 대화상자 유지, 방명록) 1440·390px 26항목 API 대조 PASS, 9개 화면 × 1440·1024·390px 가로 넘침 0, 페이지 오류 0. 인증 화면(`/login`·`/signup`·`/password-reset` 3단계 한 페이지)도 같은 토큰으로: `AuthShell`에 테마, 상단 검정 3px 선의 각진 카드, 라임 제출 버튼, 카카오 노란 버튼 유지, 오류(빨강)·완료(라임) 상태 줄, "또는" 구분선, 인증번호 단계의 두 폼 사이 구분선. 로직·API·문구 변경 없음. 검증(같은 임시 스택, Next를 localhost:3000에 직접 노출): 화면 8상태 × 1440·390px 가로 넘침 0, 틀린 비밀번호 문구·비밀번호 칸 비움, 카카오 링크와 백엔드 302(kauth.kakao.com, 따라가지 않음), 중복확인(사용 중·사용 가능), 비밀번호 불일치 차단, 가입 → `/login?next=%2Fhome&joined=1` → 로그인 → `/home` 복귀, 외부 next 무시. 실패 반복 시 429 잠금도 정상 동작 확인. 재설정 2·3단계(인증번호 확인·새 비밀번호)는 실제 메일 없이 인증번호를 알 수 없어 화면만 확인(1단계 요청 → 2단계 표시까지).
  - **[x] 모터스포츠 일정 1단계: DB·API + MANAGER 역할 (2026-10-12, `13ed78f`)**: 계획 `docs/plans/MOTORSPORT-AND-SPOTS-PLAN.md` §2·§3·§5-1. Flyway V6 `V6__motorsport_schedule.sql`: `motorsport_series`·`motorsport_venues`(IANA timezone)·`motorsport_events`(현지 날짜 starts_on/ends_on, 절대 시각 starts_at, 진행 status, 공개 publication DRAFT/PUBLISHED/HIDDEN, 공식 출처 source_url·source_name, 마지막 확인일 verified_on 필수, 소프트 삭제), `board_posts.motorsport_event_id`(nullable, SET NULL), `content_admin_logs`(수행자·당시 역할·대상·작업·시각·전후 행·사유), `users_role_check`(USER/MANAGER/ADMIN, **NOT VALID** — 운영 반영 전에 Neon role 값을 읽기 전용으로 확인하고 VALIDATE). board `motorsport.js`: 공개 `/api/board/motorsport/*`(PUBLISHED·미삭제만), 운영 `/api/board/admin/motorsport/*`(MANAGER 이상 `requireCurrentStaff` — 현재 DB 역할 기준, adminRouter보다 먼저 연결, 삭제·복원만 ADMIN, 다른 운영자 일정 수정 가능). Spring: role 허용값에 MANAGER, `GET /api/admin/members/operators`·`PUT /api/admin/members/{id}/role`(ADMIN 전용, 마지막 ADMIN·자기 변경 보호, 세션 무효화, `ROLE:A>B` 기록), MANAGER도 권한 해제 전 탈퇴 불가. 기존 "role === ADMIN" 검사는 그대로라 MANAGER는 신고·회원·게시글·차량 인증 관리에 접근하지 못한다. frontend는 회원 관리 권한 선택에 MANAGER 추가(없으면 ADMIN이 운영자 정보를 저장할 때 USER로 바뀔 수 있었음)와 탈퇴 안내 문구만. 검증(임시 PostgreSQL만, Neon 미사용): `npm test` 53 pass(신규 6: 역할별·강등 세션·기존 admin API 차단·입력 검증·날짜/시간대), 시스템 테스트 8개 PASS(신규 `motorsport-system.mjs`: V1~V5 데이터 위 V6 적용·옛 role 값 허용, 공개/비공개/삭제/복원, 기간 겹침·해외 현지 날짜, 감사 로그 8단계), `mvn test` 135 run/0 fail/0 skip(PG16·PG18 각각, 신규 `OperatorRoleIntegrationTest` 5), Next 빌드·TypeScript 통과. `withdrawn-member-system.mjs`의 스키마 전체 컬럼 검사를 원래 대상 두 테이블로 좁힘(V6의 새 deleted_at 때문).
  - **[x] 관리자 화면 리디자인 + 모터스포츠 관리 UI + 운영자 권한 화면 + 파비콘 (2026-10-12, `ed803e1`)**: 구형 화면 원인 — `/admin`은 리디자인 대상에서 빠져 있었다(`admin.module.css`에 옛 파란 토큰, 이미지·캐시 문제 아님). 모든 관리자 화면이 `AdminShell`(공통 헤더·푸터, `theme.module.css`, 역할별 왼쪽 메뉴, 401/403 시 접근 거부 화면)을 쓴다. 기존 패널은 클래스 이름을 유지해 새 디자인을 받았다. globals.css의 전역 `nav{display:flex}`가 왼쪽 메뉴를 가로로 찌그러뜨려 `.sideNav`에서 해제. `/admin` 대시보드(MANAGER: 콘텐츠 현황·바로가기·와인딩 스팟 준비 중 / ADMIN: + 커뮤니티 현황·기존 `?panel=` 화면 그대로), `/admin/motorsport`(일정 목록·검색·필터, 등록(초안/공개)·수정 폼 — API 입력과 일치, 장소 시간대 기준 시작 시각 입력·KST 표시, 공개·비공개·확인일 갱신, ADMIN 삭제·복원, 재확인 대기열, 시리즈·장소, 변경 이력), `/admin/users`(ADMIN: 운영자 목록, 회원 검색, 사유 필수 + 확인 단계 권한 변경, 최근 권한 변경 기록). Spring: 역할 API에 사유 필수(`ROLE:A>B:사유`), `GET /api/admin/members/role-history`. 헤더 "관리" 링크·로그인 후 이동에 MANAGER 포함. 파비콘: 원본 `references/badges/favicon.ico`는 실제로 1254px PNG(569KB)라 그대로 두고, 진짜 ICO(16/32/48, 15KB) `frontend/app/favicon.ico`와 `apple-icon.png`(180px)를 만들어 Next 파일 규칙으로 연결. 검증(임시 PostgreSQL만): Next 빌드·TypeScript 통과, `mvn test` 135 pass, `npm test` 53 pass, Playwright 13항목(USER·비로그인 차단, MANAGER 메뉴·API 범위, 폼으로 초안 등록(현지 13:30 → 04:30Z)·수정+공개·사유 비공개·확인일 갱신·시리즈/장소 추가, ADMIN 삭제·복원, 감사 로그 7단계 수행자·역할, 기존 `?panel=` 6화면, `/admin/users` USER→MANAGER(기존 세션 401)→USER·기록·자기 변경 409), 13화면 × 1440·1024·390px 가로 넘침 0, 페이지 오류 0.
  - **[x] 공개 `/motorsport` 캘린더·리스트·상세 + 메인 미리보기 실데이터 + 헤더 메뉴 활성화 (2026-10-12, `764f18f`)**: 기존 1단계 DB·공개 API(board-service `motorsport.js`)와 admin UI를 그대로 재사용, 새 API·새 테이블 없음. `lib/motorsport-types.ts`(공개 응답 전용 타입, `lib/admin-motorsport.ts`를 손대지 않고 트리밍해 재정의), `lib/motorsport.ts`(날짜 순수 함수: `kstToday`/`eventPhase`(예정·진행 중·종료, 서버의 `status`와 별개)/`monthGrid`/`monthRange`/`dateRangeLabel`/`kstTimeLabel`/`countryName`), `lib/motorsport-api.ts`(`fetchEvents`/`fetchEvent`/`fetchSeriesList`/`fetchVenues`, `lib/community-api.ts`와 같은 `apiFetch` 패턴). `components/motorsport/`: `motorsport-page.tsx`(SiteHeader+SiteFooter+1320px 컨테이너 셸, home-shell.tsx와 같은 패턴), `motorsport-browser.tsx`(뷰·월·종목·국내해외·선택일을 URL과 동기화, `community-list.tsx`와 같은 방식), `motorsport-calendar.tsx`(6주 고정 그리드, 오늘/선택일 표시, 날짜별 점 배지), `motorsport-day-panel.tsx`·`motorsport-list.tsx`·`event-row.tsx`(날짜별 그룹 리스트, 종목·예정진행중종료·취소변경잠정 태그), `motorsport-detail.tsx`(경기명·종목·장소·국가(`Intl.DisplayNames`)·일시·설명·공식출처링크). `/motorsport/[id]`는 `/community/[category]/[id]`와 같은 `params: Promise` 패턴, id 범위 검증 후 404. 메인 미리보기(`motorsport-preview.tsx`)는 `lib/server-api.ts`의 `fetchUpcomingMotorsportServer`(오늘부터 92일, 공개 API 1회 한도)로 실데이터 연결(`app/page.tsx`가 `Promise.allSettled`에 추가), 데이터 없으면 기존 "준비 중" 안내 유지. 헤더 활성화는 `lib/services.ts`의 motorsport 항목에 `href: '/motorsport'` 한 줄만 추가(SOON 제거·메뉴 바로가기·`ServiceShortcuts`가 전부 이 값을 읽으므로 자동 반영), `site-header.tsx`의 `activeService()`에 `/motorsport` 분기만 추가. 검증(로컬 Docker PostgreSQL만, Neon 미접근): `npx tsc --noEmit`·`next build` 통과(`/motorsport`·`/motorsport/[id]` 라우트 생성 확인). 로컬 DB에 테스트 ADMIN 계정 1개·장소 1개·시리즈 1개(F1)·일정 4개(이번 달 예정 RACE·오늘 진행 중 TRACK_DAY·지난달 종료 EVENT·다음 달 RACE)를 관리자 API로 등록해 Chrome으로 확인: 캘린더(오늘 강조, 점 배지, 날짜 클릭 시 해당일 패널 — `2026-10-25` 클릭 → 1건·시각·태그 정상), 리스트(날짜별 그룹, 월 이동 시 11월 데이터 전환, 종목 필터 적용 시 빈 상태 문구), 상세 페이지(요청된 필드 전부 + "대한민국" 국가명 + 공식 링크), 메인 미리보기(가까운 순 3건, "전체 보기" 링크), `/admin/motorsport`(기존 관리자 기능 회귀 없이 4건 그대로 표시). 반응형은 `resize_window` 도구가 실제 뷰포트를 바꾸지 못하는 기존 결함이 재현되어(STEP 3-6 기록과 동일 증상) 스크린샷 대신 컴파일된 CSS의 1180/860/760/600px 미디어 쿼리가 실제 렌더링된 해시 클래스명과 정확히 일치하는지 `document.styleSheets`로 대조해 확인했다(진짜 좁은 뷰포트 스크린샷은 못함 — 재확인 필요). 검증에 쓴 로컬 테스트 데이터(장소·시리즈·일정 4건·테스트 ADMIN 계정)는 확인 후 로컬 DB에서 삭제했다.
    - **[x] 최종 QA (2026-10-12, `764f18f`에 포함)**: 신규 기능 착수 전 점검 9항목. 버그 1건 발견·수정: `event-row.tsx`의 `.rowDate`에 `font-size`를 지정하지 않아 본문 기본 16px이 적용됐고, 월을 넘는 날짜 범위("12.30 – 1.2")가 고정폭 76px 컬럼(+gap 12px)을 넘쳐 제목과 겹쳤다(실측 scrollWidth 92px > 예산 88px — 직전 홈 "방금 올라온 글" 날짜 겹침 버그와 같은 유형). `.rowDate`에 `font-size: 13px` 지정 + 컬럼을 88px로 넓혀 수정(13px 기준 최악 케이스 "11.30 – 12.31" 실측 85px < 88px 예산, canvas로 확인). 부수 수정: `motorsport-browser.tsx`에서 날짜를 선택하지 않은 채 월만 이동하면(예: 12월로 이동) 오른쪽 패널이 계속 `today`(10월 12일) 기준으로 남아 "이 날짜에는 일정이 없어요"가 뜨던 문제 — 표시 중인 달이 이번 달이 아니면 그 달 1일을 기본값으로 쓰도록 변경. 로컬 ADMIN·MANAGER 계정과 경계용 테스트 일정 5건(오늘 하루=진행중, 내일=예정, 어제=종료, 12.30~1.2=연말연시 경계, 12.31=월말 단독)을 다시 등록해 Chrome으로 확인: ①**1440px(PC)만 실제 스크린샷으로 확인**, 390px/768px는 이 세션의 `resize_window`가 실제 뷰포트를 바꾸지 못하는 기존 결함이 재현됐고 사이트 자체 CSP(`frame-ancestors 'none'`)가 iframe 임베드로 우회하는 것도 막아 **실제로 확인하지 못함 — 검증 완료로 표시하지 않음, 다른 환경에서 재확인 필요**. ②캘린더·리스트·메인미리보기 전체 날짜 겹침 0건(`getBoundingClientRect`로 실측, 수정 전 발견한 1건 포함). ③월 이동(10→11→12→1월, 이전 달도) 날짜 계산 정확, "오늘" 버튼으로 2026-10 정확히 복귀. ④12월 그리드에 1월 1·2일(옅게, 다음달)까지 연말연시 걸침 이벤트 점 정상 표시, 1월 그리드에 12월 30·31일(옅게, 이전달)도 정상 — 월·연 경계 둘 다 깨짐 없음. ⑤`kstTimeLabel`이 `timeZone:'Asia/Seoul'`을 명시해 뷰어의 로컬 타임존과 무관하게 항상 KST로 표시됨(코드 확인 + 실제 렌더링 "오후 3:00" 확인, 이 세션 브라우저 자체가 이미 Asia/Seoul이라 다른 타임존에서의 실측은 못 함). ⑥상태 계산 경계: 어제=종료, 오늘(하루짜리, startsOn=endsOn=오늘)=진행 중, 내일=예정 전부 정확. ⑦완전히 빈 달(2026-03)·빈 날짜·필터 결과 없음 전부 정상 문구. ⑧홈 미리보기 행 클릭 → 정확히 그 일정의 `/motorsport/{id}`로 이동 확인. ⑨MANAGER로 로그인해 `/admin/motorsport` 확인 — 화면에 "삭제" 버튼 자체가 없음(ADMIN 화면엔 있음), API로 직접 `DELETE`도 403("관리자만 할 수 있는 작업입니다"), MANAGER가 할 수 있는 확인일 갱신은 200 — 서버 인가까지 재확인(기존 1단계 로직, 이번에 손대지 않음, 회귀 없음 확인). 검증에 쓴 로컬 테스트 데이터는 확인 후 전부 삭제. 운영 Neon은 전 과정 읽기 전용(게시글 21·회원 33·모터스포츠 일정 0 불변)만 확인했다.
    - 남은 것: 390px/768px 실제 뷰포트 확인(이 세션 도구로는 불가능했음 — 실기기·다른 환경 또는 `resize_window` 결함이 고쳐진 뒤 재확인), 커밋 여부 확인 후 반영.
  - **[x] 게시글 ↔ 모터스포츠 일정 연결 (2026-10-12, `c81c99c`)**: 새 테이블·새 API 없음 — V6의 `board_posts.motorsport_event_id`(1단계에서 이미 추가)와 기존 `/api/board/posts` CRUD만 확장. `vehicleId` 연결 패턴(존재 확인 → id만 저장, PUT은 body에 키가 있을 때만 바꿔 "안 건드리면 기존 링크 유지, 명시적 null만 해제")을 그대로 미러링했다.
    - **board-service(`community.js`)**: `postInput()`이 `motorsportEventId`를 `motorsport_events WHERE id=$1 AND deleted_at IS NULL AND publication='PUBLISHED'`로 검증(존재하지 않거나 초안·비공개·삭제된 id는 400 — STEP 5.1·5.2를 입력 단계에서 막는다). `postSelect`에 `motorsportEventId`(원본 컬럼, 비공개·삭제 후에도 유지)와 `linkedMotorsportEvent`(공개 중일 때만 채워지는 `{id,kind,title,startsOn,endsOn}` — 일정이 나중에 비공개·삭제되면 이 값만 자동으로 null이 되어 글 쪽 카드가 조용히 사라진다, 벡터는 유지돼 다시 공개되면 카드도 돌아온다) 추가. `GET /posts`에 `motorsportEventId` 필터 추가(`linkedPostCount`(motorsport.js)와 정확히 같은 조건이라 두 숫자가 항상 일치 — `/motorsport/{id}`의 "연결된 이야기" 목록이 이걸 쓴다). 인증·소유권 검사(POST는 `auth`, PUT은 `author_id=$3`)는 전혀 손대지 않음.
    - **에디터(`post-editor.tsx`)**: "모터스포츠 일정 연결(선택)" select를 차량 연결 select 바로 아래 같은 스타일로 추가. 공개 일정을 오늘 기준 -14~+78일(공개 API의 92일 한도 안에서 가까운 일정 쪽으로 치우침) 범위로 불러온다. 차량과 달리 **창 밖의 기존 링크를 자동 해제하지 않는다** — 그러면 의도치 않게 끊길 수 있어서, `fetchPost`가 돌려준 `linkedMotorsportEvent`가 있으면(공개 중이지만 날짜 창 밖) 목록 맨 앞에 끼워 넣고, 그것도 null인데 `motorsportEventId`는 남아 있으면(비공개·삭제됨) select는 건드리지 않은 채 "현재 비공개 처리되었거나 삭제된 일정에 연결되어 있어요. 그대로 두면 유지돼요." 안내만 보여준다(제출 시 `motorsportEventId` 키를 그대로 안 건드리면 서버도 안 바꾼다).
    - **글 상세(`post-context.tsx`)**: 오른쪽 사이드바에 "연결된 모터스포츠 일정" 카드(종목·기간·제목, `/motorsport/{id}`로 이동) 추가 — `post.linkedMotorsportEvent`가 있을 때만 렌더링되므로 비공개·삭제 시 자동으로 숨는다(STEP 3.4 "기존 게시글 디자인 유지": 본문(`post-article.tsx`)은 손대지 않고 기존에 `linkedVehicle`이 쓰던 사이드바 카드 패턴만 재사용).
    - **모터스포츠 상세(`motorsport-detail.tsx`)**: `LinkedPosts` 컴포넌트가 `fetchPosts({motorsportEventId, sort:'latest'})`로 "이 일정에 관한 이야기" 목록(썸네일·작성자·추천·댓글수, 없으면 "첫 이야기 남기기" 빈 상태)을 보여준다. 새 CSS는 `.postRow`/`.postThumb`/`.postThumbEmpty`만 추가(날짜 컬럼 폭 가정이 섞이지 않도록 이벤트 행의 `.row`와 분리).
    - **타입**: `community-types.ts`에 `LinkedMotorsportEvent`, `CommunityPost.motorsportEventId`/`linkedMotorsportEvent`, `PostInput.motorsportEventId`. `community-api.ts`의 `FetchPostsParams`에 `motorsportEventId` 추가.
    - **검증**: `npx tsc --noEmit`·`next build` 통과. **기존 테스트 회귀 1건 발견·수정**: `board-service/test/app.test.js`가 `postInput()`이 돌려주는 INSERT 파라미터 배열을 통째로 `deepEqual`로 검증하고 있어서, 새로 추가된 `motorsportEventId`(항상 마지막 요소, 값 없으면 `null`) 때문에 실패했다 — API 동작 자체의 버그가 아니라 테스트 fixture가 옛 파라미터 개수를 기대하고 있던 것이라 기대값에 `null` 하나를 추가해 고쳤다. 이후 `npm test`(Node 22) 53/53, `mvn test` 135/0 fail 전부 통과. 로컬 Docker PostgreSQL에 테스트 ADMIN·작성자 계정과 공개 일정 하나를 만들어 API로 직접 확인(curl): ①일정 연결 게시글 작성 성공, 상세 조회 시 `linkedMotorsportEvent` 정확히 반환 ②일반 게시글(연결 없음) 작성 시 두 필드 다 null ③`motorsportEventId:null`로 PUT → 해제 확인, 반대로 키를 아예 안 보낸 PUT → 기존 링크(10) 그대로 유지 확인 ④`/motorsport/{id}`의 `linkedPostCount`(1)와 `GET /posts?motorsportEventId=`(1건, 같은 글)가 정확히 일치 ⑤작성자 아님(ADMIN 포함) PUT → 기존 그대로 403 ⑥존재하지 않는 id(999999) 연결 시도 → 400 ⑦일정을 관리자 API로 `hide` 처리한 뒤: 그 id로 새 글 연결 시도 → 400, 이미 연결돼 있던 기존 글은 `motorsportEventId`(10)는 그대로인데 `linkedMotorsportEvent`만 null로 바뀜(의도대로 카드 숨김) 확인 후 다시 `publish`로 복구. `/`, `/community`, `/motorsport`, `/login`, 연결한 글 상세, 연결한 일정 상세 전부 HTTP 200 회귀 확인. **UI 시각 확인(에디터 select 렌더링, 사이드바 카드, 겹침 여부 등)은 세션 내내 Chrome 확장 연결이 끊겨 있어 못 했다 — 다음 세션 최우선으로 재확인 필요.** 검증에 쓴 로컬 테스트 데이터(계정·장소·일정·게시글)는 전부 삭제. 운영 Neon은 전혀 접근하지 않음(API 서버가 로컬 postgres에만 연결된 상태로 전부 진행).
    - 남은 것: 위 Chrome UI 시각 확인(에디터 select 렌더링, 사이드바 카드, 겹침 여부 — 이 세션도 Chrome 확장 연결 불가로 못 함, 다음 세션 최우선).
  - **[x] GitHub 레포 이름 변경 (2026-10-12)**: `namgiju/rev.cc` → `namgiju/morethancar`(사용자가 GitHub에서 직접 변경). 로컬 `origin`을 새 주소로 갱신하고 `git fetch`로 연결 확인, `main`/`origin/main` 동기화 확인 후 위 두 작업을 `docs: rename REVCC_NEXT_TASKS.md to MORETHANCAR_NEXT_TASKS.md`(`3e6ddc7`)와 `feat(community): link posts to motorsport events`(`c81c99c`) 두 커밋으로 나눠 push. 코드 식별자·Docker 서비스명·DB 이름은 변경하지 않음(레포 이름과 독립적).
  - **[x] 스팟(와인딩·심레이싱) V7 + `/spots` + `/admin/spots` (2026-10-12, `d99ace2`·`cc1ddae`·`500d2f3`·`1c6111b`, main에 push·CI(`38209876915`) 통과)**: 지시에 따라 계획(`docs/plans/MOTORSPORT-AND-SPOTS-PLAN.md`)의 결정 2(심레이싱 제외, 와인딩 3종만)를 뒤집고 WINDING·SIM_RACING 2개 카테고리로 구현. 결정 5(제보자 분리)·공개 제보/`spot_corrections`/`spot_content_removals`는 이번 범위에서 제외(관리자 직접 등록만, STEP 8에 따라 리뷰 시스템 안 만듦).
    - **DB**: Flyway `V7__drive_spots.sql`. `drive_spots`(공통: category·name·region·address·latitude/longitude·description·image_url·publication DRAFT/PUBLISHED/HIDDEN; WINDING 전용: route_start/route_end/distance_km/duration_minutes/route JSONB/recommended_time/caution; SIM_RACING 전용: business_hours/official_url/reservation_url/facility_info/price_info — 카테고리별 필수값은 CHECK로 강제), `board_posts.spot_id`(컬럼만 추가, 연결 UI는 안 만듦 — 향후 확장용), `content_admin_logs.entity_type` CHECK를 `SPOT`까지 확장(V6은 손대지 않고 ALTER로). 로컬 Postgres에 트랜잭션으로 올려 CHECK 제약(카테고리별 필수값, 좌표 범위)과 롤백 동작을 직접 확인했고, `docker compose build/up`으로 실제 Flyway 런(core 컨테이너)까지 거쳐 `flyway_schema_history`에 V7이 기록됨을 확인했다 — 운영 Neon 미접근.
    - **board-service(`spots.js`, 신규)**: motorsport.js와 같은 구조. 공개 `GET /api/board/spots`(?category&region&q&bbox&limit, PUBLISHED·미삭제만, bbox 없으면 전체 최대 200개), `GET /api/board/spots/:id`. 운영 `GET/POST/PUT /api/board/admin/spots`, `/:id/publish`·`/hide`(MANAGER 이상), `DELETE`·`/:id/restore`(ADMIN, `requireCurrentStaff` 재사용), `GET /logs`(`/:id`보다 먼저 등록해야 함 — 안 그러면 "logs"가 id 파라미터로 잘못 매칭되어 400, 테스트로 발견·수정). `app.js`에 `/api/board/admin/spots`를 `adminRouter`보다 먼저, `/api/board/spots`를 `communityRouter`보다 먼저 연결. `oneOf`/`webUrl`은 motorsport.js에서 그대로 import(중복 구현 안 함).
    - **지도**: 계획의 결정 6(카카오맵 우선)대로 카카오맵 JS SDK 어댑터(`lib/kakao-maps.ts`) 작성. **실제 API 키는 아직 없음**(사용자가 카카오 개발자 콘솔에서 직접 발급하기로 함 — 로그인용 `KAKAO_CLIENT_ID`와는 다른 "JavaScript 키"가 따로 필요, 발급 후 `.env`의 `KAKAO_MAP_KEY`에 넣고 콘솔에 `https://morethancar.kr`·`http://localhost:3000` 도메인 등록 필요). 키가 없으면 지도는 "지도를 불러올 수 없어요" 안내만 뜨고 목록·필터·내 주변 찾기는 전부 정상 동작(지도 로딩이 다른 기능을 막지 않음, 실제 지도 렌더링은 키 발급 후 브라우저로 재확인 필요). `KAKAO_MAP_KEY`는 `NEXT_PUBLIC_` 접두사를 안 쓴다 — `REVCC_API_ORIGIN`과 같은 이유로 이미지를 한 번 빌드해 여러 환경에 돌리므로, 서버 컴포넌트(`app/spots/page.tsx` 등)가 런타임에 `process.env.KAKAO_MAP_KEY`를 읽어 클라이언트 컴포넌트까지 prop으로 내려준다. CSP(`proxy.ts`)에 `img-src`/`connect-src`로 카카오 도메인(`dapi.kakao.com`, `*.daumcdn.net`) 추가 — 공개 문서 기준 best-effort라 실제 키로 띄워본 뒤 Network 탭으로 재확인 필요.
      - **[x] 실제 키 연결 + 지도 렌더링 버그 수정 (2026-10-12, `1c6111b`)**: 사용자가 카카오 개발자 콘솔에서 JavaScript 키를 발급하고 "지도" 제품을 활성화한 뒤(로그인용 `KAKAO_CLIENT_ID`와는 다른 키) `.env`의 `KAKAO_MAP_KEY`에 반영, `docker compose up -d frontend`로 재기동(런타임에서 읽으므로 재빌드 불필요). 처음엔 지도 컨테이너·마커는 뜨는데 도로·건물 타일만 안 보이는 증상 — **원인**: `proxy.ts`의 CSP `img-src`/`connect-src`가 타일 도메인을 `*.daumcdn.net`으로 추정해뒀는데, 실제 브라우저 Network 탭으로 확인한 도메인은 `dapi.kakao.com`(스크립트, 이미 허용됨)·`t1.kakaocdn.net`·`mts.kakaocdn.net`(타일·마커 이미지)이라 CSP가 조용히 차단하고 있었다(외부 `curl`로 같은 URL을 찔러보면 CSP는 브라우저만 강제하는 정책이라 200이 떠서 서버 쪽엔 전혀 문제가 없어 보였다 — 이 때문에 처음엔 "서버가 느리거나 막혔나" 하고 헷갈렸다). **수정**: `img-src`/`connect-src`에 `*.kakaocdn.net`을 스킴 없이 추가(로컬 http·운영 https 둘 다 매치), `*.daumcdn.net`은 혹시 다른 카카오 서비스가 쓸까봐 그대로 둠. `docker compose build/up frontend`로 반영 후 재확인 — 전국 지도(도로·지명·고속도로 번호)와 서울 강남 상세 지도(건물·지하철역) 둘 다 정상 렌더링 확인.
      - **[x] 실제 데이터로 지도·목록 연동 확인**: 로컬 DB에만 임시 공개 스팟 2건(와인딩 "미시령 옛길" #1, 심레이싱 "서울 심레이싱 센터" #2, `created_by`는 기존 회원 id 재사용 — ADMIN 계정 생성·세션 로그인 없이 SQL로 직접 등록해 범위를 최소화) 등록해 Chrome으로 확인: ①지도에 카테고리별 색 마커(와인딩 초록·심레이싱 파랑) 정상 표시 ②목록 항목에 마우스를 올리면 지도가 그 스팟으로 pan, 지도 마커를 클릭하면 목록에서 해당 항목이 선택 표시(밑줄) — 지도·목록 양방향 연동 확인 ③목록 클릭 → `/spots/{id}` 상세 이동 확인 ④와인딩 상세: 코스 시작·종료·거리·시간·소개 + 공공도로 안전 고정 안내 문구 전부 정상 표시, `route` 데이터가 없어 임의 경로선 없이 점 하나만 표시(지시대로) ⑤심레이싱 상세: 운영시간·이용요금·소개 정상 표시, `officialUrl`/`reservationUrl`을 비워뒀더니 두 버튼 모두 안 보임(지시대로) ⑥모바일 폭(761px, 이 세션 `resize_window`가 실제로는 안 먹어서 생긴 우연한 폭)에서 목록이 지도 위에 쌓이는 반응형 레이아웃도 확인. 확인 후 SQL로 스팟 2건 전부 삭제, 로컬 DB에 스팟 0건으로 원복. 운영 Neon·AWS는 전혀 접근하지 않음, git commit/push도 안 함.
      - 아직 못 한 것: PC 1440px 폭에서의 실제 스크린샷(이 세션 `resize_window`가 실제 뷰포트를 못 바꾸는 기존 결함 재현, 761px에서만 확인), 태블릿 768px, "내 주변 찾기" 버튼의 실제 Geolocation 권한 플로우(테스트 중엔 거리순 정렬 없이 목록·지도만 확인), 지도를 실제로 드래그해서 bbox 재조회가 동작하는지, 관리자 등록 폼(`/admin/spots`)에서의 지도 클릭 좌표 입력 — 전부 다음 세션에서 재확인 필요.
    - **공개 화면**: `/spots`(`spots-browser.tsx`: 카테고리·지역·거리순/최신순 필터를 URL과 동기화, "내 주변 찾기" 버튼이 브라우저 Geolocation API 호출(버튼 누를 때만 권한 요청, 거부해도 서비스 이용 가능, 위치는 서버에 저장 안 함, `lib/geolocation.ts`가 권한 거부·타임아웃·미지원을 구분해 안내), Haversine 직선거리로 정렬·표시(실제 도로거리와 다름을 "직선거리"로 명시). 지도 패널(`spots-map.tsx`)은 bbox 이동 시 디바운스(400ms)로 추가 스팟을 받아 목록과 병합해 지도·목록이 같은 데이터셋을 공유), `/spots/[id]`(`spot-detail.tsx`: 카테고리별 분기 — 와인딩은 코스 시작/종료·거리·시간·추천방문시간·주의사항 + 공공도로 안전 고정 안내, 심레이싱은 운영시간·요금·시설특징·공식홈페이지/예약 링크(없으면 버튼 자체를 안 보여줌), `spot-route-map.tsx`가 route 데이터 있으면 경로선, 없으면 점 하나만 — 임의로 경로를 만들지 않음). 모바일은 목록/지도 토글(지도는 DOM에 유지해 재로딩 안 함), 1180/860/760/600px 반응형. 헤더 메뉴(`lib/services.ts`)의 `spots` 항목에 `href: '/spots'` 연결, 설명 문구를 "가까운 와인딩 코스와 심레이싱 시설 찾기"로 변경(결정 2 이전 원래 문구로 복귀).
    - **관리자 화면**: `/admin/spots`(`spots-admin.tsx`: motorsport-admin.tsx와 같은 패턴, 탭은 스팟 목록·변경 이력 2개뿐 — 시리즈/장소 카탈로그·재확인 대기열 없음). 등록 폼(`spot-dialog.tsx`)은 카테고리에 따라 필드가 바뀌고, 카카오맵 키가 있으면 지도를 클릭해 좌표를 지정하는 보조 입력도 뜬다(없으면 숫자 입력 안내만). `AdminShell`의 `spots` 메뉴에 href 연결, `/admin` 대시보드의 "와인딩 스팟 준비 중" 카드를 실제 링크로 교체.
    - **검증**: `board-service`는 Node 20 로컬 환경이 `sanitize-html@2.17.7`(Node ≥22.12 요구) 때문에 전체 테스트가 깨지는 **기존 환경 문제**를 발견(모터스포츠 등 기존 테스트도 동일하게 실패, 이번 작업과 무관) — `node:22-alpine` 컨테이너로 우회해 신규 `spots.test.js` 포함 57/57 전부 통과(역할별 403/401, 카테고리별 필수값·URL·좌표 검증, bbox/limit 검증). `npx tsc --noEmit`·`next build` 통과(`/spots`·`/spots/[id]`·`/admin/spots` 라우트 생성 확인). `docker compose build/up`으로 core·board·frontend 재빌드·재기동해 실제 스택에서 `/spots`·`/spots/[id]`·`/admin/spots`·`GET /api/board/spots` 200 확인, 기존 `/`·`/motorsport`·`/community`·`/admin`·`/login`·기존 API 전부 200 유지(회귀 없음). 브라우저 UI 확인은 위 "실제 키 연결" 항목에 기록(지도 렌더링 버그 1건 발견·수정 포함).
      - **[x] `mvn test` 재시도 — 통과 (2026-10-12)**: 로컬 Java 22 vs pom 요구 23 불일치로 호스트에서는 못 돌리던 문제를 해결 — Testcontainers가 아니라 `REVCC_TEST_DB_PORT`/`REVCC_TEST_REDIS_PORT`로 외부 DB를 가리키는 방식(`docs/DATABASE-MIGRATIONS.md`)이라, 임시 `postgres:16`(db `revcc_test`)·`redis:7-alpine`을 `--network host`로 띄우고 `maven:3.9.9-eclipse-temurin-23` 컨테이너도 같은 `--network host`로 실행해 `127.0.0.1`로 서로 보이게 했다(테스트 코드가 호스트를 `127.0.0.1`로 하드코딩해 기본 브리지 네트워크로는 안 닿음). **135/135 테스트 통과, BUILD SUCCESS.** 빈 DB에 V1~V7 전체 Flyway 마이그레이션이 깨끗하게 적용됨을 확인("Successfully validated 7 migrations", schema version 7) — V7이 기존 마이그레이션 체인과 충돌 없음을 실증. 테스트용 postgres/redis 컨테이너는 종료 후 삭제.
    - **[x] MANAGER/ADMIN 권한 검증 (2026-10-12)**: 로컬 전용 테스트 계정 3개(`permtest_manager`/`permtest_admin`/`permtest_user`, 실제 `/api/auth/signup`으로 생성 후 SQL로 role만 승격)로 API 23건 + 브라우저 UI 확인, 전부 통과 후 계정·테스트 데이터 전부 삭제.
      - API(curl, 세션 쿠키 사용): MANAGER — 모터스포츠 일정/장소 등록·수정·공개·비공개·확인일 갱신 전부 200, 스팟 등록·수정·공개·비공개 전부 200, 두 경우 다 **삭제·복원은 403**(ADMIN 전용, 기존 정책 그대로). ADMIN — 위 전부 200 + 삭제(204)·복원(200) 정상. USER — 모든 운영 API 401/403, 기존 `/api/board/admin/*`(신고·회원·게시글)도 MANAGER에게 여전히 403(회귀 없음). 23/23 PASS.
      - 브라우저 UI: `permtest_manager` 로그인 → `/admin/spots`·`/admin/motorsport` 사이드바에 콘텐츠 메뉴만 보이고 회원/신고/게시글/로그 등 ADMIN 전용 메뉴는 숨겨짐, 스팟 목록 작업 칸에 "수정/비공개"만 있고 **삭제 버튼 자체가 없음**. `permtest_admin` 로그인 → 전체 메뉴 노출, "삭제" 버튼 존재·클릭 시 사유 입력 다이얼로그·실제 삭제까지 end-to-end 확인. `permtest_user` 로그인 → `/admin/spots` 접속 시 "접근 권한이 없어요" 거부 화면, 헤더에 "관리" 링크 자체가 없음. 권한 문제 발견 없음 — 기존 정책과 100% 일치해 별도 수정 안 함.
    - **[x] 회귀 테스트 (2026-10-12)**: `permtest_user`로 로그인 → 커뮤니티 글쓰기(제목·본문 작성 → 등록 → 상세 페이지 정상 렌더 → 삭제까지 확인, 작성자 본인 삭제 플로우 포함) → 내 차고(`/home`, 프로필·차량 섹션 정상) → 모터스포츠 공개 캘린더(`/motorsport`, 빈 상태 정상) 전부 정상. `/spots` 공개 목록·상세·지도는 위 "실제 데이터로 지도·목록 연동 확인" 항목에서 이미 확인. 자동 테스트: `npm test`(board-service, Node 22) 57/57, `mvn test`(backend) 135/135 — 전부 재확인 완료, 실패 0건.
    - **[x] 배포 준비 점검 (2026-10-12, 운영 Neon은 읽기 전용 세션으로만 접속 — `default_transaction_read_only=on`으로 세션 자체를 쓰기 불가 상태로 강제)**:
      - **V7 충돌 가능성**: 없음. Neon의 `flyway_schema_history`는 V6까지만 적용됨(V7 미적용 확인), `drive_spots` 테이블·`board_posts.spot_id` 컬럼·`content_admin_logs`의 SPOT entity_type 전부 아직 없음 — V7은 전부 신규 추가뿐이라 기존 데이터와 충돌하지 않는다. 운영 테이블 규모도 작다(`board_posts` 21행, `users` 33행, `motorsport_events`·`content_admin_logs` 0행) — 적용 시간은 밀리초 단위로 예상.
      - **`users_role_check`**: V6에서 `NOT VALID`로 들어간 뒤 지금까지 `VALIDATE CONSTRAINT`를 안 함. 운영 `role` 값은 `ADMIN` 1·`USER` 32뿐이고 예상 밖 값 없음 — 전부 체크를 이미 만족하므로 `VALIDATE CONSTRAINT users_role_check`는 안전하게 실행 가능(여전히 **사람이 운영 반영 시점에 직접 실행** — 이번 세션은 읽기 전용이라 실행하지 않음).
      - **백업**: 저장소에 운영 DB 백업·복구 절차 문서가 없었다(확인됨 — `docs/`에 없음, `revcc_backup.dump`는 2026-09-28 로컬 수동 덤프로 이번 작업 이전 것). `pg_dump`는 읽기 전용이라 이번 세션에서 바로 떠서 이전 Mac의 `<로컬 백업 경로>`(새 MacBook으로 옮겼는지는 확인 안 됨, 커스텀 포맷, 9.1MB, 219 TOC 항목, `pg_restore --list`로 유효성 확인함, **저장소 밖**이라 git에 안 잡힘)로 남겼다. 복구 명령: `pg_restore --clean --if-exists -d "<연결 문자열>" neon-pre-v7-*.dump`(운영 쓰기 작업이라 실행 안 함). Neon 자체 PITR(브랜치/시점 복구) 설정 여부는 웹 콘솔 접근 권한이 없어 확인 못 함 — 사람이 Neon 콘솔에서 보존 기간을 확인해야 한다.
      - **환경변수**: `KAKAO_MAP_KEY`가 `docker-compose.yml`·`docker-compose.prod.yml` 양쪽 frontend 서비스에 `${KAKAO_MAP_KEY:-}`로 연결됨(런타임 읽기라 이미지 재빌드 불필요, `REVCC_API_ORIGIN`과 같은 방식) 확인. **단, EC2 서버의 운영 `.env`에는 아직 이 키가 없을 것**(로컬 `.env`에만 방금 추가함) — 운영 반영 시 사람이 추가해야 한다. 아래 NOW-2-3 체크리스트에도 추가해둠.
      - **CSP**: nginx(`nginx/default.conf`)의 폴백 CSP는 upstream이 CSP를 안 보낸 응답(API·정적 파일)에만 붙고, `/spots` 등 Next 페이지는 항상 `proxy.ts`가 보내는 nonce CSP를 쓰므로 운영에서도 로컬과 동일하게 동작할 것으로 판단(아키텍처상 확인, 실제 운영 도메인 접속 테스트는 아님). `img-src`/`connect-src`의 `*.kakaocdn.net`은 스킴을 지정하지 않아 로컬 http·운영 https 둘 다 매치한다 — 다만 카카오 SDK가 운영(https) 환경에서 타일을 http로 요청하면 브라우저가 혼합 콘텐츠로 자체 차단할 수 있는데, 이건 로컬(http 페이지)에서는 재현되지 않는 문제라 **실제 운영 도메인(https)에 배포한 뒤 Network 탭으로 재확인 필요**.
    - 남은 것: ① (선택) 게시글 ↔ 스팟 연결 UI(컬럼만 있고 미구현), ② 운영 반영 전: Neon 읽기 전용으로 role 값 재확인 후 사람이 `VALIDATE CONSTRAINT users_role_check` 실행, ③ 운영 `.env`에 `KAKAO_MAP_KEY` 추가, ④ Neon PITR 보존 기간을 콘솔에서 확인, ⑤ 실제 운영 https 도메인에서 카카오 지도 타일 로딩 재확인, ⑥ EC2 자동 시작 차단(NOW-2-3 재검토 참고) — 이번 세션에서 AWS는 전혀 건드리지 않음.
  - **[ ] NOW-2-3 배포 직전 사람이 할 일** (코드 작업 없음, 순서대로) — 2번 근거가 없어 미완료로 둔다. 2026-10-19 문서 기록 대조: 1·4는 10-13 prod 오버레이 기동 성공(필수 env 누락이나 Compose < 2.24면 기동 자체가 안 됨), 3은 cloudflared healthy + morethancar.kr 200, 5는 `972bdfd`(2026-10-12)부터 로컬 compose가 Neon을 참조하지 않아 이 MacBook은 해당 없음(이전 Windows 스택 정지 여부는 기록 없음), 6은 10-13 Flyway V7 직접 조회로 대체. **2(카카오 콘솔 운영 Redirect URI·사이트 도메인)는 기록 없음**, 7은 선택이라 미실행:
    1. 운영 `.env` 작성(`.env.example` 기준). 필수(`:?`): `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`, `REDIS_PASSWORD`(영문·숫자, `openssl rand -hex 32`), `WITHDRAWAL_HMAC_SECRET`(32자 이상, 없으면 core 기동 거부), `CLOUDFLARE_TUNNEL_TOKEN`, `KAKAO_REDIRECT_URI=https://morethancar.kr/api/auth/kakao/callback`, `PASSWORD_RESET_URL=https://morethancar.kr/password-reset`. 기동은 되지만 기능에 필요: `PASSWORD_RESET_SECRET`(32자 이상, 없으면 재설정 503), `SMTP_*`(없으면 재설정 메일 미발송 — LATER-3상 오류도 안 보임), `KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`, `KAKAO_MAP_KEY`(2026-10-12 추가 — 없으면 `/spots` 지도가 "지도를 불러올 수 없어요" 안내만 뜨고 목록은 정상 동작, 카카오 개발자 콘솔에서 로그인용과 별도로 발급한 JavaScript 키, 사이트 도메인에 `https://morethancar.kr` 등록 필요). `SESSION_COOKIE_SECURE`는 prod 프로파일이 true로 고정하므로 넣지 않아도 된다.
    2. 카카오 개발자 콘솔 Redirect URI에 `https://morethancar.kr/api/auth/kakao/callback` 등록, 사이트 도메인에 `https://morethancar.kr` 추가.
    3. Cloudflare: `morethancar.kr` 존 추가 → Named Tunnel Public Hostname `morethancar.kr` → `http://proxy:80`(현재 `docs/DEPLOYMENT.md` 절차).
    4. 운영 서버에서 `docker compose version` ≥ 2.24 확인(prod 오버레이의 `!reset`/`!override`).
    5. 같은 Neon에 붙은 다른 인스턴스 전부 정지: Mac 로컬 스택, Windows 로컬 스택(`docker compose stop` — 컨테이너는 지우지 않음). 옛 board는 본인 글을 실제로 지우고 모든 사진을 공개한다(STEP 10-impl-B 혼합 배포 주의).
    6. Neon 읽기 전용 확인(2026-10-06 자동 권한 검사로 에이전트 실행이 막혀 사람이 실행): Flyway 최신 버전이 5이고 실패 없음, `account_status` 분포. 메모상 2026-10-04 기준 V5 적용 완료라 새 마이그레이션은 없다.
    7. 선택: 필요 없는 Neon `board_test_posts_archive` 정리.
    - **재가동 기준 재검토 (2026-10-12)**: morethancar.kr은 AWS EC2에 이미 구축·배포했고 비용 때문에 인스턴스만 중지한 상태다(사용자 확인). 위 7개는 신규 구축 기준이라 "기존 서버 재가동 + 최신 코드 반영"으로 다시 읽는다. 저장소에는 EC2 배포 기록(인스턴스, 배포 날짜·커밋, 사용한 compose 명령, 외부 진입 방식)이 없다 → 아래 "재확인"은 서버에 들어가야만 알 수 있다. 운영 `.env`·Cloudflare 설정은 새로 만들거나 덮어쓰지 않고, 빠진 키만 사람이 추가한다.
      - 완료(저장소·로컬 확인): NOW-2-1(운영 Next 서빙)·NOW-2-2(재설정 URL 강제)·NOW-4-1 코드, prod 오버레이 병합 검증(가짜 env), `scripts/nginx-forwarded-check.sh` 전부 PASS, 최신 디자인 커밋 `b0eb352`.
      - 재확인(서버·외부 콘솔): ① EC2가 돌리던 커밋과 실행 명령(prod 오버레이 사용 여부) ② 기존 컨테이너의 restart 정책과 DB 대상(Neon인지 EC2 로컬 postgres 볼륨인지) ③ 운영 `.env`에 이후 생긴 필수 키가 있는지 — `REDIS_PASSWORD`·`CLOUDFLARE_TUNNEL_TOKEN`(9/30), `WITHDRAWAL_HMAC_SECRET`(10/01), `PASSWORD_RESET_URL`(10/06), `KAKAO_REDIRECT_URI`가 운영 값인지(값은 출력하지 않음) ④ 외부 진입이 Named Tunnel인지 A 레코드인지(A 레코드면 Elastic IP 없이 재시작 시 공인 IP가 바뀜) ⑤ 카카오 콘솔 Redirect URI·사이트 도메인 ⑥ EC2의 `docker compose version` ≥ 2.24, 디스크·메모리(core/frontend 이미지 빌드) ⑦ 보안 그룹(Tunnel이면 SSH 외 인바운드 불필요).
      - 실제 미완료: Mac 로컬 스택 정지 확인, Neon 읽기 전용 재확인(V5·실패 없음·`account_status` 분포, 마지막 확인 10-04), 재가동 전 Neon 백업 브랜치(권장, 승인 필요), NOW-3 반영 자체와 배포 후 확인.
      - **가장 큰 위험**: `e68e81f`(9/30) 이전 코드는 core가 `ddl-auto: update`, board가 기동마다 `schema.sql`을 실행한다. EC2가 그 이전 커밋이고 컨테이너가 자동 시작되면, 인스턴스를 켜는 순간 옛 core/board가 Flyway V5 상태의 Neon 스키마를 건드리고 옛 삭제·사진 공개 규칙으로 동작한다(STEP 10-impl-B 혼합 배포 주의). 그래서 재가동 직후 가장 먼저 `docker ps`로 확인하고, 옛 스택이 떠 있으면 바로 `stop`한다(`down -v` 금지). 단 이것만으로는 부팅부터 `stop`까지의 몇 초~몇 분 사이를 막지 못한다 → 아래 차단 방법 중 하나를 **재가동 전에** 적용한다.
      - **상태(2026-10-12)**: EC2 재가동 보류. 인스턴스는 중지 상태로 두고 운영·Neon은 건드리지 않는다. 아래 방법은 조사만 했고 아무것도 실행하지 않았다.
      - **이후(문서 기록)**: 2026-10-13 EC2를 다시 가동해 배포했다(`MORETHANCAR_EV_TASKS.md` "배포 완료 (2026-10-13)"). 위 보류 상태는 해소됐다. 아래 자동 시작 차단 방법 중 무엇을 썼는지는 기록 없음.
      - **재가동 전 자동 시작 차단 방법(조사, 미실행)**:
        1. (권장) **EC2 보안 그룹 아웃바운드에서 Neon(TCP 5432) 차단**: 인스턴스가 중지된 상태에서 콘솔로 바꿀 수 있고 부팅이 필요 없으며 되돌리기 쉽다. 아웃바운드 "모든 트래픽" 규칙을 지우고 443·80(git·docker 이미지·카카오), 587(SMTP)만 남긴다. 옛 컨테이너가 자동으로 떠도 Neon에 연결하지 못하므로 스키마를 건드릴 수 없다. 코드 업데이트·`config` 검사가 끝난 뒤 5432를 다시 열고 `up`한다. 주의: EC2가 로컬 postgres를 썼다면 이 방법과 무관하다(그 경우 데이터가 EC2 볼륨에 있음). VPC DNS(169.254.169.253)는 보안 그룹 규칙의 영향을 받지 않는다.
        2. **Neon 앱 역할 비밀번호 재설정**: 옛 `.env`의 비밀번호가 무효가 되어 옛 컨테이너는 인증에서 실패한다. 확실하지만 운영 DB 자격 증명 변경이라 별도 승인이 필요하고, 새 비밀번호를 운영 `.env`에 사람이 넣어야 한다.
        3. Neon IP Allow: Scale 플랜 전용 기능이라 현재 플랜에서는 쓸 수 없을 가능성이 크다(플랜 확인 필요).
        4. user data로 부팅 시 Docker 비활성화(`#cloud-config`의 `bootcmd`는 매 부팅 실행): 중지 상태에서 user data를 바꿀 수 있지만 Docker 서비스보다 먼저 실행된다는 보장을 확인하지 않았다. 비권장(검증 전).
        - 공통: 재가동 직전에 Neon 백업 브랜치(또는 PITR 복원 지점 확인)를 만든다(승인 필요). 1번 적용 후 재가동하면 `docker ps`·core 로그에서 Neon 연결 실패를 보고 차단이 동작했는지 확인한다.
- **NOW-3 실제 배포**
  - Cloudflare Named Tunnel + `docker-compose.yml` + `docker-compose.prod.yml` 기준으로 배포한다.
  - 배포 후 확인은 두 가지만 한다. ① proxy 로그의 첫 칸이 실제 사용자 IP인지, cloudflared가 172.16.238.2를 쓰는지. ② 로그인·게시글·이미지 등 핵심 proxy 동작. 배포를 또 하나의 대형 테스트 프로젝트로 만들지 않는다.
  - **배포 기록(문서 기준)**: 2026-10-13 `57d0327`(EV V8, PR #2), 2026-10-16 `98eb6ec`(EV SOON 해제). 절차와 결과는 `MORETHANCAR_EV_TASKS.md`의 STEP 10과 "배포 완료 (2026-10-13)". 접속 `ssh -i <SSH 키 경로> <사용자>@<운영 서버 IP>`, 서버 경로 `~/rev.cc`, 명령 `git pull --ff-only` → `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait`.
  - **[ ] 배포 후 확인 중 기록 없는 것**: ①은 직접 확인 기록이 없다(10-13 HSTS 헤더 정상 기록이 간접 근거 — HSTS는 172.16.238.2에서 온 https 요청에만 붙는다). ②는 10-13에 커뮤니티 API·페이지·`/garage`·로그인 페이지 200까지만 기록됐고 실제 로그인·글쓰기·이미지 업로드는 기록 없음.
  - **운영 상태 — 문서 기록과 실제 서버 확인을 구분한다(2026-10-19)**: 문서 기록상 EC2의 마지막 배포 커밋은 `98eb6ec`이다. 2026-10-19 세션은 운영 서버에 접속하지 않았으므로 **실제 서버 상태는 확인하지 않았다.** 그 뒤 main 커밋은 `6d251f9`(문서만, 운영 무관)와 커뮤니티 댓글 연결선 스타일 3건 `839e333`·`730af84`·`69c0e3c`(`frontend/components/community/post-detail.module.css`만)이다. **댓글 스타일 3건의 운영 반영 여부: 미확인.** → 2026-10-19 서버 확인 결과 반영돼 있었다(아래).
  - **운영 배포(2026-10-19, 서버에서 직접 확인)**: 배포 전 EC2(`~/rev.cc`)는 `main`의 **`69c0e3c`**였다 — reflog상 2026-10-16 `98eb6ec`→`839e333`→`730af84`→`69c0e3c`로 pull돼 있었으므로 위 "댓글 스타일 3건 미확인"은 **반영돼 있었음**으로 확정한다. 추적 파일 변경·stash 없음(미추적 `backups/`, `<.env 백업 파일>`만 있어 그대로 둠). 배포 범위 `69c0e3c..6e3c624`(PR #4 로그인 토스트 `28f0036`, PR #5 답글 표시 `6e3c624`, 그 밖에 문서·`docker-compose.yml` 주석·`scripts/assignment-run.sh`만 — backend·board-service·nginx·DB 마이그레이션 0건). 서버의 core·board·proxy 이미지 태그는 실행 중인 컨테이너보다 나중에 다시 빌드된 이미지를 가리키고 있어(실행 core `41bdf4ad3456`·board `f7ac664bd44c`·proxy `650bc0c2aa0e` vs 태그 `d4d8d5246888`·`066d3d7f82f1`·`020f8b092f1b`), 문서의 전체 `up -d --build --wait` 대신 **frontend만** `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --no-deps --wait frontend`로 갱신했다(nginx는 `resolver 127.0.0.11 valid=5s`로 upstream을 다시 찾으므로 proxy 재생성 불필요). 운영 `.env`·DB·볼륨은 건드리지 않았다. 롤백 준비: 이전 frontend 이미지 `98dae3c0d60b`를 `revcc-frontend:pre-20261019-rollback`으로 태그, 롤백 명령 `docker tag revcc-frontend:pre-20261019-rollback revcc-frontend:next && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build --no-deps --wait frontend`(실행하지 않음). 배포 후: 새 frontend `59687d9a656f` healthy, 나머지 5개 서비스는 재시작 없음, morethancar.kr 주요 페이지 17개(`/health`·`/`·`/community`·`/ev/*`·`/motorsport`·`/spots`·`/login`·`/home`·`/garage`·`sitemap.xml`·`robots.txt`·공개 API) 200, HSTS·CSP 유지, 비로그인 Chrome에서 `/community/free/3` 북마크 클릭 시 토스트(하단 24px·정중앙, 북마크 미반영), 답글 ㄴ자 표시(12×8px, #c9ccc4, 이름까지 10px, 이름·본문 시작선 동일) 확인, 배포 후 frontend 오류 로그 0건·proxy 5xx 0건. 이 Mac에서 EC2 첫 SSH 접속이라 호스트 키를 새로 등록했다(ECDSA `SHA256:YXoA2Lg45fECEmCeCTKRxR9ooTSRitz2fZ8rQeBlu7Q`).
- **NOW-4 최소 운영 안정성**
  - **[x] NOW-4-1 Kakao HttpClient timeout (2026-10-07, d98b2f1)**: `KakaoOAuthService`의 `HttpClient`에 연결 timeout 3초, 토큰·프로필 요청마다 요청 timeout 5초를 넣었다(최악 약 16초 후 실패). timeout 예외는 `AuthController` 카카오 콜백의 기존 `catch (Exception)` 실패 경로로 그대로 처리된다. 검증: Maven 컨테이너에서 컴파일 + `KakaoOAuthServiceTest` 통과(카카오 URL이 하드코딩이라 실제 timeout 발생은 재현하지 않음 — JDK 표준 동작). NOW-2/NOW-3보다 먼저 했지만 독립 작업이라 순서 영향 없음.
  - 서비스 다운을 알 수 있는 최소 health monitoring·알림(예: 외부 uptime 체크 하나)을 둔다. 장애 대응에 실제로 필요한 최소 수준만 한다.
  - **[x] NOW-4-2 외부 감시용 health (2026-10-23, PR #12 `790654a`)**: 운영 배포·외부 감시 등록·장애/복구 알림 수신 확인 완료. core `GET /api/health`(DB 연결 `isValid`), board `/health`에 별칭 `/api/board/health`를 붙여 nginx 기존 `/api/board` 경로로 노출(nginx 설정 변경 없음). 둘 다 3초 timeout, 정상 200 `{"status":"ok"}` / 장애 503 `{"status":"unavailable"}`, 원인은 로그에만. 로컬 Compose에서 DB·Redis·core/board 중지 시 감지 확인. 상세 `docs/MONITORING.md`
    - **운영 배포(2026-10-23)**: 운영 EC2 `18820ce`(PR #10) → `790654a`(PR #11 문서 정리 + PR #12). 반영 코드는 core·board뿐이고 Flyway 마이그레이션이 없어 DB 백업은 생략했다. `config --services`로 postgres 제외·cloudflared 포함·`SPRING_PROFILES_ACTIVE=prod` 확인 → `git pull --ff-only` → prod 오버레이 `up -d --build --wait` 성공, 6개 서비스 healthy, 배포 직후 3분간 core·board 로그에 오류·health 실패 없음. 서버의 git 미추적 파일(`.env`, `.env.backup.*`, `backups/`)은 그대로 보존했다. 운영 DB·컨테이너를 일부러 중지하는 장애 시험은 하지 않았다(장애 감지는 로컬 Compose 검증으로 갈음).
    - **배포 후 확인(2026-10-23, `https://morethancar.kr`)**: `/` → 200(메인 페이지), `/api/health` → 200 `{"status":"ok"}`, `/api/board/health` → 200 `{"status":"ok"}`. health 응답은 `cache-control: no-store`, `cf-cache-status: DYNAMIC`(Cloudflare가 캐시하지 않음).
    - **되돌리기(확인만, 미실행)**: 운영 저장소에서 `git checkout 18820ce` 후 prod 오버레이 `up -d --build --wait`. 마이그레이션이 없어 DB는 되돌릴 필요 없다.
    - 외부 감시(2026-10-23):
      - [x] UptimeRobot(무료, 운영자 GitHub 계정으로 로그인)에 `https://morethancar.kr/`·`/api/health`·`/api/board/health` 등록 — HTTP(S), 5분 주기, 이메일 알림(운영자 계정 이메일)
      - [x] 세 모니터 모두 Up — Cloudflare Bot Fight Mode·WAF에 막히지 않음
      - [x] 장애(down) 알림 수신 — 임시 모니터 `https://morethancar.kr/api/health-alert-test`(404)가 Down 판정, 운영자가 메일 수신 확인
      - [x] 복구(up) 알림 수신 — 같은 임시 모니터의 URL을 `https://morethancar.kr/api/health?alert-test=1`(200)로 바꿔 Up 판정, 운영자가 메일 수신 확인. 확인 후 임시 모니터 삭제. (이미 등록된 `/api/health`와 같은 URL로는 저장되지 않아 쿼리 문자열을 붙였다.) 운영 서비스는 멈추지 않았다
- **LATER-1 카카오 회원 탈퇴** (NOW 작업과 배포 이후)
  - 지금은 카카오 계정의 탈퇴 요청을 400 `KAKAO_REAUTH_REQUIRED`로 안전하게 거부하는 상태를 유지한다.
  - 공개 서비스에서는 카카오 회원도 탈퇴할 수 있어야 하므로 제품 완성도 작업으로 남긴다.
  - 구현할 때 기존 STEP 10-impl-D 계획을 기계적으로 따르지 않는다. 카카오 재인증 + unlink + 탈퇴에 필요한 최소 구현만 다시 설계한다(참고: 추가 이슈의 "STEP 10-impl-C → D 전에 알아야 할 것").
- **LATER-2 비밀번호 재설정 계정 열거**
  - 응답 통일 같은 작은 수정으로 끝나면 작은 보안 정리로 처리한다. 별도의 큰 설계·테스트가 필요하면 보류한다.
  - **[x] 2026-10-23 코드 완료·운영 배포(PR #15 `76e8985`)·운영 메일 수신 확인**: 결정 — 형식이 올바른 요청은 없는 아이디·이메일 불일치·카카오 계정·60초 쿨다운·대기열 실패와 관계없이 200 `CODE_SENT`, 카카오 안내 메일 없음, 형식 검증(400)·IP/이메일 제한(429)·nginx 제한은 유지(계정 조회 전 적용이라 계정과 무관). 쿨다운은 일치 계정에만(오타 정정 요청이 버려지지 않게). 관리자 재설정은 `requestForMember`로 분리해 쿨다운 429·대기열 503을 그대로 알린다. 화면 문구 "입력한 정보가 일치하면 인증번호가 발송됩니다. 메일이 오지 않으면 입력 정보와 스팸함을 확인해 주세요. 카카오 가입 회원은 카카오 로그인을 이용해 주세요." 응답 시간: 로컬 core 직접 측정 중앙값 일치 3.1~3.5ms vs 그 외 2.4~2.8ms(Redis 2회 등 동기 처리 차이), 제한으로 표본이 막혀 더미 쓰기로 맞추지 않음. 비동기 발송 실패는 `ResetMailService` WARN(`category=SMTP_CONNECTION_FAILED` 등, 수신자·코드 없음)으로 확인(로컬). 검증: `mvn test` 140/0 fail/0 skip(격리 PG16·Redis 통합 포함), `tsc --noEmit`. 상세 `docs/member-management-password-reset.md` "계정 확인 UX 응답"
  - 남은 일:
    - [x] 운영 배포(2026-10-23): 운영 EC2 `790654a` → `76e8985`(PR #15). 반영 코드는 core·frontend뿐이고 마이그레이션·compose·nginx·env 변경 없음. `config --services` 확인 → `git pull --ff-only` → prod 오버레이 `up -d --build --wait` 성공, 6개 서비스 healthy, 배포 후 3분간 core 로그 오류 0건, git 미추적 파일(`.env` 등) 보존. 되돌리기(미실행): `git checkout 790654a` 후 같은 `up`.
    - [x] 배포 후 확인(각 1회, 제한에 걸리지 않게): `/` 200, `/api/health`·`/api/board/health` 200 `{"status":"ok"}`, 재설정 요청(없는 아이디) 200 `CODE_SENT` + 새 안내 문구, 이메일 형식 오류 400, `/password-reset` 200.
    - SMTP 연결 확인(2026-10-23, 보안 그룹 변경 없음): 운영 core 설정은 `smtp.gmail.com` / 587 / 인증 사용 / STARTTLS 사용, 계정·비밀번호·발신 주소는 설정돼 있음(값은 확인·기록하지 않음). EC2 호스트 → smtp.gmail.com:587 연결 성공(`220 smtp.gmail.com ESMTP` 응답 수신), core 컨테이너 → 587 연결 성공. 같은 확인에서 465·25·포트 80은 연결 안 됨, www.google.com:443 연결됨. 호스트 iptables OUTPUT ACCEPT, ufw 비활성. 2026-10-20 기록("아웃바운드 443만 허용", 587 연결 실패)과 다르다. 보안 그룹 규칙 자체는 보지 않았다(AWS CLI 없음, 콘솔 미확인). 이 시점 운영 core 로그에는 재배포 이후 재설정 메일 발송 기록이 없어 발송 성공·실패 모두 아직 확인되지 않았다.
    - [x] 실제 메일 발송·수신(2026-10-23, 운영): 운영자가 소유한 일반 계정(이메일 등록)으로 `/password-reset`에서 요청 → 메일 수신 → 인증번호 확인 → 새 비밀번호로 재설정까지 성공했다고 운영자가 확인했다. 받은편지함·스팸함 중 어디로 왔는지는 기록하지 않았다. 같은 시간대(최근 90분) 운영 로그: core에 `Password reset email delivery failed` 0건, `could not be queued` 0건, 예외 0건, WARN은 기동 시 Flyway의 PostgreSQL 18 버전 권고 1건뿐(기존). nginx 기준 재설정 요청은 `request` 200 2회(운영자 요청 + 배포 확인용 없는 아이디 1회)·400 1회(배포 확인용 형식 오류)·`verify` 200 1회·`complete` 200 1회. 인증번호·토큰·이메일 주소는 확인·기록하지 않았다.
    - 불일치·카카오 계정 미발송의 근거 구분:
      - 운영 실제 수신 시험: **하지 않았다**(이메일 불일치·카카오 계정으로 요청해 메일이 오지 않는지 운영에서 본 적 없음). 운영에서 확인한 것은 없는 아이디 요청 1회가 200 `CODE_SENT`로 응답한 것뿐이고, 그 경우 메일이 실제로 나가지 않았는지는 수신함으로 확인하지 않았다.
      - 자동 테스트(PR #15, CI 통과): `PasswordResetRequestTest`가 없는 아이디·이메일 불일치·카카오 계정에서 같은 200 `CODE_SENT`와 메일 발송 호출 0회·인증번호 저장 0회를 확인하고, `PasswordResetServiceTest`·`WithdrawalIntegrationTest`가 실제 Redis에서 없는 아이디·탈퇴 계정 요청에 메일 발송 호출이 없음을 확인한다(메일 발송은 mock).
    - [ ] (선택) 운영에서 이메일 불일치·카카오 계정 요청 시 메일이 오지 않는지 수신함으로 확인 — 필요하면 이메일당 5회/시간 제한 안에서 1회씩
- **LATER-3 `MAIL_UNAVAILABLE`이 사실상 도달 불가능한 경로로 보임** — 2026-10-23 LATER-2에서 `MAIL_UNAVAILABLE` 응답 자체를 없앴다(대기열 등록 실패만 동기로 잡혔고 이제 로그만 남긴다). SMTP 실패는 원래대로 `ResetMailService` 로그로만 보인다. (STEP 4-3 `/password-reset` 포팅 검증 중 발견, 2026-10-06)
  - 원인: `ResetMailService.send()`가 `@Async`라 `PasswordResetService.request()`의 `try { mail.send(...) } catch (RuntimeException e) { ... MAIL_UNAVAILABLE ... }`는 비동기 메서드 호출이 즉시 반환된 뒤의 코드라, 실제 메일 발송 실패 예외가 이 catch로 동기 전파되지 않는다(발송 실패는 `ResetMailService` 내부에서 로그만 남기고 삼켜진다). 즉 메일 발송이 실패해도 `request()`는 그대로 `CODE_SENT` 성공을 반환할 가능성이 높다.
  - 프론트(legacy `password-reset.js`, Next `password-reset-form.tsx` 모두)는 `MAIL_UNAVAILABLE` 코드를 받으면 서버 메시지를 그대로 보여주도록 되어 있으나, 이 경로가 실제로 호출되는지는 이번 세션에서 확인하지 못했다.
  - 백엔드 비동기 예외 전파 구조를 손대는 일이라 이번 인증 Next.js 포팅 범위에서는 수정하지 않는다. 실제로 메일 발송 실패가 반복되는 운영 이슈가 확인되면 그때 원인 분석·수정을 진행한다.
- **LATER-4 차량 기록/타임라인** (조사 2026-10-06, STEP 5 `/parts` 포팅과 무관하게 독립 진행 — STEP 5는 건드리지 않는다)
  - **핵심 방향(2026-10-06 확정)**: "타임라인을 보여주는 것"보다 "사용자가 의식하지 않아도 차량 기록이 쌓이는 구조"가 우선이다. timeline read API를 1순위로 만들지 않는다. `parts_listings.vehicle_id`는 이번 기능에서 제외(부품 판매를 차량 기록에 자동으로 넣지 않는다).
  - **조사로 이미 확인한 것**: `owner_vehicles`(차량) ↔ `vehicle_records`(정비/튜닝/부품, `kind`+`recorded_on` DATE) ↔ `board_posts`(`vehicle_id` FK+`created_at`)가 이미 전부 `vehicle_id`로 연결되어 있고 날짜 필드도 있다. 공개 차량 페이지(`vehicle-public.tsx`)는 이미 `records`를 날짜 내림차순으로 보여주는 중. `owner_vehicles.image_id`는 차량당 1개짜리 대표사진 슬롯(히스토리 없음)이라 "사진 기록"만 새 데이터가 필요하다. 차량 삭제는 `owner_vehicles`/`vehicle_records` CASCADE로 완전 삭제되어 기록 보존과 충돌한다. 완성차 판매 기능 자체는 현재 전혀 없다(부품 장터와 별개).
  - **1. 커뮤니티 차량 자동 연결 (frontend 전용, DB/API 변경 없음)**: `post-editor.tsx`의 `vehicleId` select 기본값 로직만 바꾼다 — `fetchMyVehicles()` 결과가 정확히 1대면 그 차량을 기본 선택, 0대면 기존처럼 "연결하지 않음", 2대 이상이면 기존처럼 사용자가 직접 선택. 사용자는 언제든 "연결하지 않음"으로 바꿀 수 있어야 한다(기존 select 동작 그대로 유지, 기본값만 조건부로 바뀜). 별도 타임라인 입력 행동을 만들지 않는다.
  - **2. 사진 기록(최소 UX)**: `vehicle_records`를 그대로 활용한다(새 테이블 없음). `vehicle_records`에 nullable `image_id INTEGER REFERENCES community_images(id)` 컬럼 1개 추가, board-service의 `kind` 허용값에 `"photo"` 추가(`community.js`의 `["maintenance","tuning","parts"]` → `photo` 포함), `photo` kind일 때만 `title`을 선택값으로 허용(현재 `text(title,150)`은 필수 — kind별로 required 플래그 분기). 최소 데이터는 `vehicle_id`+`kind='photo'`+`image`+`recorded_on`. 1차 구현은 EXIF 없이 **오늘 날짜 기본값 + 사용자가 날짜 수정 가능**까지만 한다. EXIF 촬영일 자동 추출은 비용 대비 효과를 봐서 후속 개선으로 분리(클라이언트 JS 라이브러리 추가가 필요해 1차 범위에 넣으면 규모가 커짐). 여러 장 일괄 업로드·날짜별 자동 분류도 1차에 넣지 않는다(필요해지면 "사진 올리기"를 여러 번 호출하는 것으로 충분 — 별도 bulk API 불필요).
  - **3. 차량 기록 보존**: `owner_vehicles.sold_at`은 추가하지 않는다(완성차 판매 기능이 아직 없어 "판매"에 종속된 개념을 지금 만들면 나중에 그 기능과 다시 맞춰야 함). 대신 "판매"와 무관한 일반적인 상태로 설계한다 — 현재 스키마 기준 가장 단순한 형태는 `owner_vehicles`에 `archived_at TIMESTAMPTZ`(nullable) 컬럼 1개만 추가하는 것: NULL이면 "현재 보유 차량"(내 차고 기본 목록, 대표차량 후보 등 기존 동작 그대로), 값이 있으면 "보관된/이전 차량"(내 차고에서 별도 영역으로만 노출, 기록은 전부 유지). 소유자가 쓰는 "차고에서 제거"는 이 `archived_at`을 세팅하는 새 엔드포인트(또는 기존 PUT에 플래그 추가)가 맡고, 기존 `DELETE /api/garage/vehicles/:id`·`DELETE /api/board/garage/:id`(완전 삭제, CASCADE)는 지금처럼 그대로 둬서 사용자가 명시적으로 영구 삭제를 원하는 경로를 막지 않는다. 즉 "현재 차량 아님"과 "완전 삭제"를 분리하는 게 목표고, `archived_at` 하나로 충분하다(별도 enum/상태 테이블 불필요).
  - **4. timeline read API** (1~3이 끝난 뒤 진행): `GET /api/board/garage/:id/timeline` — `owner_vehicles`(등록일 1건, `archived_at` 유무와 무관하게 포함) + `vehicle_records`(maintenance/tuning/parts/photo) + `board_posts WHERE vehicle_id=:id`를 `vehicle_id` 기준으로 합쳐 `{type, date, title, imageIds, ...}` 공통 shape로 반환. UNION ALL(또는 병렬 쿼리 후 애플리케이션에서 merge, board-service가 이미 멤버 프로필에서 쓰는 패턴과 동일). 전부 원본 테이블을 그대로 읽고, timeline 전용 테이블에 복제하지 않는다. `parts_listings`는 포함하지 않는다.
  - **5. UI**: 같은 timeline API를 `/home`(내 차고)과 공개 차량 페이지(`/community/cars/:id`)에서 재사용한다. `vehicle-public.tsx`가 이미 `records`를 날짜순으로 보여주고 있어 UI 구조 자체는 크게 바뀌지 않는다(등록일·연결된 글이 같은 리스트에 섞여 들어가는 정도). 처음부터 화려한 모션 없이 일반적인 연대기 UI부터 만든다.
  - **6. 회고 모션그래픽** (가장 마지막 단계): 의미 있는 시점(차량을 "보관"으로 전환하는 시점 등)에서 기존 timeline 데이터로 만든다. 모션을 위한 별도 데이터는 저장하지 않는다.
  - **예상 난이도**: 1(자동 연결)·3(archived_at 컬럼+필터)은 작음, 2(사진 기록)는 중간(컬럼+kind 검증 변경+업로드 UI), 4(timeline API)는 중간(쿼리 설계·merge 로직), 5(UI)는 중간(기존 레이아웃 재사용 가능해 상대적으로 가벼움), 6(모션그래픽)은 범위 미정이라 가장 불확실 — 착수 시 별도로 다시 가늠한다.

### 보류 (현재 규모에서는 오버헤드 — 실제 필요가 생기면 재개)

기록과 계획은 지우지 않는다. 기존 system/browser/E2E 테스트 자산도 지우지 않고, 큰 릴리스·배포 경계에서만 쓴다.

- STEP 10-impl-D 원래 계획 전체(→ LATER-1로 축소)
- STEP 10-impl-E: 운영 기록 보존기간, 자동 정리, FK 없는 참조 정리, 만료된 `withdrawal_blocks` 정리
- STEP 11 원래 계획 전체(→ LATER-2로 축소)
- 제재(정지·비활성화) 회원 전용 탈퇴 경로
- 무기한 withdrawal block을 해제하는 관리자 UI/API
- 드문 withdrawal race condition 보강(탈퇴 중 새 매물 등록 등)
- 이메일 없는 legacy 계정의 완전한 재가입 방지(이메일 필수화 등)
- 현재 트래픽에 필요 없는 DB·인덱스 최적화(프로필·차량 사진 참조 인덱스, `users.email` 중복 인덱스 정리 등)
- `post_images` 연결 테이블 같은 구조 리팩터링
- DB 역할 세분화(앱용·마이그레이션용 분리)
- HSTS 확대·preload
- `scripts/nginx-forwarded-check.sh`의 CI 편입
- 여러 환경·DB 버전(PG16/PG18 등) 호환성 반복 검증
- 현재 사용량에서 의미 없는 pagination·성능 최적화
- unhealthy 컨테이너 자동 재시작, Neon 유휴 연결·자동 일시정지 영향 확인
- 차고 쓰기·장터 수정 rate limit 추가, Spring 자유 텍스트 서버측 sanitize, 로그인 응답 시간 차이·잠금 직전 동시 요청 보강
- 실제 문제가 발생하지 않은 구조적 cleanup
- 향후 개선사항 — 댓글 신고(2026-10-05 결정): Next.js 포팅 범위가 아닌 신규 기능으로 분리. board-service에 댓글 신고 API가 없고 `community_reports`는 `post_id`만 가지며, 기존 상세 페이지에도 없던 기능이다. 진행 시 API·테이블·관리자 처리 화면 설계부터 결정한다.
- **P3 전체**(P3-1~P3-9): 개발 로드맵의 선행조건이 아니다. 실제 사용자·트래픽·장애·데이터 증가로 필요성이 확인되거나, 관련 코드를 고칠 일이 생겼을 때 같이 처리하는 backlog다. 단, P3-8(모니터링)의 최소 형태는 NOW-4에 포함했다.

### 새 작업을 판단하는 기준

새 작업을 발견해도 바로 STEP으로 만들지 않는다. 먼저 판단한다.

1. 지금 실제 사용자에게 문제가 되는가?
2. 실제 운영·배포를 막는가?
3. 데이터 손실이나 명확한 보안 취약점인가?
4. 지금 처리하지 않으면 나중에 수정 비용이 크게 늘어나는가?

대부분 "아니요"면 backlog(위 "보류")로 보낸다. 회원 33명 규모에서 수십만 사용자 규모를 가정한 최적화·자동화·희귀 경쟁조건 방어를 먼저 구현하지 않는다. "가능한 문제"와 "지금 해결해야 하는 문제"를 구분한다. 검증 범위는 §5의 "작업 및 검증 경량화 원칙"을 따른다.

새 세션은 "지금 할 것"에서 **처음 `[ ]`인 작업 하나만** 진행한다. 여러 작업을 한 번에 진행하지 않는다.

---

### STEP 1: 비밀번호 최소 길이 + 요청 body 크기 제한 + 배포 문서 수정 (P1-1, P1-2, P1-5)

**작업 목적**: 1글자 비밀번호로 가입/재설정이 통과되는 문제와, 크기 제한 없는 JSON 역직렬화로 인한 메모리 고갈 DoS 가능성을 막는다. 또한 문서대로 실행하면 운영 하드닝(`docker-compose.prod.yml`)이 적용되지 않는 문제를 문서 수정으로 바로잡는다.

**관련 파일**
- `backend/src/main/java/com/revcc/app/AuthController.java` (`Credentials` record, 현재 155행 부근)
- `backend/src/main/java/com/revcc/app/PasswordResetController.java` (`ResetRequest` record, 16행)
- `backend/src/main/resources/application.yml`, `application-prod.yml`
- 당시 Docker 실행 문서

**구현 요구사항**
1. `Credentials.password`, `ResetRequest.password`에 `@Size(min=..., max=255)` 추가. 최소 길이는 합리적인 값(예: 8) — 기존 계정(레거시 평문 비밀번호 포함)에는 영향 없어야 하므로 **로그인 검증이 아니라 signup/reset 입력 검증에만** 적용할 것. 레거시 평문 비밀번호 자동 마이그레이션 로직(`AuthController.login()`의 `isHash`/`upgradePassword`)은 건드리지 않는다.
2. `application.yml`/`application-prod.yml`에 body 크기 제한 추가 (`server.tomcat.max-http-form-post-size`, `spring.servlet.multipart.max-request-size` 등 필요한 항목만, 기존 `VehicleVerificationController`의 4.2MB 체크와 충돌하지 않는 값으로). 기존 이미지 업로드(base64, garage vehicle verification)가 깨지지 않는지 반드시 확인.
3. 당시 Docker 실행 문서에 `docker-compose.prod.yml` 사용법 안내 추가(어떤 섹션에 넣을지는 기존 문서 구조를 참고해서 자연스럽게). 운영 배포 시 override가 자동 병합되지 않도록 `-f docker-compose.yml -f docker-compose.prod.yml` 형태를 명시.

**건드리지 말아야 할 영역**
- 로그인(`AuthController.login()`)의 레거시 비밀번호 허용 로직, BCrypt 마이그레이션 흐름
- `VehicleVerificationController`의 기존 4.2MB 매직바이트 체크 로직 자체
- P1-3/P1-4/P1-6/P1-7과 P2/P3 전 항목
- `docker-compose.override.yml`/`docker-compose.dev.yml`/`docker-compose.garage.yml`

**완료 조건**
- 1글자 비밀번호로 signup/reset 요청 시 400
- 기존 계정으로 로그인은 여전히 정상 동작(레거시 평문 비밀번호 계정 포함)
- 매우 큰 JSON body 요청이 적절한 크기에서 즉시 거부됨(메모리 전체 역직렬화 전에)
- 기존 차량 인증서류 업로드(4.2MB 이하) 정상 동작
- 당시 Docker 실행 문서에 prod 배포 명령이 안내됨(현재 `docs/DEPLOYMENT.md`)

**실행해야 할 테스트**
- `cd backend && mvn test` — 전체 통과, 특히 `AuthControllerTest`, `PasswordResetRequestTest`, `VehicleVerificationControllerTest`, `MemberFlowIntegrationTest`(스킵되면 스킵인 채로 통과) 확인
- 비밀번호 최소 길이 검증용 신규 테스트 추가(짧은 비밀번호 거부 케이스)
- body 크기 제한 신규 테스트 추가(가능한 형태로 — MockMvc 레벨에서 대용량 payload가 컨트롤러 로직 진입 전에 거부되는지)
- `cd board-service && npm test` — board-service는 이 STEP에서 변경하지 않으므로 회귀 없이 통과해야 함

---

### STEP 2: 부품장터 관리자 모더레이션 + admin/market 인가 테스트 (P1-4, P1-6)

**작업 목적**: 커뮤니티 게시글/댓글에는 있는 관리자 삭제 기능이 부품 장터(`market.js`)에는 없어 사기/어뷰징 매물을 관리자가 내릴 방법이 없다. 동시에, 실제로는 잘 구현되어 있다고 감사에서 확인된 `admin.js`/`admin-access.js`/`market.js`의 인가 로직이 자동 테스트로 전혀 보호되지 않고 있다.

**관련 파일**
- `board-service/src/market.js`
- `board-service/src/moderation.js` (커뮤니티 게시글 관리자 삭제가 이미 구현된 참고 패턴 — 트랜잭션 + `FOR UPDATE` 행 잠금 + `reason` 필수)
- `board-service/src/admin.js`, `board-service/src/admin-access.js`
- `board-service/test/` (신규 테스트 파일 추가)

**구현 요구사항**
1. `market.js`에 관리자 전용 매물 삭제(또는 숨김) 엔드포인트 추가. `moderation.js`의 기존 패턴(트랜잭션, 사유 필수, `moderation_logs` 기록)을 그대로 재사용 — 새 방식을 발명하지 말 것.
2. `admin.js`/`admin-access.js`에 대한 인가 테스트 추가: 비관리자 403, 강등된 관리자(role이 바뀐 세션) 거부, 실제 관리자의 정상 성공 경로.
3. `market.js`에 대한 IDOR 테스트 추가: 다른 판매자의 매물을 수정/삭제 시도하면 403 (커뮤니티 게시글에 이미 있는 `author_id` 서버검증 패턴과 동일하게, `market.js`가 이미 `seller_id` 검증을 하고 있다면 그 동작을 테스트로 고정하는 것이고, 없다면 구현부터 해야 함 — 코드를 먼저 확인).

**건드리지 말아야 할 영역**
- `community.js`/`moderation.js`의 기존 커뮤니티 모더레이션 로직(이미 잘 구현됨, 패턴만 참고하고 수정하지 말 것)
- `owned-images.js`, `rate-limit.js` 등 이 STEP과 무관한 파일
- P2-4(부품장터 rate limit 부재)는 이 STEP 범위 아님 — 발견해도 기록만

**완료 조건**
- 관리자가 사유를 남기고 타인의 부품 매물을 삭제할 수 있음
- 비관리자/강등된 관리자는 거부됨
- 판매자 본인이 아닌 사용자가 매물을 수정/삭제할 수 없음(이미 되어 있다면 테스트로 고정)
- 삭제 시 `moderation_logs`에 기록 남음

**실행해야 할 테스트**
- `cd board-service && npm test` — 신규 테스트 포함 전체 통과
- `cd backend && mvn test` — board-service만 건드리므로 회귀 없이 통과해야 함

---

### STEP 3: GitHub Actions CI 구성 (P1-7)

**작업 목적**: 현재 1000줄 넘는 Spring 테스트와 Node 테스트가 전부 로컬/수동 실행에만 의존한다. PR/push 시 자동으로 돌아가는 CI가 없다.

**관련 파일**
- 신규: `.github/workflows/ci.yml` (또는 backend/board-service 분리 시 2개 파일)

**구현 요구사항**
1. `docker-assignment` 브랜치(및 필요시 main)에 push/PR 시 트리거.
2. Spring: `mvn test` 실행. 기존처럼 실 DB/Redis 없이 도는 유닛테스트 위주로 충분(통합테스트 2클래스는 `REVCC_TEST_DB_PORT`/`REVCC_TEST_REDIS_PORT` 환경변수가 없으면 자동 skip되므로 CI에서 서비스 컨테이너를 반드시 띄울 필요는 없음 — 최소 구성으로 시작, 필요하면 이후 확장).
3. Node: `npm test`(board-service) 실행.
4. 시크릿을 워크플로에 하드코딩하지 말 것 — 필요한 값은 GitHub Actions secrets 참조로.

**건드리지 말아야 할 영역**
- 기존 테스트 코드 자체(실행 방식만 자동화, 테스트 내용 수정 금지)
- Dockerfile, docker-compose*.yml (이 STEP은 CI 워크플로만 추가)

**완료 조건**
- `.github/workflows/`에 워크플로 파일 존재
- 로컬에서 `act` 등으로 검증이 어려우면 최소한 YAML 문법 오류가 없고, 로컬 `mvn test`/`npm test` 커맨드와 동일한 명령을 그대로 사용했는지 확인

**실행해야 할 테스트**
- `cd backend && mvn test`, `cd board-service && npm test` — 워크플로에 넣을 명령이 로컬에서 그대로 통과하는지 먼저 확인
- YAML 유효성: `yamllint` 또는 유사 도구가 있으면 사용, 없으면 육안 검토

---

### STEP 4: Flyway/Liquibase 기반 DB 마이그레이션 정리 (P1-3)

**작업 목적**: `users` 테이블을 Hibernate `ddl-auto:update` + `backend/migrations/*.sql`(수동) + board-service 매 부팅 `schema.sql` 3곳이 조정 없이 건드리고 있다. 가장 구조적으로 위험한 항목이라 P1 중 가장 마지막(가장 신중하게) 진행한다.

**관련 파일**
- `backend/src/main/resources/application.yml` (`spring.jpa.hibernate.ddl-auto`)
- `backend/migrations/20260929_member_management.sql`
- `board-service/src/schema.sql`, `board-service/src/server.js`(schema.sql 실행 부분)
- `backend/pom.xml` (Flyway 의존성 추가 필요)

**구현 요구사항 — 반드시 신중하게, 단계적으로**
1. Flyway(권장, Spring Boot와 통합이 쉬움) 도입: 기존 스키마 상태를 그대로 baseline으로 잡는 마이그레이션 파일부터 작성(`V1__baseline.sql` 등) — **기존 운영 데이터가 있는 DB에 적용될 수 있으므로 `baselineOnMigrate` 옵션 등으로 기존 테이블을 파괴하지 않게 할 것**.
2. `ddl-auto`를 `update`에서 `validate`로 전환하는 것은 Flyway 마이그레이션이 실제 스키마와 완전히 일치함을 확인한 뒤 마지막에 진행.
3. board-service의 `schema.sql` 매 부팅 실행 로직은, Spring이 스키마 소유권을 가져간 이후 board-service 쪽 `ALTER TABLE`(예: `created_at` 추가)도 Flyway 마이그레이션으로 옮길지, 아니면 board-service 전용 스키마 요소만 남길지 결정 필요 — **이 판단은 작업 시작 전에 코드를 다시 확인하고 정하되, 두 서비스가 같은 `users` 테이블을 건드리는 순서 의존성을 반드시 명시적으로 해결할 것**.

**건드리지 말아야 할 영역**
- 기존 컬럼/제약조건의 의미를 바꾸는 스키마 변경(이 STEP은 마이그레이션 "관리 체계"를 만드는 것이지 스키마 자체를 바꾸는 것이 아니다)
- P2-11(FK RESTRICT 문제)은 이 STEP 범위 아님 — 발견해도 기록만

**완료 조건**
- Flyway 마이그레이션이 기존 로컬/테스트 DB에 적용되어도 데이터 손실 없이 통과
- `mvn test`의 통합테스트(REVCC_TEST_DB_PORT 설정 시)가 정상 동작
- board-service 재기동 시 스키마 충돌 없음

**실행해야 할 테스트**
- `cd backend && mvn test` (가능하면 `REVCC_TEST_DB_PORT`/`REVCC_TEST_REDIS_PORT`를 실제로 설정해 통합테스트까지 포함해서 실행 — 이 STEP은 스키마를 건드리므로 스킵 없이 검증하는 것을 강력히 권장)
- `cd board-service && npm test`
- 로컬 docker compose로 처음부터 기동(`docker compose down -v` 후 `docker compose up -d --build --wait`)해서 컨테이너가 정상 기동하는지 수동 확인 — **`-v`는 로컬 테스트 볼륨에서만, 운영 볼륨에는 절대 사용하지 말 것**

---

### STEP 5: Rate Limit 보강 (P2-2, P2-4)

> **분리안 채택(2026-09-30 사용자 승인)**: **5-A**(외부 X-Forwarded-For 신뢰 문제 해결 + limiter 메모리 정리)와 **5-B**(계정 단위 로그인 제한 + board 누락 엔드포인트 + `admin-system.mjs` 정합화)를 각각 별도 STEP·별도 커밋으로 진행한다. 5-A를 먼저 끝내야 5-B의 IP 기반 제한이 의미를 가진다.

**작업 목적**: 로그인 시도 제한이 IP 기준만 있어 IP를 바꿔 가며 한 계정을 계속 시도할 수 있고, 그 IP 자체도 위조될 수 있다. 두 limiter 모두 만료된 버킷을 지우지 않아 메모리가 계속 늘어난다. board에는 제한 없는 쓰기·조회수 엔드포인트가 남아 있다.

**현재 구현 상태 (2026-09-30 코드 확인)**
- Spring `RateLimitFilter.java`: 인메모리 고정 윈도, 키는 `URI|request.getRemoteAddr()`, 분당 10회. `RateLimitConfig.java`가 `/api/auth/login`, `/api/auth/signup`, `/api/auth/check-username`에만 적용한다. `hits`(ConcurrentHashMap)의 만료 항목을 지우는 코드가 없다.
- **IP 위조 가능성(재현 테스트로 먼저 확인할 것)**: nginx(`nginx/default.conf`)는 `X-Forwarded-For $proxy_add_x_forwarded_for`로 **클라이언트가 보낸 값 뒤에 덧붙인다**. Spring `forward-headers-strategy: framework`(ForwardedHeaderFilter)는 X-Forwarded-For의 **첫 번째 값**을 remoteAddr로 쓴다. 그러면 클라이언트가 `X-Forwarded-For: 1.2.3.4`를 보내 로그인 limit과 비밀번호 재설정 IP limit(`PasswordResetController`가 `getRemoteAddr()`를 넘김)을 우회할 수 있다. Express는 `trust proxy: 1`(`app.js:37`)이라 마지막 홉만 믿으므로 안전하다.
- **Cloudflare 뒤 운영 시**: nginx의 `$remote_addr`가 Cloudflare 엣지(또는 Tunnel의 cloudflared) IP가 되어 IP 기반 제한이 전부 몇 개의 버킷으로 뭉친다. P0-2에서 A안(Cloudflare가 TLS 종단)을 채택했지만 **프록시 DNS인지 Tunnel인지는 아직 정해지지 않았다**.
- board `rate-limit.js`: 인메모리 고정 윈도, 키는 `u:<userId>` 또는 `ip:<req.ip>`. 역시 만료 항목을 지우지 않는다. `community.js`의 글(10/분), 댓글(20/분), 방명록(10/분), 이미지(20/분) 작성에만 적용돼 있다.
- board에서 제한이 없는 곳(P2-4): `POST /api/parts/listings`(`market.js:154`), `POST /api/parts/listings/:id/view`(`market.js:217`, 비인증), `POST /api/board/posts/:id/view`(`community.js:212`, 비인증), `POST /api/board/posts/:id/report`(`community.js:293`).
- 비밀번호 재설정은 이미 Redis 기반 제한이 있다(`PasswordResetService.limit()`, Lua 카운터). 계정 단위 로그인 제한을 만들 때 재사용할 수 있는 패턴이다.

**관련 파일**
- 5-A: `nginx/default.conf`, `backend/src/main/resources/application.yml`(`forward-headers-strategy`), `backend/src/main/java/com/revcc/app/RateLimitFilter.java`, `board-service/src/rate-limit.js`, 테스트 `RateLimitFilterTest.java`, `board-service/test/rate-limit.test.js`
- 5-B: `AuthController.java`(`login()`), 신규 계정 단위 제한 클래스(또는 `RateLimitConfig.java` 확장), `board-service/src/market.js`, `board-service/src/community.js`, 테스트 `AuthControllerTest.java`, `board-service/test/admin-market.test.js`, `board-service/test/app.test.js`

**결정 사항 (2026-09-30)**
- Cloudflare 운영 방식(프록시 DNS / Tunnel)은 **아직 미확정**이다. 그래서 5-A는 **외부 X-Forwarded-For 신뢰 문제 해결까지만** 한다. Cloudflare 뒤에서 실제 client IP를 복원하는 작업(`real_ip_header`, `set_real_ip_from`)은 필요해지면 **STEP 9**에서 처리한다.

**작업 시작 전 사용자 확인**
- 계정 단위 제한 수치(권장: 같은 아이디로 15분에 로그인 실패 5회 → 15분 동안 429)와 board 신규 제한 수치(권장: 매물 등록 10/분, 조회수 IP당 60/분, 신고 10/분).

**구현 요구사항**
- 5-A
  1. 재현 테스트부터 작성한다. 위조한 `X-Forwarded-For`가 Spring의 remoteAddr를 바꾸는지 확인한다(MockMvc + ForwardedHeaderFilter, 또는 임시 nginx+core 스택에 curl). 재현되지 않으면 그 결과를 기록하고 이 항목은 테스트로 고정만 한다.
  2. nginx 두 `/api` location에서 `X-Forwarded-For`를 `$remote_addr`로 **덮어쓴다**(덧붙이지 않는다). 그러면 클라이언트가 보낸 X-Forwarded-For는 core/board에 전달되지 않는다. Cloudflare 실제 IP 복원은 이 STEP에서 하지 않는다(STEP 9).
  3. 로컬 직접 접속(`http://localhost:8090`, 앞단 헤더 없음) 동작은 지금과 같아야 한다.
  4. 두 limiter 모두 만료된 버킷을 정리한다(주기적 sweep 또는 접근 시 정리 + 상한). 고정 윈도 동작과 응답(429, `Retry-After`)은 그대로 유지한다.
- 5-B
  1. 계정 단위 로그인 실패 제한: Redis 카운터로 구현하고, 키는 정규화한 username의 digest로 한다. **존재하지 않는 아이디도 똑같이 카운트하고 똑같이 응답한다**(로그인의 계정 열거 방지를 유지). 영구 잠금은 하지 않고 시간 창만 두어 피해자 계정 DoS를 막는다. IP 제한(기존 필터)은 그대로 둔다.
  2. board 누락 엔드포인트 4곳에 기존 `rateLimiter`를 적용한다. 조회수 엔드포인트는 비인증이라 `ip:` 키를 쓴다(5-A 이후라야 의미가 있다).
  3. `scripts/admin-system.mjs` 정합화: 같은 사용자로 게시글 23개를 API로 연속 작성하다 글 작성 제한(10/분)에 걸려 실패하는 기존 충돌을 해소한다(STEP 4 follow-up에서 발견, "발견된 추가 이슈" 참고). 페이지네이션 검증 의미(게시글 23개, 20/3 분할, 카테고리 11개)는 그대로 유지한다. 방식(작성자 분산, 대기, SQL로 fixture 삽입)은 5-B 작업 때 정하되, rate limit 자체를 우회하는 테스트 전용 설정은 만들지 않는다. `scripts/run-board-system.sh`로 5개 수동 테스트가 모두 PASS해야 한다.

**건드리지 말아야 할 영역**
- 로그인 응답 형태(존재하지 않는 아이디와 틀린 비밀번호가 같은 401), 레거시 비밀번호 마이그레이션, 세션 발급 로직
- `PasswordResetService`의 제한 수치와 응답 코드(STEP 11 범위)
- nginx `limit_req`, HSTS, 타임아웃(STEP 9 범위). 5-A는 IP 전달 헤더만 수정한다
- Redis 인증(STEP 7), 카카오 로그인 흐름

**완료 조건**
- 위조한 `X-Forwarded-For`로 Spring의 IP 버킷을 바꿀 수 없다(테스트로 고정)
- 같은 아이디에 대해 IP를 바꿔도 실패가 N회를 넘으면 429, 존재하지 않는 아이디도 같은 동작이다
- 두 limiter의 버킷 수가 만료 후 줄어든다(가짜 시계를 쓴 테스트)
- board 4개 엔드포인트가 한도 초과 시 429 + `Retry-After`를 반환한다
- 로컬 `http://localhost:8090` 로그인·글쓰기가 정상이다

**실행해야 할 테스트**
- `cd backend && mvn test`(`REVCC_TEST_DB_PORT`/`REVCC_TEST_REDIS_PORT`를 설정해 통합테스트 포함). 신규: XFF 위조 테스트, 버킷 정리 테스트, 계정 단위 제한 테스트(존재하지 않는 아이디 포함)
- `cd board-service && npm test`. 신규: 버킷 정리 테스트, 4개 엔드포인트 429 테스트
- nginx: 임시 네트워크에서 `nginx -t`, 위조 XFF 헤더를 넣은 curl로 core에 전달되는 값 확인

---

### STEP 6: 서버측 XSS 방어 (P2-3)

**작업 목적**: board-service는 게시글·댓글·장터글·방명록·프로필을 원문 그대로 저장하고 반환한다. 지금은 프론트가 안전하게 렌더링해서 실제 XSS는 없지만, 나중에 `innerHTML`을 쓰는 소비자(관리자 도구, 다른 클라이언트)가 생기면 바로 저장형 XSS가 된다. 서버에도 방어선을 둔다.

**현재 구현 상태 (2026-09-30 코드 확인)**
- `board-service/src/validation.js`의 `text()`는 타입·길이·trim만 검사한다. sanitize 의존성이 없다. `community.js`에서 14곳, `market.js`에서 9곳이 `text()`를 거친다.
- `assignment-frontend`는 `textContent` 기반으로 렌더링한다. `innerHTML`은 `js/admin.js:76`(빈 문자열로 초기화)과 `js/footer.js:5`(정적 마크업)뿐이다. Next.js 프로토타입(`frontend/`)에는 `dangerouslySetInnerHTML`이 없다.
- nginx CSP가 `script-src 'self'`(인라인 스크립트 불허)라서 이미 강한 완화책이 하나 있다.

**결정 사항 (2026-09-30)**: **B안(입력 시 HTML 태그 제거)을 기본 구현안으로 채택한다.** 아래 A/C는 비교를 위해 남겨 둔 기록이다.

**방식 비교 (기록)**
- **A. 원문 보존 + 위험 문자만 정리**: 제어 문자, zero-width 문자, bidi override 문자를 제거한다. `<`, `>`는 그대로 둔다. 데이터 변형이 가장 적지만 "HTML 태그 제거"는 하지 않는다.
- **B. 입력 시 HTML 태그 제거(채택)**: `sanitize-html`을 `allowedTags: []`, `allowedAttributes: {}`로 적용하고 A의 문자 정리도 함께 한다. 구조적 방어가 되지만 `a<b`, `<3` 같은 정상 텍스트가 변형될 수 있으니 테스트로 동작을 고정한다.
- **C. 저장 시 HTML 이스케이프(비권장)**: 프론트가 `textContent`로 그리므로 `&lt;`가 화면에 그대로 보이는 이중 인코딩이 생긴다.

**관련 파일**
- `board-service/src/validation.js`(`text()`에 중앙 적용), `board-service/package.json`/`package-lock.json`(B안 의존성), `board-service/test/`(신규 `sanitize.test.js` 또는 기존 `community.test.js`/`admin-market.test.js` 확장)

**구현 요구사항**
1. 선택한 방식을 `text()` 한 곳에 적용해 모든 자유 텍스트 필드에 똑같이 적용되게 한다. 카테고리·상태 같은 enum 값은 기존 allow-list 검증을 그대로 쓴다.
2. 정리한 뒤 빈 문자열이 되면 필수 필드는 기존과 같은 400을 반환한다(예: 태그만 있는 게시글).
3. 길이 검사는 정리 **후** 값 기준으로 할지 정리 **전** 기준으로 할지 정하고 테스트로 고정한다(권장: 정리 전 원문 기준으로 거부해 과대 입력 처리 비용을 막는다).
4. 기존에 저장된 데이터는 변경하지 않는다(백필 없음). 백필이 필요하면 별도 STEP으로 제안한다.

**건드리지 말아야 할 영역**
- 프론트 렌더링 코드, nginx CSP(STEP 9)
- Spring이 저장하는 텍스트(차고 차량 필드, `users.nickname`) — "발견된 추가 이슈"에 기록만 한다
- 이미지 업로드 검증(`owned-images.js`)

**완료 조건**
- `<script>alert(1)</script>`, `<img src=x onerror=...>`, `javascript:` 링크 등이 게시글·댓글·장터글·방명록·프로필 어디에도 태그로 저장되지 않는다(B안 기준)
- 한글·이모지·줄바꿈·일반 부등호 텍스트의 동작이 테스트로 고정되어 있다
- 기존 테스트가 회귀 없이 통과한다

**실행해야 할 테스트**
- `cd board-service && npm test`(신규 sanitize 테스트 포함)
- `cd backend && mvn test`(board만 바뀌므로 회귀 확인용)
- 가능하면 임시 스택에서 게시글 작성 → 조회 왕복 확인(`scripts/community-system.mjs`는 현재 깨져 있어 사용 불가 — "발견된 추가 이슈" 참고)

---

### STEP 7: Redis 인증 / 네트워크 분리 / DB credential (P2-5, P2-6)

> **분리안 채택(2026-09-30 사용자 승인)**: **7-A** Redis 인증 + DB credential 정리(환경변수와 코드 변경), **7-B** Docker 네트워크 분리(compose 구조 변경)를 각각 별도 STEP·별도 커밋으로 진행한다.

**작업 목적**: Redis에 인증이 없어서 같은 네트워크의 컨테이너 하나만 뚫려도 세션 전체를 읽고 쓸 수 있다. 모든 컨테이너가 평면 브리지 하나(`revcc-network`)에 있다. 그리고 운영 오버레이의 DB 비밀번호 배선이 실제 운영 DB(Neon)와 맞지 않는다.

**현재 구현 상태 (2026-09-30 코드 확인)**
- `docker-compose.yml` redis: `requirepass` 없음. core는 `REDIS_HOST`만, board는 `REDIS_URL=redis://redis:6379`만 받는다. Spring `application.yml`에 `spring.data.redis.password`가 없다.
- `scripts/assignment-run.sh`(docker run 방식 제출 스크립트)도 무인증 redis를 띄우고 로컬 postgres(`POSTGRES_PASSWORD:-revcc`)에 연결한다.
- `docker-compose.dev.yml`: redis를 `127.0.0.1:6379`로 노출한다(컨테이너 밖 로컬 개발용).
- **DB credential 불일치**: 기본 compose의 core/board는 `.env`의 `DB_HOST/DB_USER/DB_PASSWORD`(Neon)로 접속한다. 그런데 `docker-compose.prod.yml`은 core의 `POSTGRES_PASSWORD`와 board의 `PGPASSWORD`를 **로컬 postgres용 변수인 `${POSTGRES_PASSWORD}`로 덮어쓴다**. 두 값이 다르면 prod 오버레이로 기동할 때 Neon 인증에 실패한다. STEP 1에서 문서화한 prod 배포 명령이 그대로는 동작하지 않을 수 있다.
- 로컬 postgres 서비스는 core가 Neon을 쓰는데도 `depends_on`으로 항상 함께 뜬다(기본 compose "6개 컨테이너" 구성의 일부).
- **네트워크**: `networks.default.name: revcc-network` 하나뿐이다.

**결정 사항 (2026-09-30)**
- 네트워크 분리(7-B)는 **기본 compose(`revcc-network` 6개 구성)를 유지하고 prod 오버레이에서만 적용하는 것을 기본안으로 한다.**

**작업 시작 전 사용자 결정 (7-A)**
- 운영 DB는 Neon으로 확정인가? 확정이면 prod 오버레이에서 로컬 postgres 서비스를 빼는 것(compose `!reset`, 현재 Docker Compose v5.5.1에서 지원)을 권장한다.

**관련 파일**
- 7-A: `docker-compose.yml`(redis command/healthcheck, core/board 환경변수), `docker-compose.prod.yml`, `backend/src/main/resources/application.yml`(`spring.data.redis.password`), `board-service/src/server.js`(`createClient`에 password 전달), `scripts/assignment-run.sh`, 당시 Docker 실행 문서
- 7-B: `docker-compose.prod.yml`(적용 위치), `docker-compose.garage.yml`(garage-ui가 proxy에 도달해야 함), 당시 Docker 실행 문서

**구현 요구사항**
- 7-A
  1. Redis: `redis-server --requirepass "$REDIS_PASSWORD"`를 쓰고, healthcheck는 `REDISCLI_AUTH` 환경변수를 사용한다(비밀번호를 명령줄 인자로 노출하지 않는다). 기본 compose는 로컬 편의 기본값을 둔다(`POSTGRES_PASSWORD:-revcc`와 같은 패턴). prod 오버레이는 `${REDIS_PASSWORD:?...}`로 강제한다.
  2. Spring: `spring.data.redis.password: ${REDIS_PASSWORD:}`. board: URL에 비밀번호를 넣지 말고 `createClient({ url, password: process.env.REDIS_PASSWORD || undefined })`로 넘긴다(특수문자 URL 인코딩 문제 회피).
  3. 비밀번호가 비어 있으면 지금처럼 무인증으로 접속되어야 한다. CI의 redis 서비스와 통합테스트는 변경 없이 통과해야 한다.
  4. prod 오버레이의 DB 배선을 바로잡는다. core/board는 `DB_HOST/DB_NAME/DB_USER/DB_PASSWORD`를 `:?`로 강제하고, `POSTGRES_PASSWORD` 덮어쓰기는 로컬 postgres 서비스에만 남긴다(또는 결정에 따라 prod에서 postgres 서비스 제거).
  5. `scripts/assignment-run.sh`에도 Redis 비밀번호를 똑같이 적용한다.
- 7-B (prod 오버레이에만 적용)
  1. 권장 구성: `edge`(proxy, frontend), `app`(proxy, core, board), `data`(core, board, redis[, postgres], `internal: true`). core와 board는 Neon·Kakao·SMTP로 나가야 하므로 외부 통신이 되는 `app` 네트워크에도 붙어 있어야 한다.
  2. frontend 컨테이너에서 redis/postgres에 도달할 수 없음을 확인한다.

**건드리지 말아야 할 영역**
- 세션 키 형식(`revcc:session:<token>`)과 Spring/Node 공유 계약
- 기본 compose의 `revcc-network` 6개 컨테이너 구성(변경 금지 — 7-B는 prod 오버레이에만 적용), `docker-compose.override.yml`
- 커넥션 풀·restart 정책·`.env.example` 전체 정리(STEP 8). 단 이 STEP에서 새로 추가하는 `REDIS_PASSWORD`는 `.env.example`에 추가해도 된다
- Neon DB 역할/권한 구조 변경

**완료 조건**
- 비밀번호 없이 `redis-cli ping`하면 `NOAUTH`로 거부되고, core/board는 정상적으로 세션을 공유한다(로그인 → board 글쓰기)
- `docker compose -f docker-compose.yml -f docker-compose.prod.yml config`에서 core/board의 DB 비밀번호가 `DB_PASSWORD` 값을 가리킨다
- (7-B) prod 구성에서 frontend → redis 연결이 실패하고, proxy → core/board와 core/board → Neon은 성공한다
- 기본 compose와 `scripts/assignment-run.sh`(개별 docker run 실행)가 그대로 동작한다

**실행해야 할 테스트**
- `cd backend && mvn test`(통합 포함), `cd board-service && npm test`
- 임시 스택(임시 postgres + 인증 redis)으로 core+board 기동, 로그인 → board 세션 인식 확인. **Neon에는 연결하지 않는다**
- `docker compose ... config`로 prod 오버레이 렌더링 결과 확인(실제 기동 없이)

---

### STEP 8: 운영 안정성 — 커넥션 풀 / restart 정책 / .env.example (P2-7, P2-8, P2-9)

> **분리안**: 커넥션 풀(코드·설정)과 compose/문서(restart, `.env.example`)는 서로 독립적이다. 한 세션에 넘치면 8-A(풀) / 8-B(restart + env)로 나눈다.

**작업 목적**: DB 풀이 전혀 튜닝되지 않아서 풀이 고갈되면 board 요청이 무한 대기한다. 컨테이너가 죽어도 자동으로 재시작되지 않는다. `.env.example`만 보고서는 실행에 필요한 변수를 알 수 없다.

**현재 구현 상태 (2026-09-30 코드 확인)**
- Spring: `application.yml`/`application-prod.yml`에 `spring.datasource.hikari.*`가 없다(Hikari 기본값, 최대 10).
- board: `server.js`의 `new pg.Pool({ ssl })`에 `max`/`idleTimeoutMillis`/`connectionTimeoutMillis`가 없다(`connectionTimeoutMillis` 기본 0 = 무한 대기). 모든 인증 요청이 `app.js:49-58`에서 DB를 한 번 더 조회하므로 풀 영향이 크다.
- 운영 DB는 Neon **직접 연결**(`-pooler` 호스트 아님, 2026-09-30 `.env` 확인), PostgreSQL 18.6. core + board 합계 최대 20개 연결이 Neon 한도 안에 드는지 확인된 적이 없다.
- 5개 compose 파일 어디에도 `restart:`가 없다. 참고로 Docker는 healthcheck가 unhealthy여도 컨테이너를 재시작하지 않는다(프로세스가 종료될 때만 restart 정책이 동작).
- `.env.example`에는 SMTP/비밀번호 재설정 변수만 있다. compose가 쓰는 `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`, `POSTGRES_PASSWORD`, `KAKAO_CLIENT_ID/KAKAO_CLIENT_SECRET/KAKAO_REDIRECT_URI`, `SESSION_COOKIE_SECURE`, `REVCC_PORT`, `GARAGE_PORT`(+ STEP 7의 `REDIS_PASSWORD`)가 빠져 있다.

**작업 시작 전 확인**
- Neon의 `SHOW max_connections`(읽기 전용 쿼리)와 플랜의 연결 한도를 확인한 뒤 풀 크기를 정한다.
- restart 정책을 prod 오버레이에만 둘지(권장: 로컬 PC가 부팅될 때 Neon에 붙는 스택이 자동으로 뜨지 않도록) 기본 compose에도 둘지.

**관련 파일**
- `backend/src/main/resources/application.yml` 또는 `application-prod.yml`(hikari), `board-service/src/server.js`(pg.Pool 옵션), `docker-compose.prod.yml`(또는 `docker-compose.yml`)의 `restart:`, `.env.example`, 당시 Docker 실행 문서(변수 안내)

**구현 요구사항**
1. Hikari: `maximum-pool-size`, `minimum-idle`, `connection-timeout`(권장 5초), `max-lifetime`(Neon/네트워크 idle 끊김보다 짧게)을 명시한다. 값은 환경변수로 덮어쓸 수 있게 하고 로컬 기본값을 둔다.
2. board pg.Pool: `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`(권장 5000)를 설정하고 환경변수로 덮어쓸 수 있게 한다. 기존 에러 핸들러(`app.js:84`)는 알 수 없는 오류를 이미 503으로 응답하므로, 풀 대기 타임아웃 오류가 이 경로로 503이 되는지 테스트로 고정한다.
3. 모든 서비스에 `restart: unless-stopped`(결정한 위치에).
4. `.env.example`: compose와 코드가 실제로 쓰는 변수를 전부 나열하고, 각 변수에 필수/선택, 로컬 기본값, 운영 필수 여부를 주석으로 단다. **실제 값은 절대 넣지 않는다.**

**건드리지 말아야 할 영역**
- 연결 대상(Neon 호스트, sslmode), 스키마(Flyway)
- 네트워크/Redis 인증(STEP 7), nginx(STEP 9)
- healthcheck 명령 자체(필요하면 타임아웃 조정 제안만 기록)

**완료 조건**
- board 풀 고갈 상황에서 요청이 설정한 타임아웃 안에 503으로 끝난다(테스트 또는 임시 스택에서 `max=1`로 재현)
- Spring 풀 설정이 기동 로그/설정에 반영된다
- `docker compose ... config`에서 모든 서비스에 restart 정책이 있다
- `.env.example`의 변수 목록 ⊇ compose가 참조하는 `${...}` 변수 목록(스크립트로 대조)

**실행해야 할 테스트**
- `cd backend && mvn test`(통합 포함), `cd board-service && npm test`(신규: 풀 타임아웃 → 503 매핑 테스트)
- `grep -oh '\${[A-Z_]*' docker-compose*.yml`과 `.env.example` 변수 대조
- 임시 스택에서 core/board 기동 확인. `docker kill` 후 자동 재시작 확인(restart 정책)

---

### STEP 9: Nginx 하드닝 (P2-10)

**작업 목적**: rate limit이 애플리케이션 계층에만 있어서, 앱 로직에 버그가 있으면 엣지에서 막아 줄 장치가 없다. HTTPS 운영인데 HSTS 헤더가 없다. 프록시 타임아웃도 명시돼 있지 않다.

**현재 구현 상태 (2026-09-30 코드 확인)**
- `nginx/default.conf`: `limit_req_zone`/`limit_conn_zone`이 없다. HSTS가 없다. `proxy_*_timeout`이 명시되지 않았다(기본 60초). `server_tokens`가 설정되지 않았다(버전 노출).
- 이미 있는 것: CSP(`script-src 'self'`), `X-Content-Type-Options`, `Referrer-Policy`, `Cache-Control: no-store`, `client_max_body_size 5m`, JSON이 아닌 POST/PUT/PATCH 거부(415), `X-Forwarded-Proto`가 `http`일 때 301 https.
- 헤더는 모두 server 블록의 `add_header ... always`다. location 블록에 `add_header`를 하나라도 추가하면 nginx 상속 규칙 때문에 server 블록 헤더가 전부 사라진다.
- `limit_req`의 키(`$binary_remote_addr`)는 STEP 5-A의 실제 IP 복원이 끝나야 의미가 있다. Cloudflare 뒤에서는 엣지 IP로 뭉친다.

**관련 파일**
- `nginx/default.conf`(주 대상), `nginx/Dockerfile`(변경 없을 것으로 예상), 당시 Docker 실행 문서(확인 명령 안내)

**구현 요구사항**
1. `limit_req_zone`: 인증 엔드포인트(`/api/auth/`: 로그인, 가입, 아이디 확인, 비밀번호 재설정, 카카오)용 엄격한 zone과 `/api/` 전체용 느슨한 zone을 둔다. `limit_req_status 429`. 앱 계층 제한보다 **느슨하게** 잡아 정상 사용자가 nginx에서 먼저 막히지 않게 한다(앱 제한이 1차, nginx는 안전망).
2. HSTS: 원요청이 https일 때만 보낸다(`$proxy_x_forwarded_proto`가 `https`면 헤더 값, 아니면 빈 값 → nginx가 헤더를 생략). 초기 `max-age`는 짧게 시작하고, `includeSubDomains`/`preload`는 사용자 결정 전에는 넣지 않는다.
3. `proxy_connect_timeout`/`proxy_read_timeout`/`proxy_send_timeout`을 명시한다(인증서류 업로드 5MB를 고려한다).
4. `server_tokens off`.
5. Cloudflare 실제 client IP 복원(5-A에서 제외됨): 이 시점까지 Cloudflare 운영 방식(프록시 DNS / Tunnel)이 정해졌으면 `real_ip_header CF-Connecting-IP` + `set_real_ip_from <신뢰 대역>`으로 `$remote_addr`를 실제 클라이언트로 복원한다. Cloudflare IP 목록을 하드코딩한다면 출처 URL과 확인 날짜를 주석으로 남긴다. 아직 정해지지 않았으면 미룬다고 기록한다(이 경우 `limit_req`는 Cloudflare 엣지 IP 단위로 동작한다는 한계를 문서화한다).

**건드리지 말아야 할 영역**
- CSP 값, 415 폼 차단, `X-Forwarded-Proto` 리다이렉트 로직(P0-2)
- `assignment-frontend/nginx.conf`(frontend 컨테이너 내부 설정)
- 앱 계층 rate limit(STEP 5)

**완료 조건**
- 인증 엔드포인트에 짧은 시간 버스트를 보내면 nginx가 429를 반환한다(앱 제한보다 느슨한 수준에서)
- `X-Forwarded-Proto: https`로 요청하면 HSTS 헤더가 있고, 로컬 http 직접 접속에는 없다
- 로컬 `http://localhost:8090`의 기존 기능(로그인, 글쓰기, 이미지·인증서류 업로드)이 정상이다
- 응답 헤더에 nginx 버전이 노출되지 않는다

**실행해야 할 테스트**
- 임시 네트워크에서 proxy 이미지로 `nginx -t`, curl로 버스트 → 429, HSTS 조건부 동작, 기존 보안 헤더 유지 확인
- `cd backend && mvn test`, `cd board-service && npm test`(회귀 확인용)

**결정·결과 (2026-09-30, `c9a4490`)**
- 운영 방식 확정: **Cloudflare Named Tunnel**. 사용자 → rev.cc(Cloudflare DNS·HTTPS 종단) → Named Tunnel → `cloudflared` 컨테이너 → proxy(nginx) → frontend/core/board. prod 오버레이에 `cloudflared`(2026.9.3 고정, `CLOUDFLARE_TUNNEL_TOKEN` 필수, `tunnel ready` healthcheck)를 추가했다. proxy는 호스트 포트를 게시하지 않는다(`ports: !reset []`).
- 신뢰 경계: `cloudflared`는 proxy와 둘만 있는 `tunnel` 네트워크(172.16.238.0/28, 동적 할당은 .8/29)의 고정 주소 172.16.238.2를 쓴다. nginx는 `set_real_ip_from 172.16.238.2` + `real_ip_header CF-Connecting-IP`로 이 주소에서 온 요청만 실제 IP를 복원한다. X-Forwarded-For는 신뢰하지 않는다(재귀 해석 없음). 기존 5-A 덮어쓰기(`X-Forwarded-For $remote_addr`)는 그대로다.
- Quick Tunnel(TryCloudflare, 사용자 허용)로 Cloudflare 엣지를 실측한 근거: CF-Connecting-IP는 엣지가 만들고 클라이언트가 보내면 엣지가 거부(error 1000, HTTP 403), X-Forwarded-For는 클라이언트 값 뒤에 덧붙임, `Forwarded`·`True-Client-IP`·`X-Forwarded-Host/Port/Ssl`은 그대로 통과, X-Forwarded-Proto·CF-Visitor는 엣지가 덮어씀, X-Real-IP는 제거됨.
- **발견·수정한 5-A 우회**: Spring ForwardedHeaderFilter는 `Forwarded: for=`를 X-Forwarded-For보다 먼저 쓰고, nginx는 이 헤더를 지우지 않았다. 그래서 `Forwarded`를 요청마다 바꾸면 core 로그인 IP 제한을 끝없이 우회할 수 있었다(실제 core에서 12회 모두 401, 429 없음). nginx가 `Forwarded`, `True-Client-IP`, `X-Forwarded-Host/Port/Prefix/Ssl`, `CF-Connecting-IP`를 core/board로 넘기지 않게 했다(수정 후 11번째 429). `ForwardedClientIpTest`에 재현 테스트를 추가했다.
- rate limit(2차 안전망, 앱 수치는 변경 없음): `revcc_api` `/api` 전체 IP당 20r/s·burst 200 nodelay, `revcc_auth` 로그인·가입·아이디 확인·비밀번호 재설정·카카오 IP당 30r/m·burst 30 nodelay(`/api/auth/me`·`logout` 제외). 429는 앱과 같은 JSON 본문이다.
- HSTS `max-age=300`: 연결이 172.16.238.2에서 왔고 X-Forwarded-Proto가 https일 때만 보낸다(`includeSubDomains`/`preload` 없음). 로컬 http나 위조한 X-Forwarded-Proto에는 붙지 않는다.
- timeout: `proxy_connect 5s`, `proxy_send 30s`, `proxy_read 30s`(앱 최악 약 20초보다 길고 Cloudflare 100초보다 짧다), `client_header 15s`, `client_body 30s`, `send 30s`, `keepalive 100s`(cloudflared 유휴 연결 재사용 90초보다 길게). `server_tokens off`.

---

### STEP 10: 회원탈퇴 / FK 정책 결정 (P2-11) — ⚠ 결정 STEP, 구현하지 않음

> 이 STEP은 **선택지와 영향만 정리**한다. 사용자가 데이터 보존 정책을 결정하면 그 결정을 이 파일에 기록하고, 별도의 구현 STEP(예: STEP 10-impl)을 새로 정의한 뒤 진행한다.

**현재 상태 (2026-09-30, `V1__baseline.sql` 기준)**
- 회원을 삭제하는 코드 경로가 없다. `AdminMemberController`는 정지/비활성화(`account_status`)만 한다.
- `users(id)`를 참조하는 FK:
  - **RESTRICT(기본 NO ACTION)** → 이 행이 하나라도 있으면 `DELETE FROM users` 실패: `board_posts.author_id`, `board_comments.author_id`, `vehicle_verifications.reviewed_by`(인증을 검토한 관리자는 삭제 불가)
  - **CASCADE** → 회원과 함께 삭제: `community_images.owner_id`, `owner_vehicles.owner_id`(→ `vehicle_records`, `vehicle_verifications` 연쇄 삭제, `board_posts.vehicle_id`와 `member_profiles.representative_vehicle_id`는 SET NULL), `board_likes`, `board_bookmarks`, `community_notifications.user_id/actor_id`, `community_reports.user_id`, `garage_guestbook.owner_id/author_id`, `parts_listings.seller_id`(→ `parts_favorites` 연쇄), `parts_favorites.user_id`, `member_profiles.user_id`
  - **SET NULL**: `community_reports.reviewed_by`
  - **FK 없음(느슨한 참조)**: `moderation_logs`(admin/target id + username·원문 스냅샷), `admin_member_actions.admin_id/user_id`, `board_posts.image_ids`/`parts_listings.image_ids`(배열이라 이미지가 CASCADE로 지워지면 남은 id가 깨진 참조가 됨), Redis 세션·비밀번호 재설정 키
- 관련 동작: 본인 게시글 삭제는 하드 DELETE(`moderation.js:30`)라서 그 글에 대한 처리 대기 신고(`community_reports.post_id` CASCADE)가 함께 사라진다(신고 회피 가능).

**선택지**
- **A. 소프트 탈퇴 + 개인정보 익명화(권장 후보)**
  - 방식: `users` 행을 유지하고 `account_status='WITHDRAWN'`(새 값)으로 바꾼다. username → `deleted_<id>`, 비밀번호 → 무작위 해시, `email`/`kakao_id`/`nickname`은 NULL, `auth_version` 증가(모든 세션 즉시 무효화). 게시글·댓글은 남기고 작성자를 "탈퇴한 회원"으로 표시한다.
  - FK 변경: 필요 없음(RESTRICT 문제가 생기지 않음).
  - 별도로 결정할 것: 개인 데이터 파기 범위(자동차등록증 원본 `vehicle_verifications`는 즉시 파기 권장, 차량·차고 기록·이미지·프로필·방명록·장터 매물·좋아요/북마크), 카카오 연결 끊기(unlink API) 호출.
  - 영향: 재가입 시 같은 아이디/이메일/카카오 계정 재사용 가능 여부 결정 필요. `moderation_logs`의 username·원문 스냅샷 보존 기간 결정 필요.
- **B. 하드 삭제 + 콘텐츠 보존(작성자 익명화)**
  - 방식: `board_posts.author_id`/`board_comments.author_id`를 nullable + `ON DELETE SET NULL`(또는 센티넬 "탈퇴회원" 계정으로 이전)로 바꾼다. `vehicle_verifications.reviewed_by`도 SET NULL.
  - FK 변경: 필요함(Flyway V3 + 이 컬럼들을 읽는 board/Spring 코드의 NULL 처리).
  - 영향: 스키마 의미가 바뀌므로 테스트 범위가 크다. 표시 이름 처리는 A와 같다.
- **C. 하드 삭제 + 콘텐츠 전부 삭제(CASCADE 확대)**
  - 방식: 게시글·댓글 FK도 CASCADE로 바꾼다.
  - 영향: 구현은 가장 단순하다. 대신 내 글에 달린 **타인의 댓글**, 내 차고에 **타인이 남긴 방명록**, 내 글에 대한 신고 기록이 함께 사라진다. 스레드가 끊긴다.

**모든 선택지에 공통으로 필요한 결정**
- 방명록: 내 차고에 타인이 남긴 글 / 내가 타인 차고에 남긴 글을 각각 삭제할지 익명화할지
- 거래 중(`reserved`) 장터 매물 처리
- 처리 대기 중인 신고(내가 한 신고 / 내 글에 대한 신고) 보존 여부
- 관리자 계정 탈퇴 허용 여부(관리자 로그의 `admin_id` 참조)
- 본인 게시글 삭제를 하드 DELETE에서 소프트 삭제로 바꿀지(신고 회피 문제) — 관리자 삭제는 이미 소프트 삭제
- 법적 보존 의무 검토(개인정보 보호법상 지체 없는 파기 원칙). 법률 판단은 이 파일의 범위 밖이며 사용자가 확인한다

**결정 후 구현 STEP에 들어갈 예상 파일**: Flyway `V3__...sql`(B/C 또는 신규 status 값), `AdminMemberController.java`/`AuthController.java`(탈퇴 API), `SharedSessionService.java`(세션 폐기), `board-service/src/community.js`·`market.js`·`admin.js`(탈퇴 회원 표시), `assignment-frontend`(탈퇴 UI), 관련 테스트

**이 STEP에서 하는 일**: 없음(문서 결정만). 사용자 결정을 이 섹션 아래에 "결정: ..."으로 기록한다.

> 위 "선택지" A/B/C는 초안의 번호다. 아래 결정은 2026-09-30 조사 보고의 [결정 1~12] 번호를 따른다(초안 A ≈ 확정안).

**조사 결과 요약 (2026-09-30, 코드·임시 PostgreSQL 실측·Neon 읽기 전용 확인)**
- 운영 Neon의 FK 30개는 V1과 같다. `users` 참조 15개 중 `board_posts.author_id`, `board_comments.author_id`, `vehicle_verifications.reviewed_by`는 NO ACTION이라, 이미 삭제 표시된 글·댓글이 하나라도 있으면 `DELETE FROM users`가 실패한다. 나머지는 CASCADE(방명록 양쪽, 예약중 매물, 본인이 한 신고 포함)이고 `community_reports.reviewed_by`만 SET NULL이다.
- FK 없는 참조: `moderation_logs`(username·원문 스냅샷), `admin_member_actions`, `image_ids` 배열(실측: 이미지가 지워지면 id가 남아 깨진 링크), Neon 전용 `board_test_posts_archive`(`author_id`, `test_username`, 9행).
- 본인 게시글 삭제는 하드 DELETE라서 처리 대기 신고, **타인의 댓글**, 알림이 함께 사라진다(실측). 탈퇴와 관계없이 신고를 회피할 수 있다.
- `/api/board/images/:id`는 로그인 없이 연번 id로 조회된다. 관리자가 삭제한 글의 사진도 행이 남아 계속 보인다.
- 세션: Spring(`SharedSessionService.require`)과 board(`app.js`)가 매 요청마다 DB의 `auth_version`과 상태를 확인한다. `auth_version`을 올리면 모든 기기의 세션이 즉시 무효가 된다.
- 카카오: access token을 저장하지 않고, unlink 호출과 Admin 키도 없다. 화면의 작성자 이름은 `users.username`이다(카카오 가입자는 카카오 닉네임).
- Neon 집계(2026-09-30): 회원 33(관리자 1), `account_status`는 모두 NULL(ACTIVE), 카카오 1, 일반 32 중 **이메일 없음 31**. orphan 참조 0, 삭제 표시 글 0, 매물 0, 이미지 3(모두 참조됨).

**결정 (2026-09-30, 사용자 확정)**
1. 게시글·댓글: 유지한다. 작성자는 "탈퇴한 회원"으로 표시하고, 타인의 댓글과 게시판 문맥을 보존한다.
2. 탈퇴 방식: soft withdrawal. `users` 행은 유지하고 영구 탈퇴 상태(로그인 불가)로 만든다. 개인정보·인증정보는 익명화하거나 제거한다. 관리자가 ACTIVE로 되돌릴 수 없다.
3. 재가입: 일반 탈퇴자는 30일 뒤 같은 이메일·카카오 계정으로 재가입할 수 있다. 정지·제재 상태에서 탈퇴한 사용자는 재가입으로 제재를 우회할 수 없게 별도 처리한다. 원본 이메일·kakao_id는 보관하지 않고, 필요하면 HMAC 등 역산이 어려운 값만 최소한으로 보관한다.
4. 정지 중이거나 처리 대기 신고가 있는 회원도 탈퇴할 수 있다. 신고·제재·운영 기록은 탈퇴와 관계없이 보존한다.
5. 본인 게시글 삭제는 하드 DELETE하지 않는다. 화면에는 "삭제된 글"로 처리하고 댓글·신고·운영 기록은 유지한다(신고 회피 차단).
6. 부품 매물: 판매완료는 유지한다(판매자 "탈퇴한 회원", 연락처 등 개인정보 제거). 판매중은 판매 종료·비공개로 바꾼다. **예약중 매물이 있으면 탈퇴를 막는다**(구매자 모델이 없어 거래 보호 불가, 향후 거래 상대 모델이 생기면 개선).
7. 방명록: 탈퇴자의 차고와 그 차고의 방명록은 삭제한다. 탈퇴자가 다른 회원 차고에 쓴 방명록은 "탈퇴한 회원"으로 유지한다.
8. 차량·번호판·자동차등록증·정비기록·프로필/커버 이미지·차고 전용 이미지는 삭제한다. 공개 게시글에서 실제 사용 중인 이미지는 유지한다. 게시글에 쓰이지 않는 탈퇴 회원 이미지는 삭제하고, `image_ids` orphan 문제를 정리한다.
9. 운영 기록(`moderation_logs` 등)은 탈퇴 즉시 지우지 않고 일정 기간 보존한다. 원문과 기존 username을 영구 보존하지 않는다. 보존기간은 이 STEP에서 정하지 않고 설정값으로 관리한다. 탈퇴 회원의 username과 운영에 꼭 필요하지 않은 직접 식별정보는 가능한 범위에서 익명화한다.
10. 관리자는 관리자 권한을 가진 상태로 탈퇴할 수 없다(먼저 일반 회원으로 강등). 마지막 관리자를 강등해 관리자가 0명이 되는 것도 막는다.
11. 카카오 가입자: kakao_id를 제거·익명화하고, 가능하면 카카오 "연결된 앱" 연결도 해제한다. 실제 secret은 저장소에 넣지 않는다.
12. 즉시 탈퇴(유예 없음). 실행 직전 본인 확인은 필수다. 일반 계정은 현재 비밀번호를 다시 입력하고, 카카오 계정은 카카오 재인증을 거친다. 로그인 세션만으로는 탈퇴할 수 없다.

---

### STEP 10-impl: 회원탈퇴 구현 계획 (A~E, 각각 별도 커밋)

> 위 결정 1~12의 구현이다. **"구현 전 결정 필요" 항목(아래 맨 끝) 중 해당 하위 STEP에 표시된 것은 착수 전에 사용자에게 확인한다.** 각 하위 STEP은 공통 작업 규칙(§5)을 따른다. Neon에는 Flyway 적용(새 core 기동) 외에 쓰지 않는다. Flyway를 적용하기 전에 아래 "Neon 사전 점검"을 읽기 전용으로 다시 확인한다.

**공통 용어·설계**
- 탈퇴 상태: `users.account_status = 'WITHDRAWN'`(최종 상태, 되돌리기 없음) + `users.withdrawn_at`.
- 익명화 결과: `username` → `withdrawn:<id>`(표시용이 아니다. 가입·카카오 닉네임 갱신에서 `withdrawn:` 접두어를 금지해 선점·사칭을 막는다), `password` → 무작위 BCrypt, `email`/`nickname`/`kakao_id` → NULL, `suspended_until`은 유지(내부 기록), `auth_version` + 1.
- 표시: 공개 API는 탈퇴 작성자를 `username: "탈퇴한 회원"`, `authorId: null`, `authorWithdrawn: true`로 내려준다. 같은 탈퇴자의 글끼리 공개 화면에서 연결되지 않게 한다. 관리자 API는 내부 id를 유지한다. 가입 시 username "탈퇴한 회원"도 예약어로 막는다.
- 탈퇴 처리의 소유자는 core(Spring)다. `users`와 본인 확인이 core에 있고, board 테이블은 같은 DB에서 `JdbcTemplate`로 한 트랜잭션 안에서 처리한다.
- 트랜잭션 순서: ① 본인 확인 → ② `users` 행 `FOR UPDATE` + 사전 조건 검사(ADMIN 아님, 이미 탈퇴 아님, 예약중 매물 0) → ③ (카카오) unlink → ④ DB 처리(아래 C-2 순서) → ⑤ 커밋 → ⑥ 현재 세션 Redis 삭제 + 쿠키 제거. ③은 외부 호출이라 ②의 잠금 전에 할지 뒤에 할지는 D에서 확정한다(결정 필요 D-1).

**STEP 10-impl-A: 탈퇴 상태 기반 + 차단 + 관리자 보호** (탈퇴 API 없음, 기존 동작 무변화가 목표)
- Flyway `V3__member_withdrawal_base.sql`
  - `users ADD withdrawn_at TIMESTAMPTZ`. `account_status`에 `CHECK (account_status IS NULL OR account_status IN ('ACTIVE','SUSPENDED','DISABLED','WITHDRAWN'))`. Neon은 모두 NULL이라 안전하지만 적용 전에 다시 확인한다.
  - `board_posts ADD deleted_at TIMESTAMPTZ, ADD deleted_by BIGINT REFERENCES users(id), ADD deleted_reason VARCHAR(10) CHECK (deleted_reason IN ('AUTHOR','ADMIN'))`. 기존 `deleted=true` 행은 `deleted_reason='ADMIN'`으로 백필한다(지금까지 soft delete는 관리자 삭제뿐, Neon 0행).
- Spring
  - `User.isBlocked()`에 WITHDRAWN 포함, `isWithdrawn()` 추가, `withdrawn_at` 매핑(`ddl-auto: validate` 통과).
  - 로그인·카카오 로그인·`SharedSessionService.require`는 `isBlocked` 경유로 자동 차단된다. 카카오는 kakao_id가 NULL이 되므로 기존 계정으로 들어갈 수 없다(새 가입 경로는 C의 재가입 제한이 막는다).
  - `AdminMemberController.update`: 대상이 WITHDRAWN이면 모든 변경 409(복구 불가). `Update.status` 허용 값에 WITHDRAWN을 넣지 않는다. 목록 필터에 WITHDRAWN을 추가한다. `detail`/`list`는 탈퇴 계정의 email 등이 이미 NULL이므로 그대로 둔다.
  - 마지막 관리자 보호: ADMIN 대상을 USER로 바꾸거나 ACTIVE가 아니게 만드는 변경은, 변경 후 "ACTIVE인 ADMIN" 수가 0이면 409. 동시 강등 경쟁을 막으려고 `SELECT ... FROM users WHERE role='ADMIN' FOR UPDATE`로 관리자 행 전체를 잠근 뒤 센다. 기존 "자기 자신 강등 금지"는 유지한다.
  - `/api/auth/signup`, 카카오 신규 가입·닉네임 갱신: `withdrawn:` 접두어와 "탈퇴한 회원" 금지.
- board-service
  - `app.js` 인증: status WITHDRAWN이면 `req.user=null`(auth_version 비교와 이중 방어).
  - 표시: 작성자 JOIN(`community.js` postSelect·댓글·알림·방명록·회원 프로필, `market.js` select, `admin.js` 목록)에 공통 SQL 식 `CASE WHEN u.account_status='WITHDRAWN' THEN '탈퇴한 회원' ELSE u.username END` + `authorId` 숨김을 적용한다(한 곳에 상수로 두고 재사용).
  - 탈퇴 회원 프로필(`/api/board/members/:id`)은 404, 통계 `memberCount`와 관리자 회원 목록 집계는 WITHDRAWN을 제외(관리자 목록은 필터로 조회 가능), 검색(`u.username ILIKE`)은 탈퇴자를 제외한다.
- frontend: 관리자 회원 관리(`assignment-frontend/js/admin.js`)에 WITHDRAWN 표시·필터를 추가하고 탈퇴 계정 편집 폼을 비활성화한다. 게시판·장터는 서버 표시값을 그대로 쓴다(`authorId` null이면 프로필 링크 없음).
- 테스트: `User` 상태 단위 테스트, `AdminMemberController` PATCH(WITHDRAWN 409, 마지막 관리자 409, 동시 강등은 통합 테스트로 한 명만 성공), `AuthControllerTest`(WITHDRAWN 로그인 401과 같은 응답, 카카오 403), 예약어 가입 400, board `session-revocation`·`app.test`(WITHDRAWN 세션 거부), 표시 이름 테스트(목록·상세·댓글·방명록·장터·알림), Flyway V3를 빈 PG16/PG18과 V1+V2 적용 DB 양쪽에 적용.

**STEP 10-impl-B: 본인 글 soft delete + 이미지 공개 범위 + image_ids orphan 방지** (탈퇴와 독립, 결정 5·8)
- 본인 글 삭제(`moderation.js` `deleteContent`): `DELETE` 대신 `UPDATE board_posts SET deleted=true, deleted_at=NOW(), deleted_by=<본인>, deleted_reason='AUTHOR'`. 원문은 DB에 남기되 공개 API에서는 이미 `NOT deleted`로 숨는다. 댓글·신고·좋아요·알림은 그대로 남는다(알림 목록은 이미 `NOT p.deleted`로 거른다).
  - 관리자 신고 목록(`admin.js /reports`)은 삭제된 글의 신고도 계속 보여 주고 삭제 사유(AUTHOR/ADMIN)를 표시한다. 신고 처리 화면에서 관리자가 원문을 볼 수 있게 한다.
  - 본인이 삭제한 글의 원문 보존기간은 E의 보존기간 설정을 따른다(결정 필요 E-1).
  - 본인 댓글 삭제는 이미 soft(내용을 "삭제된 댓글입니다."로 덮어씀)라 바꾸지 않는다. 댓글은 신고 대상이 아니다.
  - 관리자 게시글 수·게시글 목록 집계는 삭제 표시 글을 제외한다(`admin.js` postCount).
- 이미지 공개 범위(`GET /api/board/images/:id`): 아래 중 하나일 때만 200, 아니면 404.
  - 삭제되지 않은 게시글의 `image_ids`에 있음
  - 비공개(closed)가 아닌 매물의 `image_ids`에 있음
  - 탈퇴하지 않은 회원의 프로필 avatar/cover 또는 차량 `image_id`임
  - 요청자가 이미지 소유자(작성 중 미리보기)
  - 관리자(신고 처리)
  - 배열 검색 성능을 위해 Flyway `V4__image_reference_indexes.sql`로 `board_posts.image_ids`, `parts_listings.image_ids`에 GIN 인덱스를 만든다. 응답에 `Cache-Control: no-store`를 유지한다.
- orphan 방지: 이미지 행을 지우는 경로를 공통 함수 하나(`purgeUnreferencedImages(ownerId)`: 위 참조 어디에도 없는 그 회원의 이미지만 삭제)로 모은다. 게시글·매물 조회 시 `image_ids`는 실제 존재하는 이미지와 교집합으로 응답한다(과거 데이터 방어). 관리자 삭제가 `image_ids='{}'`로 비운 사진은 참조가 없어져 공개되지 않는다. 물리 삭제는 E의 정리 작업이나 탈퇴 때 한다. 배열을 연결 테이블(`post_images` + FK)로 바꾸는 것은 이번 범위 밖이다(추가 이슈로 기록).
- 테스트: 본인 글 삭제 후 신고·타인 댓글·알림 행 유지 + 공개 404(`moderation-system.mjs`의 "owner deletes" 기대값 수정), 신고 목록에 AUTHOR 삭제 표시, 이미지 공개 규칙 행렬(게시글 삭제 전후, 관리자 삭제, 비로그인/소유자/관리자, 탈퇴자 프로필), `image_ids` 교집합 응답, V4 적용 테스트.

**STEP 10-impl-C: 일반 계정 탈퇴 + 데이터 처리 + 재가입 제한 + UI**
- Flyway `V5__member_withdrawal_data.sql`
  - `parts_listings`: status CHECK에 `'closed'` 추가, `ADD closed_at TIMESTAMPTZ`. 공개 목록·상세·검색·찜 목록은 `closed`를 제외한다(판매자 본인과 관리자만 조회).
  - `withdrawal_blocks(id BIGSERIAL PK, identifier_type VARCHAR(10) CHECK IN ('EMAIL','KAKAO'), identifier_hmac CHAR(64) NOT NULL, reason VARCHAR(10) CHECK IN ('COOLDOWN','SANCTION'), user_id BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NULL)`, 인덱스 `(identifier_type, identifier_hmac)`. `expires_at IS NULL`이면 관리자가 해제할 때까지 유지한다.
- 재가입 제한(결정 3·13): HMAC-SHA256(키 = 새 환경변수 `WITHDRAWAL_HMAC_SECRET`, prod 오버레이 `:?` 필수, 32자 이상). 입력은 `email:<정규화 이메일>`(기존 `PasswordResetService.email()` 정규화), `kakao:<kakao id>`. 원문은 저장하지 않는다.
  - COOLDOWN: 모든 탈퇴에 `expires_at = 탈퇴 + 30일`.
  - SANCTION: 탈퇴 시점에 SUSPENDED(미래 종료일)나 DISABLED였으면 추가로 기록한다. 기간은 결정 필요 C-2.
  - 확인 위치: 가입(이메일이 있을 때), 카카오 신규 가입(`createKakaoUser`), 관리자의 이메일 등록·변경. 제한 중이면 409 "탈퇴 후 30일 동안은 같은 정보로 가입할 수 없습니다"(제재 사유는 노출하지 않는다).
  - 만료 행은 E의 정리 작업이 지운다. 키를 교체하면 기존 제한이 무효가 되므로 교체 절차를 문서화한다.
  - **한계**: 이메일 없이 가입한 일반 계정은 식별값이 없어 재가입 제한을 걸 수 없다(Neon 일반 계정 32개 중 31개). → 결정 필요 C-1.
- API: `POST /api/auth/withdraw` `{password, confirm: true}`(JSON, 로그인 필수). 카카오 계정(kakao_id 있음)은 400 "카카오 재인증으로 탈퇴해 주세요"(D에서 구현).
  - 비밀번호 확인은 로그인과 같은 `matches()`(레거시 평문 포함)를 쓴다. 실패는 사용자당 5회/15분 제한(`LoginAttemptLimiter` 패턴, 별도 키 `withdraw-fail:`)과 IP 제한(`RateLimitConfig`에 `/api/auth/withdraw` 추가)으로 막는다. nginx `revcc_auth` 정규식에도 `withdraw`를 추가한다.
  - 사전 조건: ADMIN이면 409 "관리자 권한을 먼저 해제해야 합니다", 예약중 매물이 있으면 409 + 개수, 이미 탈퇴면 401.
- DB 처리 순서(한 트랜잭션, `WithdrawalService`):
  1. `users FOR UPDATE`, 사전 조건 재검사.
  2. `withdrawal_blocks`를 기록한다(원문이 지워지기 전에 HMAC 계산).
  3. 차고: `owner_vehicles` 삭제(CASCADE로 정비기록·자동차등록증·인증 삭제, 게시글 `vehicle_id`는 SET NULL). 탈퇴자 차고의 방명록(`garage_guestbook.owner_id=탈퇴자`) 삭제. `member_profiles` 삭제. 타인 차고에 쓴 방명록은 유지.
  4. 매물: `selling` → `closed` + `closed_at` + `contact=''` + 찜 삭제. `sold` → `contact=''`만 비우고 유지(`region`은 결정 필요 C-3). `reserved`는 1에서 이미 막았다.
  5. 개인 활동: 본인의 좋아요·북마크·찜·받은 알림을 삭제한다(결정 필요 C-4). 본인이 유발한 타인의 알림은 유지(표시만 "탈퇴한 회원"). 본인이 한 신고(`community_reports.user_id`)는 유지(결정 4).
  6. 이미지: 차량이 먼저 지워진 뒤 `purgeUnreferencedImages(탈퇴자)` → 남은 공개 게시글·유지 매물에 쓰인 이미지만 남는다(결정 8, 판매완료 매물 사진 유지 여부는 결정 필요 C-3).
  7. `moderation_logs.target_author_username`(탈퇴자 대상 행) → `탈퇴한 회원#<id>` 익명화(결정 9, id로 내부 추적은 유지).
  8. `users` 익명화(공통 설계) + `withdrawn_at` + `account_status='WITHDRAWN'` + `auth_version+1`.
  9. `admin_member_actions(admin_id=NULL, user_id=탈퇴자, action='SELF_WITHDRAW:<직전상태>')`.
  - 커밋 후 현재 세션 키 삭제와 쿠키 제거. 다른 기기 세션은 `auth_version` 비교로 즉시 무효가 된다. 비밀번호 재설정 토큰은 이메일 NULL·`auth_version` 불일치로 실패하고, Redis 키는 TTL로 사라진다.
- frontend: 내 정보 영역(`assignment-frontend/js/home.js` 또는 해당 설정 화면)에 "회원 탈퇴"를 추가한다. 처리 내용 안내(글·댓글 유지, 차고·등록증 삭제, 30일 재가입 제한), 예약중 매물 안내, 비밀번호 입력과 확인 체크 후 호출, 성공 시 로그아웃 상태로 홈 이동. 카카오 계정에는 "카카오로 다시 인증하고 탈퇴" 버튼(D).
- 테스트: `WithdrawalService` 통합 테스트(실 PostgreSQL, 테이블별 결과를 결정표대로 검증), 비밀번호 오류·제한, ADMIN 409, 예약중 409, 재가입 30일(가입·카카오·관리자 이메일 등록) + 제재 탈퇴, HMAC 원문 미저장(DB에 이메일 문자열 없음), 세션 즉시 무효(Spring·board), 이미지 유지/삭제 행렬, 매물 closed 비공개, 방명록 양방향, 신고·moderation_logs 유지와 익명화, 브라우저 스크립트(탈퇴 흐름).

**STEP 10-impl-D: 카카오 계정 탈퇴 + unlink** (결정 11·12) — ⏸ 2026-10-01 보류: §4 LATER-1에서 최소 구현으로 다시 설계한다. timeout은 NOW-4로 분리했다.
- 카카오 API 조사(2026-09-30, developers.kakao.com):
  - 연결 끊기: `POST https://kapi.kakao.com/v1/user/unlink`. 인증은 두 가지다. 사용자 토큰(`Authorization: Bearer <사용자 access token>`) 또는 Admin 키(`Authorization: KakaoAK <서비스 앱 Admin 키>` + `target_id_type=user_id&target_id=<회원번호>`). 성공 시 200 `{"id": 회원번호}`. 동의를 철회하고 발급된 토큰을 폐기한다.
  - 재인증: 인가 요청에 `prompt=login`을 붙이면 사용자가 카카오 로그인(인증)을 다시 수행해야 한다.
- 설계(**Admin 키 불필요**):
  1. 탈퇴 화면 → `GET /api/auth/kakao/withdraw`(로그인 필수, 카카오 계정만) → 인가 URL에 `prompt=login`을 붙이고, state를 Redis에 `withdraw:<userId>`로 저장(기존 `KakaoStateService` 확장, 5분, 1회 소비).
  2. 같은 콜백(`/api/auth/kakao/callback`, 등록된 Redirect URI를 그대로 사용)에서 state 목적이 withdraw이면 분기한다. 코드 교환으로 **사용자 access token**을 받고 사용자 정보의 id가 세션 사용자 kakao_id와 같은지 확인한다. 세션도 유효해야 하고, 둘 중 하나라도 어긋나면 400.
  3. 사전 조건(ADMIN·예약중 매물) 재검사 → 그 토큰으로 unlink(Bearer) 호출 → C의 탈퇴 트랜잭션 → 쿠키 제거 후 `/?withdrawn=1`로 이동.
  - `KakaoOAuthService.exchange`는 access token을 밖으로 내지 않게 유지하고, 탈퇴 전용 메서드(교환 + 사용자 조회 + unlink)를 추가한다. 토큰은 저장·로그하지 않는다.
- Admin 키를 쓰지 않는 이유와 보안 영향: Admin 키는 임의의 `target_id`로 이 앱의 어떤 사용자든 연결을 끊을 수 있고 다른 관리자 API도 호출할 수 있다. 유출 시 피해 범위가 앱 전체다. 사용자 토큰 방식은 재인증한 본인에게만 동작한다. Admin 키가 필요한 경우는 unlink 실패 재시도, 관리자 주도 정리, 이미 탈퇴한 과거 계정 처리뿐이다. 이번 STEP에서는 도입하지 않는다. 도입한다면 운영 `.env`에만 `KAKAO_ADMIN_KEY`로 두고(저장소·로그·클라이언트 금지), 서버 내부 호출에만 쓰며, 유출 시 카카오 개발자 콘솔에서 재발급한다.
- 카카오 HttpClient timeout(STEP 9 추가 이슈 해결): 연결 5초, 요청 10초. 탈퇴 흐름이 카카오 응답을 기다리므로 이 STEP에 포함한다.
- 테스트: 인가 URL에 `prompt=login`과 state 목적이 포함되는지, state 목적 불일치·재사용·만료, 카카오 id 불일치 400, 세션 없음 401, unlink 요청 헤더(Bearer, Admin 키 미사용), unlink 실패 처리(결정 필요 D-1), timeout 설정, 카카오 로그인 흐름 회귀(prompt 없음).

**STEP 10-impl-E: 운영 기록 보존기간 + FK 없는 참조 + 운영 정리 절차** (결정 9, 요구 14·15) — ⏸ 2026-10-01 보류(현재 규모에서는 오버헤드, §4 "보류")
- 보존기간 설정(값은 사용자 결정, 결정 필요 E-1):
  - `REVCC_MODERATION_RETENTION_DAYS`: `moderation_logs.original_content`와 `target_author_username`/`admin_username` 비우기. 보존 대상은 행과 종류·일시·대상 id·처리 관리자 id·사유다.
  - `REVCC_DELETED_POST_RETENTION_DAYS`: 본인 삭제 글 원문 비우기. 처리 대기 신고가 있는 글은 처리 전까지 보류한다.
  - `REVCC_WITHDRAWAL_BLOCK` 만료 정리.
  - 값이 없으면 prod 오버레이가 기동을 거부한다(`:?`). 영구 보존으로 조용히 흘러가지 않게 하려는 것이다. 로컬 기본값은 테스트용으로 짧게 둔다.
- Flyway `V6__retention_and_references.sql`: `moderation_logs ADD content_purged_at TIMESTAMPTZ`(NOT NULL 컬럼은 빈 문자열로 비움). FK 없는 참조에 FK를 `NOT VALID`로 추가한다: `admin_member_actions.user_id/admin_id`, `moderation_logs.target_author_id/admin_id` → `users(id)`(NO ACTION). 같은 파일에서 `VALIDATE CONSTRAINT`를 한다(Neon orphan 0 확인, 적용 직전 재확인). `users`는 더 이상 하드 삭제하지 않으므로 이 FK가 앞으로의 하드 삭제를 막는 안전장치가 된다. `moderation_logs.target_id`/`post_id`는 게시글·댓글·매물을 가리키는 다형 참조라 FK를 두지 않는다.
- 정리 작업: core의 `@Scheduled`(하루 1회, 한 번에 N행씩, 여러 인스턴스 대비 `pg_try_advisory_lock`)로 위 보존기간을 적용한다. 참조 없는 이미지 중 업로드 후 24시간이 지난 것도 삭제한다(작성 중 업로드 보호).
- Neon `board_test_posts_archive`(요구 14): **Flyway로 건드리지 않는다.** 운영 절차를 `docs/`에 적는다: ① 읽기 전용으로 행 수·기간 확인 → ② 필요하면 사용자가 보관 여부 결정(보관 시 암호화된 곳으로 `pg_dump -t`) → ③ 사용자가 Neon 콘솔에서 직접 `DROP TABLE` → ④ `flyway validate` 영향 없음 확인(Flyway가 모르는 테이블).
- 테스트: 가짜 시계로 보존기간 경계(직전·직후), 처리 대기 신고 글 보류, 설정 누락 시 prod 기동 거부(`docker compose config`), FK NOT VALID→VALIDATE 적용(orphan 있는 DB에서는 실패함을 확인해 사전 점검 필요성 고정), advisory lock 중복 실행 방지.

**migration 순서와 배포 (V3~V6)**
- 하위 STEP마다 Flyway 파일 하나씩. 순서는 V3(A) → V4(B) → V5(C) → V6(E)이고, D는 스키마 변경이 없다. 각 파일은 이전 코드와 호환되게 만든다(컬럼 추가·CHECK 값 추가만, 기존 값 거부 없음). 구 코드가 잠시 함께 돌아도(Mac 등) 깨지지 않게 한다. 구 board는 WITHDRAWN을 모르지만 `auth_version` 불일치로 세션을 거부한다.
- 각 파일 검증: 빈 PG16·PG18에 V1→Vn 적용, V1+V2 상태(현재 Neon 형태)에 Vn만 적용, `ddl-auto: validate` 기동, 재기동 멱등.
- Neon 사전 점검(각 배포 직전, 읽기 전용): `account_status` 값 분포, orphan 참조 0, `board_posts.deleted` 수, 매물 status 분포, `image_ids` 깨진 참조 0. 결과를 작업 이력에 남긴다.

**예상 변경 파일**
- Flyway: `V3__member_withdrawal_base.sql`, `V4__image_reference_indexes.sql`, `V5__member_withdrawal_data.sql`, `V6__retention_and_references.sql`
- Spring: `User.java`, `AuthController.java`, `AdminMemberController.java`, `SharedSessionService.java`(필요 시), `KakaoOAuthService.java`, `KakaoStateService.java`, `RateLimitConfig.java`, 신규 `WithdrawalService.java`·`WithdrawalController.java`(또는 AuthController에 추가)·`WithdrawalBlockService.java`·`RetentionJob.java`, `application.yml`/`application-prod.yml`(HMAC secret, 보존기간, 스케줄링)
- board: `app.js`, `community.js`, `market.js`, `admin.js`, `moderation.js`, `owned-images.js`(또는 신규 `images.js`), 신규 표시 이름 공통 모듈
- frontend: `assignment-frontend/js/admin.js`, `home.js`(또는 내 정보 화면), `auth.js`(예약어 안내), `market.js`/`community-list.js`(`authorId` null 처리)
- 인프라·문서: `nginx/default.conf`(auth zone에 withdraw), `docker-compose.yml`/`docker-compose.prod.yml`(`WITHDRAWAL_HMAC_SECRET`, 보존기간 변수), `.env.example`, 당시 Docker 실행 문서, 신규 운영 절차 문서
- 테스트: `AuthControllerTest`, `AdminControllerTest`(또는 신규 `AdminMemberControllerTest`), `KakaoOAuthServiceTest`, `KakaoStateServiceTest`, 신규 `WithdrawalServiceTest`/`WithdrawalIntegrationTest`/`RetentionJobTest`, board `app.test.js`·`community.test.js`·`admin-market.test.js`·`session-revocation.test.js` + 신규 `withdrawal-display.test.js`·`images.test.js`, `scripts/moderation-system.mjs`(본인 삭제 기대값), `scripts/community-system.mjs`·`market-system.mjs`(표시·closed), 브라우저 스크립트(`auth-browser.cjs`, `member-browser.cjs`)

**전체 테스트 계획(하위 STEP 공통)**
- `mvn test`(통합 포함, 실 PostgreSQL·Redis), `npm test`, `scripts/run-board-system.sh` 4개, `garage-schema-check.py`(V3~ 적용 확인), `scripts/nginx-forwarded-check.sh`(nginx 변경 시)
- 임시 prod 스택(STEP 9 방식, SSL PostgreSQL로 Neon 대역)에서 e2e: 가입 → 글·댓글·방명록·차량·등록증·매물(판매중/판매완료/예약중) 생성 → 탈퇴 시도(예약중 409) → 예약 해제 후 탈퇴 → 테이블별 결과·공개 화면 표시·이미지 공개 여부·세션 무효·30일 재가입 제한·제재 탈퇴 제한 확인
- Neon에는 Flyway 적용 외에 쓰지 않는다. 사전 점검은 읽기 전용이다.

**구현 전 결정 필요 (해당 하위 STEP 착수 전에 사용자 확인)**
- ~~C-1 (C 전)~~ **결정(2026-10-01): 한계 인정.** 이메일 필수화 없이 있는 식별값(아이디·이메일·카카오 id)만 차단한다. 이메일 없이 가입한 일반 계정(현재 31/32)은 재가입 제한을 걸 식별값이 없다. 제재 중 탈퇴해도 새 아이디로 다시 가입할 수 있다. 선택: 가입 시 이메일 필수화 / 한계 인정(제재 우회 방지는 이메일·카카오 계정에만 적용) / 다른 식별 수단 도입.
- ~~C-2 (C 전)~~ **결정(2026-10-01): 기본안.** 제재 중 탈퇴자의 재가입 제한 기간. 정지(SUSPENDED)는 "정지 종료일과 30일 중 늦은 날까지", 비활성화(DISABLED)는 "관리자가 해제할 때까지"를 기본안으로 제안한다.
- ~~C-3 (C 전)~~ **결정(2026-10-01): 기본안(지역·사진 유지).** 판매완료 매물의 지역(`region`)과 사진을 유지할지. 기본안: 지역은 유지(시·구 수준), 사진은 유지(게시글 사진과 같은 원칙).
- ~~C-4 (C 전)~~ **결정(2026-10-01): 삭제.** 탈퇴자가 남긴 좋아요(다른 사람 글의 좋아요 수가 줄어듦)를 삭제할지 유지할지. 기본안: 삭제(개인 활동 기록).
- ~~C-5 (C 전)~~ **결정(2026-10-01): 기본안(아이디 HMAC 30일, 가입과 같은 원문 비교).** 탈퇴자의 기존 아이디(username)를 다른 사람이 곧바로 쓸 수 있게 할지. 기본안: 30일 동안 같은 아이디 가입 금지(아이디 HMAC을 COOLDOWN에 함께 기록). 사칭 방지 목적이다.
- D-1 (D 전): 카카오 unlink가 실패(카카오 장애·timeout)하면 탈퇴를 중단할지(나중에 다시 시도), 탈퇴는 진행하고 연결만 남길지. 기본안: 중단하고 안내(Admin 키 없이 재시도할 방법이 없으므로).
- E-1 (E 전): 운영 기록 원문·아이디 보존기간, 본인 삭제 글 원문 보존기간(일 수). 법적 판단은 사용자가 확인한다.

---

### STEP 11: 비밀번호 재설정 계정 열거 (P2-1) — ⏸ 2026-10-01 보류: 작은 응답 통일은 §4 LATER-2

**작업 목적**: 비밀번호 재설정 요청이 "없는 아이디 / 이메일 불일치 / 카카오 계정"을 서로 다른 코드로 알려 준다. 그래서 특정 아이디에 어떤 이메일이 연결돼 있는지 확인할 수 있다.

**현재 구현 상태 (2026-09-30 코드 확인)**
- `PasswordResetService.request()`가 `USERNAME_NOT_FOUND`/`IDENTITY_MISMATCH`/`SOCIAL_ACCOUNT`(모두 400)를 구분해서 반환한다. `PasswordResetRequestTest.java`가 이 동작을 의도된 것으로 고정하고 있다. `assignment-frontend/js/password-reset.js:8`이 이 코드들로 안내 문구를 분기한다.
- 메일 발송은 요청 스레드에서 동기로 실행되고(SMTP 타임아웃 5초), 실패하면 `MAIL_UNAVAILABLE`(503)을 반환한다. **아이디와 이메일이 맞을 때만 발생하므로** 이것도 계정 확인 신호가 되고, 응답 시간 차이도 신호가 된다.
- 제한: IP당 20회/시간(`getRemoteAddr()` 기반이라 STEP 5-A 전에는 위조 가능), 이메일당 5회/시간(**입력한 이메일 기준**이라 이메일을 바꿔 가며 같은 아이디를 시험하는 것은 막지 못함).
- **아이디 존재 여부 자체는 이미 공개 정보다**: `/api/auth/check-username`(가입 화면의 아이디 확인)이 존재 여부를 알려 주고, 게시글 작성자 이름도 공개된다. 따라서 이 STEP에서 실질적으로 보호할 대상은 "아이디 ↔ 이메일 연결(개인정보)"이다.

**작업 시작 전 사용자 결정**
- **A. 현행 유지**: UX 우선. 위험을 수용했다고 문서에 기록하고, STEP 5의 제한 강화로 완화한다. 코드 변경 없음.
- **B. 요청 응답 통일(권장)**: 없는 아이디, 불일치, 카카오 계정, 정상 모두 같은 `CODE_SENT` 응답("입력한 정보가 맞으면 인증번호를 보냈습니다")을 반환한다. 메일은 정상인 경우에만 보낸다(카카오 계정이면 "카카오 로그인을 이용하세요" 안내 메일로 대체할 수 있음). 메일 발송을 비동기로 바꾸거나 응답 시간을 맞춰 타이밍 차이를 줄인다. `MAIL_UNAVAILABLE`은 사용자에게 드러내지 않고 서버 로그/지표로만 남긴다.
- **C. B + 아이디 확인 API 강화**: `check-username`에 추가 방어(CAPTCHA 등)까지 넣는다. 범위가 크고 효과가 작아서 비권장.

**관련 파일 (B안 기준)**
- `backend/src/main/java/com/revcc/app/PasswordResetService.java`, `PasswordResetController.java`, `ResetMailService.java`(비동기 발송 시), `backend/src/test/java/com/revcc/app/PasswordResetRequestTest.java`, `PasswordResetServiceTest.java`(통합), `assignment-frontend/js/password-reset.js`, `assignment-frontend/auth/reset.html`(안내 문구), `docs/member-management-password-reset.md`, `docs/smtp-e2e-checklist.md`

**구현 요구사항 (B안 기준)**
1. `request()`의 실패 분기 3개와 메일 실패를 모두 같은 성공 응답으로 바꾼다. 쿨다운/제한(429)은 모든 경우에 똑같이 적용되게 해서 429 여부로도 구분할 수 없게 한다.
2. 타이밍: 메일 발송을 요청 경로에서 분리한다(`@Async` 또는 큐). 이때 실패 로깅은 기존 `SafeMailFailure` 화이트리스트 방식을 유지한다.
3. 인증번호 검증(`verify`)과 재설정 완료(`complete`) 흐름은 변경하지 않는다.
4. 프론트 안내 문구를 통일된 응답에 맞춘다.

**건드리지 말아야 할 영역**
- 인증번호 생성·저장·검증 로직, 재설정 후 세션 무효화(`authVersion`)
- 로그인 응답(이미 통일돼 있음), `check-username`(C안 선택 시에만)
- 제한 수치 자체(STEP 5에서 결정된 값 유지)

**완료 조건**
- 없는 아이디 / 불일치 / 카카오 계정 / 정상 요청의 HTTP 상태와 본문이 같다(테스트로 고정)
- 정상 요청만 메일 발송이 호출된다
- 메일 서버 장애가 응답에 드러나지 않는다
- 응답 시간이 메일 발송 시간에 좌우되지 않는다(비동기화 확인)

**실행해야 할 테스트**
- `cd backend && mvn test`(통합 포함). `PasswordResetRequestTest`의 기존 "구분 응답" 테스트를 "통일 응답" 테스트로 교체하는 것은 이 STEP의 의도된 변경이다
- `cd board-service && npm test`(회귀 확인용)
- `docs/smtp-e2e-checklist.md` 절차로 실제 메일 발송 확인(사용자 SMTP 설정 필요, 선택)

---

## 5. 공통 작업 규칙

모든 STEP에 공통으로 적용된다.

1. 작업 시작 전 `git status`로 현재 상태 확인 — 이전 세션이 남긴 미커밋 변경이 있으면 먼저 사용자에게 확인하거나 별도로 처리, 임의로 버리지 않는다.
2. 최신 `main`에서 기능별 브랜치를 만들어 작업한다(2026-10-19부터, §1 "브랜치" 참고). `main`에 직접 커밋하지 않는다. (이전 규칙: `docker-assignment` 브랜치에서만 작업)
3. 기존에 정상 동작하는 기능을 임의로 리팩터링하지 않는다. 해당 STEP의 구현 요구사항에 명시된 범위만 수정한다.
4. 작업 중 STEP 범위 밖의 문제를 발견해도 임의로 고치지 않는다 — 이 파일의 "발견된 추가 이슈" 섹션(아래, 없으면 새로 만들어 추가)에 기록만 한다.
5. `.env`, API key, token, password 등 민감정보를 절대 커밋하지 않는다. `git add` 전 `git status`/`git diff`로 반드시 확인한다.
6. 작업 완료 후 **변경과 직접 관련된 테스트만** 실행한다. 범위는 아래 "작업 및 검증 경량화 원칙"을 따른다(2026-10-01 개정: 이전의 "매번 `mvn test`·`npm test` 전체 + 변경하지 않은 쪽도 함께 실행" 규칙을 대체한다). 전체 테스트는 GitHub Actions가 수행한다.
7. 테스트가 실패하면 원인을 해결하기 전에는 commit도 push도 하지 않는다. 원인이 이번 변경 때문인지, 기존부터 있던 문제인지 먼저 구분한다.
8. commit 전 `git diff`로 변경사항을 최종 검토한다.
9. 문제가 없으면 **해당 STEP에서 변경한 파일만** commit한다(다른 STEP이나 무관한 파일을 같이 묶지 않는다).
10. 기능 브랜치를 `origin`에 push하고 `main`으로 합친다(PR 또는 병합). push·병합은 사용자 지시가 있을 때만 한다. (이전 규칙: `origin/docker-assignment`로 push)
11. 이 파일(`MORETHANCAR_NEXT_TASKS.md`)의 "다음 작업 순서" 표에서 완료한 STEP을 `[x]`로 갱신하고, 아래 "작업 이력" 섹션에 결과와 commit hash를 기록한 뒤, 이 갱신 자체도 같은 commit(또는 바로 다음의 문서 전용 commit)에 포함해 push한다.
12. `REVCC_AUDIT.md`는 절대 수정하지 않는다(감사 원본 보존).

### 작업 및 검증 경량화 원칙 (2026-10-01, STEP 10-impl-C 이후 모든 작업에 적용)

기본 원칙은 **"변경 범위에 비례한 최소 구현 + 최소 검증"**이다. morethancar는 PostgreSQL·Flyway·Docker 호환성을 시험하는 프로젝트가 아니라 실제 자동차 커뮤니티 서비스를 만드는 프로젝트다. 테스트와 검증은 서비스 개발을 돕는 수단이며, 개발 작업보다 커지면 안 된다. 기존 테스트 자산(단위·통합·system·browser 스크립트, V1~V5 migration)은 그대로 보존한다. 줄이는 것은 "매번 실행하는 범위"와 "새 테스트를 추가하는 기준"뿐이다.

**일반 작업: 로컬 기본 검증**
1. 변경 기능과 직접 관련된 단위·통합 테스트
2. 변경한 API의 핵심 정상 동작 확인
3. DB 변경이 있으면 현재 최신 schema에 신규 migration 적용 확인
4. diff 확인

여기까지 통과하면 로컬 검증을 끝낸다. 명확한 이유 없이 아래를 매 작업마다 반복하지 않는다.
- 전체 Maven test, 전체 npm test
- 전체 Docker Compose E2E, 모든 system·manual 테스트 스크립트, 브라우저 E2E
- PostgreSQL 16/18 등 여러 DB 버전 반복 검증
- 빈 DB에서 V1부터 최신까지 Flyway 전체 적용, checksum·재기동·up-to-date 반복 검증
- 대량 fixture 생성, 같은 기능을 여러 계층에서 중복 검증
- 가능성이 매우 낮은 edge case 테스트 대량 추가, 반복적인 race condition stress test
- 일회성 검증을 위한 새 테스트 인프라·스크립트 구축

"안전을 위해", "혹시 모르니", "완전성을 위해"라는 이유만으로 검증 범위를 넓히지 않는다.

**Flyway**
- 기존 V1~V5는 절대 수정하거나 합치지 않는다. schema 변경은 V6, V7처럼 새 migration으로 추가한다.
- 로컬 기본 검증은 "현재 최신 schema → 신규 migration 적용 → 변경 기능 테스트"까지다. migration을 추가할 때마다 PG16·PG18을 각각 띄워 같은 검증을 반복하지 않는다.
- 빈 DB 전체 적용, 여러 PostgreSQL 버전, checksum·재기동 검증은 DB 호환성이나 migration 자체가 이번 작업의 핵심 위험일 때만 한다.

**고위험 작업**
- 인증·인가, 세션, 회원탈퇴·데이터 삭제, 관리자 권한, DB migration, 데이터 유실, 동시성, 운영 인프라처럼 위험이 큰 변경은 필요한 검증을 추가할 수 있다.
- 하지만 "고위험"이라는 이유만으로 전체 회귀를 자동 실행하지 않는다. 실제로 일어날 수 있는 위험을 먼저 판단하고, 그 위험을 검증하는 최소 범위만 테스트한다.

**CI**
- 로컬은 빠른 관련 테스트에 집중한다. GitHub Actions가 전체 테스트를 수행하므로 같은 전체 테스트를 로컬에서 다시 돌리지 않는다.
- 순서: 로컬 관련 테스트 통과 → diff 확인 → commit → push → GitHub Actions 확인.
- CI가 성공한 뒤 추가 테스트나 분석을 새로 시작하지 않는다.

**전체 회귀·E2E**
- 매 STEP마다 하지 않는다. P2 같은 큰 작업 묶음 완료, main merge 직전, production 배포 직전에만 종합적으로 수행한다.

**새 테스트 추가 기준**
- 다음 중 하나의 명확한 가치가 있을 때만 추가한다: 핵심 비즈니스 규칙 보호, 실제 발견된 버그의 재발 방지, 중요한 보안 경계 검증, 실제 데이터 유실 방지.
- 테스트 개수를 품질로 보지 않는다. 기존 테스트가 이미 보장하는 동작을 새 E2E·system·browser 테스트로 다시 검증하지 않는다.
- 가벼운 기능 변경 때문에 테스트 코드나 검증 스크립트가 실제 구현보다 커지지 않게 한다.

STEP 10-impl-C에서 수행한 검증(PG16·PG18 각각 전체 Maven, Flyway 반복 검증, 전체 Node, 다수 system test, 브라우저 E2E, 동시성 반복 검증)은 그 STEP 한정이었다. 앞으로 모든 기능의 기본 검증 방식으로 쓰지 않는다.

### 발견된 추가 이슈 (STEP 범위 밖에서 발견된 것들 — 기록만, 수정 금지)

_(작업 중 발견하면 여기에 "STEP 번호 — 파일:설명" 형식으로 추가할 것.)_

- ~~2026-10-19 새 MacBook 환경 정리 — **로컬 DB 볼륨 이름이 폴더 이름에 묶여 있다(수정하지 않음, 기록만)**: `docker-compose.yml`의 `revcc_pg`에는 `name:`이 없어 실제 볼륨 이름이 `<compose 프로젝트 이름>_revcc_pg`가 되고, 프로젝트 이름은 폴더 이름에서 온다. 이전 Mac(`revcc-site` 폴더)에서는 `revcc-site_revcc_pg`였지만 이 MacBook(`morethancar` 폴더)에서는 `morethancar_revcc_pg`가 새로 만들어졌다. 그런데 `scripts/assignment-run.sh`는 `revcc-site_revcc_pg`를 하드코딩해 직접 만들고, `docker-compose.yml` 131행 주석·당시 Docker 실행 문서(`docker volume inspect revcc-site_revcc_pg`)도 그 이름을 전제로 한다. 영향: 이 Mac에서는 compose 실행과 `assignment-run.sh` 실행이 서로 다른 볼륨을 써서 로컬 데이터가 갈라지고, 문서의 볼륨 확인 명령은 실패한다. 운영은 해당 없음(prod 오버레이가 postgres와 `revcc_pg`를 `!reset`으로 제거, DB는 Neon). 고치려면 볼륨에 `name:`을 고정하거나 문서·스크립트를 프로젝트 이름 기준으로 바꾸는 것 중 하나를 사용자가 정한다.~~
  → **해결(2026-10-19, 브랜치 `chore/local-db-volume-and-branch-rules`)**: 사용자 결정으로 현재 볼륨 `morethancar_revcc_pg`와 데이터를 유지하고(삭제·이름 변경·초기화 없음), `scripts/assignment-run.sh`가 `docker compose config --no-interpolate`로 Compose가 이 폴더에서 쓰는 볼륨 이름을 직접 골라 쓰게 바꿨다(새로 만들 때는 Compose 라벨을 붙이고, `--print-volume`은 이름만 출력). `docker-compose.yml` 주석·당시 Docker 실행 문서도 맞췄다. 검증: 저장소에서 `--print-volume` = `morethancar_revcc_pg` = Compose 값, `COMPOSE_PROJECT_NAME=volcheck`에서도 둘이 일치, 볼륨 목록 변화 없음. 전용 테스트 볼륨(복사한 `mtc-volcheck` 폴더 → `mtc-volcheck_revcc_pg`)으로 스크립트 전체를 실행해 6개 서비스 기동·`:8091` 200을 확인하고, 그 볼륨을 Compose가 경고 없이 이어 쓰는 것까지 본 뒤 테스트 자원만 지웠다. 원래 스택은 `down`(볼륨 유지) 후 다시 `up`했고 `morethancar_revcc_pg`의 행 수·Flyway 이력이 전후 동일하다. 폴더 이름이 `revcc-site`인 다른 PC에서는 계속 `revcc-site_revcc_pg`를 고른다.
- STEP 1 — `frontend/components/garage/garage-session.tsx`: Next.js "My Garage" 프로토타입 가입 폼에는 8자 최소 길이 클라이언트 검증이 없다(서버가 400으로 거부하지만 안내 문구가 없음). 기본 compose 미포함 프로토타입이라 수정하지 않음.
- STEP 1 — 테스트 환경: Windows 개발 PC에는 Java/Maven/Node가 설치되어 있지 않아 `maven:3.9.9-eclipse-temurin-23`, `node:22-alpine` 컨테이너로 테스트를 실행했다(Dockerfile과 같은 버전). STEP 3 CI에서도 같은 버전을 쓰면 된다.
- STEP 2 — `board-service/src/schema.sql`: `moderation_logs.action_type` CHECK 제약에 `LISTING_DELETE`를 추가했다(기존 DB는 board-service 기동 시 1회 교체, 임시 PostgreSQL에서 기존 로그 보존·재적용 무변화·잘못된 값 거부 확인). 공유 Neon DB에는 board-service가 새 코드로 처음 재기동될 때 적용된다. 이전 코드와도 호환된다(허용 값만 늘어남).
- STEP 2 — `assignment-frontend/js/admin.js` 운영 로그 탭: 매물 삭제 로그의 카테고리는 부품 카테고리 키(`brakes` 등)가 그대로 표시된다(커뮤니티 카테고리 이름표만 있음). 기능 영향 없음, 표시 개선만 필요.
- STEP 2 — `board-service/src/market.js`: 관리자 매물 삭제는 소프트 삭제가 아니라 실제 삭제다(관심 목록은 CASCADE로 함께 삭제). 원문(제목·설명·판매자)은 `moderation_logs`에 스냅샷으로 남는다. 이미지(`image_ids`)는 로그에 남지 않는다.
- STEP 4 — 스키마 소유 주체는 감사 기록의 3곳이 아니라 4곳이었다: `VehicleRepository`의 `@PostConstruct`도 `vehicles` 테이블을 만들고 시드 데이터를 넣고 있었다. 이번에 V1으로 옮겼다.
- STEP 4 — 스키마가 기동 순서에 따라 달라지고 있었다: 빈 DB에서는 core(Hibernate)가 먼저 `owner_vehicles`/`vehicle_verifications`를 identity 컬럼, 기본값 없음, year CHECK 없음으로 만들었고, Neon은 board `schema.sql`이 먼저 만든 형태(SERIAL, 기본값, CHECK)였다. V1은 Neon 형태를 기준으로 삼았다. 이전 코드로 만든 로컬 볼륨은 Hibernate 형태로 남지만 baseline과 validate는 통과한다(임시 DB에서 확인).
- STEP 4 — Neon에만 있는 `board_test_posts_archive` 테이블: 코드에서 쓰지 않으므로 V1에 넣지 않았고 건드리지도 않았다. 필요 없으면 수동으로 정리할 대상이다.
- STEP 4 — `users.email`에 unique 제약(`uk6dotkott...`, Hibernate)과 unique 인덱스(`users_email_unique`, 과거 수동 마이그레이션)가 중복돼 있다. 운영 DB와 맞추려고 V1에 그대로 두었다. 정리하려면 새 마이그레이션으로 처리한다.
- STEP 4 — Neon은 PostgreSQL 18.6인데 로컬 compose와 CI는 postgres:16이다. Spring Boot 3.5.0이 쓰는 Flyway는 PG18에서 "지원 미검증" 경고를 낸다(PG18 임시 DB에서 V1·V2 적용, baseline, 재기동 모두 정상 확인). CI와 compose를 18로 올릴지는 별도로 판단할 사항이다.
- STEP 4 — Neon 반영 시점: 새 core가 Neon에 처음 기동할 때 baseline(V1)을 기록하고 V2(`LISTING_DELETE` CHECK)를 적용한다. Neon은 아직 STEP 2 제약이 반영되지 않은 상태였다(덤프로 확인). 이전 코드(Mac 등)와도 호환된다. 이전 board `schema.sql`은 멱등하고, 이전 Hibernate update는 추가할 컬럼이 없다. 이 세션에서는 Neon에 쓰기를 하지 않았다(읽기 전용 스키마 덤프만 실행).
- ~~STEP 5~11 계획 중 발견(2026-09-30) — **STEP 4 회귀**: `scripts/admin-system.mjs`, `community-system.mjs`, `market-system.mjs`, `moderation-system.mjs`, `garage-schema-check.py`가 STEP 4에서 삭제한 `board-service/src/schema.sql`을 직접 읽거나 JPA의 스키마 자동 생성을 전제로 한다. 지금은 실행되지 않는다.~~ → **STEP 4 후속 수정 완료(2026-09-30, 작업 이력의 "STEP 4 follow-up" 참고)**. `.mjs` 4개는 공통 helper `scripts/lib/flyway-migrations.mjs`로 Flyway `V*.sql`을 버전 순서대로 격리 스키마에 적용하고, 실행기 `scripts/run-board-system.sh`가 만든 임시 PostgreSQL에서만 돈다(`REVCC_SYSTEM_TEST_DB=isolated`가 없으면 실행 거부 → Neon에 연결된 board 컨테이너에서는 돌지 않음). `garage-schema-check.py`는 compose 대신 임시 네트워크·postgres·redis와 현재 소스로 빌드한 core/board를 쓰고, core의 Flyway가 빈 스키마에 V1→V2를 적용하는지까지 확인한다. 없어진 `schema.sql` "두 번 적용 멱등성" 검사는 대상이 사라져 Flyway 적용 확인으로 대체했다.
- STEP 4 follow-up 중 발견 — `scripts/admin-system.mjs`는 같은 사용자로 API를 통해 게시글 23개를 연속 작성한다. 2026-09-28 커밋 `098518e`가 추가한 글 작성 rate limit(10/분)에 걸려 11번째 글에서 429로 실패한다. 스크립트 마지막 수정(2026-09-22)이 rate limit 도입보다 앞서므로 **STEP 4와 무관한 기존 문제**다. 10개마다 61초 대기만 넣은 사본으로 실행하면 전체 검증이 통과함을 확인했다(저장소 파일은 수정하지 않음). → **STEP 5-B에서 해결 완료**: 작성자를 10개씩 나눠(a 10, b 10, c 3) rate limit을 끄거나 대기하지 않고 23개를 만든다. 1번 글은 일반 회원 글로 유지해 "관리자도 남의 글 수정 불가" 검사 의미를 보존했다. 4개 스크립트 전체가 대기 없이 약 8초에 PASS.
- STEP 5~11 계획 중 발견 — `docker-compose.prod.yml`이 core의 `POSTGRES_PASSWORD`와 board의 `PGPASSWORD`를 로컬 postgres 변수 `${POSTGRES_PASSWORD}`로 덮어쓴다. 기본 compose는 Neon 접속에 `DB_PASSWORD`를 쓰므로 두 값이 다르면 prod 오버레이 기동이 실패한다. STEP 7-A 범위에 포함시켰다.
- STEP 5~11 계획 중 발견 — board 차고 쓰기 엔드포인트(`POST /api/board/garage`, `PUT /api/board/garage/:id`, `POST /api/board/garage/:id/records`)와 장터 수정(`PUT /api/parts/listings/:id`)에도 rate limit이 없다. P2-4 원래 범위 밖이라 STEP 5에 넣지 않았다. 필요하면 5-B에 추가한다.
- STEP 5~11 계획 중 발견 — Spring이 저장하는 자유 텍스트(차고 차량 `nickname`/`description` 등 `GarageVehicleRequest` 필드, 관리자가 수정하는 `users.nickname`)도 서버측 정리가 없다. STEP 6은 board-service만 다룬다.
- STEP 5~11 계획 중 발견 — core와 board가 Neon에 같은 DB 사용자(`DB_USER`)로 접속한다. 이 사용자는 Flyway DDL 권한까지 가진다. 앱용/마이그레이션용 역할 분리(최소 권한)는 어느 STEP에도 포함되지 않았다.
- STEP 5~11 계획 중 발견 — Docker는 healthcheck가 unhealthy여도 컨테이너를 재시작하지 않는다. STEP 8의 restart 정책은 프로세스 종료만 복구한다. hang 상태 복구가 필요하면 별도 감시가 필요하다.
- STEP 10 — `board_posts.image_ids`/`parts_listings.image_ids`는 배열이라 FK를 둘 수 없다. STEP 10-impl-B는 공개 범위 검사와 공통 삭제 함수로 orphan을 막는 데까지만 한다. 연결 테이블(`post_images` + FK)로 바꾸는 것은 별도 작업이다.
- STEP 10 — 비밀번호 재설정 요청은 아이디→이메일 순서로 검사하며 결과별로 다른 코드를 준다(`USERNAME_NOT_FOUND`/`IDENTITY_MISMATCH`/`SOCIAL_ACCOUNT`). 탈퇴 계정도 이 경로를 탄다(아이디가 바뀌어 NOT_FOUND). 열거 문제는 STEP 11 범위다.
- STEP 10 — 회원가입 username에는 길이 제한만 있고 문자 제한이 없다. 그래서 "탈퇴한 회원"이나 관리자처럼 보이는 이름으로 가입할 수 있다. STEP 10-impl-A는 탈퇴 관련 예약어만 막는다.
- STEP 10-impl-A — **Neon 반영 전 확인**: V3는 아직 Neon에 적용되지 않았다. 새 core가 Neon에 처음 기동할 때 적용된다. `users_account_status_check`는 기존 값이 허용 목록 밖이면 적용에 실패한다. 기동 전에 읽기 전용으로 `SELECT DISTINCT account_status FROM users`를 다시 확인한다(2026-09-30에는 전부 NULL). 이전 코드(Mac 등)는 새 컬럼을 모르지만, 컬럼 추가뿐이라 함께 떠 있어도 깨지지 않는다.
- STEP 10-impl-B — **이미지 물리 삭제(`purgeUnreferencedImages`)는 만들지 않았다**. 지금 이미지 행을 지우는 코드 경로가 없어(회원 삭제 cascade뿐) 모을 대상이 없고, 호출할 곳은 C(탈퇴)와 E(정리)다. 만들 때 조건: ① 작성자가 삭제한 글도 원문 보존 대상이므로 `deleted` 글의 image_ids도 "참조"로 센다(공개 규칙 `image-references.js`와 다르다). ② 방금 올리고 아직 글에 붙이지 않은 사진(작성 중)을 지우지 않도록 생성 후 경과 시간 조건을 둔다. ③ `owner_vehicles.image_id`는 `ON DELETE` 없는 FK라 참조 중인 사진은 DB가 삭제를 거부한다.
- STEP 10-impl-B — 미첨부·삭제 글 전용 사진은 이제 공개되지 않지만 행은 계속 쌓인다. 작성자가 지운 글의 원문·사진도 무기한 남는다. 보존기간과 정리는 E(결정 E-1)에서 한다.
- STEP 10-impl-B — **혼합 배포 주의**: 새 board가 배포되기 전까지 이전 board(Mac 등)는 본인 글을 계속 hard delete하고 모든 사진을 공개한다. V4는 인덱스 추가뿐이라 이전 코드와 함께 떠 있어도 안전하다. Neon에는 V3·V4가 함께 적용된다(V3 확인 사항은 위 항목).
- STEP 10-impl-B — 작성자 본인 삭제는 moderation_logs를 남기지 않는다(관리자 조치 기록이므로). 본인 삭제의 흔적은 `board_posts.deleted_at/deleted_by/deleted_reason`에만 있다.
- STEP 10-impl-C — **legacy 이메일 없는 계정의 한계(C-1)**: Neon 일반 계정 33개 중 이메일이 있는 계정은 1개다. 나머지는 탈퇴해도 아이디 HMAC만 남아, 새 아이디로 다시 가입하는 것을 막을 수 없다(제재 회피 포함). 이메일 필수화 등은 별도 결정이 필요하다.
- STEP 10-impl-C — **정지·비활성화 회원은 탈퇴할 수 없다**: 탈퇴는 로그인이 필요한데, 정지(SUSPENDED)·비활성화(DISABLED) 회원은 로그인·세션이 거부된다. "제재 중이라는 이유만으로 탈퇴를 막지 않는다"는 정책을 지금은 API로 지킬 수 없다. SANCTION 기록 로직(종료일과 30일 중 늦은 날, 무기한)은 구현·테스트했지만, API 경로에서는 세션 확인과 잠금 사이에 제재된 경우만 도달한다. 제재 회원용 탈퇴 경로(예: 아이디+비밀번호로 본인 확인하는 별도 요청)는 인증 없는 경로가 생기는 문제라 결정이 필요하다.
- STEP 10-impl-C — 무기한 SANCTION(`expires_at IS NULL`)을 해제하는 관리자 화면·API가 없다. 지금은 운영자가 DB 행을 직접 지워야 하고 기록도 남지 않는다(`docs/member-withdrawal.md`).
- STEP 10-impl-C — 탈퇴 트랜잭션이 회원 행을 잠근 동안 같은 회원이 board에서 새 매물을 등록하면, 그 INSERT는 FK 잠금 때문에 기다렸다가 탈퇴 커밋 뒤 판매중 상태로 들어간다. 판매자는 impl-A 규칙으로 "탈퇴한 회원"으로 보이고 연락처도 공개되지 않지만, 매물은 공개 목록에 남는다. 요청이 겹칠 때만 생기는 좁은 경쟁이다. 새 게시글도 같은 방식으로 들어가며, 이것은 "탈퇴한 회원" 글로 남는다.
- STEP 10-impl-C — `WITHDRAWAL_HMAC_SECRET`이 없는 로컬 환경(기본 compose)을 운영 DB(Neon)에 붙이면, 운영에서 누군가 탈퇴해 제한 행이 생긴 뒤에는 로컬 가입이 503이 된다(제한을 조용히 건너뛰지 않도록 한 설계). 로컬도 같은 키를 쓰거나 격리 DB를 쓴다.
- STEP 10-impl-C — `withdrawal_blocks.user_id`는 탈퇴 회원을 가리킨다. 만료 행 정리와 함께 E에서 다룬다(원문이 없어 개인정보는 아니지만 회원과 연결된다).
- STEP 10-impl-C — 탈퇴한 판매자의 닫힌 매물(`closed`)과 판매완료 매물 행, 작성자 삭제 글의 원문·사진은 무기한 남는다. 보존기간은 E-1.
- STEP 10-impl-C → **D 전에 알아야 할 것**: ① `WithdrawalService.withdraw`는 `user.getKakaoId()!=null`이면 `KAKAO_REAUTH_REQUIRED`로 거부한다. D는 카카오 재인증 결과로 이 검사를 대체하되, 비밀번호 확인과 같은 수준의 "방금 본인 확인" 증거(재인증 state·짧은 유효시간)를 서비스에 넘겨야 한다. ② 재가입 제한은 이미 KAKAO 식별자를 기록·검사한다(`kakao:<id>`, 콜백의 신규 가입에서 409). ③ unlink 호출(외부 HTTP)을 DB 트랜잭션 안에서 할지(D-1)는 이 서비스의 잠금 시간과 직결된다. ④ `KakaoOAuthService`의 HttpClient timeout 부재(STEP 9 이슈)도 D에서 함께 다룬다. ⑤ 프론트는 `method==="KAKAO"`일 때 안내만 보여 준다. D에서 재인증 버튼으로 바꾼다.
- STEP 10-impl-B — 이미지 공개 판정의 `member_profiles.avatar_image_id/cover_image_id`, `owner_vehicles.image_id` 조회에는 인덱스가 없다(계획은 image_ids GIN만). 지금은 행 수가 적어 문제없지만 커지면 추가를 검토한다.
- STEP 9 — **실제 Named Tunnel에서 아직 확인하지 않은 것**: TryCloudflare Quick Tunnel로만 실측했다(경로에 `cf-worker: trycloudflare.com`이 있다). 자체 zone(rev.cc)에서 클라이언트가 CF-Connecting-IP를 보냈을 때 엣지가 거부(1000)하는지 덮어쓰는지, 헤더 구성이 같은지는 운영 tunnel 생성 후 확인해야 한다. 어느 쪽이든 origin에는 Cloudflare가 만든 값만 도착한다. 운영 배포 후 `docker compose ... logs proxy`의 첫 칸이 실제 사용자 IP인지, `curl -sI https://rev.cc/`에 HSTS가 있는지 확인한다.
- STEP 9 — `tunnel` 네트워크 대역 172.16.238.0/28(Docker 기본 주소 풀 밖)이 운영 서버의 호스트·VPC 네트워크와 겹치면 기동이 실패하거나 라우팅이 꼬인다. 바꿀 때는 `nginx/default.conf`(set_real_ip_from, HSTS map), `docker-compose.prod.yml`(ipv4_address, subnet), `scripts/nginx-forwarded-check.sh`를 함께 바꾼다(스크립트가 세 값을 대조한다). 같은 이유로 이 스크립트는 운영 스택이 떠 있는 호스트에서 실행하지 않는다.
- STEP 9 — X-Forwarded-Proto는 여전히 어느 발신지에서 와도 core/board로 전달된다(P0-2 로직, 이번 범위에서 변경 금지). 운영에서는 proxy에 닿는 것이 cloudflared뿐이고 Cloudflare가 값을 덮어쓰므로 안전하다. 로컬 기본 구성에서는 클라이언트가 `https`라고 속일 수 있다(자기 요청에만 영향). HSTS는 이 값만으로 판단하지 않고 cloudflared 발신지를 함께 확인한다.
- STEP 9 — `KakaoOAuthService`의 `HttpClient.newHttpClient()`에 연결·요청 timeout이 없다. 카카오 API가 멈추면 사용자는 nginx 504(30초)를 받지만 core의 요청 스레드는 계속 기다린다. 앱 timeout 추가는 이번 범위 밖이다.
- STEP 9 — nginx realip는 CF-Connecting-IP가 쉼표 목록이면 마지막 값을 쓴다. Cloudflare는 단일 값만 만들고 클라이언트 값은 엣지에서 거부하므로 운영에서는 해당 없다(테스트로 동작만 고정했다). IP가 아닌 값이면 cloudflared 주소로 남아 모두 한 버킷이 된다(안전한 쪽으로 실패).
- STEP 9 — 신뢰 경계는 "172.16.238.2에서 온 TCP 연결"이다. 이 주소를 쓰려면 호스트나 Docker 권한이 필요하다. Linux 호스트의 root는 컨테이너 IP로 proxy에 직접 닿을 수 있으므로 호스트 자체는 신뢰 범위다. `TUNNEL_TOKEN`은 다른 비밀값처럼 `docker inspect`로 보인다.
- STEP 9 — 로컬 기본 구성에서는 Docker 포트 매핑 때문에 모든 브라우저가 게이트웨이 IP 하나로 보이고(5-A 기록과 같음) nginx rate limit 버킷도 공유한다. 로컬에서 한 PC로 1분에 로그인·가입 등을 30회 넘게(순간 30) 하거나 API를 초당 20회 넘게(순간 200) 보내면 nginx 429가 날 수 있다. `docker-compose.garage.yml`의 Next.js garage-ui는 서버에서 proxy를 호출하므로 모든 사용자가 garage-ui 컨테이너 IP 하나로 묶인다(로컬 전용 프로토타입).
- STEP 9 — `scripts/nginx-forwarded-check.sh`는 여전히 수동 검사다(CI에 넣지 않음, 5-A 기록과 같음). `cloudflared` 이미지는 2026.9.3으로 고정했다(자동 업데이트 없음). 보안 업데이트는 태그를 바꿔 재배포한다.
- STEP 9 — **운영 배포 후 후속 검증 항목**(Kakao HttpClient timeout 부재는 위 항목에 별도 기록):
  1. 실제 Named Tunnel(rev.cc) 경유로 IP spoofing을 다시 확인한다. `X-Forwarded-For`·`Forwarded`·`True-Client-IP`를 요청마다 바꿔도 Spring 로그인 IP 제한은 10회, board 조회수 제한은 60회 뒤에 429가 나야 한다. 위조한 `CF-Connecting-IP`는 엣지가 거부하거나 덮어써야 하고, proxy 로그의 첫 칸은 실제 사용자 IP여야 한다. STEP 9 e2e(Quick Tunnel)와 같은 절차로 확인한다.
  2. `docker inspect`로 cloudflared가 `tunnel` 네트워크에서 172.16.238.2를 쓰는지 확인한다. 최초 기동, `docker compose up -d` 재생성, 호스트 재부팅 뒤에 각각 확인한다. 주소가 다르면 실제 IP 복원과 HSTS가 조용히 꺼진다(모든 사용자가 cloudflared 주소 bucket 하나를 공유). 운영 서버의 `ip route`·VPC 대역이 172.16.238.0/28과 겹치지 않는지도 확인한다.
  3. `scripts/nginx-forwarded-check.sh`를 GitHub Actions에 넣을지 검토한다. 이 스크립트는 Docker와 고정 대역 네트워크(172.16.238.0/28)만 있으면 되므로 ubuntu 러너에서 실행할 수 있을 것으로 보이지만 확인하지 않았다. 넣으면 nginx 설정 회귀(신뢰 주소 불일치, 전달 헤더 제거 누락, rate limit·HSTS 조건 변경)를 자동으로 막을 수 있다.
- STEP 9 — HSTS 확대(`max-age` 604800 → 2592000, `includeSubDomains`, `preload`)는 사용자 결정 사항이다. `preload`는 되돌리기 어렵다.
- STEP 8 — core는 DB가 멈췄을 때 board보다 늦게 503이 된다(단건 약 10초, 쿼리 진행 중이면 최대 약 20초). Hikari가 오래 쉰 연결을 빌려줄 때 유효성 검사(`validation-timeout` 기본 5초)를 먼저 하고, 실패하면 새 연결을 기다리기(5초) 때문이다. 제한 시간이 있어 무한 대기는 아니며, 더 줄이려면 `validation-timeout`·`socketTimeout`을 낮춘다.
- STEP 8 — Neon은 compute 크기(자동 확장 범위)에 따라 max_connections가 달라진다. 2026-09-30 값(901)은 현재 설정 기준이다. 플랜이나 compute 크기를 바꾸면 다시 확인해야 한다. 지금은 Neon 풀러(`-pooler` 호스트)가 아닌 직접 연결을 쓴다.
- STEP 8 — core의 `minimum-idle: 2`는 요청이 없어도 Neon 연결 2개를 열어 둔다. Neon의 유휴 시 자동 일시정지(scale to zero)가 열린 유휴 연결의 영향을 받는지는 확인하지 않았다. 비용·일시정지가 중요하면 Neon 문서를 확인하고 `CORE_DB_POOL_MIN_IDLE=0`을 검토한다.
- STEP 8 — `.env` 파일에서 `KEY=   # 설명`처럼 값이 빈 줄 뒤에 인라인 주석을 달면 Compose가 주석 글자를 값으로 읽는다(실측: `REDIS_PASSWORD`가 `# [prod][base]`로 들어감). `.env.example`은 주석을 모두 별도 줄로 옮겼다. 실제 `.env`를 편집할 때도 같은 주의가 필요하다.
- STEP 8 — 쿼리 응답 제한(core `DB_SOCKET_TIMEOUT_S`, board `PG_QUERY_TIMEOUT_MS`, 기본 15초)은 compose가 전달하지 않아 코드 기본값으로만 동작한다. 오래 걸리는 정상 쿼리가 생기면 compose 전달을 추가해 조정한다.
- STEP 7-B — `docker-compose.garage.yml`(Next.js garage-ui)을 prod 오버레이와 함께 쓰면 garage-ui는 기본 네트워크에 붙는데 prod에는 기본 네트워크가 없어 proxy에 닿지 않는다. garage 오버레이는 로컬 전용(127.0.0.1 포트)이라 prod와 조합하지 않는 것을 전제로 수정하지 않았다. 필요하면 garage 오버레이에 `networks: [edge]` 등을 추가한다.
- STEP 7-B — `app` 네트워크는 일반 bridge라 core/board뿐 아니라 proxy도 외부로 나갈 수 있다. proxy는 게시 포트 때문에 internal이 아닌 네트워크가 하나 필요해 이렇게 두었다. core/board의 외부 통신도 목적지 제한은 없다(Neon·Kakao·SMTP 외 차단은 호스트 방화벽/egress 정책 영역).
- STEP 7-B — 기본 compose와 prod 오버레이는 네트워크 구조가 다르다(단일 `revcc-network` vs edge/app/data). 기본 compose 기준의 `docker network inspect revcc-network` 확인은 prod에는 해당하지 않는다.
- STEP 7-A — 운영 반영 시 필요한 수동 작업: 운영 `.env`에 `REDIS_PASSWORD`(영문·숫자, 예 `openssl rand -hex 32`)를 새로 넣어야 한다. 넣지 않으면 prod 오버레이 기동이 거부된다. `.env`는 git에 없으므로 Mac과 Windows에 각각 넣어야 한다.
- STEP 7-A — prod 오버레이는 `!reset`/`!override`를 쓰므로 Docker Compose 2.24 이상이 필요하다(이 PC는 v5.5.1). Mac이나 운영 서버의 Compose 버전을 확인해야 한다.
- STEP 7-A — 컨테이너 밖에서 `docker-compose.dev.yml`의 Redis(127.0.0.1:6379)에 Spring/Node를 직접 붙이는 로컬 개발은 이제 `REDIS_PASSWORD`(기본 `revcc-local-redis`)를 넘겨야 한다. 넘기지 않으면 NOAUTH로 실패한다(현재 `docs/DEVELOPMENT.md`에 안내).
- STEP 7-A — Redis 비밀번호에 큰따옴표나 백슬래시가 있으면 redis 설정 파일 파싱이 깨질 수 있다. 영문·숫자만 쓰도록 문서화했고 강제 검사는 하지 않았다.
- STEP 7-A — 검증 중 발견: `docker-compose.yml`의 고정 `container_name`(revcc-*)과 네트워크 이름(`revcc-network`) 때문에, 같은 PC에 기존 compose 프로젝트 컨테이너가 남아 있으면(이 PC에는 10시간 전에 멈춘 revcc-* 6개가 있음) 다른 프로젝트 이름으로도 동시에 띄울 수 없다. 검증은 이름만 바꾸는 테스트 전용 오버레이(scratchpad)로 했고, 기존 컨테이너·`revcc-network`·`revcc_revcc_pg` 볼륨은 건드리지 않았다. 고정 이름을 쓰는 기존 실행 구성 때문에 수정하지 않았다.
- STEP 7-A — 검증에서 `docker compose up --build`를 실행해 로컬 이미지 `revcc-core/board/frontend/proxy:assignment`가 현재 소스(STEP 7-A 포함)로 다시 빌드되었다. 기존 멈춘 컨테이너는 옛 이미지 ID를 그대로 쓰므로 영향은 없고, 다음 `docker compose up --build` 때 어차피 다시 빌드된다.
- STEP 6 — B안의 알려진 변형(테스트로 고정): 붙여 쓴 `a<b`는 `<b` 태그 시작으로 해석되어 `a`만 남는다(`a < b`처럼 띄우면 유지). 사용자가 엔티티 글자를 직접 입력하면(`&amp;` 등) HTML로 해석되어 `&`로 저장된다. 검색어(`q`)와 관리자 필터도 `text()`를 거치므로 같은 규칙이 적용된다(필터는 이후 allow-list로 다시 검사).
- STEP 6 — 기존 데이터 백필 없음(결정대로). 이미 저장된 글에 태그 문자열이 있어도 그대로 남는다. Neon에 해당 데이터가 있는지는 조회하지 않았다. 필요하면 읽기 전용 점검 후 별도 STEP으로 백필을 제안한다.
- STEP 6 — Spring이 저장하는 자유 텍스트(차고 차량 `nickname`/`description` 등, `users.nickname`)는 여전히 sanitize되지 않는다(앞의 "STEP 5~11 계획 중 발견" 항목과 같은 문제, 이번 범위 밖).
- STEP 6 — `sanitize-html` 2.17.7은 Node ≥ 22.12를 요구한다(`engines`). Dockerfile과 CI는 `node:22`(현재 22.23)라 문제없지만, Mac에서 로컬 Node로 board를 직접 실행한다면 버전을 확인해야 한다.
- STEP 5-B — 로그인 응답 시간: 없는 아이디는 BCrypt 비교를 건너뛰므로(`AuthController.login()`의 `user == null ||` 단락 평가) 응답이 더 빠르다. 응답 본문은 같지만 시간 차이로 계정 존재 여부를 추정할 수 있다. 기존 동작이며 이번 STEP에서 바꾸지 않았다(더미 해시 비교로 해결 가능). 다만 아이디는 게시글 작성자·`check-username`으로 이미 공개된 정보다(STEP 11 참고).
- STEP 5-B — 계정 잠금은 "검사 후 실패 기록" 순서라, 잠기기 직전에 동시에 들어온 요청 몇 개는 5회를 넘겨 비밀번호 검사를 받을 수 있다. 추가 시도는 IP당 10/분 제한으로 묶인다. 원자적 예약 방식으로 바꾸려면 별도 작업이 필요하다.
- STEP 5-B — 아이디 단위 잠금의 본질적 트레이드오프: 아이디를 아는 누구나 틀린 비밀번호 5회로 그 계정을 15분 잠글 수 있다(피해자 DoS). 영구 잠금은 없고 카카오 로그인·비밀번호 재설정은 영향받지 않는다. 사용자 승인 수치(5회/15분)대로 구현했다.
- STEP 5-A — `scripts/nginx-forwarded-check.sh`(nginx가 X-Forwarded-For를 덮어쓰는지 확인)는 수동 검사다. GitHub Actions에는 넣지 않았다(CI 워크플로 변경은 이 STEP 범위 밖). nginx 설정 회귀를 CI에서 막으려면 별도로 추가한다.
- STEP 5-A — Docker Desktop의 포트 매핑으로 로컬 접속하면 nginx의 `$remote_addr`가 Docker 게이트웨이 주소가 되어, 로컬의 모든 브라우저가 IP 버킷 하나를 공유한다. 로컬 개발 한정이며 기존 동작과 같다(수정하지 않음).
- STEP 4 — `docker compose down -v && up` 검증: 기본 compose는 core/board가 `.env`의 Neon을 가리키고 URL에 `sslmode=require`가 고정돼 있다. 그래서 compose를 그대로 기동하지 않고, 같은 이미지로 임시 PostgreSQL(16·18)과 Redis 스택을 만들어 compose와 같은 순서(core healthy → board)로 검증했다.

---

## 6. 작업 이력

| STEP | 상태 | 완료일 | commit hash | 비고 |
|---|---|---|---|---|
| P0-1/P0-2 | 완료 | 2026-09-29 | `07c7d7d` | Kakao OAuth state, Cloudflare/TLS 대응. `mvn test` 77 run/0 fail, `npm test` 9 run/0 fail |
| STEP 1 | 완료 | 2026-09-30 | `688e990` | 비밀번호 8자 이상(가입/재설정만), `/api` 본문 64KB·인증서류 업로드 5MB 상한(413), prod 배포 문서. `mvn test` 86 run/0 fail/0 skip(통합테스트 포함), `npm test` 9 run/0 fail |
| STEP 2 | 완료 | 2026-09-30 | `a7ed438` | 관리자 매물 삭제(사유 필수, `LISTING_DELETE` 로그), admin/market 인가·IDOR 테스트 5건. `npm test` 14 run/0 fail, `mvn test` 86 run/0 fail(통합 9 skip) |
| STEP 3 | 완료 | 2026-09-30 | `a74eb33` | `.github/workflows/ci.yml`(backend: Java 23 + Postgres/Redis 서비스로 통합테스트 포함, board: Node 22). GitHub Actions 첫 실행 성공: `mvn test` 86 run/0 fail/0 skip, `npm test` 14 pass. 1차 시도는 러너가 서비스 컨테이너 초기화 단계에서 멈춰 취소됐고(로그 없음, 일시 장애로 판단) 재실행에서 통과 |
| STEP 4 | 완료 | 2026-09-30 | `e68e81f` | Flyway 도입(`V1__baseline`=Neon 스키마, `V2`=`LISTING_DELETE` CHECK), `baseline-on-migrate`, `ddl-auto: validate`. board `schema.sql`, `backend/migrations/`, `VehicleRepository` DDL 제거. 검증: 빈 PG16/PG18 적용 후 Neon 덤프와 비교(예상한 차이만 있음), Neon 스키마 복제본+데이터에서 baseline→V2 적용·데이터 보존·재기동 멱등·API 200, 이전 코드로 만든 DB에서 baseline 통과. `mvn test` 86 run/0 fail/0 skip(통합 포함), `npm test` 14 pass |
| STEP 4 follow-up | 완료 | 2026-09-30 | `47dbd69` | 수동 시스템 테스트 5개를 Flyway 단일 스키마 소유 구조로 전환(`scripts/lib/flyway-migrations.mjs`, `scripts/run-board-system.sh`, `garage-schema-check.py` 임시 스택화, 문서 4곳의 실행 명령 수정). 임시 PostgreSQL 16에서 실행: community/market/moderation PASS, garage-schema-check PASS(V1→V2 + core validate), admin은 기존 rate limit 충돌로 실패(사본으로 나머지 검증 PASS, 추가 이슈 참고). `mvn test` 86 run/0 fail/0 skip(통합 포함), `npm test` 14 pass. Neon 미접속. GitHub Actions run 36661042141 성공(Spring tests, Node tests 모두 success) |
| STEP 5-A | 완료 | 2026-09-30 | `1aae376` | 재현: Spring(`forward-headers-strategy: framework`)은 X-Forwarded-For 첫 값을 IP로 쓰고 nginx는 클라이언트 값 뒤에 덧붙이고 있어, 위조 헤더로 core 로그인 IP 버킷을 매번 바꿀 수 있었다(`ForwardedClientIpTest`, `scripts/nginx-forwarded-check.sh`로 수정 전 실패 확인). 수정: nginx 두 `/api` location에서 X-Forwarded-For를 `$remote_addr`로 덮어씀, Spring/board limiter에 만료 윈도 정리(윈도 길이마다 sweep, 시계 주입). 검증: `mvn test` 91 run/0 fail/0 skip(통합 포함, 신규 5), `npm test` 16 pass(신규 2), nginx 검사 PASS, 현재 소스로 빌드한 전체 임시 스택에서 가입·로그인·글쓰기·프론트 정상 + 위조 XFF를 바꿔 가며 로그인해도 10회 초과 시 429. Cloudflare 실제 IP 복원은 STEP 9. Neon 미접속 |
| STEP 5-B | 완료 | 2026-09-30 | `83c79f1` | 계정 단위 로그인 제한 `LoginAttemptLimiter`(Redis, 키 `login-fail:<SHA-256(로그인과 같은 정확한 아이디)>`, 실패 5회 → 그 시점부터 15분 429 + `Retry-After`, 막힌 동안은 DB·비밀번호 검사 없음, 없는 아이디·정지 계정도 같은 401/429, 성공 시 초기화하지 않고 TTL로만 만료 — `PasswordResetService`와 같은 패턴). 기존 IP 필터와 병행. board: 매물 등록 사용자당 10/분, 신고 사용자당 10/분, 조회수 2곳 IP당 60/분(`rateLimiter`에 `by: "ip"` 추가, 로그인 여부 무관). `admin-system.mjs` 작성자 분산으로 rate limit 충돌 해소. 검증: `mvn test` 99 run/0 fail/0 skip(통합 포함, 신규 8), `npm test` 20 pass(신규 4), 수동 시스템 테스트 5개 PASS, 임시 전체 스택 e2e(동시에 띄운 별도 IP 클라이언트로 계정 잠금·없는 아이디 동일 응답·잠금 중 올바른 비밀번호도 429·다른 아이디 영향 없음·IP 제한 병행 확인). Neon 미접속 |
| STEP 6 | 완료 | 2026-09-30 | `6274979` | `validation.js`의 `text()` 한 곳에서 `sanitize-html`(2.17.7, `allowedTags: []`)로 태그 제거 → sanitize-html이 만든 엔티티 4종(`&lt; &gt; &quot; &amp;`)만 평문으로 되돌림 → 값이 바뀌지 않을 때까지 반복(최대 5회, 수렴하지 않으면 400; 엔티티로 숨긴 태그 차단). 제어·bidi·폭 없는 문자 제거(이모지용 ZWJ는 유지). 길이는 정리 전 원문 기준으로 먼저 검사, 정리 후 빈 필수 값은 400. 백필 없음. 검증: `npm test` 41 pass(신규 21), `mvn test` 99 run/0 fail/0 skip(회귀), 수동 시스템 테스트 5개 PASS, 실제 PostgreSQL에서 작성→조회 왕복(태그 제거, `<3`·`1<2 & 3>2`·이모지 평문 유지, 엔티티 없음). 참고: STEP 6 본문의 "`community-system.mjs`는 깨져 있어 사용 불가"는 STEP 4 follow-up(`47dbd69`)으로 해결된 옛 문구다. Neon 미접속 |
| STEP 7-A | 완료 | 2026-09-30 | `de14a47` | 결정: 운영 DB는 Neon 확정. Redis 인증: `REDIS_PASSWORD`를 redis(설정 파일로 전달해 ps에 노출 안 됨, healthcheck는 `REDISCLI_AUTH`+PONG 확인)·core(`spring.data.redis.password`, prod 프로파일은 필수)·board(`createClient({password})`)에 같은 값으로 전달, 기본 compose는 로컬 기본값 `revcc-local-redis`, prod 오버레이는 `:?` 강제, 비밀번호 미설정 시 무인증 접속 유지(CI·격리 테스트). DB: prod 오버레이가 로컬 `POSTGRES_PASSWORD`로 core/board를 덮어쓰던 문제 제거, core/board는 `DB_HOST/DB_NAME/DB_USER/DB_PASSWORD`를 `:?`로 강제, 로컬 postgres 서비스와 `revcc_pg` 볼륨은 prod 병합 결과에서 `!reset null`로 제거(core `depends_on`은 `!override`로 redis만). `scripts/assignment-run.sh`·당시 Docker 실행 문서·`.env.example` 반영. 검증: 가짜 env로 `docker compose config` 병합 결과 확인(prod 서비스 5개·postgres/볼륨 없음·Neon 값만 사용·로컬 비밀번호 미유입·Redis 값 3곳 일치·필수값 6개 누락 시 기동 거부, 기본 compose 6개·`revcc-network` 유지), SSL 켠 임시 PostgreSQL(Neon 대역)로 prod·기본 구성 실제 기동(prod 5개 healthy·postgres 컨테이너/볼륨 미생성·SSL 연결·Flyway V1/V2·가입/로그인/board 글쓰기·Secure 쿠키, 기본 6개 healthy·같은 흐름), Redis 무인증 접근 NOAUTH, `mvn test` 99 run/0 fail/0 skip(무인증 Redis 통합 포함), `npm test` 41 pass, 수동 시스템 테스트 5개 PASS. Neon 미접속 |
| STEP 7-B | 완료 | 2026-09-30 | `7819b9a` | prod 오버레이에만 역할별 네트워크: `edge`(proxy·frontend, internal), `app`(proxy·core·board, 외부 통신 가능), `data`(core·board·redis, internal). 기본 compose(`revcc-network` 6개)는 변경 없음, prod 병합 결과에 기본 네트워크·postgres·볼륨 없음. 임시 prod 스택(SSL PostgreSQL로 Neon 대역) 실측 — 허용: proxy→frontend/core/board, 게시된 포트→proxy(edge가 internal이어도 동작), core/board→redis(로그인·board 세션), core/board→외부 PostgreSQL TLS(12/12 SSL, Flyway V1/V2), core/board→kauth/kapi.kakao.com HTTPS 응답, Redis 인증(NOAUTH/PONG). 차단 12건: frontend→redis/core(DNS·IP)·인터넷, proxy→redis(DNS·IP), redis→frontend/proxy/core의 app IP·인터넷·외부 PostgreSQL. 대조군(같은 nc/TCP 도구로 허용 경로 연결 성공) 확인. `mvn test` 99 run/0 fail/0 skip, `npm test` 41 pass, board 수동 시스템 테스트 4개 PASS(garage-schema-check는 compose를 쓰지 않아 영향 없음). Neon 미접속 |
| STEP 8 | 완료 | 2026-09-30 | `8d8f94e` | Neon 읽기 전용 확인: max_connections 901, superuser_reserved 4(일반 가용 897), 역할·DB 한도 없음, 앱 외 연결은 관리·백그라운드뿐. 풀: core Hikari 최대 10·최소 유휴 2·연결 대기 5초·socketTimeout 15초, board pg.Pool 최대 10·유휴 30초·연결 대기 5초·query_timeout 15초(모두 env로 조정) → 평시 합산 최대 20, 재배포 중첩 40(가용의 약 4.5%). DB 연결 실패는 Spring도 503(`DatabaseUnavailableHandler`, board는 기존 핸들러). 검증 중 발견·수정: 이미 열린 연결에서 DB가 멈추면 board 쿼리가 무한 대기(40초 무응답)하던 문제 → query_timeout/socketTimeout 추가 후 503. prod 오버레이 5개 서비스 `restart: unless-stopped`(기본 compose는 없음), `.env.example`을 compose 변수 전체 기준으로 재작성(값 없는 줄 뒤 인라인 주석이 값이 되는 문제 발견·회피). 검증: `docker compose config`(prod 5개·재시작 정책·풀 변수·7-A/7-B 구조 유지, 기본 6개·재시작 없음), 격리 prod 스택 실측(부하 중 board 연결이 정확히 10에서 멈춤, DB 중지/멈춤/부하 중 멈춤 모두 503·최대 15.0초(board)/20.2초(core)·무응답 0건·복구 후 200, redis·core 비정상 종료 후 자동 재시작·수동 stop은 유지), `mvn test` 101 run/0 fail/0 skip(신규 2), `npm test` 45 pass(신규 4), 수동 시스템 테스트 5개 PASS. Neon에는 SELECT/SHOW만 실행 |
| STEP 9 | 완료 | 2026-09-30 | `c9a4490` | Named Tunnel 운영 확정. nginx: cloudflared 고정 주소(172.16.238.2)에서 온 요청만 CF-Connecting-IP로 실제 IP 복원, `Forwarded`·`True-Client-IP`·`X-Forwarded-Host/Port/Prefix/Ssl`·`CF-Connecting-IP`를 백엔드로 넘기지 않음(**5-A 우회 발견·수정**: Spring이 `Forwarded: for=`를 우선해 로그인 IP 제한을 우회할 수 있었음), limit_req(`/api` 20r/s·burst 200, 인증 30r/m·burst 30, JSON 429), HSTS `max-age=300`(cloudflared 경유 https만), `server_tokens off`, timeout 명시(proxy read 30s 등). prod 오버레이: `cloudflared` 서비스 + `tunnel` 네트워크, proxy 호스트 포트 제거. 검증: Quick Tunnel로 Cloudflare 엣지 헤더 실측, `scripts/nginx-forwarded-check.sh` PASS(수정 전 설정은 FAIL), 임시 prod 스택(SSL PostgreSQL로 Neon 대역) 실제 엣지 경유 e2e(HSTS, http→301, Secure 세션 로그인·board 세션·글쓰기·업로드 4MB, nginx 로그에 실제 공인 IP, 위조 헤더를 바꿔도 Spring 10회·Node 60회 후 429, 인증 zone 429), 신뢰 발신지 시뮬레이션(사용자별 버킷 분리, 비신뢰 발신지는 한 버킷), 구 설정 이미지로 `Forwarded` 우회 재현, proxy 직접 접근 불가(게시 포트 없음, 외부 컨테이너 도달 불가), core 정지 시 504 30.0초, 기본 compose 회귀(6개 healthy, 로컬 http에 HSTS 없음, 가입·로그인·세션·글·댓글·이미지·로그아웃·기존 rate limit·415). `docker compose config`(prod 6개·게시 포트 0·토큰 누락 시 거부, 기본 6개·8090·`revcc-network` 유지), `.env.example` ⊇ compose 변수. `mvn test` 102 run/0 fail/0 skip(통합 포함, 신규 1), `npm test` 45 pass, 수동 시스템 테스트 4개 PASS. GitHub Actions run 36718881922 성공(Spring tests, Node tests). Neon 미접속 |
| STEP 10 | 결정 완료 | 2026-09-30 | (문서) | 회원탈퇴 정책 12개 결정(soft withdrawal, 콘텐츠 "탈퇴한 회원" 유지, 즉시 탈퇴 + 본인 재확인 등) 기록, STEP 10-impl A~E 계획 정의. 조사: 임시 PostgreSQL에서 `DELETE FROM users` 시나리오 실측(ROLLBACK), Neon은 FK 카탈로그·집계만 읽기 전용 확인(FK 30개 V1과 일치, orphan 0, 관리자 1명, 일반 계정 32개 중 31개 이메일 없음). 코드 변경 없음 |
| STEP 10-impl-A | 완료 | 2026-10-01 | `cf9fe55` | Flyway V3: `users.withdrawn_at`, `account_status` CHECK(ACTIVE/SUSPENDED/DISABLED/WITHDRAWN), `board_posts.deleted_at/deleted_by(FK users)/deleted_reason`(AUTHOR/ADMIN, 기존 deleted=true는 ADMIN 백필). V1/V2 무변경, 탈퇴 API 없음. Spring: WITHDRAWN을 `User.isBlocked()`에 포함 → 일반 로그인(없는 계정과 같은 401)·카카오 로그인(403, 닉네임 갱신 전 거부)·공유 세션·관리자 인가 차단, 비밀번호 재설정 요청/완료도 거부. 관리자 회원 PATCH: 탈퇴 대상은 모든 변경 409, 변경 후 유효 관리자 0명이면 409(ADMIN 행 전체 id 순 FOR UPDATE 후 요청자·대상을 다시 읽음), 목록 WITHDRAWN 필터(기본 목록·overview 회원 수 제외). 예약 아이디(NFKC·대소문자·구두점 정규화, "탈퇴한 회원"·`withdrawn` 접두어·관리자류): 가입·중복 확인·카카오 신규/닉네임 갱신. board: WITHDRAWN 세션 거부, 공통 `member-display.js`로 글·댓글·알림·방명록·장터·관리자 글/신고 목록에 "탈퇴한 회원" 표시와 공개 id·연결 차량 숨김(관리자는 내부 id 유지), 탈퇴 회원 프로필·차고·방명록 404, 연락처 비공개, 회원 수·검색·관리자 회원 목록 제외. frontend: id 없으면 프로필 링크 없음, 관리자 회원 창 WITHDRAWN 표시·편집 비활성. **중단 복구**: 작업 중 세션이 끊겨 커밋 전 working tree에서 재개. 누락 1건(관리자 글/신고 목록의 탈퇴 표시)을 보완하고, 남아 있던 임시 컨테이너 `s10a-testpg`/`s10a-testredis`를 정리했다. 검증: `mvn test` 118 run/0 fail/0 skip(통합 포함, 빈 PG16·빈 PG18 각각, 같은 DB 재기동 시 flyway history·checksum 동일), 마지막 관리자 동시 강등 8라운드 매번 1건만 성공·관리자 1명 유지, Flyway CLI로 V1+V2 적용 DB(기존 글·정지 회원 포함)에 V3 적용 PG16/PG18 모두 성공(백필 ADMIN, 기존 상태 유지, 잘못된 상태 CHECK 거부, validate 통과), `npm test` 47 pass, 수동 시스템 테스트 5개 PASS(`withdrawn-member-system.mjs` 신규), `garage-schema-check.py` PASS(V1→V2→V3 + core validate). Neon 미접속·V3 미적용(다음 core 기동 시 V3 적용됨). GitHub Actions run 36738672032 성공(Spring tests, Node tests) |
| STEP 10-impl-B | 완료 | 2026-10-01 | `544a819` | 본인 글 삭제를 `DELETE`에서 soft delete로 바꿨다(`deleted=true, deleted_at=NOW(), deleted_by=삭제한 사용자 id, deleted_reason='AUTHOR'`, 원문·사진 참조 유지). 관리자 삭제도 `deleted_at/deleted_by/deleted_reason='ADMIN'`을 기록한다(원문은 기존대로 moderation_logs, 글의 제목·본문·image_ids는 비움). 댓글·신고·좋아요·북마크·알림은 더 이상 cascade로 지워지지 않고, 반복 삭제는 404(기록 추가 없음). 공개 조회는 이미 `NOT deleted`였고, 관리자 overview `totalPosts`·회원별 `postCount`·관리자 게시글 목록에서도 삭제 글을 뺐다. 관리자 신고 목록은 삭제 글의 신고를 유지하며 `postDeleted/deletedReason/deletedAt`과 작성자 삭제 글의 원문을 준다(관리자 화면에 "작성자가/관리자가 삭제한 글" + 원문 펼치기). 이미지 공개(`GET /api/board/images/:id`): 삭제되지 않은 글·매물의 image_ids, 탈퇴하지 않은 회원의 avatar/cover/차량 image_id가 참조할 때만 공개하고, 소유자(미리보기)와 DB 기준 관리자는 항상 볼 수 있다. 그 밖은 없는 id와 같은 404(`board-service/src/image-references.js`). 글·매물 응답의 imageIds는 실제 있는 이미지와 교집합(순서 유지). Flyway V4 `V4__image_reference_indexes.sql`: `board_posts.image_ids`, `parts_listings.image_ids` GIN 인덱스. 이미지 행을 지우는 코드 경로는 원래 없었다(삭제는 회원 cascade뿐)라 바꾸지 않았다(추가 이슈 참고). 검증: `mvn test` 118 run/0 fail/0 skip(빈 PG16·PG18 각각, 재기동 후 flyway history·checksum 동일), Flyway CLI로 V1→V3 + 데이터 5000행 DB에 V4 적용 PG16/PG18 성공, 재실행 "up to date", `image_ids @> ARRAY[..]`가 `board_posts_image_ids_gin` Bitmap Index Scan 사용, `npm test` 47 pass, 수동 시스템 테스트 6개 PASS(`post-soft-delete-system.mjs` 신규: 요청한 15개 항목 + 탈퇴자 프로필·차량 사진 404 + 숫자가 아닌 이미지 id 400, `moderation-system.mjs`에 deleted_by/deleted_reason 기대값, `community-system.mjs`는 미첨부 사진 비로그인 404로 기대값 변경), `garage-schema-check.py` PASS(V1→V4 + core validate). Neon 미접속·V3/V4 미적용. GitHub Actions run 36744039479 성공(Spring tests, Node tests) |
| STEP 10-impl-C | 완료 | 2026-10-01 | `1af7edb` | 일반 계정 탈퇴 `POST /api/auth/withdraw {password, confirm:true}`(로그인 필수, 로그인과 같은 비밀번호 확인, 실패 회원당 5회/15분 `withdraw-fail:<id>` + IP 10/분 + nginx 인증 구간), 화면용 `GET /api/auth/withdraw`(방식·관리자·예약중 수). 거부: 카카오 400 `KAKAO_REAUTH_REQUIRED`(D 전까지), ADMIN 409, 예약중 매물 409(개수), 비밀값 없음 503 — 거부 시 아무것도 바뀌지 않는다. `WithdrawalService` 한 트랜잭션: 회원·매물 행 잠금 → `withdrawal_blocks` → 차고(차량 CASCADE로 정비기록·등록증·인증, 글 vehicle_id SET NULL)·프로필·내 차고 방명록 삭제 → 판매중 closed(연락처·찜 삭제), 판매완료 연락처만 삭제(지역·사진 유지) → 좋아요·북마크·찜·받은 알림 삭제 → 어디서도 참조하지 않는 내 사진 삭제(삭제 글·닫힌 매물 참조도 보존) → moderation_logs 대상 이름 `탈퇴한 회원#<id>` → users 익명화(`withdrawn:<id>`, email·kakao_id·nickname NULL, 사용 불가 비밀번호, suspended_until 유지) + WITHDRAWN + withdrawn_at + auth_version+1 → `SELF_WITHDRAW:<직전상태>`. 커밋 후 현재 세션 키 삭제·쿠키 제거, 다른 세션은 auth_version으로 Spring·board 즉시 거부. 재가입 제한: HMAC-SHA256(`WITHDRAWAL_HMAC_SECRET`, `type:value`)만 저장(V5 CHECK로 hex 64자만 허용), 아이디(가입과 같은 원문)·정규화 이메일·카카오 id, COOLDOWN 30일 + SANCTION(정지: 종료일과 30일 중 늦은 날, 종료일 없는 정지·비활성화: 무기한). 확인: 가입·아이디 확인·카카오 신규 가입/닉네임 갱신·관리자 이메일 등록. prod 프로파일·오버레이는 비밀값 없으면 기동 거부, 그 외 환경은 탈퇴 503 + 살아 있는 제한 행이 있으면 가입도 503. Flyway V5 `V5__member_withdrawal_data.sql`(매물 status에 closed — 기존 CHECK는 정의로 찾아 교체, closed_at, withdrawal_blocks). board: closed 매물은 목록·검색·찜·상세·조회수·찜·수정에서 제외(관리자 상세만), 사진 비공개. `/api/admin/members/{id}/actions`의 admin_id NULL NPE 수정. frontend `/home` "회원 탈퇴"(안내·비밀번호·동의, 서버 사유 표시, 카카오·관리자·예약중은 폼 없이 안내). 문서 `docs/member-withdrawal.md`(키·교체·수동 해제·한계). 검증: `mvn test` 130 run/0 fail/0 skip(빈 PG16·PG18 각각, 같은 DB 재실행 후 flyway history·checksum 동일; 신규 `WithdrawalIntegrationTest` 9·`WithdrawalBlocksTest` 3 — 테이블별 결과, 세션 2개 무효, 탈퇴 전 재설정 토큰 거부, 재가입 409, 원문·단순 SHA-256 미저장, 예약중 409 무변경, 카카오·관리자 거부, 제재 기간 4가지, 강제 실패 전체 롤백, 동시 탈퇴 4회 1건만 성공, 예약 변경 경쟁 6회, 관리자 복구 불가·마지막 관리자 보호), Flyway CLI V4(기존 매물 3상태)→V5 PG16/PG18 성공·재실행 up to date·CHECK 이름이 달라도 교체, `npm test` 47 pass, 수동 시스템 테스트 7개 PASS(`withdrawal-system.mjs` 신규), `garage-schema-check.py` PASS(V1→V5 + core validate), 실제 core+board 임시 스택 e2e PASS, 전체 스택(proxy·frontend 포함) 브라우저 `withdrawal-browser.cjs` PASS, prod 프로파일 비밀값 없이 기동 실패 확인, `docker compose config`(prod는 비밀값 누락 시 거부, 기본 compose는 영향 없음). Neon: 읽기 전용 집계만(Flyway v2, account_status 33명 전부 NULL, 매물 0건, status CHECK 이름 `parts_listings_status_check`, 이메일 1·카카오 1·관리자 1) — 쓰기 없음. GitHub Actions run 36748149088 성공(Spring tests, Node tests) |
| STEP 10-impl-D~E | 보류(2026-10-01) | - | - | 공개 단계 전환으로 보류. D는 §4 LATER-1(최소 구현), E는 §4 "보류" |
| STEP 11 | 보류(2026-10-01) | - | - | 작은 응답 통일은 §4 LATER-2, 큰 설계가 필요하면 보류 |
| UI: 로그인 필요 토스트 | 완료·운영 배포(2026-10-19) | 2026-10-19 | `679f9a2`(PR #4, 병합 `28f0036`) | 비로그인 사용자가 로그인이 필요한 동작을 하면 페이지 위쪽 안내 줄(`notify`) 대신 화면 하단 중앙 토스트("로그인 후 이용할 수 있어요.")를 띄운다. 공통 `components/common/toast.tsx`(+`.module.css`)를 루트 레이아웃에 한 번 두고 `showLoginRequiredToast()`로 부른다: `position: fixed`, 약 3초 뒤 자동으로 사라짐(닫기 버튼 없음), 한 번에 하나만 표시하고 다시 부르면 마지막 호출부터 시간을 다시 잼, `pointer-events: none`·배경 가림 없음, `role="status"` + `aria-live="polite"`, 모바일(760px 이하)은 하단 16px + `env(safe-area-inset-bottom)` + `--toast-bottom-offset`(하단 메뉴가 생기면 그 높이, 지금은 없음), `max-width: calc(100vw - 32px)`. 적용: 글 상세(추천·북마크·댓글·답글·신고 등 `requireLogin`), 회원 프로필·내 차고 방명록, 매물 상세, 매물 목록 찜. 로그인 검사·차단 로직, 일반 오류·성공 안내(`notify`), 로그인 페이지 안내, "내 활동" 범위 버튼의 로그인 이동은 그대로. 검증: `tsc --noEmit`, Docker frontend 재빌드(`next build` 포함), Chrome 비로그인 — PC 1440px(2389px 스크롤 위치에서 하단 24px·정중앙, 문서 높이 변화 없음), 모바일 폭 500px(Chrome 창 최소 폭, 하단 16px·가로 스크롤 없음, 긴 문구는 양옆 16px 안에서 줄바꿈), 연속 클릭 6회에도 토스트 1개·마지막 클릭 후 3,028ms에 사라짐, 추천·북마크·댓글 미반영, 토스트 아래 요소 클릭 가능, 콘솔 오류 없음. 320/390px은 CSP `frame-ancestors 'none'`로 iframe 확인을 못 해 CSS 계산(허용 폭 288px > 문구 폭 204px)으로만 판단. 장터는 `/parts` 307 보류 중이라 화면 확인 없이 타입 검사만. 로컬 DB에 테스트 계정 `toasttest`와 글 1개(`/community/free/1`)를 만들었다(운영 무관) |
| UI: 답글 표시 단순화 | 완료·운영 배포(2026-10-19) | 2026-10-19 | `e044a34`(PR #5, 병합 `6e3c624`) | 글 상세 댓글의 답글 연결선(`839e333`·`730af84`·`69c0e3c`: 부모 구분선에서 내려오는 세로선 + 꺾쇠 화살표)을 짧은 ㄴ자 표시로 바꿨다(`post-detail.module.css`의 `.reply`만). 표시는 답글 위쪽 여백 안(위 구분선에서 18px 아래)에서 시작해 구분선과 떨어져 있고, 끝은 작성자 줄 가운데에 맞췄다. 12×8px, 1.5px `--line-strong`(#c9ccc4), 화살촉 없음, 이름까지 10px. 작성자·날짜·본문은 같은 왼쪽 시작선(`padding-left: 22px`), 들여쓰기는 PC 24px·모바일(760px 이하) 8px. 검증: Docker frontend 재빌드 후 Chrome PC 1470px에서 실측(답글 이름·날짜·본문 시작선 동일, 이름까지 10px, 표시 끝 25.25px ≈ 메타 줄 가운데 25px), 모바일은 Chrome 확장·헤드리스 모두 창 폭이 500px 아래로 줄지 않아 500px 레이아웃에서 모바일 규칙 적용만 확인(390·320px 미확인). 로컬 DB에 테스트 계정 `replytest`와 댓글 2개·답글 2개를 `/community/free/1`에 만들었다(운영 무관) |

---

## 7. 다음 실행 명령

새 터미널/새 Claude Code 세션에서 아래 한 문장만 입력하면 된다:

```
MORETHANCAR_NEXT_TASKS.md를 읽고 "지금 할 것"의 처음 미완료 작업 하나만 진행해. 공통 작업 규칙과 "작업 및 검증 경량화 원칙"을 따르고, 최신 main에서 기능 브랜치를 만들어 작업하고, 관련 테스트 통과 후 그 브랜치에 commit까지 진행해. push·main 병합은 내가 확인한 뒤 진행해.
```
