# 전기차 정책·정보 허브 개발 작업 (STEP 0 분석 + STEP 1 DB 설계 + STEP 2~10 계획)

> 작성: 2026-10-13(STEP 0) · 갱신: 2026-10-13(STEP 1) · 2차 보완: 2026-10-13(STEP 1, 사용자 검토 지적 사항 7개 반영 — §3.0) · 3차 갱신: 2026-10-13(STEP 2, 공개 조회 API) · 4차 갱신: 2026-10-13(STEP 2 버그 수정 + STEP 3~6 공개 화면 구현) · 기준 코드: `main`(작업 트리에 `frontend/app/icon.png`, `frontend/public/apple-touch-icon.png` 미추적 파일 존재, 이번 STEP에서도 보존 — 수정하지 않음) · 상태: **STEP 2 API 버그 4건 수정 + STEP 3~6(`/ev`,`/ev/buy`,`/ev/drive`,`/ev/changes`,`/ev/policy/[slug]`) 공개 화면 구현 완료, Node 22로 board-service 테스트 74개 전부 통과 확인, 합성 fixture로 브라우저 실동작 확인 완료. STEP 7(관리자 UI) 승인 대기**
> 5차 갱신: 2026-10-13(STEP 7, 관리자 쓰기 API + `/admin/ev` 화면 — mock(가짜 DB) 테스트·`tsc`/`build`까지 확인, 실제 DB·브라우저 확인은 미실행).
> 6차 갱신: 2026-10-13(STEP 7 배포 전 결함 점검·보완 — 검증 선언 로직·승격 동시성·동시 편집 보호 3건 수정 + 실제 코드 리뷰로 발견한 SQL 버그 1건(정책 공개·비공개 500 오류) 수정. **격리된 일회용 PostgreSQL 16 + Redis로 V1→V8 신규 적용과 기존 V7→V8 업그레이드를 모두 실행 검증**, board-service를 실제로 띄워 관리자 전체 흐름·권한·동시 승격·동시 편집을 실제 HTTP 요청으로 재현, 프런트엔드를 실제로 띄워 브라우저로 관리자 화면·메인 화면을 확인 — STEP 1부터 "정적 검토만, 실행 검증 미실행"이라고 반복해 남겨 두었던 것을 이번에 처음 실행했다. 아래 STEP 7 항목에 구현/mock검증/실DB검증을 구분해 갱신).
> 범위: 전기차 정책·정보 허브(`/ev`, `/ev/buy`, `/ev/drive`, `/ev/changes`, `/ev/policy/{slug}`) + `/admin/ev` 관리 기능.
> 참고: `docs/plans/MOTORSPORT-AND-SPOTS-PLAN.md`는 "전기차 정보 허브는 제외"라고 명시했던 문서다(2026-10-12 작성, 모터스포츠·스팟 범위만 다룸). 이 문서가 그 후속으로 전기차 범위를 다룬다.
>
> **중요 — API 소유권 표시 (STEP 2에서 갱신)**: "API는 board-service에 둔다"는 **사용자가 Spring Boot 대신 board-service를 직접 지정한 결정이 아니다.** STEP 2 지시에서 사용자가 "다음 단계의 판단과 지시"를 맡겼고, 그 구현 조정 판단으로 **기존 콘텐츠 기능(모터스포츠·스팟)과 같은 board-service를 선택**했다 — 이것은 기존 아키텍처를 존중한 **구현 선택**이며, 사용자의 원래 지시(Spring Boot가 정책 API를 맡는다는 전제)와 다르다는 사실 자체는 바뀌지 않는다. 이 차이를 숨기거나 "원래 지시대로 됐다"고 적지 않는다. Spring Boot는 여전히 Flyway의 유일한 스키마 소유자이고, 이번 구현은 새 인증 시스템이나 별도 서비스를 만들지 않았다(기존 `requireCurrentStaff`/세션 체계를 그대로 전제— 다만 STEP 2는 공개 GET만이라 인증 자체를 쓰지 않는다). STEP 1에서 작성한 Flyway 스키마(`V8__ev_policy_hub.sql`)는 이 구현 선택과 **독립적으로 유효**하다: 어떤 서비스가 API를 맡든 그대로 쓸 수 있는 순수 스키마다.

---

## 1. 현재 코드베이스 분석 결과

### 1.1 아키텍처 (실제 확인, 추측 없음)

이 프로젝트는 **3개 서비스 + nginx + PostgreSQL**로 구성된다. 사용자가 건넨 지시문은 "Spring Boot가 정책 API를 맡는다"고 가정하지만, **실제 코드는 다른 구조**다 — §2에서 바로잡는다.

| 서비스 | 위치 | 역할 | 확인한 증거 |
|---|---|---|---|
| `frontend` | `frontend/` | Next.js 16.3.4, App Router | `frontend/package.json`, `node_modules/next/package.json` |
| `backend`(core) | `backend/` | **Spring Boot. 인증·회원·차고·Flyway 스키마 소유만** | 컨트롤러 7개 전부: `AuthController`, `AdminController`, `AdminMemberController`, `GarageVehicleController`, `VehicleController`, `VehicleVerificationController`, `PasswordResetController`. `motorsport`/`spots` 관련 Java 파일 0개(grep 확인) |
| `board-service` | `board-service/` | **Node.js(Express) + `pg` 직접 쿼리. 커뮤니티·모터스포츠·스팟·부품장터·관리자 콘텐츠 API 전부** | `board-service/src/{community,motorsport,spots,market,admin,admin-access}.js` |
| `nginx` | `nginx/` | 단일 진입점, 경로별 라우팅 | `nginx/default.conf` |
| PostgreSQL | 로컬 dev: `docker-compose.yml`의 `postgres` 서비스 / 운영: Neon(`docker-compose.prod.yml`만 `.env`의 `DB_HOST` 사용) | 스키마는 Flyway(core)만 변경 | `docs/DATABASE-MIGRATIONS.md`, `docker-compose.yml` 1~3번 줄 주석 |

**nginx 라우팅** (`nginx/default.conf`):
- `^/api/(board|parts)(/|$)` → `board:3001`
- `/api/` → `core:8080`
- 나머지(`/`, `/_next/static/`, 이미지) → `frontend:80`

→ `/ev`, `/ev/buy`, `/ev/drive`, `/ev/changes`, `/ev/policy/{slug}`는 전부 `frontend` 라우트이므로 **nginx 설정 변경이 필요 없다**. API는 `/api/board/ev/...` 형태로 board-service에 둘 것이므로 기존 `^/api/(board|parts)` 규칙에 자동으로 맞는다.

### 1.2 기존 "전기차 SOON" 메뉴 구현 위치

- `frontend/lib/services.ts`: `SERVICES` 배열에 `{key: 'ev', label: '전기차', description: '보조금·충전·정책 정보'}` 가 **이미 존재**하고 `href`가 없다(= SOON).
- `frontend/components/common/site-header.tsx`: `href`가 없는 서비스를 `<span className={styles.soon}>…<small>SOON</small></span>`으로 렌더링(74~79번 줄). `activeService()`(25~31번 줄)에는 아직 `ev` 경로 매칭이 없다.
- **결론**: 메뉴 자리는 이미 마련되어 있다. 페이지가 생기면 `services.ts`에 `href: '/ev'`만 추가하고, `site-header.tsx`의 `activeService()`에 `/ev` 매칭 한 줄만 추가하면 된다. 메뉴 구조 자체를 바꿀 필요가 없다(요구사항 §15 "기존 내비게이션 전면 개편 금지"와 충돌 없음).

### 1.3 Next.js 버전과 App Router 구조

- Next.js **16.3.4**(`"next": "latest"` — 이 저장소의 학습 데이터 기준 버전과 다를 수 있어 실제 설치 버전 문서(`frontend/node_modules/next/dist/docs/`)를 직접 확인했다).
- `frontend/app/layout.tsx`가 **모든 라우트를 강제로 동적 렌더링**한다(`await connection()`, 이유: 요청마다 CSP nonce를 적용하는 `frontend/proxy.ts`가 동적 렌더링에서만 동작). 즉 **정적 생성(SSG)/ISR은 이 프로젝트 구조상 쓸 수 없다** — 모든 페이지가 매 요청 SSR이다. 이것은 전기차 허브의 SEO 요구사항(§12)과 충돌하지 않는다(SSR도 크롤러가 완성된 HTML을 받으므로 문제없음). 오히려 **정적 생성이 안 되니 캐싱 전략은 신경 쓸 필요가 없다**.
- 라우트 그룹 `(owners)`가 이미 쓰이고 있다(`/home`, `/garage` 등). `/ev/*`는 그룹 없이 일반 세그먼트로 추가해도 기존 구조와 충돌하지 않는다.
- `frontend/next.config.ts`: `rewrites()`로 `/api/:path*` → `backendOrigin`(브라우저 쪽, 로컬 전용 경로. 운영은 nginx가 먼저 받으므로 이 rewrite는 로컬 `next dev` 단독 실행 시에만 의미 있음), `redirects()`로 `/parts`를 커뮤니티로 돌려보냄. `/ev` 관련 추가 설정 불필요.

### 1.4 공통 레이아웃·내비게이션·디자인 토큰

- `frontend/components/common/site-header.tsx` + `theme.module.css`(화이트 테마 토큰) + `frontend/components/footer/site-footer.tsx`가 모든 공개 페이지의 공통 틀이다.
- 기능별 페이지는 `components/<feature>/<feature>-page.tsx`로 "헤더+푸터+1320px 컨테이너" 틀을 감싸는 공용 셸을 둔다(예: `components/spots/spots-page.tsx`, `components/motorsport/motorsport-page.tsx`로 추정되는 동일 패턴 — 주석에 "같은 패턴"이라고 명시). **전기차도 `components/ev/ev-page.tsx`로 동일하게 만든다.**
- 디자인 시스템 추가 없음 확인: `theme.module.css`(화이트/카드/얇은 테두리/검은 타이포) 하나뿐이고 기능별로 새 토큰을 만들지 않는다. §11 요구사항(기존 디자인 유지)과 100% 일치하므로 **그대로 재사용**한다.

### 1.5 재사용 가능한 기존 구조 — 가장 중요한 선례: "스팟(drive_spots)" 기능

`docs/plans/MOTORSPORT-AND-SPOTS-PLAN.md`로 계획되고 구현된 **스팟 기능이 전기차 정책 허브와 구조적으로 거의 동일**하다(공개 조회 + 관리자 CRUD + 공개/비공개 + 소프트 삭제 + 감사 로그). 아래 패턴을 그대로 따른다.

**DB (Flyway V7, `backend/src/main/resources/db/migration/V7__drive_spots.sql`)**
- `publication` 상태기계: `DRAFT → PUBLISHED ↔ HIDDEN` (+ `published_at`, `CHECK (publication = 'DRAFT' OR published_at IS NOT NULL)`)
- 소프트 삭제: `deleted_at` + `deleted_by`, `CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))`
- `created_by`/`updated_by` → `users(id)` FK
- `content_admin_logs`(V6에서 생성)의 `entity_type` CHECK를 `ALTER TABLE ... DROP/ADD CONSTRAINT`로 확장(V6 파일 자체는 수정하지 않음 — **이미 커밋된 마이그레이션은 절대 고치지 않는다**, `docs/DATABASE-MIGRATIONS.md`)

**API (`board-service/src/spots.js`, 354줄)**
- 공개 라우터(`spotsRouter`): 로그인 불필요, `publication='PUBLISHED' AND deleted_at IS NULL`만 노출
- 관리자 라우터(`spotsAdminRouter`): `requireCurrentStaff(db, user, 'MANAGER')`로 세션 역할 + **DB 현재 역할**을 매 요청 재확인. 삭제·복원만 `'ADMIN'`
- 트랜잭션 헬퍼(`transaction()`) + 모든 변경을 `content_admin_logs`에 before/after JSON으로 기록(`log()`)
- 입력 검증: `board-service/src/validation.js`의 `text()`/`positive()`/`integer()`/`fail()`, `motorsport.js`의 `oneOf()`/`webUrl()`을 import해 재사용
- 목록 API는 커서가 아니라 `page`/`pageSize=20` 오프셋 페이징(관리자용), 공개 API는 `limit`(최대 200) 단순 조회

**프론트엔드**
- 타입 분리: `lib/spots-types.ts`(공개, `PublicSpot`) ↔ `lib/admin-spots.ts`(관리자, `AdminSpot` = 공개 필드 + `publication`/`createdBy`/`deletedAt` 등 감사 컬럼). **이 분리 패턴을 그대로 따른다.**
- API 클라이언트: `lib/spots-api.ts`(공개, 브라우저 fetch, `BASE='/api/board/spots'`) ↔ `lib/admin-spots.ts`에 관리자 호출 포함
- 공개 페이지: `app/spots/page.tsx`, `app/spots/[id]/page.tsx` — **다만 이 둘은 전부 클라이언트 컴포넌트에서 `useEffect`로 데이터를 가져온다(`components/spots/spot-detail.tsx` 1~44번 줄 확인). `metadata`도 정적 문자열(`{title: '스팟'}`)이다.** → §1.6에서 이 부분만은 전기차 허브가 **따르지 않아야 할 패턴**으로 지정한다(이유는 §1.6).
- 관리자 화면: `components/admin/admin-shell.tsx`(역할 기반 사이드 내비, `NavKey` 유니온에 키 추가), `components/admin/spots-admin.tsx` + `spot-dialog.tsx` + `spots-logs.tsx`, `app/admin/spots/page.tsx`. `components/admin/admin-app.tsx`의 `ContentSummary`에 대시보드 카드(`/admin/spots`) 추가.

### 1.6 SEO 관련 중요 발견 — 기존 구조와 지시사항이 충돌하는 지점

**발견**: 이 코드베이스 전체에 `generateMetadata`(Next.js 동적 메타데이터 함수) 사용례가 **0건**이다(grep 확인). 모든 페이지가 `export const metadata = {title: '고정문자열'}` 정적 객체만 쓴다. 그리고 상세 페이지(`/spots/[id]`, `/community/[category]/[id]`)는 **클라이언트 컴포넌트가 `useEffect`로 데이터를 가져오는 CSR 패턴**이라, 최초 HTML에는 실제 콘텐츠(정책명, 설명 등)가 없다 — 크롤러가 받는 HTML에 알짜 내용이 비어 있다는 뜻이다.

**단, 예외가 있다**: 메인 페이지(`app/page.tsx`)는 **서버 컴포넌트**이고 `frontend/lib/server-api.ts`(SSR 전용 fetch 헬퍼, `REVCC_API_ORIGIN`으로 board-service를 직접 호출)를 통해 실제 데이터를 서버에서 가져와 렌더링한다. 즉 **이 프로젝트에 이미 "SSR로 실데이터를 뿌리는" 정석 패턴이 존재하며, 메인 페이지가 그 선례다.**

**지시사항(§12)은 "Next.js 서버 렌더링, title, meta description, canonical, sitemap, robots, 구조화 데이터"를 명시적으로 요구**한다. 스팟/커뮤니티 상세처럼 CSR + 정적 title로 만들면 이 요구사항을 충족할 수 없다.

**결론 및 제안(지시사항 §16 "충돌 시 기존 구조를 존중하고 대안 제시"에 따른 제안)**:
- 전기차 페이지는 스팟/커뮤니티 상세의 **CSR 패턴을 따르지 않는다.**
- 대신 메인 페이지가 쓰는 **`lib/server-api.ts` 스타일의 SSR fetch 패턴을 그대로 확장**해 `lib/ev-server-api.ts`를 만들고, `/ev`, `/ev/buy`, `/ev/drive`, `/ev/changes`, `/ev/policy/{slug}` 전부를 **서버 컴포넌트**로 작성한다.
- `/ev/policy/{slug}`에는 이 저장소 최초로 **`generateMetadata`**(동적 title/description/canonical)를 추가한다. 이는 기존 패턴을 바꾸는 게 아니라 "지금까지 쓸 일이 없었던 Next.js 표준 기능을 처음 쓰는 것"이라 기존 코드와 충돌하지 않는다.
- 지도·카카오 로그인처럼 **순수 상호작용(필터 탭, 즐겨찾기 등)만** 클라이언트 컴포넌트로 분리하고, 초기 데이터는 항상 서버에서 내려준다(스팟의 지도는 상호작용 특성상 클라이언트가 불가피했지만, 정책 정보는 상호작용이 적어 SSR에 훨씬 유리하다).
- 이 결정은 스팟·커뮤니티 기존 페이지를 전혀 수정하지 않는다(그 페이지들의 CSR 패턴은 그대로 둔다) — 전기차 페이지만 다른, 더 적합한 기존 패턴(메인 페이지 패턴)을 골라 쓰는 것이다.

### 1.7 PostgreSQL 스키마·Flyway 마이그레이션

- 마이그레이션 디렉터리: `backend/src/main/resources/db/migration/`. 현재 `V1__baseline.sql` ~ `V7__drive_spots.sql`까지 존재. **다음 파일은 `V8__...sql`.**
- 규칙(`docs/DATABASE-MIGRATIONS.md`): core가 기동 시 미적용 버전을 순서대로 실행, `flyway_schema_history`에 기록. Hibernate는 `ddl-auto: validate`라 **JPA 엔티티가 있는 테이블만** 스키마와 엔티티 일치를 검사한다. `motorsport_events`/`drive_spots` 둘 다 JPA 엔티티가 없다(Java 쪽에 해당 클래스 0개) — board-service가 raw SQL로만 접근하므로 **전기차 정책 테이블도 JPA 엔티티를 만들지 않는다.** Flyway SQL 파일만 추가하면 core는 정상 기동한다.
- **이미 커밋된 마이그레이션 파일은 절대 수정하지 않는다**(체크섬 불일치로 core 기동 실패). V8은 새 파일로만 추가한다.
- 로컬 개발 DB 분리 확인(중요한 안전장치, 최근 보강된 것으로 보임): `docker-compose.yml` 1~3번 줄 주석과 `core` 서비스의 `SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/revcc`(하드코딩)로 보아, **기본 `docker-compose.yml`은 로컬 Postgres에만 연결하고 운영 Neon(`${DB_HOST}` 등)은 `docker-compose.prod.yml`에서만 참조한다.** 즉 로컬 개발·CI에서 V8을 적용해도 운영 DB(Neon)에는 영향이 없다. (참고: `docs/plans/MOTORSPORT-AND-SPOTS-PLAN.md` 24번 줄은 "기본 compose가 Neon에 연결된다"고 경고했으나, 지금 코드를 직접 읽은 결과 **현재는 그렇지 않다** — 이후 보강되었거나 그 경고 자체가 다른 전제였던 것으로 보인다. 운영 반영 시점은 여전히 "core 재기동 시"이므로 §13 위험 요소에 그대로 남긴다.)

### 1.8 관리자 인증·권한 구조

