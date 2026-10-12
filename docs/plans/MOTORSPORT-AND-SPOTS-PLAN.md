# 모터스포츠 일정 · 와인딩/드라이브 스팟 개발 계획

> 작성: 2026-10-12 · 기준 코드: `main` (`1852109`) · 상태: **결정 확정(§9), 1단계 착수**
> 범위: A. 모터스포츠 일정, B. 와인딩·드라이브 스팟. 전기차 정보 허브는 제외(`lib/services.ts`의 `ev` 항목·관련 코드는 그대로 둔다).
> 아키텍처 유지: Next.js(frontend) · Spring Boot(core, 인증·Flyway 스키마 소유) · Node.js(board-service, 커뮤니티·관리자 API) · PostgreSQL(Neon).

---

## 0. 현재 코드에서 확인한 사실 (계획의 전제)

| 항목 | 현재 상태 | 계획에 주는 영향 |
|---|---|---|
| 스키마 소유 | core의 Flyway가 유일한 소유자(`backend/src/main/resources/db/migration`, V1~V5). board-service는 DDL을 실행하지 않는다 | 새 테이블은 **Flyway V6, V7…**로 추가한다 |
| 커뮤니티·관리자 API | board-service: `/api/board/*`(community.js), `/api/board/admin/*`(admin.js, `requireCurrentAdmin`으로 DB 역할 재확인) | 새 API도 board-service에 라우터 2개(`motorsport.js`, `spots.js`)로 추가한다. Spring은 건드리지 않는다 |
| 게시글 ↔ 대상 연결 | `board_posts.vehicle_id`(FK, ON DELETE SET NULL) + 글쓰기 화면의 "내 차량 연결" 선택 | 같은 패턴으로 `motorsport_event_id`, `spot_id` 컬럼을 추가한다 |
| 게시판 분류 | `free / maintenance / parts / drive` 4개(board-service `categories`, frontend `categories.ts`) | 새 분류는 만들지 않는다(§9 결정 1). 일정·스팟 후기는 기존 분류의 글에 ID를 연결한다 |
| 사진 | `community_images`(DB 저장) + 공개 규칙 `publicImageSql`(image-references.js): 공개 데이터가 참조할 때만 공개 | 스팟 사진을 공개하려면 이 규칙에 "승인된 스팟"을 추가해야 한다. 승인 전 제보 사진은 지금 규칙대로 소유자·관리자만 본다 |
| 메인 화면 | `MotorsportPreview`가 이미 `{kind, series, title, venue, startDate, endDate, officialUrl}` 형태를 받도록 되어 있고 지금은 빈 목록 | 일정 API 응답을 이 형태에 맞춘다 |
| 헤더 메뉴 | `lib/services.ts`에 `motorsport`, `spots`가 href 없이 "SOON" | 페이지가 생기면 href만 채운다(`ev`는 그대로 SOON) |
| 관리자 화면 | `/admin`(admin-app.tsx)에 탭 7개(개요·회원·차량 인증·게시글·신고·로그·인장) | "모터스포츠", "스팟" 탭 2개를 추가한다 |
| CSP | Next가 요청마다 nonce CSP를 보낸다(`frontend/proxy.ts`, `img-src 'self' blob: data:`) | 지도 SDK 스크립트·타일 도메인을 CSP에 추가해야 한다(§4) |
| 탈퇴 정책 | STEP 10: 탈퇴 회원은 "탈퇴한 회원"으로 표시, 공개 id 숨김(member-display.js) | 스팟 제보자·후기 작성자 표시에도 같은 함수를 쓴다 |

⚠️ **로컬 개발 주의**: 기본 `docker-compose.yml`은 core/board를 Neon에 연결한다. V6/V7이 들어간 core를 로컬에서 Neon에 붙여 기동하면 **Neon에 마이그레이션이 바로 적용된다**. 구현·검증은 지금처럼 임시 postgres 스택에서만 하고, Neon 적용은 운영 재가동 때 별도 승인으로 한다.

---

## 1. 페이지와 사용자 동선

