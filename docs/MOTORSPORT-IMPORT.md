# 모터스포츠 공식 일정 자동 수집

공식 출처에서 일정을 읽어 `/motorsport` 캘린더용 일정(`motorsport_events`)에 **초안(DRAFT)**으로 넣는다.
공개는 지금처럼 운영자가 관리자 화면(`/admin/motorsport`)에서 확인한 뒤 한다. 수집기는 공개 상태를 바꾸지 않는다.

- 코드: `board-service/src/motorsport-import/` (출처 어댑터 `sources/*.js`, 반영 규칙 `sync.js`, 실행 `run.js`, CLI `cli.js`)
- 스키마: Flyway `V9__motorsport_import.sql` (기존 테이블에 nullable 컬럼 + 실행 기록 `motorsport_import_runs`)
- 스케줄: `scripts/motorsport-import-cron.sh` (운영 EC2 cron)

## 지원 범위 (2026-10-20)

| 출처 키 | 대상 | 공식 출처 | 읽는 데이터 | 이용 조건 확인 | 운영 활성화 |
|---|---|---|---|---|---|
| `f1` | F1 (올해 남은 경기 + 발표된 다음 시즌) | formula1.com 경기 페이지 | 페이지의 race 데이터·JSON-LD. 세션이 TBC면 시각 저장 안 함 | **금지** — 디지털 서비스 약관·가이드라인이 스크래핑·데이터 마이닝 금지 | 안 함 |
| `nascar` | NASCAR Cup Series | nascar.com 일정 JSON 피드 | race_id별 세션, 결승 시각(트랙 시간대 표를 피드 오프셋과 대조) | **금지** — 이용약관이 봇·스크립트 데이터 수집 금지 | 안 함 |
| `lemans` | 르망 24시 | 24h-lemans.com 일정 페이지 | JSON-LD 결승 출발~체커기 | **불명확** — 자동 수집 조항 없음, 콘텐츠·DB 저작권, "개인 열람만, 공개 게시 제외" | 안 함(결정 대기) |
| `superrace` | 슈퍼레이스(에버랜드·인제 라운드) | super-race.com 시즌 일정 | 라운드별 rid·날짜(시각 없음) | **불명확** — 약관 본문을 확인하지 못함(스크립트 로드) | 안 함(결정 대기) |
| `inje` | 인제 스피디움 공식 경기 + 일반 주행일 | 서킷일정 달력(cc.speedium.co.kr:8443) | "대회/행사"와 "스포츠주행"이 명시된 날 | **불명확** — 자동 수집 금지 조항 없음, robots 전체 허용, 회원 약관에 정보의 영리 목적 무단 복제 금지 | 안 함(결정 대기). **운영 EC2에서 접속 불가**(80·443·8443 모두 타임아웃, 2026-10-20) |

미지원:
- **WRC**: 수집기 없음. 개발 환경에서는 wrc.com이 요청을 403으로 막았고, 운영 EC2에서는 2026-10-20 캘린더 페이지가 200으로 열렸다(접속 확인만 함). 구조화된 데이터가 없고 이용 조건을 확인하지 않아 구현하지 않았다. 우회 수집은 하지 않는다.
- **에버랜드 스피드웨이 자체 일정**: 공개된 공식 일정 페이지를 찾지 못했다. 에버랜드 경기는 `superrace`로만 들어온다.
- 인제 스포츠주행 세션 시간표는 이미지로만 공개돼 시각을 저장하지 않는다. 예약 링크만 저장하고 예약 가능 여부·잔여석은 수집하지 않는다.

출처는 **명시적으로 활성화한 것만** 실행된다(`MOTORSPORT_IMPORT_SOURCES`, 비어 있으면 아무것도 하지 않음).
이용 조건이 금지이거나 불명확한 출처는 운영자 결정 전까지 켜지 않는다.

## 반영 규칙

- 같은 일정은 출처 식별자(`source_key`, 예: `f1:1297`, `superrace:88`, `inje:91177`)로 찾는다. 날짜·제목이 바뀌어도 같은 행이다.
- 새 일정은 DRAFT. 이미 끝난 일정은 넣지 않는다.
- 출처가 바꾼 필드 중 운영자가 고치지 않은 것만 갱신한다. 공개 중인 일정의 날짜·시각·장소가 바뀌면 상태를 "변경됨"으로 표시한다.
- 운영자가 고친 값과 충돌하면 덮어쓰지 않고 **재확인 대기열**에 "출처 변경 미반영"으로 표시한다. "확인일 갱신"을 누르면 운영자 값을 유지한 채 해소된다.
- 취소는 출처가 명시한 경우만. 출처에서 사라지거나 수집에 실패해도 삭제·취소하지 않는다(실행 결과의 `missing`으로 보고). 운영자가 삭제한 일정은 다시 만들지 않는다.
- 시간대: `startsOn/endsOn`은 개최지 현지 날짜, `startsAt`은 출처가 확정한 시각만(UTC). 화면은 KST와 현지 시각을 함께 보여 준다.
- 재실행·동시 실행: `source_key` 유일 인덱스 + 출처별 DB 잠금 + cron 스크립트 flock.
- 요청: 출처당 1.5초 간격, 하루 한 번. User-Agent `morethancar-schedule/1.0 (+https://morethancar.kr)`.

## 실행

board 컨테이너 안에서 실행한다(board와 같은 DB 설정).