- 역할: `users.role` ∈ `USER < MANAGER < ADMIN`(V6에서 `NOT VALID` CHECK 추가, 기존 값 검증 전제 없음).
- 역할 변경은 **Spring 한 곳**(`AdminMemberController`, `PUT /api/admin/members/{id}/role`)에서만 한다 — board-service는 역할을 바꾸지 않고 **읽기만** 한다.
- 콘텐츠 운영 권한 검사: `board-service/src/admin-access.js`의 `requireCurrentStaff(db, user, minRole='MANAGER')` — 세션 역할과 **DB의 현재 역할·계정 상태(정지/탈퇴/비활성)**를 매 요청 재확인. 기존 커뮤니티 관리(`requireCurrentAdmin`, ADMIN 전용)와는 별도 함수라 **MANAGER에게 기존 신고·회원 관리 권한이 새로 열리지 않는다.**
- `board-service/src/app.js`에서 콘텐츠 관리자 라우터(`motorsportAdminRouter`, `spotsAdminRouter`)는 **`adminRouter`(ADMIN 전용)보다 먼저** 등록된다 — 전기차 관리자 라우터도 같은 자리(먼저)에 추가해야 MANAGER가 접근 가능하다.
- **새 인증 시스템을 만들 필요가 전혀 없다** — `requireCurrentStaff`를 그대로 import해서 쓰면 된다(§10 지시사항과 정확히 일치).

### 1.9 기존 SEO 설정

- `app/layout.tsx`의 전역 `metadata`(사이트 기본 title 템플릿 `%s | morethancar`, description)만 있고 **`sitemap.ts`, `robots.ts`가 저장소에 존재하지 않는다**(find 결과 0건). `generateMetadata` 0건(§1.6).
- 구조화 데이터(JSON-LD) 사용례 없음.
- → 전기차 허브를 위해 **`app/sitemap.ts`, `app/robots.ts`를 이번에 처음 만든다**(사이트 전체에 적용되는 전역 파일이지만, 지금은 전기차 콘텐츠만 동적으로 색인할 가치가 있으므로 정책 URL만 채우고 나머지는 정적 목록으로 둔다). 이것도 "기존 걸 바꾸는" 게 아니라 "비어 있던 걸 처음 채우는" 작업이다.

### 1.10 테스트·CI 구조

- `.github/workflows/ci.yml`: `mvn -B test`(backend, Postgres 16 + Redis 서비스 컨테이너) + `npm test`(board-service, Node 22). **프론트엔드 빌드·테스트·Playwright는 CI에 없다**(수동 검증만, `MOTORSPORT-AND-SPOTS-PLAN.md` 진행 현황 기록에 명시). 전기차 작업도 이 관행을 따른다: board-service는 CI가 자동 검증, 프론트는 각 STEP에서 `npm run build`/타입체크를 수동 실행하고 결과를 문서에 남긴다.
- board-service 테스트는 `board-service/test/*.test.js`(예: `spots.test.js`, `motorsport.test.js`) — Node 내장 테스트 러너로 추정(전기차도 `board-service/test/ev.test.js`로 같은 위치에 추가).

### 1.11 현재 운영 배포 구조

- `docker-compose.prod.yml` + `nginx` + Cloudflare Tunnel(cloudflared, 고정 IP `172.16.238.2`)로 AWS EC2(서울 리전)에 배포(이전 세션 메모리 기록과 일치, `project_portfolio_pivot.md`). TLS는 Cloudflare가 종단, 내부는 평문 80.
- 운영 DB는 Neon. **core를 Neon에 연결해 재기동하는 시점에 그동안 쌓인 Flyway 마이그레이션이 한 번에 적용된다** — 전기차 V8도 예외 없이 이 규칙을 따른다(§13 위험 요소).

### 1.12 재사용 가능한 컴포넌트·API 요약

| 재사용 대상 | 위치 | 전기차에서의 용도 |
|---|---|---|
| `content_admin_logs` 테이블 | V6 (ALTER로 확장) | 정책 등록·수정·공개·숨김·삭제 감사 로그 |
| `requireCurrentStaff` | `board-service/src/admin-access.js` | 정책 관리자 API 권한 검사 |
| `text/positive/integer/fail` | `board-service/src/validation.js` | 정책 입력 검증 |
| `oneOf/webUrl` | `board-service/src/motorsport.js`(export) | enum·URL 검증 |
| `AdminShell`, `AdminHeading`, `hasRole` | `components/admin/admin-shell.tsx` | `/admin/ev` 화면 틀 |
| `lib/server-api.ts` 패턴 | `frontend/lib/` | `/ev/*` SSR 데이터 패칭 |
| `theme.module.css`, `site-header.tsx`, `site-footer.tsx` | `frontend/components/common|footer/` | 디자인 재사용(필수) |
| `motorsport_series.code` 슬러그 CHECK(`^[a-z0-9][a-z0-9-]*$`, UNIQUE) | V6 | `policy_items.slug` 설계 그대로 재사용 |

---

## 2. 최종 페이지 및 라우팅 구조

지시사항 §2의 구조는 **기존 App Router와 충돌 없음**(완전히 새 세그먼트, 라우트 그룹·동적 라우트 규칙과 겹치지 않음). 그대로 확정한다.

```
frontend/app/ev/page.tsx                  → /ev           (메인 대시보드)
frontend/app/ev/buy/page.tsx              → /ev/buy       (구매·지원)
frontend/app/ev/drive/page.tsx            → /ev/drive     (운행·혜택)
frontend/app/ev/changes/page.tsx          → /ev/changes   (정책 변경 타임라인)
frontend/app/ev/policy/[slug]/page.tsx    → /ev/policy/{slug} (정책 상세)
```

- `[slug]`는 `motorsport_series.code`와 같은 정규식(`^[a-z0-9][a-z0-9-]*$`)으로 검증 후 404 처리(스팟의 `/^\d+$/` 숫자 검증과 같은 자리, 같은 방식).
- 전부 서버 컴포넌트(§1.6). 탭·필터처럼 URL 쿼리(`?category=`, `?status=`)로 상태를 표현하는 부분은 `useSearchParams`를 쓰는 클라이언트 하위 컴포넌트로 분리(기존 `app/admin/*` 패턴과 동일).
- 공용 셸: `frontend/components/ev/ev-page.tsx`(스팟의 `spots-page.tsx`와 동일한 모양이나, **서버 컴포넌트 자식**을 감쌀 수 있어야 하므로 `'use client'`를 헤더 자체가 아니라 "헤더 안의 인증 상태 표시 부분"에만 좁게 적용하거나, 기존처럼 클라이언트 셸 + 서버에서 받은 데이터를 prop으로 내려주는 방식 중 하나를 STEP 3에서 실제로 정한다. 이 문서에서는 "셸은 클라이언트여도 되지만 본문 데이터는 반드시 서버에서 가져온다"는 원칙만 확정한다).

---

## 3. 데이터베이스 설계안 (Flyway V8) — STEP 1 확정, STEP 1 보완(2026-10-13 2차)에서 수정

**파일**: `backend/src/main/resources/db/migration/V8__ev_policy_hub.sql` (작성 완료, DB에는 아직 적용하지 않음). 최신 마이그레이션은 여전히 `V7__drive_spots.sql`임을 이번 보완에서도 재확인했다(`ls backend/src/main/resources/db/migration/`) — `V8` 번호를 그대로 유지했다. `git status`로 이 파일이 **아직 커밋되지 않은 미추적 신규 파일**임을 재확인했으므로, Flyway의 "이미 커밋된 파일은 수정하지 않는다" 규칙은 이 파일에는 아직 적용되지 않는다 — 그래서 V9를 새로 만들지 않고 **V8 파일 자체를 직접 고쳤다**. **V1~V7은 이번에도 전혀 수정하지 않았다**(git status/diff로 변경 없음 확인).

### 3.0 이번 보완에서 바로잡은 오류 (사용자 검토 지적 사항 반영)

이전 STEP 1 결과를 사용자가 검토하면서 아래 7가지 문제를 지적했다. 각각 정적 검토만으로 확인·수정했고, 실제 DB 실행으로 확인한 것은 없다(§3.3, §9 STEP 1 참고).

1. **`end_date` NULL을 "무기한"으로 단정한 것은 틀렸다** — NULL은 "종료일 정보가 없다"는 뜻일 뿐이다. `policy_versions.end_date_indefinite BOOLEAN`을 추가해 "공식 근거로 확인된 무기한"과 "단순히 모름/미확인"을 구분했다(§3.2, §3.5).
2. **`supersedes_version_id`가 다른 정책의 버전을 가리키는 것을 "DB는 막을 수 없다"고 적은 것은 틀렸다** — PostgreSQL의 복합 FK로 충분히 막을 수 있다. `UNIQUE(policy_id, id)` + `FOREIGN KEY (policy_id, supersedes_version_id) REFERENCES policy_versions(policy_id, id)`로 수정했다(§3.3). 자기참조·순환·미래 버전 참조는 `CHECK (supersedes_version_id < id)` 하나로 동시에 막힌다(아래 설명).
3. **`status`/`change_confirmed`의 모순 조합, 취소된 버전이 대표 버전이 되는 경우, `region_note`의 공백 입력**을 막는 CHECK 4개를 추가했다(§3.2).
4. **`is_current`의 의미를 "대표 표시 버전"으로 명확히 재정의**했다("법적으로 지금 시행 중"이 아님) — PROPOSED나 EXPIRED 버전도 대표 버전이 될 수 있어 목록·상세에서 계속 탐색 가능하다. 상세 페이지는 현재 내용과 공개된 예정 변경을 함께 보여줘야 한다는 조회 규칙을 명문화했다(§3.1, §4).
5. **정책 전체 공개 게이트**(`policy_items.publication`/`published_at`)를 추가해, 정책을 통째로 비공개로 전환할 때 과거·미래 버전·출처가 공개 API 어디에서도 새어나오지 않게 했다. 출처는 "이미 한 번이라도 공개된 버전에는 추가하지 않는다"는 규칙을 명시했다(§3.3).
6. **`content_admin_logs_action_check` 이름이 확정적으로 맞다고 주장하지 않는다** — 정적 근거(Postgres 이름 생성 규칙 + V7의 간접적 실행 증거)만 남기고, 실제 확인은 격리 DB 검증으로 미뤘다(§3.3, §9 STEP 1).
7. V8이 **아직 미커밋·미적용 신규 파일**임을 git status로 재확인한 뒤 직접 수정했다(V1~V7은 보존).

### 3.1 전체 구조와 설계 이유

```
policy_items (정책의 영구 식별자)
  │  slug, category, scope/region_note, title, featured
  │  publication(DRAFT/PUBLISHED/HIDDEN), published_at  ← 정책 전체 공개 게이트(이번 보완에서 추가)
  │  ※ "지금 어떤 내용인지"는 들고 있지 않는다
  │
  └─ 1:N ─ policy_versions (내용 스냅샷 — 핵심 설계)
              │  version_no, revision_kind(INITIAL/CHANGE/CORRECTION)
              │  summary, key_points, target, benefit, how_to_apply, note  (평문 내용)
              │  status(ACTIVE/SCHEDULED/PROPOSED/EXPIRED), change_confirmed
              │  announced_on, effective_date, end_date, end_date_indefinite ← 이번 보완에서 추가
              │  verification_status(VERIFIED/UNVERIFIED), last_verified_on, verified_by
              │  publication(DRAFT/PUBLISHED/HIDDEN), published_at  ← 이 버전 자체의 공개 상태
              │  is_current ← "목록·상세의 대표 버전" (법적 "현재 시행 중"과 다른 뜻, 정책당 최대 1개)
              │  supersedes_version_id → 자기 테이블, (policy_id, id) 복합 FK로 같은 정책만 가리킴
              │  cancelled_at, cancellation_note ← 취소/대체된 예정 변경도 삭제하지 않고 보존
              │  change_summary ← CHANGE·CORRECTION은 필수(DB가 강제)
              │
              └─ 1:N ─ policy_sources (해당 "버전"의 공식 출처)
                          publisher, title, url, checked_on, checked_by

content_admin_logs (V6, 기존 테이블 — ALTER로 확장만)
  entity_type += POLICY(policy_items 단위) / POLICY_VERSION(policy_versions 단위)
  action      += CANCEL / PROMOTE
```

**왜 내용을 `policy_items`가 아니라 `policy_versions`에 두는가(지시 4번의 핵심 요구)**: "현재 적용 내용"과 "미래 변경안"이 동시에 존재해야 한다. STEP 0 초안은 `policy_items`에 현재 내용을 직접 두고 `policy_versions`를 보조적인 변경-요약 로그로만 썼는데, 이러면 "예정된 변경을 등록하는 행위"가 곧 "현재 보여주는 내용을 덮어쓰는 행위"가 돼버려 지시 4번을 지킬 수 없다. 그래서 **내용·상태·날짜·검증·공개 여부를 전부 버전 쪽으로 옮기고, `policy_items`는 slug·분류·정책 전체 공개 게이트 같은 "변하지 않는 뼈대"만 남겼다.** 목록·상세의 대표 버전은 `is_current=true`인 한 행으로 지정하고, 같은 정책에 대한 다른(미래·검토 중·취소된) 버전 행들은 `is_current=false`로 공존한다.

**`is_current`의 정의(이번 보완에서 명확화 — 지시 4번)**: `is_current=true`는 "이 버전이 법적으로 지금 시행 중"이라는 뜻이 **아니다.** "이 정책을 조회했을 때 목록·상세에 대표로 보여줄 버전"이라는 뜻이다. 그래서 최초 등록된 정책의 유일한 버전이 `status=PROPOSED`(아직 정부안 단계)이거나 `status=EXPIRED`(이미 종료됨)여도 그 버전이 `is_current`가 되어 정책이 목록·상세에서 계속 탐색 가능하다 — "정부안이거나 종료된 정책도 탐색 가능해야 한다"는 요구를 이렇게 만족한다. 다만 `DRAFT`(한 번도 공개된 적 없음)이거나 `cancelled_at`이 설정된(취소된) 버전은 대표가 될 수 없다(§3.2 CHECK).

**검증 상태를 공개 상태와 분리한 이유(지시 3번)**: "확인일만 갱신해서 검증된 것으로 취급하지 마세요"라는 지시를 DB에서 두 가지로 강제한다.
1. `verification_status`(`VERIFIED`/`UNVERIFIED`)는 `publication`과 별도 컬럼이라, "확인일(`last_verified_on`)을 오늘 날짜로 갱신"하는 것과 "검증 상태를 VERIFIED로 바꾸는 것"은 서로 다른 동작이다 — 하나를 바꾼다고 다른 하나가 같이 바뀌지 않는다.
2. `CHECK (verification_status = 'UNVERIFIED' OR (last_verified_on IS NOT NULL AND verified_by IS NOT NULL))` — VERIFIED로 만들려면 확인일과 확인자가 **반드시 함께** 있어야 한다(날짜만 바꾸고 아무도 확인하지 않은 척 VERIFIED로 만드는 경로를 막는 최소한의 DB 안전장치). 다만 "진짜로 공식 근거를 다시 확인했는지"까지는 DB가 알 수 없으므로, 이 행위 자체를 강제하는 것은 §3.3의 API 책임이다.
3. `CHECK (publication <> 'PUBLISHED' OR verification_status = 'VERIFIED')` — 미확인 정보는 공개할 수 없다(지시 3번 그대로). **동시에 `status = 'PROPOSED'`이면서 `publication = 'PUBLISHED'`인 조합은 허용된다** — "공식적으로 확인된 정부안은 PROPOSED로 공개할 수 있다"는 지시를 그대로 반영한 것이다. 즉 이 스키마에서 금지하는 것은 "확정 여부"가 아니라 "확인 여부"다.

### 3.2 상태 전환·공개 규칙 (네 축을 분리, 지시 3·4)

| 축 | 컬럼 | 값 | 누가 바꾸나 | 자동 전환 여부 |
|---|---|---|---|---|
| 시행 상태 | `policy_versions.status` | `ACTIVE`/`SCHEDULED`/`PROPOSED`/`EXPIRED` | 운영자 명시적 작업만 | **없음.** 시행일(`effective_date`)이 지나도 시스템이 `ACTIVE`로 바꾸지 않는다(지시 4번, 스케줄러·배치 제외) |
| 확정 여부 | `policy_versions.change_confirmed` | `status`와 결정론적으로 연동(아래 CHECK) | `status`를 바꾸는 운영자 작업에 같이 포함 | 없음. `PROPOSED`면 반드시 `false`, 그 외 상태면 반드시 `true`(DB CHECK, 이번 보완에서 추가) |
| 검증 상태 | `policy_versions.verification_status` | `VERIFIED`/`UNVERIFIED` | 운영자가 공식 출처를 확인한 뒤 명시적 작업(`/verify-confirm` 류 API, STEP 2) | 없음. `last_verified_on` 날짜만 바꾸는 것으로는 안 바뀐다(§3.1 CHECK로 최소 방어, 완전한 강제는 API 책임) |
| 공개 상태(버전) | `policy_versions.publication` | `DRAFT`/`PUBLISHED`/`HIDDEN` | 운영자(`/publish`·`/hide`) | 없음. `PUBLISHED`로 가려면 `VERIFIED`가 선행 조건(DB CHECK) |
| 공개 상태(정책 전체) | `policy_items.publication` | `DRAFT`/`PUBLISHED`/`HIDDEN` | 운영자(이번 보완에서 추가 — §3.3·§5 참고) | 없음. 이 게이트가 `HIDDEN`/`DRAFT`면 그 정책의 모든 버전·출처가 공개 API에서 보이지 않는다 |
| 대표 버전 지정 | `policy_versions.is_current` | `true`는 정책당 최대 1개(부분 유니크 인덱스) | 운영자(`PROMOTE` 작업) | 없음. `DRAFT`이거나 취소된(`cancelled_at IS NOT NULL`) 버전은 대표가 될 수 없다(DB CHECK, 취소 조건은 이번 보완에서 추가) |

네 축이 독립이므로 예를 들어 "`status=PROPOSED`(정부 발표, 아직 국회 통과 전) + `change_confirmed=false`(연동, 자동) + `verification_status=VERIFIED`(공식 보도자료로 확인함) + `publication=PUBLISHED`(그렇다는 사실 자체는 공개) + `is_current=false`(아직 대표 버전은 아님)" 같은 조합이 정상적으로 존재한다 — 이것이 지시 4번이 말한 "현재 적용 내용과 미래 변경안의 동시 존재"의 실제 모습이다.

**이번 보완에서 추가한 모순 방지 CHECK 4가지(지적 3번)**:
1. `CHECK (change_confirmed = (status <> 'PROPOSED'))` — `status`와 `change_confirmed`가 서로 어긋나는 조합(예: `status=ACTIVE`인데 `change_confirmed=false`)을 저장할 수 없다. 이 둘의 관계는 결정론적이다(PROPOSED는 정의상 미확정, 나머지 상태는 정의상 확정) — 그래서 CHECK로 직접 강제해도 표현력을 잃지 않는다.
2. `CHECK (status = 'PROPOSED' OR verification_status = 'VERIFIED')` — "ACTIVE/SCHEDULED/EXPIRED는 공식 확정 근거를 요구한다"는 지시를 그대로 반영했다. 이전 설계는 **공개(`publish`)할 때만** 검증을 요구했는데, 이러면 `DRAFT` 상태에서도 "확정 상태"를 미확인 상태로 저장할 수 있었다 — 이번에 공개 여부와 무관하게 적용되도록 넓혔다.
3. `CHECK (NOT is_current OR cancelled_at IS NULL)` — 취소된 버전은 대표 버전이 될 수 없다(지적 3번 "취소 버전이 is_current가 되는 경우" 방지).
4. `CHECK (scope = 'NATIONAL' OR (region_note IS NOT NULL AND length(btrim(region_note)) > 0))` — `region_note`가 `NULL`이거나 공백만 있는 경우를 함께 막는다. **주의**: `IS NOT NULL` 없이 `length(btrim(region_note)) > 0`만 쓰면 `region_note`가 `NULL`일 때 `btrim(NULL)`도 `NULL`이 되고, PostgreSQL CHECK는 평가 결과가 `NULL`이면 "통과"로 취급하므로 `NULL` 값이 조용히 허용돼 버린다(지적 3번 "공백 입력" 점검 과정에서 이 함정을 다른 유사 컬럼에도 다시 점검했다 — `cancellation_note`에도 같은 `btrim` 체크를 추가했다, V8 참고).