### A. 모터스포츠 일정
| 경로 | 내용 |
|---|---|
| `/motorsport` | 기본은 **이번 달 월간 캘린더**. `?view=list`로 리스트 보기(날짜순, 지난 일정 접기). `?month=2026-11`로 월 이동. 필터: 국내/해외, 시리즈(F1·WEC·슈퍼레이스 등), 종류(경기·스포츠주행일·행사) |
| `/motorsport/[id]` | 일정 상세: 시리즈·장소·기간(KST, 해외는 현지 시간 병기), 상태(예정·변경·취소·잠정), **공식 출처 링크와 확인일**, 관련 커뮤니티 후기 목록, "후기 쓰기" 버튼 |
| 메인 `/` | 기존 `MotorsportPreview`에 다가오는 일정 5개 |

동선: 메뉴 "모터스포츠" → 캘린더에서 날짜 칸의 일정 클릭 → 상세 → 공식 사이트(새 창) 또는 "후기 쓰기"(`/community/new?event={id}`로 일정이 미리 연결된 글쓰기. 게시판은 기존 4개 중에서 작성자가 고른다) → 글 상세 오른쪽 패널에 "이 글에 연결된 일정".

### B. 와인딩·드라이브 스팟
| 경로 | 내용 |
|---|---|
| `/spots` | 데스크톱: 왼쪽 목록 + 오른쪽 지도. 모바일: 목록/지도 전환 버튼. 필터: 종류(와인딩 도로·전망대·드라이브 코스), 지역(시·도), 검색어. 지도를 움직이면 보이는 영역의 스팟만 다시 불러온다 |
| `/spots/[id]` | 사진(최대 3장), 위치(작은 지도 + "카카오맵에서 길찾기" 외부 링크), 주소, 주차 정보, **안전 정보**(급커브·낙석·야간 통제·단속 구간 등), 추천 시간·계절, 연결된 후기 글, "후기 쓰기" |
| `/spots/new` | 로그인 사용자 제보: 지도에서 위치 찍기 → 이름·종류·설명·주차·안전 정보·사진 → "검토 대기"로 저장 |
| `/spots/mine` | 내 제보와 상태(검토 대기·승인·반려 사유) |

동선: 메뉴 "스팟 지도" → 지도/목록 → 상세 → "후기 쓰기"(`drive` 분류, 스팟 연결) / 정보가 틀리면 "정보 수정 제보". 제보 → 관리자 승인 → 지도에 공개.

공통: 공통 헤더(`site-header.tsx`)와 화이트 테마 토큰(`theme.module.css`)을 그대로 쓴다. 지도와 캘린더 외에는 새 UI 패턴을 만들지 않는다.

---

## 2. DB 테이블과 관계 (Flyway)

### V6 — 모터스포츠 (1단계에서 구현)
```
motorsport_series   (id, code UNIQUE, name, scope 'DOMESTIC'|'INTERNATIONAL', official_url, active, created_at, updated_at)
motorsport_venues   (id, name, country(ISO 2자리), region, timezone(IANA, 예: Asia/Seoul) NOT NULL,
                     official_url, latitude NULL, longitude NULL, active, created_at, updated_at)
motorsport_events   (id,
                     series_id → motorsport_series NULL,     -- 스포츠주행일은 시리즈가 없을 수 있다
                     venue_id  → motorsport_venues NOT NULL,
                     kind 'RACE'|'TRACK_DAY'|'EVENT',
                     title, starts_on DATE, ends_on DATE (>= starts_on, 31일 이내),
                     starts_at TIMESTAMPTZ NULL,             -- 주요 세션 시작 시각(공개된 경우만)
                     status 'SCHEDULED'|'TENTATIVE'|'CHANGED'|'CANCELLED',
                     source_url NOT NULL, source_name NOT NULL,              -- 공식 출처 필수
                     verified_on DATE NOT NULL, verified_by → users,        -- 마지막 확인일 필수
                     note, created_by/updated_by → users, created_at, updated_at,
                     deleted_at NULL, deleted_by → users NULL)              -- 소프트 삭제(후기 연결 유지)
  INDEX (starts_on, ends_on) WHERE deleted_at IS NULL, (series_id, starts_on), (verified_on) WHERE deleted_at IS NULL
board_posts.motorsport_event_id → motorsport_events ON DELETE SET NULL   -- nullable, 기존 글 영향 없음
```
**날짜·시간대 규칙**
- `starts_on`/`ends_on`은 **개최지 현지 날짜**다(주최 측 공식 일정에 적힌 날짜 그대로). 개최지 시간대는 `motorsport_venues.timezone`이 정한다(국내 서킷은 `Asia/Seoul`).
- `starts_at`은 시각이 공개된 경우에만 저장하는 **절대 시각(UTC 저장)**이다. 화면은 KST로 바꿔 보여 주고, 해외는 현지 시각도 함께 보여 준다(API가 `timezone`을 같이 돌려준다). `starts_at`의 현지 날짜는 `starts_on`~`ends_on` 안이어야 한다(API 검증).
- 기간 조회(`from`/`to`)는 현지 날짜 기준 겹침(`ends_on >= from AND starts_on <= to`)이다. 해외 경기는 KST 기준으로 하루가 넘어갈 수 있으므로 캘린더는 현지 날짜 칸에 표시하고 시각은 KST로 보여 준다.
- `verified_on`(마지막 확인일)은 KST 날짜이며 오늘(KST) 이후일 수 없다.