```bash
# 운영 EC2 (~/rev.cc)
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
$C exec -T board node src/motorsport-import/cli.js --source inje            # dry-run: 반영하지 않고 결과만
$C exec -T board node src/motorsport-import/cli.js --source inje --apply    # 반영
$C exec -T board node src/motorsport-import/cli.js --apply                  # .env의 MOTORSPORT_IMPORT_SOURCES만

# 로컬(DB 없이 출처 해석만)
cd board-service && node src/motorsport-import/cli.js --source all --no-db
```

결과는 출처별 JSON 한 줄(`inserted/updated/conflict/unchanged/deleted/missing/errors`). 하나라도 실패하면 종료 코드 1.

테스트: `cd board-service && npm test`(파서·반영 규칙 단위 테스트), `scripts/run-board-system.sh scripts/motorsport-import-system.mjs`(임시 PostgreSQL).

## 운영 설정 (.env)

| 키 | 값 |
|---|---|
| `MOTORSPORT_IMPORT_USER_ID` | 수집 전용 계정 `schedule-bot`의 users.id |
| `MOTORSPORT_IMPORT_SOURCES` | 활성화한 출처(쉼표 구분). 비어 있으면 수집하지 않음 |

### 수집 전용 계정

로그인할 수 없는 MANAGER 계정이다. 감사 로그에 수행자로 남는다.

```sql
INSERT INTO users(username,password,role,account_status,auth_version,created_at)
VALUES('schedule-bot','$2a$10$!login-disabled-schedule-bot','MANAGER','ACTIVE',0,NOW()) RETURNING id;
```

- 비밀번호 칸은 BCrypt처럼 보이지만 올바르지 않은 값이다. 평문으로 두면 로그인 코드가 평문 비교를 하고 core 시작 시
  `PasswordMigrationRunner`가 BCrypt로 바꿔 그 문자열로 로그인할 수 있게 된다(로컬에서 재현·확인). 위 값은 평문 비교·마이그레이션
  대상이 아니고 BCrypt 검증은 항상 실패한다.
- 이메일·카카오 ID가 없어 비밀번호 재설정·카카오 로그인으로도 인증되지 않는다(카카오는 kakao_id로만 계정을 찾는다).

## 스케줄과 실패 확인

```cron
# crontab -e (ubuntu, 서버 시간대 UTC)
30 18 * * * /home/ubuntu/rev.cc/scripts/motorsport-import-cron.sh
```

- 매일 18:30 UTC = 03:30 KST. 스크립트가 PATH와 저장소 경로를 직접 정한다.
- 로그 `~/logs/motorsport-import.log`: 1MB를 넘으면 마지막 512KB만 남긴다.
- 실패는 메일로 알리지 않는다(2026-10-20 결정). 로그와 관리자 재확인 대기열의 출처별 "수집 실패/지연(이틀 넘게 성공 없음)/정상"으로 확인한다.
- 스케줄은 활성화한 출처의 첫 등록과 재실행 무중복을 확인한 뒤 켠다.

## 되돌리기

V9는 기존 행을 바꾸지 않는다. 수집으로 들어온 일정만 지우려면 `source_key IS NOT NULL`인 DRAFT 일정을 대상으로 한다
(연결된 후기 글은 `motorsport_event_id`가 NULL이 된다). 스키마까지 되돌리려면 배포 전 pg_dump 백업으로 복원한다.

## 운영 배포 기록 (2026-10-20)

- 배포: `dcf475d`(PR #8). core·board·frontend만 갱신, proxy·redis·cloudflared 재시작 없음. Flyway V9 적용 확인(02:38 UTC).
- 배포 전 백업: `~/rev.cc/backups/neon-pre-v9-20261020-023011.dump`(pg_dump 18 — Neon 서버가 PostgreSQL 18이라 16으로는 실패, TABLE DATA 28개 확인),
  `.env.backup.20261020-023642`. 롤백 이미지: `revcc-core|revcc-board|revcc-frontend:pre-20261020-v9-rollback`
  (core·board는 원본 이미지 기록이 없어 실행 중이던 컨테이너를 `docker commit`).
- 수집 계정: `schedule-bot`(users.id 4, MANAGER, 이메일·카카오 없음). 운영 로그인 시도 401, core 재시작 후에도 비밀번호 칸 그대로.
- `.env`: `MOTORSPORT_IMPORT_USER_ID=4`, `MOTORSPORT_IMPORT_SOURCES=`(비어 있음). 수집기 실행 시 "활성화된 출처 없음"으로 종료.
- **출처 활성화·첫 등록·cron 등록은 하지 않았다** — 이용 조건이 금지(F1·NASCAR) 또는 불명확(르망·슈퍼레이스·인제)이라 사용자 결정 대기.
- 운영 EC2 접속 확인: WRC 캘린더 200(접속만 확인), 인제 서킷 사이트 80·443·8443 타임아웃.
- 실패 알림 메일은 쓰지 않기로 했다(2026-10-20). 관리자 상태 표시와 로그만 쓴다.
- EC2 보안 그룹 `launch-wizard-1`(sg-09c3eed40efefe97d) 아웃바운드가 443만 허용해 smtp.gmail.com:587에 연결되지 않는다.
  core의 비밀번호 재설정 메일도 같은 이유로 발송되지 않는다(별도 복구 작업). 운영 SMTP 설정은 587 + STARTTLS(필수) + 인증으로 정상.