날짜가 지났다는 이유로 자동 활성화하지 않는다는 원칙(지시 4번 "자동 ACTIVE 전환 금지")은 이 CHECK들로도 바뀌지 않는다 — 이 CHECK들은 "저장 가능한 정적 조합"만 제한할 뿐, "언제 상태를 바꾸는가"는 전적으로 운영자의 명시적 작업이고 스케줄러·배치는 여전히 만들지 않았다.

### 3.3 SQL 제약으로 보장하는 것 vs 후속 API 트랜잭션으로 보장해야 하는 것 (지시 6·8)

DB가 구조적으로 막을 수 있는 것과, "의도"가 필요해 애플리케이션이 트랜잭션으로 책임져야 하는 것을 명확히 나눈다. STEP 2(API)는 이 표를 그대로 구현 요구사항으로 쓸 수 있다.

| 요구 | SQL 제약(완료, V8) | API 트랜잭션 책임(STEP 2에서 구현) |
|---|---|---|
| slug 중복 금지 | `UNIQUE(slug)` | — |
| 잘못된 기간(종료일 < 시행일) | `CHECK (end_date >= effective_date)`(둘 다 있을 때만) | — |
| 잘못된 상태값 | `CHECK (status IN (...))` 등 모든 enum 컬럼 | — |
| 버전 번호 중복 | `UNIQUE(policy_id, version_no)` | 삽입 시 `version_no = 기존 최대값+1`을 **같은 트랜잭션의 `SELECT ... FOR UPDATE`로 계산**해 동시 등록 충돌을 피한다(경쟁 상태로 중복 시도하면 이 UNIQUE가 최종 방어선 — 실패 시 409로 재시도 안내) |
| 다른 정책의 버전을 현재(대표) 버전으로 지정 | `is_current`가 부모 포인터가 아니라 자식 행의 플래그라 구조적으로 불가능(§3.1) | — |
| `supersedes_version_id`가 **다른 정책**의 버전을 가리키는 경우 | **정정(지적 2번)**: DB가 막을 수 있다. `UNIQUE(policy_id, id)` + `FOREIGN KEY (policy_id, supersedes_version_id) REFERENCES policy_versions(policy_id, id)` 복합 FK — 다른 정책의 버전을 가리키는 행은 이 FK를 위반해 INSERT 자체가 거부된다. (`supersedes_version_id`가 NULL인 INITIAL 행은 복합 FK 열 중 하나가 NULL이라 자동으로 검사를 건너뛴다 — PostgreSQL MATCH SIMPLE 기본 동작) | 없음(이 항목은 DB가 전부 보장) — API는 "어떤 버전을 대체해야 하는가"라는 **업무 로직**(보통은 지금 대표 버전을 대체)만 책임진다. DB는 "같은 정책의 버전인지"만 보장하고 "올바른 버전을 골랐는지"는 보장하지 않는다 |
| `supersedes_version_id`의 자기참조·순환·미래 버전 참조 | `CHECK (supersedes_version_id < id)` — 같은 정책 안에서 "항상 더 먼저 만들어진(= 더 작은 id) 버전만" 가리키게 한다. 이 하나의 부등식이 자기참조(`=id` 배제)·순환(모든 변이 id 감소 방향이면 고리가 생길 수 없음)·미래 버전 참조(존재하지 않는 더 큰 id는 어차피 FK로도 막힘)를 동시에 막는다 | 없음(이 항목도 DB가 전부 보장) |
| 미확인 정보 공개 금지 | `CHECK (publication<>'PUBLISHED' OR verification_status='VERIFIED')` + `CHECK (status='PROPOSED' OR verification_status='VERIFIED')`(이번 보완에서 추가 — 공개 여부와 무관하게 확정 상태는 검증을 요구) | — |
| `status`/`change_confirmed` 모순, 취소 버전의 대표 지정, 지역 설명 공백(지적 3번) | `CHECK (change_confirmed=(status<>'PROPOSED'))`, `CHECK (NOT is_current OR cancelled_at IS NULL)`, `CHECK (scope='NATIONAL' OR (region_note IS NOT NULL AND length(btrim(region_note))>0))`(§3.2) | — |
| "확인일 갱신 ≠ 검증 완료" | `CHECK (verification_status='UNVERIFIED' OR (last_verified_on IS NOT NULL AND verified_by IS NOT NULL))`(최소 방어) | `/verify`(확인일만 갱신)와 `/verify-confirm` 같은 "검증 완료로 전환" 작업을 **별도 엔드포인트로 분리**해, 날짜 갱신 UI에서 실수로 검증 상태까지 바뀌지 않게 한다 |
| 출처 없는 정책 공개 금지 | 없음(테이블 CHECK로 "자식 행이 1개 이상 존재"는 표현 불가, 트리거 없이는 불가능) | `publish` 작업 시 해당 버전의 `policy_sources` 행이 1개 이상인지 조회해 확인, 없으면 409 거부 |
| 과거 출처 불변(과거 버전의 근거가 바뀌지 않음) | FK만으로는 UPDATE 자체를 막지 못함 | `policy_sources`에 대한 **수정 API를 아예 만들지 않는다**(생성만 허용). **그리고 이미 한 번이라도 공개된 버전(`published_at IS NOT NULL`)에는 출처를 추가로 붙이지도 않는다**(지적 5번 — 조용히 근거가 늘어나 보이는 것 방지). 근거가 보강되면 새 CHANGE/CORRECTION 버전을 만들고 그 버전에 출처를 단다 |
| 정책 전체를 비공개로 전환했을 때 과거·미래 버전·출처가 공개 API에 새어나옴(지적 5번) | `policy_items.publication`(정책 전체 공개 게이트, 이번 보완에서 추가) — `HIDDEN`/`DRAFT`면 모든 버전·출처가 즉시 가려진다 | 모든 공개 쿼리(상세·목록·`/ev/changes`·sitemap)는 **버전의 `publication`뿐 아니라 `policy_items.publication='PUBLISHED' AND deleted_at IS NULL`도 항상 같이 확인**해야 한다(단일 조건 추가라 빠뜸 위험이 적음) |
| 비공개 전환 시 대표 버전 플래그 처리 | `CHECK (NOT is_current OR publication='PUBLISHED')`가 이미 구조적으로 강제: 대표 버전을 `HIDDEN`으로 바꾸려면 **같은 UPDATE에서 `is_current`도 `false`로 바꿔야** CHECK를 통과한다 | `hide` 작업은 대상이 대표 버전이었다면 `is_current`를 같은 트랜잭션에서 `false`로 함께 내린다(안 그러면 DB가 거부). 대표 버전이 없어진 정책은 공개 상세·목록에서 "현재 내용 없음"으로 처리(화면 설계는 STEP 3·5) |
| 변경 요약 없이 "조용한 수정" 금지 | `CHECK (revision_kind='INITIAL' OR change_summary가 비어있지 않음)` | — |
| 동시 편집 충돌 | 없음(락 컬럼을 추가하지 않음 — 아래 §3.4) | `transaction()` 내 `SELECT ... FOR UPDATE`(스팟·모터스포츠의 `lockSpot()`과 동일 패턴) |
| 미확인 수치·날짜 임의 생성 | NOT NULL 필수 필드는 빈 문자열을 거부(`CHECK length(btrim(x))>0`) | 값이 확인되지 않은 정책은 애초에 버전을 만들지 않고 `DRAFT`로 남긴다(콘텐츠 운영 규칙, §8) |
| `end_date` NULL을 "무기한"으로 단정(지적 1번) | `end_date_indefinite BOOLEAN`(이번 보완에서 추가) + `CHECK (NOT end_date_indefinite OR status<>'EXPIRED')`(무기한과 "이미 종료"는 동시에 성립할 수 없음) | API·화면은 `end_date IS NULL`을 "무기한"으로 **임의 해석하지 않는다** — `end_date_indefinite=true`일 때만 "종료일 없음(무기한)"으로 표시하고, `false`인데 `end_date`도 `NULL`이면 "종료일 미확인"으로 표시한다(§3.5) |

### 3.4 동시 편집 충돌 처리 (지시 8)

새 락 컬럼(예: `lock_version` optimistic lock)을 추가하지 않았다 — 이 코드베이스의 기존 관행(스팟 `spots.js`의 `lockSpot()`, 모터스포츠 동일 패턴)이 **트랜잭션 안에서 `SELECT ... FOR UPDATE`로 대상 행을 잠그고 그 안에서 UPDATE**하는 방식이라, 전기차 정책도 같은 방식을 그대로 쓰면 된다. 두 운영자가 동시에 같은 정책을 수정하면 하나는 행이 잠긴 동안 대기했다가 "그 사이 바뀐 이전 값"을 기준으로 처리된다(선착순 커밋, 낙관적 충돌 UI는 만들지 않는다 — 운영자 10~15개 정책 규모에서 과설계). **이것은 API 설계 사항(STEP 2 책임)이고 이번 STEP 1에서 구현하지 않는다** — 이 문서에 설계 방향만 기록한다.

### 3.5 날짜·시간대 규칙 (지시 8, 마이그레이션 파일 주석과 동일 내용을 문서에도 남김)

- `DATE` 컬럼(`effective_date`, `end_date`, `announced_on`, `last_verified_on`, `checked_on`)은 **정책 기준일**이며 KST 달력 날짜다(시간대 변환 없음, `motorsport_events.starts_on`/`ends_on`과 같은 규칙).
- `end_date`는 **포함 종료일**이다 — 그 날까지 적용되고 다음 날부터 적용되지 않는다.
- **정정(지적 1번)**: `end_date`가 `NULL`이라는 것은 "종료일 **정보가 없다**"는 뜻일 뿐이며 "무기한"을 보장하지 않는다. 종료일을 아직 조사하지 못한 경우와, 공식적으로 "종료일 없이 계속 운영한다"고 확인된 경우는 서로 다른 사실이다. 이를 구분하기 위해 `policy_versions.end_date_indefinite BOOLEAN NOT NULL DEFAULT false`를 추가했다 — `true`는 "공식 근거로 확인된 무기한", `false`인데 `end_date`도 `NULL`이면 "종료일 미확인"이다. **API·화면은 `end_date IS NULL`만 보고 "무기한"이라고 임의로 표시해서는 안 된다** — 반드시 `end_date_indefinite` 값을 함께 확인해 "종료일 없음(무기한)"과 "종료일 확인 중"을 구분된 문구로 표시해야 한다(STEP 3·5 화면 설계 요구사항으로 명시).
- 시행일·종료일이 미정이면 `NULL`로 두고 임의 날짜(예: `9999-12-31`, 오늘 날짜 등)로 채우지 않는다. `effective_date`는 `end_date`와 달리 "확정된 무기한" 같은 대응 개념이 없어(시행 자체가 아직 없다는 사실만 있을 뿐) 별도 컬럼을 추가하지 않았다.
- `TIMESTAMPTZ` 컬럼(`created_at`/`updated_at`/`published_at`/`cancelled_at`)은 **이 시스템에 언제 기록됐는가**의 감사용 시각이며 정책 기준일과 혼동하지 않는다.
- 세 가지를 명확히 분리했다(지시 5번 "공식 발표일, 실제 시행일, 등록·수정 시각을 혼동하지 않게"): `announced_on`(공식 발표일) ≠ `effective_date`(실제 시행일) ≠ `created_at`/`updated_at`(이 시스템에 등록·수정된 시각).

### 3.6 변경 이력 vs 감사 로그, 취소·대체 보존 (지시 5)

- **정책 변경(`CHANGE`) vs 오탈자 수정(`CORRECTION`)을 `revision_kind`로 구분**한다. 둘 다 새 행으로 쌓는다(기존 행을 고치지 않음 — append-only). `CORRECTION`도 역사에서 지우지 않는 이유: "오탈자였다"는 사실 자체도 운영 기록으로 남아야 하고, 이미 공개됐던 틀린 문구를 누가 언제 고쳤는지가 감사 대상이기 때문이다. 다만 `/ev/changes`(사용자용 타임라인)에는 **기본적으로 `CHANGE`만 보여주고 `CORRECTION`은 숨긴다**(사용자에게 "정책이 바뀌었다"고 오인시키지 않기 위해 — API 설계 사항, STEP 2).
- **취소·대체된 예정 변경의 보존**: 운영자가 등록했던 `SCHEDULED`/`PROPOSED` 미래 버전이 취소되면(예: 입법예고가 철회됨) 행을 지우지 않고 `cancelled_at`/`cancellation_note`만 채운다. 그 버전은 `is_current`가 된 적이 없어도(한 번도 "현재"였던 적이 없어도) 영구히 조회 가능하다. 다른 버전이 대신 승격되면, 대체된 버전은 `is_current=false`로 남고 새 버전의 `supersedes_version_id`가 그 이전 버전(대체된 버전이 아니라 **승격 직전까지 현재였던 버전**)을 가리킨다 — "취소된 경쟁 버전"과 "실제로 대체된 버전"이 섞이지 않게, 이 구분은 API가 승격 시점에 정확히 기록해야 한다(STEP 2 책임).
- **정책 버전(`policy_versions`) vs 관리자 감사 로그(`content_admin_logs`)의 역할 구분**: `content_admin_logs`는 "누가(운영자 id·권한) 언제 무엇을(`entity_type`+`entity_id`) 어떤 작업을(`action`) 했는가"의 내부 운영 기록이며 `/admin/ev` 로그 탭에서만 보인다. `policy_versions`는 "정책 내용이 실제로 어떻게 바뀌었는가"의 **사용자용** 이력이며 `/ev/changes`와 정책 상세 "변경 이력"에 노출된다. 하나의 실제 수정 작업(예: PUT으로 버전 등록)은 **두 곳 모두에 기록**된다 — `policy_versions`에 새 행 1개, `content_admin_logs`에 `entity_type='POLICY_VERSION'` 감사 행 1개(이 작업은 API 트랜잭션의 책임, STEP 2).

### 3.6-1 정책 전체 공개 게이트와 비공개 전환 (지적 5번, 이번 보완에서 추가)

`policy_items.publication`/`published_at`을 추가했다. `policy_versions.publication`(버전 자체의 공개 여부)과 역할이 다르다:

- **`policy_items.publication`**: "이 정책을 공개 화면 어디에든 노출할지"의 마스터 스위치. `HIDDEN`이나 `DRAFT`면 그 정책에 속한 **모든** 버전(과거·현재·미래, `publication` 값과 무관하게)과 그 버전들의 출처가 공개 API(목록·상세·`/ev/changes`·`sitemap.ts`) 어디에서도 보이지 않는다.
- **`policy_versions.publication`**: "이 버전의 내용이 보여줄 준비가 됐는지"(출처 확보·검증 등). 정책 전체 게이트가 `PUBLISHED`여도 특정 버전은 여전히 `DRAFT`일 수 있다.

**정책이 실제로 공개되려면 둘 다 충족해야 한다** — 모든 공개 쿼리는 `policy_items.publication='PUBLISHED' AND policy_items.deleted_at IS NULL`을 **항상** 추가 조건으로 걸어야 한다(STEP 2 책임, §3.3 표).

**비공개 전환 시 대표 버전(`is_current`) 처리**: `policy_versions`의 `CHECK (NOT is_current OR publication='PUBLISHED')`가 이미 이 문제를 구조적으로 풀어 둔다 — 대표 버전을 `HIDDEN`으로 바꾸려면 **같은 UPDATE에서 `is_current`도 `false`로 함께 바꿔야** 제약을 통과한다(따로 바꾸면 DB가 거부). 즉 "버전을 숨기면서 대표 지정을 깜빡 남겨두는" 상태 자체가 저장될 수 없다. 정책 전체 게이트(`policy_items.publication`)를 `HIDDEN`으로 바꾸는 것은 버전들의 `is_current`/`publication`을 전혀 건드리지 않는다 — 다시 `PUBLISHED`로 되돌리면 이전 대표 버전이 그대로 복원된다(정책 전체 게이트는 "가리는 커튼"이고, 버전 쪽 상태는 커튼 뒤에서 그대로 보존된다).

**공개 버전 수정은 항상 새 버전을 만든다는 원칙은 이번 보완에도 그대로 유지**된다 — 정책 전체 게이트를 추가했다고 해서 "이미 공개된 버전의 내용을 직접 고치는" 경로가 생기지 않는다. 출처도 마찬가지로, 이미 한 번이라도 공개됐던 버전(`published_at IS NOT NULL`)에는 새 출처를 추가하지 않는다 — 근거가 보강되면 새 CHANGE/CORRECTION 버전을 만든다(§3.3 표, 지적 5번).

### 3.7 이번 V8에 넣지 않은 것(과설계 방지, 지시 7)

1. **지역 마스터 테이블**: 만들지 않음. `policy_items.scope`(`NATIONAL`/`REGIONAL`) + `region_note`(평문 설명)로 대체. 지역별 수치를 구조화해 임의로 추정하지 않는다는 원칙을 스키마 수준에서도 지킨다.
2. **관련 정책 연결 테이블**: 만들지 않음. "관련 정책"은 같은 `category`의 공개 정책을 조회하는 API(`SELECT ... WHERE category=$1 AND id<>$2`)로 충분하다(정책 10~15개 규모). 필요해지면 이후 마이그레이션에서 `policy_related(policy_id, related_policy_id)`를 추가한다.
3. **본문 리치 텍스트/섹션 CMS**: 만들지 않음. `key_points`/`target`/`benefit`/`how_to_apply`/`note`는 전부 평문 `VARCHAR` 컬럼이다(지시 2번 "계산기나 범용 CMS로 확대하지 않는다"). 섹션이 더 필요해지면 그때 컬럼을 추가한다 — 지금은 상세 페이지 항목 4(적용 대상)·5(지원 내용·혜택)·6(신청·이용 방법)에 정확히 대응하는 3개 컬럼 + 핵심 내용 요약(`key_points`) + 보충 설명(`note`)으로 충분하다.

### 3.8 검토가 끝난 결정 (STEP 0의 "검토 필요 사항"을 이번 STEP에서 확정함)

STEP 0 문서는 이 3가지를 "사용자 확인 필요"로 남겨 뒀다. 이번 지시(§1~§9)가 사실상 답을 줬으므로 다음과 같이 확정했다 — 사용자가 다른 결정을 원하면 STEP 2 착수 전에 알려달라.
1. 본문을 단일 TEXT로 둘지: → **평문 컬럼 분리로 확정**(target/benefit/how_to_apply/key_points/note, §3.7-3).
2. 관련 정책 테이블: → **만들지 않음, 같은 category 조회로 대체**(지시 7과 일치, 확정).
3. 지역 테이블: → **만들지 않음, scope/region_note 평문 컬럼으로 대체**(지시 7과 일치, 확정).

---

## 4. API 엔드포인트 — 공개 조회는 STEP 2에서 구현 완료, 관리자 쓰기는 여전히 설계뿐(후속 단계)