### V7 — 스팟
```
drive_spots (id, name, kind 'WINDING_ROAD'|'VIEWPOINT'|'DRIVE_COURSE',
             region(시·도), address, latitude NUMERIC(9,6), longitude NUMERIC(9,6),
             route JSONB NULL,             -- 코스·와인딩 구간 선(좌표 배열), 없으면 점 하나
             description, parking_info, safety_info NOT NULL, best_time,
             status 'PENDING'|'PUBLISHED'|'REJECTED'|'HIDDEN',
             submitted_by → users NULL,                  -- 공개 후 제보자 분리 시 NULL (결정 5)
             reviewed_by → users NULL, reviewed_at, reject_reason,
             created_at, updated_at)
  INDEX (status, latitude, longitude), (status, region)
spot_photos (id, spot_id → drive_spots ON DELETE CASCADE, image_id → community_images,
             contributed_by → users NULL, position, created_at)   -- 스팟당 최대 3장(결정 4), 기여자별 삭제 가능
spot_corrections (id, spot_id → drive_spots ON DELETE CASCADE, user_id → users,
                  kind 'WRONG_INFO'|'CLOSED'|'DANGER'|'OTHER', message, status 'OPEN'|'DONE'|'DISMISSED',
                  handled_by, handled_at, created_at)
spot_content_removals (id, spot_id, requested_by → users, target 'PHOTO'|'DESCRIPTION'|'ALL_MINE',
                       photo_id NULL, reason, status 'OPEN'|'DONE'|'DISMISSED', handled_by, handled_at, created_at)
```
**제보자 개인정보 분리와 기여 콘텐츠 삭제 (결정 5)**
- 사진은 게시글처럼 `image_ids` 배열에 넣지 않고 `spot_photos` 행으로 저장해 "누가 올린 사진인지"를 남긴다. 그래야 기여자별 삭제 요청을 처리할 수 있다.
- 공개 화면에는 제보자를 보여 주지 않는다(스팟은 운영자가 관리하는 공용 정보로 표시). 제보자 정보는 관리자 화면과 `/spots/mine`에서만 쓴다.
- 회원 탈퇴 시(core `WithdrawalService`에 추가): 검토 대기·반려된 내 제보는 사진과 함께 삭제, 공개 스팟은 `submitted_by`·`spot_photos.contributed_by`를 NULL로 끊는다(콘텐츠는 공용 정보로 남음). 탈퇴 시 사진 삭제 규칙(§7 "어디에서도 참조하지 않는 사진만")에 `spot_photos` 참조를 추가해야 한다.
- 탈퇴 전 회원은 `/spots/mine`에서 내 사진·설명 삭제를 요청할 수 있다(`spot_content_removals`). 관리자가 처리하며 사진은 행 삭제, 설명은 관리자가 대체 문구로 바꾼다. 탈퇴 후 요청은 운영 문의로 받는다.
- 지도 범위 검색은 위도·경도 범위 조건(BETWEEN)과 일반 인덱스로 충분하다(스팟 수가 수천 개 이하). PostGIS는 쓰지 않는다.

### 공통 (V6에 포함)
```
board_posts.motorsport_event_id → motorsport_events ON DELETE SET NULL  (V6)
board_posts.spot_id             → drive_spots       ON DELETE SET NULL  (V7)
content_admin_logs (id, entity_type 'MOTORSPORT_EVENT'|'SPOT'|…, entity_id, action, before JSONB, after JSONB,
                    admin_id → users, reason, created_at)   -- 일정 수정·스팟 승인/반려/숨김 이력
```
관계 요약: `series 1─N events N─1 venues`, `events 1─N board_posts`, `spots 1─N board_posts`, `spots 1─N spot_corrections`, `users 1─N spots(제보자)`.

- 기존 `moderation_logs`는 게시글·댓글 삭제 전용(CHECK 제약)이라 건드리지 않고 별도 로그 테이블을 둔다.
- 사진 공개 규칙(`publicImageSql`)에 "공개 스팟의 `spot_photos`가 참조하는 사진"을 추가한다(`spot_photos.image_id` 인덱스).

---

## 3. API 설계 (board-service)

공개(로그인 불필요):
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/board/motorsport/events?from=&to=&scope=&series=&kind=` | 기간 범위(최대 3개월) 일정. 캘린더·리스트·메인 공용 |
| GET | `/api/board/motorsport/events/:id` | 상세 + 연결된 글 수 |
| GET | `/api/board/motorsport/series`, `/venues` | 필터 목록 |
| GET | `/api/board/spots?bbox=swLat,swLng,neLat,neLng&kind=&region=&q=` | 공개 스팟만, 최대 200개 |
| GET | `/api/board/spots/:id` | 공개 스팟 상세(제보자는 공개하지 않음, 결정 5) |
| GET | `/api/board/posts?event=:id` / `?spot=:id` | 기존 목록 API에 필터만 추가 |

로그인 사용자:
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/board/spots` | 제보(항상 PENDING). 기존 이미지 업로드 API 재사용, rate limit 적용 |
| GET | `/api/board/spots/mine` | 내 제보와 상태 |
| POST | `/api/board/spots/:id/corrections` | 정보 수정 제보 |
| POST | `/api/board/spots/:id/removals` | 내 사진·설명 삭제 요청(결정 5) |
| POST/PUT | `/api/board/posts` | 기존 API에 `motorsportEventId`, `spotId`(선택) 필드 추가. 공개 스팟·삭제되지 않은 일정만 연결 가능 |

관리자(`/api/board/admin/*`, `requireCurrentAdmin`):
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST/PUT | `/admin/motorsport/events[/:id]` | 일정 등록(기본 초안, `publish:true`면 공개)·수정(MANAGER, 다른 운영자 일정 포함). 출처·확인일 필수 |
| POST | `/admin/motorsport/events/:id/publish`·`/hide`·`/verify` | 공개·비공개·확인일 갱신(MANAGER) |
| DELETE·POST | `/admin/motorsport/events/:id`·`/:id/restore` | 소프트 삭제·복원(**ADMIN**) |
| GET | `/admin/motorsport/logs` | 감사 로그 |
| POST/PUT | `/admin/motorsport/series`, `/venues` | 시리즈·장소 관리 |
| GET | `/admin/motorsport/stale` | 앞으로 60일 안의 일정 중 확인일이 14일 넘은 것(재확인 대기열) |
| GET | `/admin/spots?status=PENDING` | 승인 대기 목록 |
| PATCH | `/admin/spots/:id` | `{action: approve|reject|hide|restore, reason}` |
| PUT | `/admin/spots/:id` | 관리자 직접 수정(위치 보정 등) |
| GET/PATCH | `/admin/spot-corrections[/:id]` | 수정 제보 처리 |
| GET/PATCH | `/admin/spot-removals[/:id]` | 기여 콘텐츠 삭제 요청 처리 |

모든 관리자 변경은 `content_admin_logs`에 전후 값을 남긴다. 입력 검증은 기존 `validation.js`(`text`, `positive`, `integer`)를 재사용한다.

---

## 4. 지도 서비스 선택과 예상 비용

| 후보 | 장점 | 단점 | 비용(확인 범위) |
|---|---|---|---|
| **카카오맵 JS SDK (권장)** | 국내 도로·주소 정확도, 이미 카카오 개발자 앱이 있음(카카오 로그인), 주소→좌표 변환을 SDK `services`로 브라우저에서 처리 가능 | 무료 쿼터는 **개발자 계정에서 처음 활성화한 앱에만** 제공. 초과 시 429, 유료 전환은 비즈월렛 연결 필요. 2026-07-21에 사용 규칙이 바뀜 | 정확한 무료 쿼터 수치는 공개 문서에서 확인하지 못함 → 콘솔 "통계 > 쿼터"에서 확인 필요. 지도 이동·확대는 추가 호출로 세지 않는다는 FAQ 해석이 있으나 공식 확인 필요 |
| 네이버 지도(NCP Maps) | 국내 품질 좋음 | NCP 계정·결제수단 필요, 무료 이용량은 대표 계정만 | 무료량 수치는 콘솔 요금표 확인 필요 |
| Google Maps | 해외 서킷 표시 | 국내 상세 지도·길찾기 제약, 무료 한도 작음 | 제3자 자료 기준 Dynamic Maps 월 10,000회 무료 후 1,000회당 약 $7 |
| Leaflet + OSM | 라이브러리 무료 | OSM 공식 타일은 대량 사용 금지 → 타일 제공자 필요, 국내 상세도 낮음 | 타일 제공자 요금 |