> **구현 선택(승인된 요구사항 변경이 아님)**: board-service에 두는 것은 §1.1에서 설명한 대로 "사용자가 다음 단계 구현을 맡기면서 기존 아키텍처를 존중한 조정 판단"이다. §3의 DB 스키마는 이 선택과 무관하게 유효하다.

`board-service/src/ev.js`에 `evRouter({ db })` 하나를 작성해 `board-service/src/app.js`에 등록했다(실제 코드, STEP 2 완료). **`evAdminRouter`는 아직 없다** — 관리자 쓰기 API(등록·수정·공개·승격·취소·삭제)는 여전히 §5의 설계뿐이고 다음 단계로 미룬다. 기존 라우터 등록 순서·패턴(모터스포츠·스팟과 동일하게 공개 라우터를 `communityRouter`보다 먼저 붙임)을 그대로 따랐다. 기존 `/api/board/*` 엔드포인트, 인증, 세션 동작은 전혀 바꾸지 않았다(`app.js` diff는 import 1줄 + `app.use` 1줄뿐).

### 공개 — 실제로 구현됨(`board-service/src/ev.js`, STEP 2)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/board/ev/policies?category=&status=&featured=&q=&limit=` | 정책 목록(카드). 모든 필터는 선택이고 각각 `oneOf`/`positive`로 엄격히 검증한다(허용값 밖이면 DB를 두드리기 전에 400). `policy_items.deleted_at IS NULL AND publication='PUBLISHED' AND policy_versions.is_current AND publication='PUBLISHED'` 게이트를 항상 건다. 대표 버전이 `PROPOSED`·`EXPIRED`여도 포함된다(`is_current`를 `status='ACTIVE'`의 동의어로 쓰지 않음). `limit` 기본 50, 최대 200 |
| GET | `/api/board/ev/policies/:slug` | 정책 상세. `slug`는 라우트 파라미터 검증(`slugParam`, V8의 slug CHECK와 같은 정규식)에서 먼저 걸러지며 형식이 틀리면 400. 정책이 없거나 비공개(`DRAFT`/`HIDDEN`)거나 삭제됐거나 공개된 버전이 하나도 없으면 **모두 같은 404**("삭제되었거나 없는 정책입니다", 이유를 구분해 알려주지 않음). 응답은 `current`(대표 버전)·`upcomingChanges`(대표가 아니고 공개됐고 취소되지 않은 버전)·`history`(공개된 버전 전체, `CORRECTION`·취소 포함)·`relatedPolicies`(같은 category 최대 5개)로 구분된다. 정확한 필드는 §4.1 계약 참고 |
| GET | `/api/board/ev/changes?filter=scheduled\|recent\|ending\|expired\|proposed&limit=` | 변경 타임라인. 필터 생략 시 다섯 조건을 OR로 합친 전체. `revision_kind<>'CORRECTION'`과 `cancelled_at IS NULL`을 필터와 무관하게 항상 적용(오탈자·취소된 변경은 이 목록에 안 뜸, 정책 상세의 `history`에서만 보임). 각 필터의 정확한 범위는 §4.2 참고. `limit` 기본 50, 최대 200 |

대시보드 전용 조합 엔드포인트(`/highlights`)는 **이번에 만들지 않았다** — 지시의 "필요한 경우만 추가" 기준에 따라, `/changes?filter=scheduled`가 이미 "D-day 표시 가능(= `effectiveDate` 있고 `status='SCHEDULED'`로 확정된 것만)" 계약을 만족하므로 STEP 3에서 메인 대시보드를 만들 때 이 엔드포인트들을 조합해 쓰는 것으로 충분하다고 판단했다. STEP 3에서 실제로 화면을 만들다가 전용 조합 엔드포인트가 필요하면 그때 추가한다.

### 관리자 — STEP 7에서 구현 완료(`/api/board/admin/ev/*`, `board-service/src/ev.js`의 `evAdminRouter`, `requireCurrentStaff`, MANAGER 이상). 아래 표는 설계와 거의 그대로 구현됐고, 실제 구현에서 달라진 점만 각주로 남긴다(세부는 STEP 7 항목 참고 — 실제 DB 실행 검증은 아직 없음, mock 테스트만).

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/board/admin/ev/policies?q=&category=&deleted=&page=` | 정책 항목 목록(정책 단위, 각 행에 버전 개수·현재 버전 상태 요약 포함) |
| GET | `/api/board/admin/ev/policies/:id` | 정책 항목 하나(목록과 같은 모양 — 수정 다이얼로그가 이걸 안 쓰고 목록 응답을 그대로 재사용하지만, 별도 새로고침·딥링크용으로 둠) |
| GET | `/api/board/admin/ev/policies/:id/versions` | 해당 정책의 전체 버전 이력(모든 `revision_kind`, 모든 `publication` 포함, 각 버전의 출처 배열 포함) |
| POST | `/api/board/admin/ev/policies` | 정책 항목 생성(slug·category·scope) **+ 첫 버전(`revision_kind='INITIAL'`) 동시 생성.** 같은 트랜잭션. `version_no=1`, `is_current`는 아직 `false`(publish 전에는 현재 버전이 될 수 없음, DB CHECK) |
| PUT | `/api/board/admin/ev/policies/:id` | 정책 기본 정보만 수정(분류·전국/지역·지역 설명·제목·featured). `slug`는 받지 않음(등록 후 불변). `expectedUpdatedAt`을 보내면 동시 편집 충돌을 409로 감지(지시 8, §3.4 — 새 락 컬럼 없이 기존 `updated_at`으로 비교) |
| POST | `/api/board/admin/ev/policies/:id/versions` | 새 버전 등록(`revision_kind='CHANGE'` 또는 `'CORRECTION'`, `change_summary` 필수 — DB CHECK가 최종 방어). `supersedes_version_id`는 복합 FK(§3.3)로 같은 `policy_id`인지는 DB가 보장하지만, "올바른 버전"(보통 지금 대표 버전)을 고르는 것은 API 책임 |
| PUT | `/api/board/admin/ev/versions/:id` | **설계 당시(§4 초안)에는 없던 엔드포인트 — STEP 7 지시("미공개 초안만 편집할 수 있게 하세요")에 따라 추가했다.** 한 번도 공개되지 않은 버전(`published_at IS NULL`)의 내용·상태·검증·종료일만 수정한다. `revisionKind`·`supersedesVersionId`는 구조적 식별자라 수정에서 받지 않는다(바꿀 수 없음). `expectedUpdatedAt`으로 동시 편집 충돌을 409로 감지 |
| POST/PUT | `/api/board/admin/ev/policies/:id/publish` · `/hide` | **정책 전체 공개 게이트**(`policy_items.publication`) 전환(§3.6-1, 이번 보완에서 추가된 엔드포인트). 개별 버전을 건드리지 않고 정책 전체를 한 번에 가리거나 드러낸다 |
| POST | `/api/board/admin/ev/versions/:id/sources` | 출처 추가. **해당 버전이 아직 한 번도 공개된 적 없을 때만**(`published_at IS NULL`) 허용 — 이미 공개됐던 버전에는 추가하지 않는다(지적 5번, §3.3). 기존 출처 행은 어떤 경우에도 수정하지 않는다 |
| POST | `/api/board/admin/ev/versions/:id/publish` · `/hide` | **버전 단위** 공개·비공개(정책 전체 게이트와 별도 축, §3.6-1). publish 전 `policy_sources` 1개 이상 필수(§3.3) + `verification_status='VERIFIED'` 필수(DB CHECK). 대표 버전(`is_current=true`)을 `hide`하면 **같은 트랜잭션에서 `is_current=false`로도 내려야** DB CHECK를 통과한다(지적 5번 — 이 순서를 지키지 않으면 저장 자체가 거부된다) |
| POST | `/api/board/admin/ev/versions/:id/verify` | 확인일(`last_verified_on`)만 갱신 — `verification_status`는 바꾸지 않는다(§3.2 두 동작 분리) |
| POST | `/api/board/admin/ev/versions/:id/verify-confirm` | 공식 출처를 실제로 다시 확인했다는 명시적 작업 — `verification_status='VERIFIED'` + `last_verified_on`/`verified_by` 갱신(§3.3 "확인일 갱신 ≠ 검증 완료" 분리 지점) |
| POST | `/api/board/admin/ev/versions/:id/promote` | 이 버전을 현재 버전으로 승격(`is_current=true`) — 직전 현재 버전은 `is_current=false`로. `action='PROMOTE'` 로그 |
| POST | `/api/board/admin/ev/versions/:id/cancel` | 아직 현재 버전이 된 적 없는 예정 버전을 취소(`cancelled_at`/`cancellation_note`만 채움, 행 삭제 없음, §3.6) |
| DELETE · POST | `/api/board/admin/ev/policies/:id` · `/:id/restore` | 정책 항목 소프트 삭제·복원(**ADMIN 전용**, 버전·출처는 그대로 보존) |
| GET | `/api/board/admin/ev/logs` | 감사 로그(`content_admin_logs WHERE entity_type IN ('POLICY','POLICY_VERSION')`) |
| GET | `/api/board/admin/ev/stale` | 재확인 대기열(`last_verified_on`이 오래된 `PUBLISHED` 버전) |

모든 변경은 `transaction()` + `content_admin_logs` 기록(스팟 패턴 그대로, STEP 7에서 구현 완료). `app.js`에 실제로 추가된 줄(STEP 7):

```js
import { evAdminRouter, evRouter } from "./ev.js";
// ...
app.use("/api/board/admin/ev", evAdminRouter({ db, auth }));   // adminRouter보다 먼저(모터스포츠·스팟과 같은 자리)
app.use("/api/board/ev", evRouter({ db }));
```

### 4.1 공개 API 응답 계약 (STEP 2 실제 구현, SSR·`generateMetadata`·`sitemap.ts`가 재사용할 타입)

응답은 전부 camelCase JSON이고 날짜는 `YYYY-MM-DD` 문자열(KST 달력 날짜, `to_char`로 직렬화 — 서버 시간대에 따라 하루 밀리는 문제를 피하기 위해 DATE 컬럼을 JS Date로 변환하지 않는다, `motorsport.js`의 기존 방식과 동일). 내부 사용자 id(`createdBy`/`updatedBy`/`verifiedBy`/`checkedBy`)와 원본 숫자 PK는 어떤 응답에도 없다 — 정책의 공개 식별자는 `slug`, 버전의 공개 식별자는 `versionNo`(정책 안에서만 유일)다.

```ts
type PublicSource = { publisher: string; title: string; url: string; checkedOn: string };

// previousVersion: 이 버전이 대체한 버전이 "지금도 공개"일 때만 채워진다. INITIAL이면 비교 대상이
// 없어 둘 다 null. 대체된 버전이 비공개로 바뀌었으면 previousVersion=null이고
// previousVersionNote="이전 버전의 공개 정보를 확인할 수 없습니다."로 이유를 명시한다(묻지도 않고
// 숨기지 않는다 — 지시 사항).
type PublicVersion = {
  versionNo: number;
  revisionKind: "INITIAL" | "CHANGE" | "CORRECTION";
  summary: string; keyPoints: string; target: string; benefit: string; howToApply: string; note: string | null;
  status: "ACTIVE" | "SCHEDULED" | "PROPOSED" | "EXPIRED";
  changeConfirmed: boolean;               // status<>'PROPOSED'와 결정론적으로 같음(V8 CHECK)
  // 시행일/종료일이 지났는데 status가 그대로면 true — "그러니 지금은 ACTIVE/EXPIRED"라고 단정하지
  // 않고 이 플래그만 올린다(STEP 2 보완에서 추가, 지적 1). status 값 자체는 절대 자동으로 안 바뀐다.
  needsReview: boolean;
  announcedOn: string | null; effectiveDate: string | null;
  endDate: string | null;                 // null이어도 "무기한"이 아니다 — endDateIndefinite를 같이 봐야 함
  endDateIndefinite: boolean;              // true=공식 확인된 무기한, false+endDate=null=미확인
  lastVerifiedOn: string | null;
  changeSummary: string | null;
  cancelled: boolean; cancellationNote: string | null;
  sources: PublicSource[];
  // status·benefit도 함께 공개한다(요약만으로 "뭐가 바뀌었는지" 비교하기 부족해 STEP 2 보완에서 추가, 지적 4).
  previousVersion: { versionNo: number; summary: string; status: "ACTIVE" | "SCHEDULED" | "PROPOSED" | "EXPIRED"; benefit: string; effectiveDate: string | null; endDate: string | null } | null;
  previousVersionNote: string | null;
};

// GET /api/board/ev/policies → { policies: PolicyCard[] }
type PolicyCard = {
  slug: string; title: string; category: "BUY" | "DRIVE"; scope: "NATIONAL" | "REGIONAL"; regionNote: string | null; featured: boolean;
  versionNo: number; summary: string; target: string; status: PublicVersion["status"]; changeConfirmed: boolean;
  effectiveDate: string | null; endDate: string | null; endDateIndefinite: boolean; lastVerifiedOn: string | null;
  // 주의: 카드에는 keyPoints/benefit/howToApply/sources가 없다(목록을 가볍게 유지, 상세에서만 전체 제공).
};

// GET /api/board/ev/policies/:slug → PolicyDetail | 404
type PolicyDetail = {
  slug: string; title: string; category: "BUY" | "DRIVE"; scope: "NATIONAL" | "REGIONAL"; regionNote: string | null; featured: boolean;
  current: PublicVersion;                          // 대표 버전(법적 "지금 시행 중"이 아니라 "대표 표시 버전")
  // "살아있는" 예정 변경만: 대표가 아니고, 취소되지 않았고, CORRECTION이 아니고, status가
  // SCHEDULED나 PROPOSED이고, 더 최신 버전으로 이미 대체되지도 않은 것만(STEP 2 보완, 지적 1).
  upcomingChanges: PublicVersion[];
  history: PublicVersion[];                         // 공개된 버전 전체(CORRECTION·취소·이미 대체된 옛 예정안 포함, 지우지 않음)
  relatedPolicies: { slug: string; title: string; summary: string; status: PublicVersion["status"] }[]; // 최대 5개
};

// GET /api/board/ev/changes → { today: string; filter: string; changes: ChangeEntry[] }
type ChangeEntry = PublicVersion & { slug: string; title: string; category: "BUY" | "DRIVE" };
```

**D-day 계약**: 프런트는 `effectiveDate`가 `null`이 아닐 때만 D-day를 계산해 보여준다. `/changes?filter=scheduled`로 받은 항목은 전부 `status='SCHEDULED'`(= `changeConfirmed=true`)이고 `effectiveDate`가 항상 채워져 있으므로, 이 필터로 받은 목록은 추가 null 검사 없이 항상 D-day를 표시할 수 있다(§4.2). 그 외 응답(`current`/`upcomingChanges`/`history`/필터 없는 `/changes`)에는 `effectiveDate`가 `null`인 `PROPOSED` 항목이 섞여 있을 수 있으므로 반드시 null 검사 후에만 D-day를 표시해야 한다 — 서버는 D-day 자체를 계산해 내려주지 않는다(캐시 신선도·시간대 문제를 프런트의 "오늘" 계산 한 곳으로 모은다).

### 4.2 `/changes` 필터 범위 (문서화 — 실제 쿼리와 정확히 일치, `board-service/src/ev.js`)

| 필터 | 조건 | 비고 |
|---|---|---|
| (생략) | 기간 조건 없이 공개된 변경 **전체**(다섯 필터의 OR가 아니다 — 다섯 필터 중 어디에도 안 걸리는 행도 포함되는 더 넓은 집합, STEP 2 보완에서 주석을 바로잡음) | `CORRECTION`과 취소된 변경은 항상 제외(필터와 무관) |
| `scheduled`(시행 예정) | `status='SCHEDULED' AND effectiveDate IS NOT NULL AND effectiveDate > 오늘(KST) AND` 아직 더 최신 버전으로 대체되지 않음(`NOT EXISTS`) | `PROPOSED`는 아무리 날짜가 지나도 여기 안 뜬다(자동 전환 없음 — 운영자가 명시적으로 `status`를 바꿔야 함) |
| `recent`(최근 시행) | `status='ACTIVE' AND effectiveDate IS NOT NULL AND 오늘-30일 <= effectiveDate <= 오늘` | 30일 창 고정(`RECENT_WINDOW_DAYS`) |
| `ending`(종료 예정) | `status IN ('ACTIVE','SCHEDULED') AND endDate IS NOT NULL AND 오늘 <= endDate <= 오늘+30일` | 30일 창 고정(`ENDING_WINDOW_DAYS`). `EXPIRED`는 제외(이미 끝난 건 "종료 예정"이 아니라 "종료") |
| `expired`(종료) | `status='EXPIRED' OR (status IN ('ACTIVE','SCHEDULED') AND endDate IS NOT NULL AND endDate < 오늘)` | **STEP 2 보완(지적 2)**: `PROPOSED`는 종료일이 지나도 여기 섞이지 않는다 — 날짜만으로 미확정 정부안을 "시행됐다 끝났다"로 만들지 않는다. 확정 상태(ACTIVE/SCHEDULED)의 종료일이 지난 경우만 본다 |
| `proposed`(검토 중) | `status='PROPOSED' AND` 아직 더 최신 버전으로 대체되지 않음(`NOT EXISTS`) | `changeConfirmed=false`와 결정론적으로 같음(V8 CHECK) |

오늘(KST)은 매 요청마다 `kstToday()`로 계산한다(서버의 로컬 시간대와 무관 — UTC+9 고정 오프셋, 한국은 서머타임이 없어 안전, `motorsport.js`의 기존 방식과 동일). 모든 공개 쿼리(`publicGate`)는 `verification_status='VERIFIED'`를 명시적으로 포함한다(STEP 2 보완, 지적 3 — 이전에는 `publication='PUBLISHED'`에만 의존했다).

---

## 5. 관리자 기능 설계

- `/admin/ev` 신규 화면(`frontend/app/admin/ev/page.tsx` + `components/admin/ev-admin.tsx` + `ev-policy-dialog.tsx` + `ev-logs.tsx`) — `/admin/spots` 구조를 그대로 복제.
- `components/admin/admin-shell.tsx`: `NavKey`에 `'ev'` 추가, `NAV`의 "콘텐츠" 그룹에 `{key: 'ev', label: '전기차 정책', href: '/admin/ev', min: 'MANAGER'}` 추가.
- `components/admin/admin-app.tsx`의 `ContentSummary`에 "전기차 정책" 카드 추가(공개/초안/비공개/재확인 필요 건수 — `fetchAdminEv` 호출로 스팟과 같은 모양).
- 다이얼로그는 **정책 항목 편집**(제목·카테고리·전국/지역 구분·지역 설명·featured 토글·**정책 전체 공개 게이트**, `/admin/ev/policies/:id`)과 **버전 등록**(요약·핵심 내용·적용대상·지원내용·신청방법·보충설명·상태·확정여부·발표일·시행일·종료일·**종료일 무기한 여부** + **출처 반복 입력(이미 공개된 적 없는 버전에서만 추가 가능, 기존 출처는 수정 불가 — §3.6-1)** + 변경 요약, `/admin/ev/policies/:id/versions`)으로 **화면을 분리**한다 — §3에서 내용이 정책이 아니라 버전에 속하도록 재설계했기 때문이다. 새 버전을 등록해도 기존 "대표 버전"이 바로 바뀌지 않고, 별도의 "대표 버전으로 승격" 작업(§4 `/promote`)을 거쳐야 공개 화면에 반영된다. "종료일 없음"을 선택하면 화면은 "무기한(공식 확인됨)"과 "아직 모름"을 서로 다른 선택지로 보여준다(둘 다 `end_date`는 비워 두지만 `end_date_indefinite` 값이 다르다, §3.5).
- 권한: 등록·수정·공개/비공개·출처 추가·확인(verify)·승격(promote)·취소(cancel) = MANAGER 이상. 정책 항목 삭제·복원 = ADMIN(스팟과 동일 기준, §10 요구사항 "최소 기능"과 "서버에서 권한 검증" 모두 충족).
- **새 관리자 인증 시스템을 만들지 않는다** — `requireCurrentStaff` 재사용(§1.8).

---

## 6. 정책 상태 및 변경 이력 관리 방식

상세 규칙은 §3.2(상태 전환·공개 규칙 표)·§3.6(변경 이력 vs 감사 로그)에 확정되어 있다. 요약:

- 시행 상태·검증 상태·공개 상태·현재 버전 지정은 **네 가지 독립된 축**이며 전부 운영자의 명시적 작업으로만 바뀐다. 자동 전환(배치·스케줄러)은 MVP에 없다(§3.2).
- `status=PROPOSED`(정부안)이면서 `publication=PUBLISHED`(공개)인 조합은 정상 케이스다 — 화면에는 항상 `status` 배지를 명확히 표시해 확정 정책처럼 보이지 않게 한다("정부안을 확정된 정책처럼 표시하지 않는다"의 구현 지점, STEP 3·5에서 구현).
- 버전 등록(`CHANGE`/`CORRECTION`)은 **변경 요약(`change_summary`) 없이 저장할 수 없다**(§3.1 CHECK로 DB가 직접 강제 — API가 아니라 스키마 레벨 보장이라는 점이 STEP 0 설계보다 강화된 부분).
- 과거 버전 행은 삭제하지 않는다. 취소된 예정 변경도 `cancelled_at`/`cancellation_note`로 남기고 보존한다(§3.6).
- `/ev/policy/{slug}` URL은 정책이 바뀌어도 유지한다(slug는 `policy_items`에 있고 버전이 바뀌어도 그대로다 — slug 변경 자체를 막는 것은 API 책임, STEP 2에서 수정 엔드포인트에 slug 필드를 받지 않도록 구현).

---

## 7. SEO 적용 방안

| 항목 | 적용 방법 |
|---|---|
| SSR | `/ev/*` 전부 서버 컴포넌트 + `lib/ev-server-api.ts`(§1.6) |
| title/description | `/ev`, `/ev/buy`, `/ev/drive`, `/ev/changes`는 정적 `export const metadata`(메인 페이지 패턴). `/ev/policy/[slug]`는 **이 저장소 최초의 `generateMetadata`**로 정책 제목·요약을 반영 |
| canonical | `generateMetadata`의 `alternates.canonical`에 `https://morethancar.kr/ev/policy/{slug}` 고정(연도 등 변동 요소 없음, §12 지시와 일치) |
| sitemap | `app/sitemap.ts` 신설: 정적 라우트(`/ev`, `/ev/buy`, `/ev/drive`, `/ev/changes`) + `PUBLISHED`이고 삭제되지 않은 정책의 slug 전부를 **서버에서 동적으로 조회**해 포함. 비공개(DRAFT/HIDDEN) 정책은 포함하지 않는다(§12 "콘텐츠 없는 페이지를 노출하지 않는다") |
| robots | `app/robots.ts` 신설: `/admin` 경로는 `disallow`, 나머지는 `allow` |
| 구조화 데이터 | `/ev/policy/[slug]`에 `<script type="application/ld+json">`로 `Article` 또는 `GovernmentService`에 가까운 스키마(정확한 타입은 schema.org 확인 후 STEP 9에서 결정) — `dateModified`를 **현재 버전(`is_current`)의** `last_verified_on`으로 채운다 |
| 내부 링크 | `/ev` 메인에서 모든 카테고리·변경·상세 페이지로 링크, 상세 페이지에 "관련 정책"(같은 category) 링크 |
| 수정일 표시 | 상세 페이지에 "최종 확인일: YYYY-MM-DD" 고정 표시(지시사항 핵심 요구) |
| 지역별·차종별 대량 생성 금지 | §3.2 결정대로 지역 테이블을 만들지 않으므로 자동 대량 생성 자체가 불가능한 구조 |

---

## 8. 실제 정책 데이터 확보 및 검증 계획

- STEP 8에서만 수행(코드 작업이 아니라 **콘텐츠 작업**). 관리자 화면(STEP 7 완료 후)으로 운영자가 직접 입력한다.
- 1차 확인 기관(지시사항 §13 그대로): 무공해차 통합누리집, 국가법령정보센터, 한국도로공사, 정부 부처 공식 발표, 지자체 공식 공고.
- 각 버전 등록 시 `policy_sources`에 최소 1개 출처(기관명·자료명·URL·확인일·확인자) 필수 입력 — publish API가 서버에서 강제(§3.3, §4).
- 확인되지 않은 수치·날짜는 입력하지 않는다. 확인 안 된 버전은 `verification_status=UNVERIFIED`·`publication=DRAFT`로 남기고 공개하지 않는다(§3.1 CHECK로 DB가 직접 강제).
- 자동 수집(크롤링)은 이번 MVP에서 구현하지 않는다(지시사항과 일치, `ev.js`에 크롤러·스케줄러 코드를 추가하지 않는다).
- STEP 8 완료 기준: 구매·지원 최소 5건, 운행·혜택 최소 5건, 각 정책 출처 1개 이상, 전부 `status` 실제 값과 일치, 사용자(요청자)가 각 정책의 공식 출처 URL을 직접 열어 확인.

---

## 9. STEP 1~10 세부 개발 작업

공통 규칙(모터스포츠·스팟 선례와 동일):
- 각 STEP = 별도 커밋 + (board-service 변경 시) CI 통과 + 로컬 임시 스택 검증(Neon 미사용, `docker-compose.yml` 기본값) + 사용자 확인.
- **운영 반영(Neon 적용)은 이 문서의 STEP 범위가 아니다** — core를 Neon에 연결해 재기동하는 시점에 별도 승인.
- 이미 커밋된 Flyway 파일은 수정하지 않는다. 스키마를 더 바꿔야 하면 `V9__...`을 새로 추가한다.

### ☑ STEP 1 — 정책 데이터 모델 및 DB 설계 확정 (2026-10-13 작성, 2026-10-13 보완 — 정적 검토만, DB 실행 검증은 여전히 미실행)

**완료한 작업(1차, 2026-10-13)**:
- [x] §3.2의 검토 필요 사항 3가지를 지시사항(§1~§9)에 맞춰 확정(§3.8).
- [x] `backend/src/main/resources/db/migration/V8__ev_policy_hub.sql` 작성(DB에 적용하지 않음).
- [x] V1~V7 파일을 전혀 수정하지 않았음을 `git status`/`git diff`로 재확인.
- [x] 정적 검토(SQL 문법·네이밍·FK·CHECK 상호 일관성을 눈으로 재검토).

**완료한 작업(보완, 2026-10-13 2차 — 사용자 검토 지적 사항 7개 반영, §3.0)**:
- [x] `end_date` NULL=무기한 단정을 바로잡고 `end_date_indefinite` 컬럼 추가(지적 1).
- [x] `supersedes_version_id`의 "다른 정책 참조를 DB가 막지 못한다"는 잘못된 설명을 복합 FK로 바로잡음(지적 2).
- [x] `status`/`change_confirmed` 모순, 취소 버전의 대표 지정, `region_note` 공백 입력을 막는 CHECK 4개 추가(지적 3).
- [x] `is_current`를 "대표 표시 버전"으로 명확히 재정의하고, 상세 페이지가 대표 버전 + 공개된 예정 변경을 함께 반환하도록 §4 설계를 갱신(지적 4).
- [x] `policy_items.publication`(정책 전체 공개 게이트) 추가, 비공개 전환 시 `is_current` 처리 규칙과 출처 추가 제한 규칙을 명문화(지적 5).
- [x] `content_admin_logs_action_check` 이름을 "확정 통과"가 아니라 "정적 근거 + 실행 미확인"으로 다시 표현(지적 6).
- [x] V8이 미커밋·미적용 신규 파일임을 git status로 재확인한 뒤 V9가 아니라 V8 자체를 수정(지적 7).
- [x] `git status`/`git diff`로 V1~V7과 기존 아이콘 파일(미추적 2건)이 이번 보완에서도 전혀 바뀌지 않았음을 재확인.

**미완료(다음 STEP 전 격리 환경에서 수행)**:
- [ ] **DB 실행 검증 — 여전히 미실행.** 이번 보완도 지시에 따라 DB 접속·마이그레이션 실행을 전혀 하지 않았다. 아래 "향후 실행 검증 절차"(보완판)를 격리된 일회용 PostgreSQL에서 수행해야 STEP 2 착수 전 최종 확인이 끝난다.

**정적 검토 내용(실행 없이 눈으로 확인한 것, 보완판)**:
- 모든 `VARCHAR`/`BIGINT`/`TIMESTAMPTZ`/`SERIAL` 타입과 `created_by`/`updated_by`/`deleted_by` 패턴이 V6/V7과 동일한 길이·FK 관례를 따르는지 대조(신규 컬럼 `end_date_indefinite`, `policy_items.publication`/`published_at` 포함).
- **제약 이름의 정적 근거(지적 6, 확정 통과라고 보고하지 않음)**: V6의 `entity_type`·`action` 컬럼은 둘 다 "컬럼 선언에 바로 붙은 이름 없는 CHECK"다. PostgreSQL은 이런 단일 컬럼 CHECK에 `<테이블명>_<컬럼명>_check` 규칙으로 이름을 자동 생성한다(해당 이름이 테이블에 아직 없을 때). `entity_type` 쪽은 V7이 이미 같은 방식으로 `DROP/ADD CONSTRAINT content_admin_logs_entity_type_check`에 성공했고, V7은 커밋되어 CI(`mvn test`)를 통과해 main에 있다 — 이것이 **간접적인 실행 증거**다. `action` 쪽(`content_admin_logs_action_check`)은 이번이 첫 확장이라 이런 선례가 없다 — 이름 생성 규칙이 같은 컬럼 수(1개)·같은 선언 방식이라 **같은 이름이 생성될 것으로 추정**하지만, 실제로 그 이름이 존재하는지는 **확인하지 않았다**. 이것은 추정이고 확정이 아니다.
- `policy_versions`의 CHECK 제약 전체(이번 보완 후 13개)가 서로 논리적으로 충돌하지 않는지 수동 추론: `is_current ⟹ publication='PUBLISHED' ⟹ published_at IS NOT NULL AND verification_status='VERIFIED'`, `is_current ⟹ cancelled_at IS NULL`, `status≠'PROPOSED' ⟺ change_confirmed=true ⟹ verification_status='VERIFIED'`, `end_date_indefinite ⟹ status≠'EXPIRED'` — 체인을 따라가며 서로 막는 조합이 없는지 확인.
- 복합 FK `(policy_id, supersedes_version_id) → policy_versions(policy_id, id)`가 `UNIQUE(policy_id, id)`를 참조 대상으로 요구하는데 그 UNIQUE가 바로 위에 선언돼 있는지, `supersedes_version_id`가 NULL일 때 PostgreSQL의 기본 FK 매치 규칙(MATCH SIMPLE)상 검사를 건너뛰는 것이 맞는지(표준 동작) 확인.
- `CHECK (supersedes_version_id < id)`가 SERIAL 컬럼의 자동 할당값을 CHECK 평가 시점에 올바르게 참조하는지(컬럼 기본값은 제약 평가 전에 확정되므로 유효한 패턴) 확인.
- `region_note`/`cancellation_note` CHECK에서 `IS NOT NULL`을 뺀 `length(btrim(x))>0`만 쓰면 NULL 입력이 조용히 통과하는 함정(PostgreSQL CHECK는 평가 결과가 NULL이면 "통과"로 취급)이 있는지 전체 CHECK를 다시 훑어 재확인 — `region_note`에서 발견해 수정했고(지적 3), 같은 패턴을 쓰는 다른 조건부 필드(`cancellation_note`, `change_summary`)는 이미 `IS NOT NULL`을 같이 쓰고 있어 문제없음을 재확인했다.

**향후 실행 검증 절차(STEP 2 착수 전, 격리된 일회용 PostgreSQL에서 수행 — 이번 STEP에서도 수행하지 않음, 보완판)**:
1. 운영 Neon과 무관한 **임시 컨테이너**를 띄운다: `docker run --rm -e POSTGRES_PASSWORD=test -e POSTGRES_DB=revcc_test -p 5433:5432 postgres:16` (기존 로컬 compose의 `postgres` 서비스나 운영 DB에 절대 연결하지 않는다).
2. 빈 DB 검증: `cd backend && REVCC_TEST_DB_PORT=5433 REVCC_TEST_REDIS_PORT=<임시 redis 포트> mvn test` — V1~V8이 순서대로 전부 적용되고 Hibernate `ddl-auto: validate`가 통과하는지 확인.
3. 기존 DB 업그레이드 경로 확인: V1~V7만 적용된 스냅샷에 V8만 추가로 적용해도 동일하게 성공하는지 확인.
4. `content_admin_logs_entity_type_check`와 `content_admin_logs_action_check` 제약 이름이 실제로 존재하는지 `\d content_admin_logs`로 둘 다 확인(특히 `action_check`는 선례가 없는 첫 확인 — 이름이 다르면 V8의 해당 `DROP CONSTRAINT` 줄만 수정).
5. 제약 실패 검증(의도적으로 CHECK/UNIQUE/FK를 위반하는 INSERT를 시도해 각각 거부되는지 확인, 전부 거부돼야 "검증됨"):
   - 중복 `slug`로 두 번째 `policy_items` 삽입 → UNIQUE 위반으로 거부.
   - `effective_date` > `end_date`인 버전 삽입 → CHECK 위반으로 거부.
   - `publication='PUBLISHED'`, `verification_status='UNVERIFIED'`인 버전 삽입 → CHECK 위반으로 거부.
   - `status='ACTIVE'`(또는 SCHEDULED/EXPIRED), `verification_status='UNVERIFIED'`인 버전 삽입(공개 여부와 무관) → CHECK 위반으로 거부(이번 보완에서 추가된 규칙, 지적 3).
   - `status='ACTIVE'`인데 `change_confirmed=false`인 버전 삽입 → CHECK 위반으로 거부(지적 3).
   - `end_date_indefinite=true`, `status='EXPIRED'`인 버전 삽입 → CHECK 위반으로 거부(지적 1).
   - `is_current=true`, `publication='DRAFT'`인 버전 삽입 → CHECK 위반으로 거부.
   - `is_current=true`, `cancelled_at`이 NULL이 아닌 버전 삽입 → CHECK 위반으로 거부(지적 3).
   - `scope='REGIONAL'`, `region_note`가 공백 문자열(`' '`)인 정책 삽입 → CHECK 위반으로 거부(지적 3 — 이전 버전은 이 사례를 놓쳤을 것).
   - 같은 `policy_id`에 `is_current=true`인 버전 2개 삽입 → 부분 UNIQUE 인덱스 위반으로 거부.
   - 같은 `(policy_id, version_no)` 쌍으로 두 번째 버전 삽입 → UNIQUE 위반으로 거부.
   - `revision_kind='CHANGE'`인데 `change_summary`가 NULL/빈 문자열인 버전 삽입 → CHECK 위반으로 거부.
   - `revision_kind='INITIAL'`인데 `supersedes_version_id`가 NULL이 아닌 버전 삽입 → CHECK 위반으로 거부.
   - 같은 정책 안에서 `supersedes_version_id`가 **자기 자신의 id 이상**(자기참조 또는 아직 없는 미래 id)을 가리키는 버전 삽입 → CHECK 위반으로 거부(지적 2).
   - **정책 A의 버전이 정책 B의 버전을 `supersedes_version_id`로 가리키는 INSERT** → 이번 보완에서 **복합 FK 위반으로 거부되어야 한다**(이전 절차는 "성공해야 정상"이라고 잘못 적었다 — 지적 2로 바로잡은 핵심 시나리오. 이 INSERT가 만약 성공한다면 복합 FK 설계 자체에 문제가 있다는 뜻이므로 즉시 재검토).
   - `policy_items.publication='PUBLISHED'`인데 `published_at`이 NULL인 정책 삽입 → CHECK 위반으로 거부(지적 5, 정책 레벨 게이트에도 같은 패턴 적용).
6. 정상 흐름도 함께 확인: ①같은 정책의 이전 버전을 올바르게 `supersedes_version_id`로 가리키는 INSERT는 성공, ②대표 버전을 `publication='HIDDEN'`으로 바꾸는 UPDATE는 같은 문장에서 `is_current=false`도 같이 바꿔야 성공하고 `is_current`만 그대로 두고 `publication`만 바꾸면 거부되는지 확인(지적 5).
7. 검증 완료 후 **임시 컨테이너를 삭제**하고(`docker rm`), 로컬 compose의 `postgres` 서비스나 운영 Neon에는 어떤 영향도 주지 않았음을 재확인한다.
8. 이 절차의 결과(통과/실패 각 항목)를 이 문서 STEP 1 섹션에 추가 기록한 뒤에만 STEP 2를 시작한다.

**수정 파일(이번 보완)**: `backend/src/main/resources/db/migration/V8__ev_policy_hub.sql` (전면 수정, 아직 미적용·미커밋) · `MORETHANCAR_EV_TASKS.md` (§3.0 신규, §3.1~§3.6-1 갱신, §4·§5·§9·§11 갱신).

### ☑ STEP 2 — board-service 정책 "공개 조회" API (2026-10-13, 관리자 쓰기 API는 후속 단계로 보류)

**완료한 작업**:
- [x] `board-service/src/ev.js` 작성: `evRouter({db})` — `GET /policies`, `GET /policies/:slug`, `GET /changes`(§4 공개 표). `evAdminRouter`는 **이번에 작성하지 않았다**(§5 설계는 남아 있고 구현은 후속 단계).
- [x] `board-service/src/app.js`에 2줄만 추가(import 1줄 + `app.use("/api/board/ev", evRouter({db}))` 1줄, 기존 라우터 등록 순서·패턴 그대로). 기존 `/api/board/*` 엔드포인트·인증·세션 로직은 한 글자도 바꾸지 않았다(`git diff board-service/src/app.js` = 3줄 추가뿐).
- [x] `board-service/test/ev.test.js` 작성(16개 테스트 — 검증·404 동일성·현재+미래 분리·비공개 이전 버전 숨김·내부 id 미노출·종료일 미정/무기한 구분·slug 검증·`changesWindow` 날짜 경계·SQL 텍스트 게이트 확인).
- [x] 기존 테스트가 DB/Redis/운영 네트워크를 쓰지 않는지 소스 확인(`grep`로 `new Pool`/`createClient`/`process.env.DB_HOST` 등 0건, 전부 `createApp({db: fake, redis: fake})` 패턴).
- [x] `node --check src/ev.js test/ev.test.js src/app.js` 구문 검사 통과.
- [x] V1~V8 마이그레이션 파일, `frontend/`, 기존 미추적 아이콘 파일을 건드리지 않았음을 `git status`/`git diff`로 재확인.

**1차 완료 당시 미완료 — 이번 보완에서 해소됨**: `npm test` 실행 자체가 로컬 Node 20.10과 `sanitize-html→htmlparser2`(ESM) 비호환으로 막혔던 문제. 이번에 **전역 런타임을 바꾸지 않고**(설치 과정 없이) 이미 로컬에 있던 `nvm`(`~/.nvm/versions/node/v22.20.0`)과 Homebrew `node@22`(`/opt/homebrew/opt/node@22`)를 확인하고, `/opt/homebrew/opt/node@22/bin/node --test`로 **기존 의존성 그대로** 직접 실행했다 — package.json·lockfile·node_modules는 전혀 건드리지 않았다.

### ☑ STEP 2 보완 — 공개 조회 API 버그 4건 수정 (2026-10-13)

사용자가 지적한 4가지를 전부 수정했다(모두 `board-service/src/ev.js` 수정, `board-service/test/ev.test.js`에 회귀 테스트 추가):

1. **`upcomingChanges`가 과거 ACTIVE/EXPIRED 이력과 CORRECTION까지 "예정 변경"으로 보여주던 문제** → `revision_kind<>'CORRECTION'`, `status IN ('SCHEDULED','PROPOSED')`, 그리고 **이미 더 최신 버전으로 대체된 버전은 제외**(`supersededIds()` 헬퍼, `/policies/:slug`에서 메모리 계산 / `/changes`에서는 `NOT EXISTS` SQL)하도록 좁혔다. `history`는 그대로 전부 보존한다. 시행일이 지났는데 상태가 안 바뀐 경우는 `needsReview: true`로만 표시하고 `status`를 임의로 ACTIVE/EXPIRED로 바꾸지 않는다(새로 추가한 `needsReview` 순수 함수, 테스트로 확인).
2. **`expired` 필터에 `end_date`만 지난 PROPOSED가 섞이던 문제** → 날짜 기반 종료 판정을 `status IN ('ACTIVE','SCHEDULED')`로만 한정했다. PROPOSED는 `status='EXPIRED'`로 명시 전환되지 않는 한 `expired` 필터에 절대 나타나지 않는다(SQL 텍스트 회귀 테스트로 확인).
3. **"모든 쿼리에 검증 조건을 쓴다"는 주석과 실제 SQL의 불일치** → `publicGate`, `/policies/:slug`의 버전 조회, 이전 버전 비교 조회, 관련 정책 조회 전부에 `verification_status='VERIFIED'`를 명시적으로 추가했다(이전에는 `publication='PUBLISHED'`에만 의존 — V8 CHECK로 결과는 같았지만 쿼리 자체에 쓰여 있지 않았다).
4. **`/changes` 필터 생략 시 동작과 주석 불일치** → "다섯 조건을 OR로 합친 전체"라고 썼던 주석을 "기간 조건 없이 공개된 변경 전체"로 바로잡았다(실제로는 다섯 필터 중 어디에도 안 걸리는 행도 포함되는 **더 넓은** 집합이다). 이전/이후 비교에 `status`·`benefit`을 추가했다(요약만으로 부족한 경우 대비). 운영 수정 시각(`created_at`/`updated_at`)과 공식 발표일(`announcedOn`)/시행일(`effectiveDate`)은 애초에 DTO에 분리돼 있어 혼동 여지가 없음을 재확인했다.

**실행 검증(이번에 실제로 실행함)**:
- [x] `cd board-service && /opt/homebrew/opt/node@22/bin/node --test` → **74개 전부 통과**(기존 56 + ev.test.js 18, 슬러그 테스트 2건을 가짜 "오류" 사례였음을 발견해 수정 — "ends-"/"trailing-"은 V8 정규식이 실제로 허용하는 값이라 금지 목록에서 뺐다).
- [x] DB 접속·마이그레이션 실행은 하지 않았다 — STEP 1의 "향후 실행 검증 절차"는 여전히 미실행으로 남아 있다.

**수정 파일(이번 보완)**: `board-service/src/ev.js`, `board-service/test/ev.test.js`, `MORETHANCAR_EV_TASKS.md`.

**남은 위험**:
- `/changes`의 OR 분기·`NOT EXISTS` 서브쿼리가 실제 Postgres에서 계획대로 동작하는지는 fake DB로는 증명되지 않는다(SQL 텍스트만 확인) — STEP 1 "향후 실행 검증 절차"에서 샘플 데이터로 5개 필터 + "대체된 예정안 제외"를 실제로 조회해 재확인 필요.
- `attachSourcesAndPrevious`의 배치 조회가 실제 실행 계획(인덱스 사용 등)에서도 효율적인지는 실제 DB에서만 확인 가능.

### ☑ STEP 3 — 전기차 메인 대시보드 (`/ev`) — 완료 2026-10-13

**실제 구현(계획보다 구조를 일부 바꿈 — 이유는 아래)**:
- [x] `frontend/lib/ev-types.ts`, `frontend/lib/ev-server-api.ts`, `frontend/lib/ev-format.ts`(라벨·날짜·D-day 순수 함수, 신규 — 계획에 없었지만 여러 페이지가 공용으로 써서 분리) 작성.
- [x] `frontend/components/ev/ev-page.tsx`(공용 셸) + `ev.module.css` 작성.
- [x] `frontend/app/ev/layout.tsx` **신규 추가(계획에 없었음)** — `app/(owners)/layout.tsx` 선례를 따라 `/ev` 하위 전체가 `<EvPage>`로 한 번만 감싸이게 했다. 이러면 `error.tsx`/`not-found.tsx`가 셸(헤더·푸터) 안에서 자동으로 렌더링된다(아래).
- [x] `frontend/app/ev/error.tsx`, `frontend/app/ev/not-found.tsx` **신규 추가(계획에 없었음, 지시 요구사항 반영)** — API 장애는 "재시도 가능한 오류 UI"로, 없음/비공개 정책은 `notFound()`로 구분해야 한다는 지시를 Next.js 표준 관례(세그먼트 `error.tsx`/`not-found.tsx`)로 구현했다. 하나씩만 만들어 `/ev` 하위 5개 페이지가 전부 공유한다.
- [x] `frontend/components/ev/status-badge.tsx`, `policy-card.tsx`, `version-detail.tsx`, `source-list.tsx`, `tab-links.tsx` — 계획의 `ev-policy-card.tsx`/`ev-filter-tabs.tsx`를 역할별로 더 작게 나눴다(카드와 버전 상세 블록은 /ev, /ev/buy, /ev/drive, /ev/changes, /ev/policy/[slug]가 전부 재사용한다).
- [x] `frontend/app/ev/page.tsx` — 제목·설명은 지시에서 준 문구를 그대로 썼다. 탭(전체/구매·지원/운행·혜택/정책 변경)은 `/ev`·`/ev/buy`·`/ev/drive`·`/ev/changes` 네 페이지를 오가는 상단 내비게이션으로 구현하고, "전체 정책 목록" 절은 그 아래 별도의 상태 필터(전체/적용 중/시행 예정/검토 중/종료)를 둔다 — 원 지시 §3이 이 둘을 모두 요구해서 두 단으로 나눴다. 주요 정책 카드·곧 달라지는 정책(`/changes?filter=scheduled`)·최근 변경된 정책(`/changes`) 세 절도 전부 구현.
- [x] `frontend/lib/services.ts`는 **건드리지 않았다** — href는 여전히 없다(SOON 유지, 지시대로).

**필터는 전부 URL 쿼리 + 일반 `<a>` 링크다(클라이언트 상태·useEffect 없음)** — 서버 컴포넌트가 `searchParams`를 읽어 그 값으로 바로 fetch하므로, 서버 렌더링과 필터가 항상 같은 값을 쓴다(지시 요구사항 그대로).

**테스트/검증 결과**:
- [x] `cd frontend && npx tsc --noEmit` — 오류 0건.
- [x] `cd frontend && rm -rf .next && npm run build` — 성공, `/ev`·`/ev/buy`·`/ev/drive`·`/ev/changes`·`/ev/policy/[slug]` 전부 `ƒ`(동적 서버 렌더링)로 빌드됨.
- [x] **브라우저로 실제 확인함(완료로 적기 전에 직접 봤다)**: 합성 fixture를 돌려주는 임시 로컬 HTTP 서버(`/private/tmp/.../scratchpad/ev-mock/server.mjs`, 저장소 밖, 커밋 대상 아님, 테스트 전용 — 실제 서비스 폴백 데이터로 쓰지 않았다)를 띄우고 `REVCC_API_ORIGIN`을 거기로 돌려 `next dev`로 데스크톱(1440px)·모바일(~390px)·태블릿(~768px)에서 확인: 탭 전환, 상태 배지(적용 중/시행 예정/검토 중·미확정/종료), D-day 배지, 카드 레이아웃이 좁은 화면에서 1열로 자연스럽게 줄어듦(가로 스크롤 없음)을 직접 봤다.
- [x] API가 실패하는 경우(목 서버를 꺼서 재현)도 확인: 빈 목록이나 404로 숨지 않고 "전기차 정책 정보를 불러오지 못했어요 / 다시 시도" 오류 화면이 뜨는 것을 직접 봤다(`error.tsx`).

### ☑ STEP 4 — 구매·지원 / 운행·혜택 페이지 — 완료 2026-10-13

**실제 구현**: `frontend/components/ev/category-listing.tsx`(신규, 계획의 "컴포넌트 재사용"을 공용 서버 컴포넌트 함수로 구현 — `/ev/buy`·`/ev/drive`가 category만 다르게 호출) + `frontend/app/ev/buy/page.tsx`, `frontend/app/ev/drive/page.tsx`(각각 `generateMetadata` 포함). 전국 공통/지역 한정 표시는 `PolicyCard`가 두 페이지에서 동일하게 보여준다(지역별 금액 추정 없음 — `regionNote`가 있을 때만 그 문구를 그대로 노출).

**테스트/검증 결과**: STEP 3과 같은 `tsc`/`build` 통과. 브라우저로 `/ev/buy` 확인(스크린샷) — `category=BUY` 정책만 나오는 것, 상단 탭의 "구매·지원"이 활성 표시되는 것, 하단 상태 필터가 `/ev`와 별도로 동작하는 것을 직접 확인. `/ev/drive`는 코드 리뷰로 동일 구조임을 확인(브라우저로는 `/ev/buy`만 직접 열어봤다 — 완전히 같은 컴포넌트를 쓰므로 회귀 위험은 낮지만, 직접 본 것과 코드로 미뤄 짐작한 것을 구분해 적는다).

### ☑ STEP 5 — 정책 상세 페이지 (`/ev/policy/{slug}`) — 완료 2026-10-13

**실제 구현**: `frontend/app/ev/policy/[slug]/page.tsx`(`generateMetadata` — 이 저장소 최초 사용, `fetchEvPolicyDetail`로 정책별 title·description·canonical 생성, 없으면 `{title:'정책을 찾을 수 없음', robots:{index:false}}`, API 장애 시엔 단정하지 않고 `{title:'전기차 정책', robots:{index:false,follow:true}}`로 안전하게 폴백). 현재 내용·공개된 예정 변경·변경 이력·관련 정책 네 절을 `VersionDetail`로 렌더링(12개 항목: 제목·상태·핵심요약·대상·혜택·이용방법·시행일·종료일·공식출처·최종확인일·예정변경·누적이력 — 관련 정책은 별도 절). PROPOSED는 "검토 중·미확정" 배지로 표시, 종료일 NULL은 `endDateIndefinite`를 같이 봐서 "무기한"과 "확인 중"을 구분해서 보여준다(절대 NULL만으로 무기한 처리하지 않음). 취소된 버전은 이력에는 남지만(배지로 표시) 예정 변경 절에는 안 나온다.

**테스트/검증 결과**: `tsc`/`build` 통과. 브라우저로 `/ev/policy/highway-toll-discount` 전체를 스크롤하며 확인 — 현재 내용, 공개된 예정 변경(D-80 배지), 변경 이력(오탈자 수정 항목 포함), 취소된 변경(취소 사유·"이전 버전 비교 정보 없음" 문구), 관련 정책까지 전부 렌더링을 직접 봤다. `curl`로 HTML 응답에 실제 정책명·요약이 포함돼 있음을 확인(SSR 검증 — CSR이었다면 비어 있었을 자리). 잘못된 slug(`/ev/policy/not-a-real-slug`) → 404 상태 코드 + `not-found.tsx` 렌더링을 직접 확인(단, `127.0.0.1`로 접속하면 Next.js dev 모드의 `allowedDevOrigins` 제한으로 하이드레이션이 막혀 빈 화면이 뜨는 로컬 전용 현상을 발견 — `localhost`로 접속하면 정상 렌더링됨을 확인·기록. 앱 코드 문제가 아니라 dev 서버 접속 호스트 문제다).

### ☑ STEP 6 — 정책 변경 타임라인 (`/ev/changes`) — 완료 2026-10-13

**실제 구현**: `frontend/app/ev/changes/page.tsx`. 뉴스 목록이 아니라 `VersionDetail`(이전/이후 비교 포함) 블록을 쌓는 타임라인이다. 필터 6종(전체/시행 예정/최근 시행/종료 예정/종료/검토 중)을 `TabLinks`로 구현(URL 쿼리와 동기화). D-day는 `VersionDetail` 안에서 `status==='SCHEDULED' && changeConfirmed`일 때만 계산한다(확정된 미래 날짜에만 표시, 지시 그대로).

**`lib/services.ts`의 `href` 추가·메뉴 SOON 해제는 하지 않았다** — 이번 지시가 명시적으로 "실제 검증된 콘텐츠와 관리자 기능까지 준비된 후로 남겨 두라"고 했으므로, STEP 0~STEP1 계획 문서에 있던 "STEP 6에서 SOON을 해제한다"는 이전 계획을 **이번 지시로 덮어써 보류**했다. `site-header.tsx`의 `activeService()`에 `/ev` 매칭만 추가했다(href가 없어 지금은 시각적 효과가 없지만, href가 나중에 붙을 때 추가 수정 없이 바로 동작하도록 — 지시된 "최소 수정" 범위).

**테스트/검증 결과**: `tsc`/`build` 통과. 브라우저로 `/ev/changes` 전체(필터 전환 포함, "검토 중" 클릭 → URL이 `?filter=proposed`로 바뀌고 PROPOSED 항목만 남는 것)를 직접 확인.

### ☑ STEP 7 — 관리자 정책 관리 기능 (`/admin/ev`) — 구현 2026-10-13, **배포 전 결함 점검·보완 2026-10-13(실제 PostgreSQL/Redis 격리 환경 + 브라우저로 실행 검증 완료)**

**작업**: §5 전체(목록·등록·수정·공개/비공개·삭제/복원·출처 관리·감사 로그·대시보드 카드·사이드 내비) + 관리자 쓰기 API(§4, 이전까지 설계뿐이던 `evAdminRouter`).

**백엔드 — 실제 구현 파일**:
- `board-service/src/ev.js` — 기존 공개 라우터(`evRouter`, STEP 2) 아래에 `evAdminRouter({db, auth})` 추가(파일을 새로 만들지 않고 이어씀 — 공개/관리자 라우터를 같은 파일에 두는 건 `motorsport.js`/`spots.js`의 기존 관행과 동일). §4 표의 엔드포인트 전부 + 설계에 없던 `PUT /versions/:id`(미공개 초안 수정, 지시 3번 "미공개 초안만 편집할 수 있게"에 따라 추가) 구현.
- `board-service/src/app.js` — `evAdminRouter` import 1줄 + `app.use("/api/board/admin/ev", evAdminRouter({db, auth}))` 1줄을 `adminRouter`(ADMIN 전용)보다 먼저 등록(모터스포츠·스팟과 같은 자리 — §1.8).
- `board-service/test/ev-admin.test.js` (신규) — spots.test.js/motorsport.test.js와 같은 "가짜 DB(SQL 문자열 매칭)" 패턴. **실제 PostgreSQL에 접속하지 않으므로 CHECK 제약·실제 트랜잭션 격리가 "진짜로" 동작하는지는 증명하지 않는다** — 증명하는 건: (1) 세션 역할과 현재 DB 역할·상태 재확인, (2) 핸들러가 상태 전환 규칙을 실제로 거부하는지, (3) 성공 시 `content_admin_logs` INSERT+COMMIT / 실패 시 ROLLBACK만 일어나는지, (4) 공개·삭제가 보내는 SQL 자체에 `publication`/`deleted_at`을 바꾸는 구문이 들어있는지(문자열 검사).

#### 배포 전 결함 점검에서 발견·수정한 4건 (2026-10-13)

사용자가 이번 라운드에서 지시한 "배포 전 결함 점검"으로 코드를 다시 읽으며 실제 결함 3건을 찾아 고쳤고, 그 수정을 실제 PostgreSQL로 검증하는 과정에서 **설계·리뷰만으로는 안 보이던 SQL 버그 1건을 추가로 발견**했다(mock DB 테스트는 SQL을 실행하지 않아 이 네 번째 결함을 전혀 잡지 못했다 — 왜 실DB 검증이 필요했는지의 직접적인 증거).

1. **검증 선언이 암묵적으로 이뤄지던 결함(지시 1번)** — 이전 `versionContentInput`은 `status`가 `PROPOSED`가 아니면 `verifiedOn`이 없어도 오늘 날짜로 채우고 조용히 `VERIFIED`로 저장했고, `ev-version-fields.tsx`는 확정 상태를 고르면 검증 체크박스를 자동으로 켜고 비활성화했다 — **상태를 고른 것 자체가 "공식 출처로 확인했다"는 선언이 되어버렸다.** 고친 뒤: 서버는 요청 본문의 **명시적 불린 `confirmVerification`**(사용자가 실제로 체크한 값만, 상태·날짜로 추론하지 않음)이 `true`일 때만 `VERIFIED`로 저장하고, 아니면 확정 상태 저장 자체를 400으로 거부한다. **근거(출처)까지 같은 요청에서 확인**한다 — `confirmVerification:true`인데 출처가 하나도 없으면(새로 보낸 것도, 이미 저장된 것도) 409로 거부한다(버전 생성은 DB에 행이 없어 "이미 저장된 출처"가 있을 수 없으므로 반드시 같은 요청에 `sources` 배열을 포함해야 한다). UI 체크박스는 더 이상 자동으로 켜지거나 비활성화되지 않고, 확정 상태인데 체크가 안 돼 있으면 붉은 안내 문구로 왜 저장이 안 되는지 설명한다. **브라우저로 직접 확인함**: 상태를 "적용 중"으로 바꿔도 체크박스가 그대로 꺼져 있고 안내 문구가 뜨는 것을 스크린샷으로 확인.
2. **대표 버전 승격(promote)의 동시성 결함(지시 2번)** — 이전 구현은 대상 버전부터 잠그고 "지금 대표인 행"을 그 다음에 조회했는데, 그 사이 정책 부모 행에 대한 락이 없었다. 대표가 아직 없는 정책에서 서로 다른 두 버전을 동시에 승격하면 둘 다 "지금 대표가 없다"는 커밋 전 상태를 보고 각자 자신을 대표로 쓰려 할 수 있었다 — 부분 유니크 인덱스가 최종적으로 막긴 하지만 "직렬화돼 둘 다 처리"가 아니라 "하나가 불필요하게 실패"하는 결과였다. **이전 주석이 "동적 조회라 교착이 없다"고 적었던 것은 실제로 재현하지 않고 단정한 것이었다 — 정정한다(교착은 맞게도 없었지만, 유니크 위반 경쟁은 있었다).** 고친 뒤: 버전 등록과 같은 순서로 **정책 부모 행을 먼저 `SELECT ... FOR UPDATE`로 잠근 뒤에만** 버전 행을 읽거나 쓴다 — 같은 정책에 대한 승격·버전 등록은 전부 정책 행의 락 하나로 직렬화된다.
3. **`expectedUpdatedAt` 생략 시 충돌 검사가 조용히 건너뛰어지던 결함(지시 3번)** — 이전에는 이 필드가 요청에 아예 없으면(undefined) 동시 편집 검사를 생략했다. 고친 뒤: `PUT /policies/:id`·`PUT /versions/:id`는 이 키가 요청 본문에 **아예 없으면**(값이 `null`이어도 키 자체는 있어야 한다 — "한 번도 수정된 적 없음"의 명시) 400으로 거부한다 — 충돌 보호를 우회할 수 있는 경로 자체를 없앴다.
4. **(실DB 검증 중 발견) 정책 공개·비공개 SQL의 파라미터 타입 불일치** — `UPDATE policy_items SET publication=$2,published_at=COALESCE(published_at,CASE WHEN $2='PUBLISHED' THEN NOW() END)...`에서 `$2`를 캐스트 없이 두 번(대입 1회 + `CASE WHEN` 비교 1회) 썼다. 실제 PostgreSQL은 이 조합에서 타입을 일관되게 추론하지 못해 `inconsistent types deduced for parameter $2` 오류로 500(관리자 화면에는 "서비스에 일시적으로 연결할 수 없습니다")이 났다 — **정책 공개·비공개가 코드 리뷰·mock 테스트를 모두 통과했음에도 실제로는 항상 실패했을 결함**이다. `spots.js`/`motorsport.js`의 같은 패턴은 이미 `$2::text`로 캐스트돼 있었는데 이 부분만 빠뜨렸다. 양쪽 다 `$2::text`로 캐스트해 고쳤고, mock 테스트에 캐스트가 둘 다 남아 있는지 문자열로 고정하는 회귀 테스트를 추가했다(SQL을 실행하지 않는 mock으로는 이 종류의 타입 오류 자체를 다시 잡을 수 없어, "캐스트 문자열이 사라지지 않았는지"만 방어선으로 둔다).

수정 파일: `board-service/src/ev.js`(위 4건), `board-service/test/ev-admin.test.js`(결함 1·2·3·4 각각의 회귀 테스트 추가, 총 93개 중 신규), `frontend/components/admin/ev-version-fields.tsx`(체크박스 자동화 제거, `confirmVerification` 명시 전송), `frontend/components/admin/ev-policy-dialog.tsx`(출처 입력 섹션을 처음 추가 — 이전에는 정책 등록 다이얼로그에 출처 입력이 아예 없었다), `frontend/components/admin/ev-version-dialog.tsx`(출처를 버전 저장과 **같은 요청**(`sources` 배열)으로 보내도록 변경 — 이전에는 버전을 먼저 저장한 뒤 `POST .../sources`를 순서대로 호출해, confirmVerification을 요구하는 순간엔 아직 DB에 출처가 없는 경쟁 구간이 있었다), `frontend/lib/admin-ev.ts`(`VersionContentInput.confirmVerification` 필드 추가, `NewVersionInput`/`UpdateVersionInput`에 `sources?` 추가).

**검증 상태 선언 방식(§3.2·지시 "확인일 갱신만으로 VERIFIED가 되지 않게", 이번 수정으로 최종 확정)**: `confirmVerification`은 상태·날짜 입력과 완전히 독립된, 운영자가 직접 켠 명시적 플래그다. `status`가 `PROPOSED`가 아닌데 `confirmVerification`이 `true`가 아니면 저장 자체를 400으로 거부한다(DB CHECK가 거부하는 조합을 더 친절한 메시지로 먼저 막음). `confirmVerification:true`는 반드시 근거(출처, 새로 보낸 것이든 이미 저장된 것이든)를 동반해야 한다. `/verify`(확인일만)와 `/verify-confirm`(검증 상태 전환, 출처 1개 이상 필수)은 여전히 분리된 별도 엔드포인트다.

**출처 추가 후 재검증**: `PROPOSED` 버전만 DB CHECK상 `UNVERIFIED`로 되돌릴 수 있어(그 외 상태는 항상 `VERIFIED`여야 함), 단독 `/versions/:id/sources` 엔드포인트로 출처를 추가하면 `PROPOSED`인 경우에만 검증 상태를 자동으로 `UNVERIFIED`로 내린다. 그 외 상태의 미공개 초안에 이 엔드포인트로 출처를 추가하면 검증 상태는 그대로 유지되고, 운영자가 필요하면 `/verify-confirm`을 다시 호출해야 한다 — DB 제약상 가능한 범위까지만 자동화했고, 나머지는 문서에 한계로 남긴다. (등록·수정 시점에 `sources`로 같이 보내는 출처는 이 자동 되돌림과 무관하다 — 그 순간 검증을 새로 선언하는 것이다.)

**동시 편집 충돌(지시 8, §3.4, 이번 수정으로 보강)**: 새 락 컬럼을 추가하지 않았다. `PUT /policies/:id`·`PUT /versions/:id`는 `expectedUpdatedAt` 키가 요청에 없으면 400, 있으면 서버가 잠근 행의 현재 `updated_at`과 **epoch 비교**(문자열 형식이 Postgres의 `+00:00`과 JS의 `Z`로 달라도 같은 순간이면 통과)해 다르면 409로 거부한다. 버전 번호 발급·대표 버전 승격은 **정책 부모 행을 먼저 잠근 뒤**(위 결함 2 수정) 대상 행을 같은 트랜잭션에서 잠그고 계산한다.

**프런트엔드 — 실제 구현 파일**:
- `frontend/lib/admin-ev.ts` (신규) — 관리자 타입 + API 클라이언트. 공개 타입(`lib/ev-types.ts`)과 라벨(`lib/ev-format.ts`)을 재사용(새로 안 만듦).
- `frontend/components/admin/ev-admin.tsx` (신규) — `/admin/ev` 본체. 탭은 "정책/재확인 대기열/변경 이력" 3개(`?tab=`), 정책 행의 "버전 관리"를 누르면 탭 영역이 **그 정책의 버전 목록 화면으로 전환**된다(`?policy=`, 별도 다이얼로그가 아니라 전체 폭 화면 — 버전이 여러 개일 수 있어 다이얼로그에 넣기엔 좁아서, 이번 지시에는 없던 화면 전환 하나를 추가했다. 다단계 승인·복잡한 편집기는 아님, 목록 ↔ 상세 전환뿐).
- `frontend/components/admin/ev-version-fields.tsx` (신규, **예상 파일 목록에는 없었음**) — 정책 등록(최초 버전)과 버전 등록·수정이 똑같이 쓰는 12개 입력 필드(요약·핵심내용·대상·혜택·방법·보충설명·상태·발표일·시행일·종료일·무기한 여부·검증)를 한 곳으로 모았다. 세 군데에 똑같은 폼을 복붙하지 않으려고 분리했다 — 새 API나 새 다이얼로그가 아니라 순수 폼 컴포넌트.
- `frontend/components/admin/ev-policy-dialog.tsx` (신규) — 정책 항목 등록(+최초 버전 내용)·수정. slug는 등록 후에는 입력란 자체가 없다(불변).
- `frontend/components/admin/ev-version-dialog.tsx` (신규) — 새 버전 등록(종류·대체할 이전 버전·변경 요약 선택 포함) / 미공개 초안 수정. 출처는 이미 등록된 것은 읽기 전용으로 보여주고, 추가할 출처만 입력폼에서 모아 저장 시 버전 저장 다음에 순서대로 `POST .../sources`를 호출한다(별도 배치 API를 만들지 않음 — 기존 코드베이스 관행대로 순차 호출).
- `frontend/components/admin/ev-logs.tsx` (신규) — `spots-logs.tsx`와 같은 틀 + 대상 종류(정책/버전) 필터.
- `frontend/components/admin/admin-shell.tsx` — `NavKey`에 `'ev'`, `NAV`의 "콘텐츠" 그룹에 전기차 정책 항목 추가.
- `frontend/components/admin/admin-app.tsx` — `ContentSummary`의 `cardGrid`에 "전기차 정책" 카드 추가(기존 스팟 카드와 같은 모양 — 숫자 카운터 타일은 스팟 카드에도 없어서 맞추지 않음, 과설계 방지).
- `frontend/app/admin/ev/page.tsx` (신규) — `metadata.robots: {index:false, follow:false}`로 색인 제외(지시 4번). 공개 `/ev` 메뉴의 SOON은 건드리지 않음(`lib/services.ts` 미수정, STEP 6 결정 유지).

**구현 완료 체크(코드)**:
- [x] §5 전체 + §4 관리자 API 전부 + 지시 1·2·3 결함 수정 + 실DB 검증 중 발견한 결함 4 수정.

**mock 테스트/정적 검증(완료)**:
- [x] `cd board-service && npm test` — **93개 전부 통과**(기존 74개 + `ev-admin.test.js` 19개). 권한·상태 전환·승격/취소 거부·감사로그/롤백·동시 편집(가짜 DB상의 SQL 순서)에 더해, 이번 라운드에서 결함 1(명시적 confirmVerification + 근거 필요)·결함 2(promote가 정책 부모 행을 먼저 잠그는지)·결함 3(expectedUpdatedAt 생략 시 400)·결함 4($2::text 캐스트가 SQL에 남아 있는지) 각각의 회귀 테스트를 추가했다.
- [x] `cd frontend && npx tsc --noEmit` — 오류 0건.
- [x] `cd frontend && npm run build` — 성공, `/admin/ev` 포함 전체 라우트 정상 빌드.

**실제 PostgreSQL/Redis 격리 환경 검증(완료 — 2026-10-13, 이번 라운드에서 처음 실행)**

운영 Neon·AWS에는 전혀 접속하지 않았다. 기존 dev 컨테이너(`revcc-member-test-pg` 등)·볼륨(`revcc-site_revcc_pg`)은 전혀 건드리지 않고, **완전히 새로운 이름의 1회용 컨테이너**(`revcc-ev-verify-pg`(postgres:16, 호스트 포트 55433), `revcc-ev-verify-redis`(redis:7-alpine, 포트 56379), 전용 네트워크 `revcc-ev-verify-net`)를 띄워 검증한 뒤 **검증이 끝나자마자 컨테이너·네트워크를 전부 삭제**했다(`docker rm -f` + `docker network rm` — 기존 컨테이너·볼륨은 검증 전후로 상태 변화 없음, `docker ps -a`로 확인).

- [x] **빈 DB에 V1→V8 적용**: 새 DB(`revcc_fresh`)에 core(Spring, `mvn -o package` 후 `java -jar`)를 직접 실행해 Flyway가 V1부터 V8까지 순서대로 적용되는 것을 로그로 확인(`Successfully applied 8 migrations ... now at version v8`), `flyway_schema_history`에 8행 전부 `success=t`, `policy_items`/`policy_versions`/`policy_sources`/`content_admin_logs` 테이블 생성 확인, Hibernate `ddl-auto: validate` 통과(앱이 정상 기동 — 엔티티-스키마 불일치 없음).
- [x] **기존 V7→V8 업그레이드**: 같은 Postgres에 두 번째 DB(`revcc`)를 만들어, **V8 마이그레이션 파일을 일시적으로 빼고** core를 실행해 V1~V7만 적용(`Successfully applied 7 migrations ... now at version v7`) → 실제 운영과 같은 모양의 데이터(ADMIN/MANAGER/USER/정지된 MANAGER 포함 회원 4명)를 직접 INSERT로 채움 → V8 파일을 되돌리고 **`mvn clean package`로 다시 빌드**(최초 시도에서 Maven이 target/classes의 V8 리소스를 자동으로 지우지 않아 "V7만 적용"이 거짓으로 통과한 것을 발견·재현해 바로잡음 — `clean` 없이 `package`만 하면 삭제된 리소스가 산출물에 남는다는 사실을 이번에 직접 확인) → core를 다시 실행해 **`Successfully applied 1 migration ... now at version v8`**(증분 적용) 확인, 기존 회원 4명 데이터가 그대로 남아 있음을 재확인, V8 새 테이블도 모두 생성됨을 확인.
- [x] **V8 CHECK·FK·유니크 인덱스를 실제 SQL로 직접 재현**(STEP 1부터 "정적 근거뿐" 이라고 남겨 두었던 항목들): `content_admin_logs_action_check`에 `CANCEL`/`PROMOTE`가 실제로 반영됐는지 `pg_get_constraintdef`로 직접 조회해 확인(이름 추정이 맞았음을 실행으로 처음 확인), 복합 FK(`policy_id, supersedes_version_id`)가 **다른 정책의 버전을 가리키는 INSERT를 실제로 거부**하는지 확인(`ERROR: ... violates foreign key constraint ... policy_versions_policy_id_supersedes_version_id_fkey`), `CHECK(supersedes_version_id < id)`가 자기참조를 거부하는지, `CHECK(publication<>'PUBLISHED' OR verification_status='VERIFIED')`가 미검증 공개를 거부하는지, `CHECK(status='PROPOSED' OR verification_status='VERIFIED')`가 미검증 확정 상태를 거부하는지, 마지막으로 **부분 유니크 인덱스(`policy_versions_one_current`)가 같은 정책에 두 번째 대표 버전을 지정하려는 UPDATE를 실제로 거부**하는지까지 전부 직접 SQL로 재현해 확인했다.
- [x] **관리자 등록→출처→검증→공개→승격 전체 흐름을 실제 HTTP로 재현**: board-service를 이 Postgres/Redis에 직접 연결해 띄우고(`PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`, `REDIS_URL`), Redis에 `revcc:session:<token>` 키를 Spring과 같은 포맷(`{id,username,role,version}`)으로 직접 심어 ADMIN/MANAGER/USER/정지된 MANAGER 네 세션을 만든 뒤, **Node 스크립트로 실제 fetch 요청 21건을 순서대로 보내 확인**: 익명 401, USER 403, MANAGER 200, 정지 계정 401(아래 참고), 정책 등록(PROPOSED, 검증 불필요) 201, 확정 상태인데 confirmVerification 없음 400, confirmVerification:true인데 출처 없음 409, confirmVerification:true + 출처 포함 201(검증됨+출처 1개), 버전 공개 200, 대표 승격 200, 정책 전체 공개 200, 공개 API에 실제로 노출됨 확인, MANAGER 삭제 시도 403, ADMIN 삭제 204, 공개 API 404로 사라짐, 감사 로그에 CREATE/PUBLISH/PROMOTE/DELETE 전부 기록됨, ADMIN 복원 200 — **21건 전부 기대한 결과**. 이 과정에서 결함 4(공개·비공개 500 오류)를 실제로 맞닥뜨려 수정했다.
  - 정지된 MANAGER 세션은 403이 아니라 **401**을 받았다 — `requireCurrentStaff`의 역할 검사까지 가기 전에, `app.js`의 공용 세션 재확인 미들웨어가 SUSPENDED 계정의 `req.user`를 이미 `null`로 만들기 때문이다(EV 전용 동작이 아니라 플랫폼 전체의 기존 동작). mock 테스트는 이 미들웨어의 쿼리를 모든 사용자에 대해 항상 ACTIVE로 반환하도록 단순화해 둬서 이 차이를 가리고 있었다 — mock 테스트도 실제 동작에 맞춰 바로잡았다(결과는 바뀌지만 "접근이 막힌다"는 보안 결론은 동일하다).
- [x] **동시 승격 재현**: 같은 정책의 공개된 두 버전(B, C — 어느 쪽도 아직 대표가 아님)에 **`Promise.all`로 진짜 동시에** `POST .../promote`를 보냈다. 결과: **둘 다 200으로 성공**(교착도, 유니크 위반 409도 없음 — 결함 2 수정이 실제로 직렬화함을 확인), 최종적으로 둘 중 하나만 대표(`is_current`)로 남음(순서는 레이스라 결정되지 않지만 상태는 항상 일관됨).
- [x] **동시 편집 재현**: 같은 정책에 **같은(오래된) `expectedUpdatedAt`을 들고 동시에** `PUT /policies/:id` 두 번(제목만 다르게)을 보냈다. 결과: **정확히 하나는 200, 다른 하나는 409** — 유실된 업데이트(lost update) 없이 충돌 보호가 실제 동시 요청에서도 보장됨을 확인.
- [x] **브라우저로 직접 확인**(core는 마이그레이션 적용 후 종료, board-service·frontend(standalone 빌드)를 이 Postgres/Redis에 연결해 구동, Redis에 심어 둔 MANAGER 세션 쿠키로 로그인 상태 재현): `/admin/ev` 정책 목록 → "버전 관리" → 버전 테이블(상태·검증·공개 배지, 작업 버튼이 상태별로 다르게 보임) → "새 버전 등록" 다이얼로그에서 시행 상태를 "적용 중"으로 바꿔도 **검증 체크박스가 자동으로 켜지지 않고**, 빨간 안내 문구("...체크박스를 직접 켜고... 출처를 1개 이상 입력해야...")가 뜨는 것을 스크린샷으로 직접 확인(결함 1 수정의 실제 UI 동작 확인) → 메인 페이지(`/`)에서 변경된 제목("차 그 이상의 이야기")·설명 문구와 자연스러운 줄바꿈을 직접 확인.
  - **반응형**: 1280px·768px은 요청대로 정확히 재현해 확인(가로 스크롤 없음, 관리자 테이블은 `.tableWrap` 내부 스크롤만 — 기존 스팟/모터스포츠 관리자 화면과 같은 기존 패턴). **360px/390px은 이 세션의 브라우저 자동화 도구가 허용하는 최소 창 너비가 500px로 보여(여러 번 재시도, 더 작은 값을 요청해도 500px로 고정됨) 정확히 그 값으로는 확인하지 못했다** — 대신 도달 가능한 가장 좁은 500px에서 관리자 화면·메인 화면 모두 가로 스크롤 없음(`document.documentElement.scrollWidth === clientWidth`로 직접 확인)과 제목·설명 줄바꿈이 깨지지 않는 것을 확인했다. CSS가 `clamp()`(폭에 비례해 줄어들다 하한에서 고정)와 `word-break: keep-all`을 쓰므로 500px 미만에서 상황이 더 나빠질 구조적 이유는 없지만, **360px/390px을 글자 그대로 확인했다고 말할 수는 없다** — 이 도구 제약을 그대로 보고한다.

**정리**: 사용 후 모든 임시 자원을 제거했다 — Docker 컨테이너 2개(`revcc-ev-verify-pg`, `revcc-ev-verify-redis`) + 네트워크(`revcc-ev-verify-net`) 삭제, 로컬 core/board-service/frontend 프로세스 전부 종료, 브라우저 탭 전부 닫음. 기존 dev 컨테이너·볼륨·`.env`·운영 설정은 어느 것도 수정하지 않았다.

#### 범위 밖(참고): 같은 라운드에서 함께 처리한 메인 화면 문구 변경

사용자 지시 3번으로 `frontend/components/home/home-shell.tsx`(브랜드 제목·설명 문구)와 `main.module.css`(`.brandTitle` 글자 크기 약 10%·굵기 한 단계 축소, `.brandTitle`/`.brandLead`에 `word-break: keep-all` 추가로 한글 단어 중간 줄바꿈 방지)를 수정했다 — **이것은 전기차 정책 허브(STEP 1~10)와 무관한 별도 작업**이라 이 문서의 STEP 번호에 넣지 않고 여기 참고로만 남긴다. 기존 색상·버튼 문구/동작·통계·배치·내비게이션은 손대지 않았고, 다른 페이지 문구·폰트도 바꾸지 않았다. 검증: `tsc`/`build` 통과, 브라우저로 1280px·768px·(도구 제약상)500px에서 실제 렌더링 확인(위 "브라우저로 직접 확인" 항목에 포함).

#### 배포 준비 판정 (사용자 지시 5번, 2026-10-13)

**결론: 이 브랜치의 코드는 main 반영 후보로 올릴 수 있는 상태지만("코드 배포" 준비), "전기차 정책 허브 정식 오픈"은 별개이며 아직이다.** 아래는 그 둘을 구분한 근거다.

- **마이그레이션 순서·적용 시점**: `docker-compose.prod.yml`의 core가 Neon에 연결해 재기동하는 시점에 그동안 쌓인 Flyway 마이그레이션(V1~V8, 운영 Neon은 아직 V8 미적용 — STEP 1부터 기록)이 한 번에 적용된다. 이번에 **격리된 로컬에서 "기존 V7 상태 + 데이터 → V8 증분 적용" 경로를 실행으로 확인**했으니, 운영에서도 같은 경로(core 재기동 한 번으로 V8만 추가 적용)가 동작할 근거는 생겼다 — 다만 이건 **로컬 재현이지 운영 Neon 자체를 확인한 것이 아니다.** 운영 반영 시점은 여전히 "core를 Neon에 연결해 재기동할 때"이고, 사용자의 "운영 반영 승인" 전까지는 하지 않는다(§13, STEP 10 완료 기준과 동일).
- **백업·복구 절차**: 이번 라운드에서 새로 만들거나 확인하지 않았다. STEP 10(운영 배포 준비)의 몫으로 남아 있다 — Neon에 V8을 적용하기 전 스냅샷/백업 시점을 사용자와 먼저 정해야 한다.
- **이전 앱과의 호환성**: V8은 새 테이블 3개(`policy_items`/`policy_versions`/`policy_sources`) 생성과 기존 `content_admin_logs` 하나에 대한 `ALTER TABLE ... DROP/ADD CONSTRAINT`(entity_type·action 허용값 확장)만 한다 — 기존 테이블의 컬럼·데이터를 바꾸지 않는다. 이번 실DB 검증에서 V7→V8 적용 전후로 기존 회원 데이터가 그대로 남아 있음을 직접 확인했다. **다만 커뮤니티·차고 등 기존 기능 자체의 API 회귀 테스트는 이번에 수행하지 않았다** — V8이 그 테이블들을 전혀 건드리지 않는다는 마이그레이션 파일의 구조적 사실에 근거한 "영향 없을 것"이라는 판단이지, 실행으로 재확인한 것은 아니다.
- **core→board/frontend 준비 상태**: core(Flyway 소유), board-service(`evAdminRouter`), frontend(`/admin/ev`) 세 서비스 모두 이번 라운드에서 실제로 함께 띄워 전체 흐름을 확인했다(위 "실제 PostgreSQL/Redis 격리 환경 검증" 전체). 세 서비스 간 계약(라우팅·세션 포맷)은 기존 것을 그대로 썼고 바꾸지 않았다.
- **기존 로그인·커뮤니티·차고 회귀**: 이번 라운드에서 **직접 재확인하지 않았다**(세션 생성은 Redis에 직접 키를 심는 방식으로 우회했고, Kakao 로그인·회원가입·커뮤니티 글쓰기·차고 등록 같은 기존 플로우는 건드리지도 실행하지도 않았다). board-service의 기존 테스트 스위트(74개, 이번에 93개로 늘었지만 기존 74개는 그대로 통과)가 그 기능들의 단위 수준 회귀는 계속 잡아 주지만, **실제 DB로 end-to-end 재확인한 것은 아니다** — 미실행으로 명시한다.
- **CI 공백**: `.github/workflows/ci.yml`은 `mvn test`(backend)와 `npm test`(board-service)만 실행하고, **frontend의 `tsc`/`build`는 CI에 없다**(이전 STEP들의 기록과 동일, 이번에도 확인함 — 사람이 매번 로컬에서 돌려야 한다는 뜻이다). 이번 STEP 7 전체 구간에서 frontend 빌드가 깨진 적이 없었던 것은 사람이 그때그때 로컬 `npm run build`로 확인했기 때문이지, CI가 보장해서가 아니다.
- **STEP 8(실제 정책 데이터)·STEP 9(SEO)는 여전히 미완료**다 — "코드가 main에 반영될 수 있는 상태"와 "전기차 정책 허브가 실제로 오픈된 상태"는 다르다. `lib/services.ts`의 SOON은 이번에도 해제하지 않았고, 가짜/임시 정책 데이터를 공개 API에 등록하지도 않았다(검증에 쓴 `drive-verify-subsidy`·`concurrency-verify`는 격리된 1회용 DB에만 있었고, 그 DB 자체를 삭제했다 — 운영 Neon에는 애초에 연결하지 않았으니 새어나갈 경로가 없다).

### ☐ STEP 8 — 실제 정책 데이터 검증 및 등록

**작업**: §8 그대로. 코드 작업 없음(콘텐츠 작업), 관리자 화면으로 사용자(또는 운영자)가 직접 입력.

**완료 기준**: §8 완료 기준 그대로(구매·지원 5건↑, 운행·혜택 5건↑, 출처 1개 이상, 공식 출처 URL 직접 열어 확인).

### ☐ STEP 9 — SEO, 반응형, 통합 테스트

**작업**: `app/sitemap.ts`, `app/robots.ts` 신설, 구조화 데이터(JSON-LD) 추가, 반응형(모바일 폭 3종) 가로 스크롤 0 확인, 전체 플로우 통합 확인.

**수정 파일**:
- `frontend/app/sitemap.ts`, `frontend/app/robots.ts` (신규)
- `frontend/components/ev/policy-detail.tsx` (JSON-LD `<script>` 추가)

**테스트/완료 기준**: `/sitemap.xml`에 PUBLISHED 정책 slug만 포함(DRAFT/HIDDEN 제외) 확인. Google 리치 결과 테스트 등으로 구조화 데이터 유효성 확인(수동). `npx tsc --noEmit && npm run build` 통과. 모바일(360px)·태블릿·데스크톱 3너비에서 전기차 5개 화면 모두 가로 스크롤 없음.

### ☐ STEP 10 — 운영 배포 준비 및 최종 검증

**작업**: 운영 반영 전 점검 — Neon 적용 시점 계획(§13), 최종 데이터 재확인, CI 전체 통과 재확인, 기존 기능(커뮤니티·내 차고·모터스포츠·스팟·인증) 회귀 없는지 수동 확인.

**완료 기준**: 사용자가 "운영 반영 승인" 전까지는 **core를 Neon에 연결해 재기동하지 않는다.** 체크리스트: V8 마이그레이션 로컬 재검증, `mvn test`/`npm test` 둘 다 최신 통과, 메뉴 "전기차" 클릭부터 정책 상세·변경 타임라인까지 전체 동선 1회 실행, 관리자 화면 권한 재확인.

---

## 10. 운영 배포 시 주의사항

1. **Neon 적용 시점**: V8은 core가 Neon에 연결되어 재기동하는 순간 적용된다. STEP 1~9는 로컬 임시 Postgres로만 검증하고, STEP 10에서 사용자 승인 후에만 운영 재기동한다(§1.7, 모터스포츠·스팟과 동일 원칙).
2. `content_admin_logs_entity_type_check` 확장(ALTER)이 기존 MOTORSPORT/SPOT 로그 조회에 영향 없는지 운영 반영 직후 `/admin/motorsport`, `/admin/spots`의 로그 탭을 재확인한다.
3. 메뉴 노출(STEP 6)은 `/ev/*` 5개 페이지 + 관리자 화면이 **전부 완성된 뒤에만** 켠다 — 미완성 상태로 SOON을 해제하면 안 된다.
4. 기존 커뮤니티·차고·모터스포츠·스팟 기능, 기존 데이터, 기존 Flyway 파일(V1~V7)에는 어떤 수정도 하지 않는다(§15 지시).

---

## 11. 예상 위험 요소와 대응 방법

| 위험 | 대응 |
|---|---|
| 지시사항이 가정한 "Spring Boot API" 구조가 실제와 다름(§1.1) | 이미 이 문서에서 board-service로 바로잡음. 이후 STEP에서 "Spring" 언급이 나오면 이 문서를 기준으로 board-service로 해석 |
| 정책 콘텐츠의 사실 오류(잘못된 수치·시행일) | 출처 1개 이상 필수(publish 시 서버 강제), `status`와 `publication` 분리, 최종 확인일 상시 표시, 재확인 대기열(STEP 2 `/admin/ev/stale`) |
| 정부안을 확정 정책으로 오인 | `status=PROPOSED` 배지를 모든 화면(카드·목록·상세·변경 타임라인)에 일관되게 표시, 색상·문구 구분(디자인 토큰 재사용 범위 내에서) |
| SEO 요구사항과 기존 CSR 패턴의 충돌(§1.6) | 전기차 페이지만 SSR + `generateMetadata`로 분리, 기존 스팟·커뮤니티 페이지는 수정하지 않음 |
| 지역별 보조금 임의 추정 | DB에 지역별 수치 테이블을 만들지 않음(§3.7-1), `region_note`에 공식 조회 페이지 안내만 서술 |
| 운영 DB(Neon) 실수 적용 | 로컬 compose가 Neon을 참조하지 않음을 재확인(§1.7), STEP 10까지 재기동 보류. STEP 1 실행 검증도 **격리된 일회용 컨테이너에서만** 수행(§9 STEP 1 "향후 실행 검증 절차") |
| 콘텐츠 운영자가 변경 이력 입력을 누락 | `policy_versions` CHECK가 `CHANGE`/`CORRECTION`에서 `change_summary` 누락을 **DB 레벨로** 거부(§3.1, STEP 0 설계보다 강화됨) |
| 정책 10~15개 규모에 과설계(불필요한 테이블·필터) | §3.7에서 "관련 정책 테이블", "지역 테이블", "본문 리치 텍스트"를 명시적으로 보류 — 필요해지면 그때 마이그레이션 추가 |
| `supersedes_version_id`가 다른 정책의 버전을 가리킬 위험 | **정정(지적 2)**: 이전에는 "DB가 막지 못함"이라고 잘못 적었다 — 실제로는 `UNIQUE(policy_id, id)` + 복합 FK `(policy_id, supersedes_version_id)→policy_versions(policy_id, id)`로 DB가 직접 막는다(§3.3). 남은 위험은 "같은 정책 안에서 올바른 버전을 고르는 업무 로직"뿐이고 이건 애초에 DB가 보장할 수 없는 영역이다 |
| `content_admin_logs_action_check` 제약 이름 추정이 틀릴 가능성 | V6은 컬럼 레벨 `CHECK`라 Postgres 기본 이름 규칙을 신뢰했지만 이번이 `action` 쪽은 첫 확장이라 선례가 없음(entity_type은 V7 선례 있음) — **확정 통과로 보고하지 않는다**(지적 6), 향후 실행 검증 절차 4번에서 가장 먼저 확인 |
| `end_date` NULL을 "무기한"으로 잘못 단정했던 이전 설계 | **정정(지적 1)**: `end_date_indefinite` 컬럼으로 "확인된 무기한"과 "미확인"을 분리(§3.5). API·화면이 이 구분 없이 임의 해석하면 틀린 정보를 사용자에게 보여줄 위험이 남으므로, STEP 3·5 화면 설계에서 두 상태를 반드시 다른 문구로 표시해야 한다 |
| 정책을 통째로 비공개로 전환해도 일부 버전·출처가 공개 API에 남아 보일 위험 | **정정(지적 5)**: `policy_items.publication` 게이트를 추가해 단일 조건으로 전부 가린다(§3.6-1) — 다만 STEP 2에서 모든 공개 쿼리가 이 게이트를 **빠뜸 없이** 포함하는지가 실제 위험 지점이므로, STEP 2 코드 리뷰 때 모든 공개 엔드포인트가 이 조건을 갖고 있는지 체크리스트로 재확인해야 한다 |

---

## 12. 체크리스트 범위 밖 — 이번 STEP에서 하지 않은 것

**STEP 0**:
- 애플리케이션 코드 수정 0건, DB 마이그레이션 실행·DB 데이터 변경·Docker 재시작·운영 서버 접속·git commit/push·브랜치 변경·운영 배포 — 전부 수행하지 않음.

**STEP 1 (이번 갱신)**:
- API·화면·인증 코드 0건 작성(§4·§5는 설계 문서만 갱신, 코드 없음). `board-service/`, `frontend/` 어떤 파일도 수정하지 않았다(git status로 확인).
- DB 접속·마이그레이션 실행·실제 데이터 변경·Docker 기동/재시작·운영 서버 접속·배포·브랜치 변경·git commit/push — 전부 수행하지 않음.
- 서버 기동이나 DB 연결을 유발하는 어떤 테스트도 실행하지 않음(`mvn test`/`docker compose up` 등 전혀 실행하지 않았다 — §9 STEP 1 "향후 실행 검증 절차"는 문서화만 하고 이번 세션에서 실행하지 않았다).
- 실제 정책 수치·날짜·운영 시드 데이터를 생성하지 않음(SQL 파일에 샘플 INSERT 없음, 스키마 DDL만 있음).
- 기존 미추적 파일(`frontend/app/icon.png`, `frontend/public/apple-touch-icon.png`) 보존(git status로 변경 없음 확인).

**STEP 1 보완(이번 2차 갱신)**:
- SQL 파일과 작업 문서만 변경했다(`V8__ev_policy_hub.sql`, `MORETHANCAR_EV_TASKS.md`). API·화면 코드는 여전히 0건.
- DB 접속·Docker 기동·마이그레이션 실행·운영 서버 접속·배포·브랜치 변경·git commit/push — 전부 수행하지 않음(git status/diff로 재확인).
- API 소유권(board-service 권고안 vs Spring Boot 원 지시)을 "결정 필요" 항목으로 그대로 보존했다 — 사용자 승인이 있었다고 적지 않았다(§1.1, §4 상단 플래그 유지).
- `content_admin_logs_action_check` 등 어떤 제약도 "확정적으로 통과했다"고 보고하지 않았다 — 전부 "정적 근거 + 실행 미확인"으로 표현했다(§9 STEP 1).

**STEP 2 (이번 갱신, 공개 조회 API)**:
- 변경 파일은 `board-service/src/ev.js`(신규), `board-service/src/app.js`(2줄), `board-service/test/ev.test.js`(신규), `MORETHANCAR_EV_TASKS.md`뿐이다. `evAdminRouter`(관리자 쓰기)는 작성하지 않았고, `frontend/`·V1~V8 마이그레이션·상단 메뉴(`services.ts`)·기존 board-service 엔드포인트는 전혀 건드리지 않았다(git status/diff로 확인).
- DB 접속·마이그레이션 실행·실제 데이터 변경·Docker 기동/재시작·운영 서버 접속·배포·브랜치 변경·git commit/push — 전부 수행하지 않음.
- 실제 정책 수치·날짜는 쓰지 않았다 — 테스트 fixture는 전부 `baseVersionRow({...})` 같은 합성 더미값이다.
- `npm test`를 "통과했다"고 보고하지 않았다 — 로컬 Node 20.10 환경에서 기존 테스트 11개를 포함해 전부 실행 자체가 막혔고, 이 사실과 원인을 숨기지 않고 §9 STEP 2에 그대로 적었다.

**STEP 2 보완 + STEP 3~6 (이번 갱신)**:
- `board-service/src/ev.js`/`test/ev.test.js` 버그 수정 4건 + `/ev`·`/ev/buy`·`/ev/drive`·`/ev/changes`·`/ev/policy/[slug]` 공개 화면만 구현했다. **`/admin/ev`(관리자 기능), 실제 정책 콘텐츠 등록, 운영 배포는 이번 범위가 아니다** — 손대지 않았다.
- 전역 런타임을 바꾸지 않고 이미 로컬에 있던 Node 22(`nvm`, Homebrew `node@22`)로 `board-service` 테스트 74개를 실제로 실행해 전부 통과를 확인했다 — `npm test`가 "미실행"이 아니라 "실행해서 통과"로 바뀐 유일한 라운드다.
- DB 접속·마이그레이션 실행·Docker 기동/재시작·운영 서버 접속·배포·브랜치 변경·git commit/push — 전부 수행하지 않음(git status/diff로 재확인, `board-service/src/app.js` +3줄과 `frontend/components/common/site-header.tsx` +3줄 외에는 전부 신규 파일).
- 실제 정책 수치·데이터를 서비스 코드나 fixture 밖에 두지 않았다 — 브라우저 검증에 쓴 합성 fixture 서버는 저장소 밖 스크래치패드에만 있고, 어떤 소스 파일에도 "실제처럼 보이는 임의 샘플"을 심지 않았다.
- `lib/services.ts`는 건드리지 않았다 — 전기차 메뉴는 여전히 SOON이다(지시대로 보류).

---

### 배포 완료 (2026-10-13)

- **main**: PR #2 머지 커밋 `57d0327`. CI 통과(run 38357882057, Node/Spring 둘 다 success).
- **EC2 배포**: `54.180.254.40`(`~/rev.cc`), `git pull --ff-only` → `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait`. 전 서비스(proxy/core/board/frontend/redis/cloudflared) healthy.
- **마이그레이션**: 배포 전 Neon `flyway_schema_history`가 V7(success)인 것을 직접 쿼리로 확인(`docker exec revcc-board node`로 읽기 전용 조회). 배포 전 `pg_dump -Fc`로 백업(`~/rev.cc/backups/pre-v8-20261013-064220.dump`, 94KB)해 **실제로 별도 컨테이너에 복원까지 해 보고** users=3/board_posts=1 확인(복구 가능 확인됨). 배포 후 core 로그: `Current version of schema "public": 7` → `Migrating ... to version "8"` → `Successfully applied 1 migration ... now at version v8`. 1건만 증분 적용됨, 에러 없음.
- **롤백 준비**: 배포 전 이미지 4개를 `:pre-v8-rollback` 태그로 보존(core `f965b426cc84`/board `dedaf3d0063c`/frontend `2aca363d3370`/proxy `80756a97e4fd`), 이전 git 커밋 `59bff74`. 앱 롤백은 이 태그로 compose 재기동, DB는 이번에 되돌리지 않음(V8은 추가만 하는 마이그레이션이라 롤백 필요성 낮음, 임의로 되돌리지 말라는 지시에 따름).
- **배포 후 확인**(morethancar.kr, 실제 접속): 메인 제목 문구 반영 확인, `/admin/ev` `200`(비로그인 화면 셸만), `/api/board/admin/ev/policies` 비로그인 `401`, `/api/board/ev/policies` 공개 조회 `200`(정책 0건 — 콘텐츠 미등록, SOON 유지 확인), 없는 slug `404`, 커뮤니티 API/페이지·`/garage`·로그인 페이지 전부 `200`, HSTS 헤더 정상, proxy/core 로그에 5xx·에러 없음(최근 5분 기준).
- **미확인(계정 필요)**: 실제 MANAGER/ADMIN 로그인으로 `/admin/ev` 내부 화면 확인 — 운영 테스트 계정을 만들지 않기로 해 미실행으로 남김. 사용자가 실제 계정으로 로그인해 확인 필요.