결정(§9 결정 6): **카카오맵 우선 채택**. 실제 쿼터와 비용은 카카오 개발자 콘솔에서 확인하기 전까지 **확정하지 않는다**. 지금 규모(일 방문 수백~수천)에서는 무료 쿼터 안일 가능성이 높지만 추정일 뿐이다. 콘솔에서 쿼터 수치를 확인하고, 유료 전환 시 **일·월 사용 한도**를 꼭 걸어 과금 폭주를 막는다. 해외 서킷은 지도 없이 장소명·공식 링크만 보여 준다(모터스포츠에는 지도가 필수가 아님).

구현 메모:
- 지도는 클라이언트 컴포넌트에서만 불러오고(`autoload=false`), 지도 부분을 작은 어댑터로 감싸 나중에 지도 제공자를 바꿀 수 있게 한다. 지도 로딩이 실패해도 목록은 동작해야 한다.
- CSP(`frontend/proxy.ts`): 지금 `script-src`가 nonce + `'strict-dynamic'`이라 nonce 붙은 SDK 스크립트가 불러오는 하위 스크립트는 허용되지만, 타일·마커 이미지를 위해 `img-src`에 카카오 지도 도메인을 추가해야 한다. 정확한 도메인 목록은 구현 단계에서 실제 요청으로 확인한다.
- 카카오 콘솔: 같은 앱에 JavaScript 키 **사이트 도메인**(`https://morethancar.kr`, 로컬 `http://localhost:3000`)을 등록해야 한다(사람이 할 일).

---

## 5. 일정 데이터의 출처와 갱신 방식

원칙(기존 메인 화면 문구와 같음): **검증된 일정과 공식 링크만 등록한다. 가짜·추정 일정은 넣지 않는다.**

| 구분 | 1차 출처(공식) | 비고 |
|---|---|---|
| F1, WEC 등 국제 시리즈 | 각 시리즈 공식 사이트의 시즌 캘린더 | 공식 공개 API가 없다. 커뮤니티 API(예: Jolpica, 구 Ergast)는 비공식이라 "출처"로 쓰지 않는다 |
| 국내 레이스(슈퍼레이스 등) | 대회 주최 측 공식 사이트·공지 | 시즌 중 일정 변경이 잦다 |
| 서킷 스포츠주행일 | 각 서킷(인제 스피디움, 코리아 인터내셔널 서킷 등)의 공식 일정·예약 페이지 | 월 단위 공지가 많다 |

갱신 방식:
1. **관리자 수동 등록**(1단계): 등록 폼에서 출처 URL·출처명·확인일이 필수. 화면에는 "공식 출처 · 2026-10-12 확인"으로 그대로 보여 준다.
2. **재확인 대기열**: 다가오는 60일 안의 일정 중 확인일이 14일 넘은 것을 관리자 화면에 모아 보여 준다. 다시 확인하면 확인일만 갱신(변경 이력은 로그).
3. **상태 표시**: 잠정·변경·취소를 배지로 보여 주고, 취소된 일정도 지우지 않는다(후기 글 연결 유지).
4. 자동 수집(크롤링)은 하지 않는다: 사이트 이용약관·구조 변경에 약하고, 잘못된 일정이 자동 공개될 수 있다. 나중에 필요하면 "가져오기 → 초안 상태 → 관리자 확인 후 공개" 방식만 검토한다.
5. 시간대: 날짜는 `DATE`(KST 기준 표시), 시간이 공개된 경우만 `start_at`(UTC)과 현지 시간대를 저장한다. 해외 경기는 KST 날짜가 하루 넘어갈 수 있어 상세 화면에 현지 시간도 같이 보여 준다.

---

## 5-1. 운영 권한 (2026-10-12 확정, 1단계에서 구현)

콘텐츠는 여러 운영자가 코드 없이 웹 관리자 화면에서 관리한다. 역할: `USER < MANAGER < ADMIN`(`users.role`).

| 작업 | USER | MANAGER | ADMIN |
|---|---|---|---|
| 공개 일정·스팟 조회, 후기 작성, 스팟 제보 | ✅ | ✅ | ✅ |
| 일정 등록·수정(다른 운영자가 등록한 일정 포함)·공개·비공개·확인일 갱신, 시리즈·장소 관리 | | ✅ | ✅ |
| 스팟 등록·수정, 제보 승인·반려 (V7 단계) | | ✅ | ✅ |
| 일정·스팟 소프트 삭제·복원 | | | ✅ |
| 운영자 지정·해제 | | | ✅ |
| 기존 커뮤니티 관리(신고 처리, 회원 제재, 게시글 강제 삭제, 차량 인증) | | | ✅ |

- **권한 검사는 모두 백엔드**에서 한다. board-service는 `requireCurrentStaff(db, user, minRole)`(admin-access.js)로 세션 역할과 **현재 DB 역할·상태**를 매 요청 확인하고, 권한은 DB 역할로 판단한다. 콘텐츠 API는 `/api/board/admin/motorsport`에 ADMIN 전용 `adminRouter`보다 먼저 붙어 있어, MANAGER는 기존 `/api/board/admin/*`(신고·회원·게시글)에 들어가지 못한다. 기존 "role === ADMIN" 검사는 하나도 바꾸지 않았다.
- **역할 변경은 Spring 한 곳**(`AdminMemberController`)에서만 한다: `GET /api/admin/members/operators`, `PUT /api/admin/members/{id}/role {role}`(ADMIN 전용). 관리자 행 잠금 후 요청자 재확인, 자기 자신 변경 금지, 마지막 유효 ADMIN 강등 금지, 탈퇴 회원 변경 금지, 이용 제한 회원에게 운영자 권한 부여 금지. 바뀌면 대상의 모든 세션이 무효(auth_version 증가) — 이전 권한의 세션으로는 접근할 수 없다. 기록은 `admin_member_actions`에 `ROLE:USER>MANAGER`(기존 회원 수정 API는 `UPDATE:ROLE(USER>MANAGER)`).
- MANAGER도 ADMIN처럼 권한을 먼저 해제해야 탈퇴할 수 있다(`ADMIN_ROLE` 409).
- V6의 `users_role_check`(USER·MANAGER·ADMIN)는 `NOT VALID`다. 운영 반영 전에 Neon의 기존 role 값을 읽기 전용으로 확인하고 `ALTER TABLE users VALIDATE CONSTRAINT users_role_check`를 따로 한다.
- **공개 상태**(`publication`): DRAFT(작성 중) → PUBLISHED ↔ HIDDEN. 공개 API는 PUBLISHED이고 삭제되지 않은 일정만 보여 준다. 진행 상태(`status`: 예정·잠정·변경·취소)와는 별개다.
- **감사 로그**(`content_admin_logs`): 수행자 id·당시 DB 역할, 대상 종류·id, 작업(CREATE·UPDATE·PUBLISH·HIDE·VERIFY·DELETE·RESTORE), 시각, 변경 전후 행, 사유를 변경과 같은 트랜잭션에 남긴다. 거부된 요청은 남지 않는다.

## 6. 관리자 기능

`/admin`에 탭 2개 추가(기존 패널 구조와 같은 목록 + 다이얼로그).
- **모터스포츠**: 일정 목록(월·시리즈·상태 필터), 등록·수정 다이얼로그(출처·확인일 필수), "재확인 필요" 대기열, 시리즈·장소 관리, 삭제(소프트).
- **스팟**: 승인 대기 목록 → 상세 미리보기(지도 위치·사진·안전 정보) → 승인 / 반려(사유 필수, 제보자에게 표시) / 위치·내용 수정 후 승인. 공개 스팟 숨김·복원. 수정 제보 처리.
- **개요 탭**: 승인 대기 스팟 수, 재확인 필요 일정 수 카드 추가.
- 모든 처리는 `content_admin_logs`에 남기고 로그 탭에서 볼 수 있게 한다.

---

## 7. 기존 커뮤니티 게시글과 연결하는 방식

- **연결 방법**: `board_posts`에 nullable FK 컬럼 2개(`motorsport_event_id`, `spot_id`). 이미 있는 `vehicle_id` 연결과 같은 방식이라 글 삭제·탈퇴·신고·사진 공개 규칙을 그대로 따른다. 한 글은 일정 하나, 스팟 하나까지 연결한다(차량 연결과 동시에 가능).
- **게시판 분류**: 새 분류를 만들지 않는다(결정 1). 일정·스팟 후기는 기존 4개 분류 중 작성자가 고른 글에 ID만 연결한다(스팟 후기는 기본 선택만 `drive`).
- **글쓰기**: 상세 화면의 "후기 쓰기"는 `/community/new?event=7` 또는 `/community/new?category=drive&spot=12`처럼 연결 대상을 미리 채운다. 글쓰기 화면에 "연결된 스팟/일정" 표시와 "연결 해제"만 둔다(검색해서 고르는 UI는 2차).
- **글 상세**: 오른쪽 패널(post-context.tsx)에 "이 글에 연결된 일정/스팟" 카드 추가(지금의 "이 글에 연결된 차량"과 같은 모양).
- **일정·스팟 상세**: `GET /api/board/posts?event=` / `?spot=`로 관련 글 목록(기존 PostRow 재사용).
- **검증**: 연결은 공개 스팟·삭제되지 않은 일정만 허용(서버에서 확인). 스팟이 숨김 처리되면 글은 남고 연결 카드만 "비공개 스팟"으로 표시.

---

## 8. 단계별 구현 순서

각 단계 = 별도 커밋 + CI + 임시 스택 검증(Neon 미사용) + 사용자 확인. 운영 반영은 EC2 재가동 때 별도 승인.

| 단계 | 내용 | 산출물 |
|---|---|---|
| 0 | 결정 사항 확정(§9, 완료), 카카오 콘솔에서 지도 쿼터·도메인 확인(사람, 스팟 단계 전까지) | 결정 기록 |
| 1 | V6 모터스포츠 테이블 + `content_admin_logs` + 운영 API(MANAGER 이상) + 공개 조회 API + MANAGER 역할·운영자 권한 API(Spring) + 테스트 **(완료 2026-10-12)** | 마이그레이션, `motorsport.js`, 테스트 |
| 2 | 관리자 화면 리디자인(최신 화이트 테마) + `/admin/motorsport`(등록·수정·공개/비공개·확인일·삭제/복원·시리즈/장소·이력) + `/admin/users`(운영자 권한, ADMIN) **(완료 2026-10-12, `ed803e1`)** | 관리자 UI |
| 3 | `/motorsport` 캘린더·리스트·상세, 메인 미리보기 실데이터, 헤더 메뉴 활성화 | 공개 화면 |
| 4 | 게시글 ↔ 일정 연결(V6 컬럼은 1단계에 포함), 글쓰기·글 상세·일정 상세 연결 UI | 후기 연결 |
| 5 | V7 스팟 테이블 + 사진 공개 규칙 확장 + 제보·승인 API + 테스트 | `spots.js`, image-references 수정 |
| 6 | 카카오 지도 어댑터 + CSP 변경 + `/spots` 지도·목록·상세 | 지도 화면 |
| 7 | `/spots/new`·`/spots/mine` 제보, `/admin` 스팟 탭(승인·반려·수정 제보) | 제보·승인 흐름 |
| 8 | 게시글 ↔ 스팟 연결, 상세의 후기 목록 | 후기 연결 |
| 9 | 초기 데이터 입력(관리자가 공식 출처 확인 후 수동 등록), 운영 반영 준비 | 실제 데이터 |

A(1~4)를 먼저 끝내고 B(5~8)로 넘어간다. A는 지도·외부 키가 필요 없어 바로 시작할 수 있다.

---

### 진행 현황 (2026-10-12)

- 1단계 완료 `13ed78f`: V6 + 공개·운영 API + MANAGER 역할·운영자 권한 API. CI run 38154786026 성공.
- 2단계 완료 `ed803e1`: 관리자 화면 리디자인(`AdminShell`), `/admin/motorsport`, `/admin/users`(사유 필수 + 확인 단계, 권한 변경 기록 API), 파비콘. 검증: Next 빌드·TypeScript 통과(CI에는 프론트 빌드가 없음), `mvn test` 135, `npm test` 53, Playwright 13항목, 13화면 × 3너비 가로 넘침 0.
- 3·4단계 완료(공개 `/motorsport`, 메인 미리보기, 헤더 메뉴, 게시글 ↔ 일정 연결) — 자세한 내용은 `MORETHANCAR_NEXT_TASKS.md` 참고.
- 스팟(5~8단계 상당) 완료 (2026-10-12, 커밋 전): 범위를 §9 결정 2(번복)에 따라 WINDING·SIM_RACING 2개 카테고리로 조정했고, 공개 제보·승인 대기열(§2 V7 원안의 `spot_photos`/`spot_corrections`/`spot_content_removals`, 결정 4·5)은 이번 범위에서 제외 — 관리자 직접 등록만 지원한다(신규 지시가 공개 제보 흐름을 요구하지 않음). 지도는 카카오맵 어댑터를 실제 키로 연결해 라이브 검증까지 마쳤다(CSP `img-src`/`connect-src`가 실제 타일 도메인 `kakaocdn.net` 대신 추정값 `daumcdn.net`만 허용해 타일이 안 뜨던 버그 1건 발견·수정, 2026-10-12). 자세한 구현·검증 내용은 `MORETHANCAR_NEXT_TASKS.md`의 "스팟(와인딩·심레이싱) V7 + `/spots` + `/admin/spots`" 항목 참고.
- 남은 것: 카카오맵 키 발급 후 실지도 검증, `mvn test`(Java 23 환경) 재시도, 브라우저 UI 실측, 운영 반영 전 `users_role_check` VALIDATE와 EC2 자동 시작 차단.

## 9. 결정 사항 (2026-10-12 확정)

1. **모터스포츠 후기 게시판**: 새 분류를 만들지 않는다. 기존 커뮤니티 글에 일정 ID를 연결한다(`board_posts.motorsport_event_id`).
2. ~~스팟 종류: 와인딩 도로·전망대·드라이브 코스 3종으로 시작한다...~~ **(2026-10-12 번복)**: 신규 지시에 따라 와인딩(WINDING)·심레이싱(SIM_RACING) 2개 카테고리로 구현한다. `lib/services.ts`의 "심레이싱·바이크 카페" 문구는 오히려 원래 방향이었던 것으로 확인돼 설명만 다듬어 유지한다. 전망대·드라이브 코스는 별도 kind로 나누지 않고 WINDING 하나로 묶는다(구현: V7 `drive_spots.category`, `board-service/src/spots.js`, `/spots`).
3. **와인딩 안전 안내**: 와인딩 스팟 상세·제보 화면에 공공도로 교통법규 준수, 과속·위험 운전 금지, 안전한 정차 장소 이용 안내를 넣는다(제보 시 확인 항목 포함).
4. **스팟 제보 사진**: 최대 3장.
5. **탈퇴 회원의 제보**: 미승인(검토 대기·반려) 제보는 삭제한다. 승인된 공개 스팟은 제보자 개인정보와 분리해 공용 정보로 관리한다. 사진·설명 등 개인 기여 콘텐츠의 삭제 요청도 처리한다(§2 V7 설계).
6. **지도**: 카카오맵 우선 채택. 실제 API 쿼터와 비용은 카카오 개발자 콘솔에서 확인하기 전까지 확정하지 않는다.

---

## 10. 위험과 대응

- **Neon 마이그레이션 적용 시점**: V6/V7은 다음 core 기동 때 Neon에 적용된다. 로컬에서 Neon 연결로 core를 띄우지 않는다. 운영 재가동 절차(MORETHANCAR_NEXT_TASKS.md NOW-2-3 재검토)와 함께 적용 시점을 정한다.
- **잘못된 일정 정보**: 출처·확인일 필수, 상태 배지, "일정은 주최 측 사정으로 바뀔 수 있습니다" 고정 안내, 재확인 대기열.
- **위험 운전 조장 우려(와인딩)**: 안전 정보 필수 필드, 교통법규 준수·과속 금지·안전한 정차 안내(결정 3), 관리자 승인 후 공개, 숨김 기능.
- **사적 장소·개인정보 노출**: 제보 가이드(사유지·주거지 앞 제외), 사진 속 번호판·얼굴은 관리자 반려 사유.
- **지도 쿼터 초과**: 콘솔 사용 한도 설정, 지도 실패 시 목록만으로 동작.
