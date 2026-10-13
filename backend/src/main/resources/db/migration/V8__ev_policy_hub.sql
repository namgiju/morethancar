-- 전기차 정책·정보 허브(MORETHANCAR_EV_TASKS.md §3). 조회·관리 API는 board-service가 맡을 예정이다
-- (V6/V7과 같은 방식 — 이 전제는 아직 사용자 승인을 받지 않은 권고안이다. 원래 지시는 Spring Boot
-- API를 가정했고, 이 마이그레이션 자체는 그 결정과 독립적으로 유효하다 — API 소유 서비스가
-- 무엇이든 이 스키마는 그대로 쓸 수 있다. JPA 엔티티는 만들지 않는다, motorsport_events/drive_spots와 동일).
--
-- 이 파일은 아직 어떤 DB에도 적용되지 않았고 커밋되지 않은 신규 마이그레이션이다(git 미추적).
-- Flyway 규칙상 "이미 커밋된 파일은 수정하지 않는다"는 적용된·공유된 파일에 대한 것이고, 이
-- 파일은 아직 거기 해당하지 않으므로 STEP 1 보완 과정에서 이 파일 자체를 직접 고쳤다(V9를
-- 새로 만들지 않음). V1~V7은 이번에도 손대지 않았다.
--
-- 설계 개요(상세 근거는 MORETHANCAR_EV_TASKS.md §3)
--  - policy_items: 정책의 영구 식별자(slug)·분류·전국/지역 구분·"정책 전체 공개 게이트"만 갖는다.
--    "지금 어떤 내용인지"는 들고 있지 않는다 — 그건 policy_versions의 몫이다(아래 이유 참고).
--  - policy_versions: 정책 내용의 스냅샷 1건 = 1행. "현재 적용 내용"과 "미래 변경(예정)"이
--    동시에 존재해야 하므로, 시행 상태·검증 상태·공개 상태·시행일·종료일을 모두 policy_items가
--    아니라 이 테이블에 둔다. is_current는 "지금 목록·상세 화면에 대표로 보여줄 버전"을 가리키는
--    표시용 선택이며, "법적으로 지금 시행 중"이라는 뜻과는 다르다(아래 "is_current의 정의" 참고
--    — 최초 등록이 PROPOSED이거나 정책이 EXPIRED여도 그 버전이 is_current가 되어 정책을 계속
--    목록·상세에서 찾을 수 있게 한다).
--  - policy_sources: 출처는 정책이 아니라 "그 버전"에 연결한다 — 나중에 출처를 고쳐도 이미
--    공개됐던 과거 버전이 가리키는 근거는 바뀌지 않는다(출처 행 자체를 UPDATE하지 않고, 이미
--    한 번이라도 공개됐던 버전에는 출처를 더 추가하지도 않는다 — 아래 "SQL 제약 vs API 책임" 참고).
--  - content_admin_logs(V6)는 "누가 언제 무엇을 바꿨는가"의 내부 감사 기록이고, policy_versions는
--    "정책 내용이 실제로 어떻게 바뀌었는가"를 사용자에게 보여주는 이력이다 — 역할이 다르므로
--    둘 다 둔다. entity_type을 POLICY(정책 항목 단위 작업)·POLICY_VERSION(버전 단위 작업)으로
--    나눠 확장한다.
--
-- "정책 전체 공개 게이트"(policy_items.publication)와 "버전 공개 상태"(policy_versions.publication)의
-- 역할 구분: 정책이 공개 화면 어디에든(상세·목록·타임라인·sitemap) 나타나려면 **둘 다** 공개여야
-- 한다 — policy_items.publication='PUBLISHED'(이 정책 자체를 노출할지)이고, 그 안의 개별 버전도
-- publication='PUBLISHED'(그 버전 내용이 보여줄 준비가 됐는지)여야 한다. 정책 전체를 잠깐
-- 내리고 싶을 때(예: 내용 전반을 재검토하는 동안) 버전을 하나하나 비공개로 바꾸지 않고
-- policy_items 쪽 게이트 하나만 HIDDEN으로 바꾸면 그 정책의 과거·현재·미래 버전과 출처 전부가
-- 한 번에 공개 API·상세·타임라인·sitemap에서 보이지 않게 된다(새로운 쿼리 조건 하나만 추가하면
-- 되므로 "버전 하나를 깜빡하고 숨기지 않아 새어나오는" 위험이 없다).
--
-- is_current의 정의(혼동 방지): is_current=true는 "이 버전이 법적으로 지금 시행 중"이라는 뜻이
-- 아니라 "이 정책을 조회했을 때 대표로 보여줄 버전"이라는 뜻이다. 그래서 상태가 PROPOSED이거나
-- EXPIRED인 버전도 is_current가 될 수 있다(그래야 정책이 아직 확정 전이거나 이미 끝났어도
-- 목록·상세에서 탐색 가능하다는 요구를 만족한다). 다만 DRAFT(한 번도 공개된 적 없는 내용)나
-- 취소된 버전은 대표로 보여줄 수 없다(아래 CHECK).
--
-- 상세 페이지 조회 규칙(문서화, 쿼리는 STEP 2에서 구현): /ev/policy/{slug}는 (1) is_current
-- 버전의 전체 내용, (2) 같은 정책의 publication='PUBLISHED'이고 is_current=false이고
-- cancelled_at이 NULL인 버전들("공개된 예정 변경" — 미래 SCHEDULED/PROPOSED 변경을 여기서도
-- 보여준다, 타임라인에만 몰아넣지 않는다), (3) 전체 버전 이력(CORRECTION 포함, 취소된 버전
-- 포함 — 이력에서는 지우지 않는다)을 모두 반환해야 한다. "다가오는 변경/D-day" 요약(메인·상세
-- 공용)은 (2)에서 cancelled_at이 NULL이고 effective_date가 있는 것만 추려서 계산한다 — 취소된
-- 변경은 이력에는 남지만 D-day 계산에서는 제외한다.
--
-- 이번 범위에서 만들지 않는 것(과설계 방지 — MORETHANCAR_EV_TASKS.md §3.7과 동일 결론)
--  - 지역 마스터 테이블: policy_items.scope/region_note(평문)로 대체.
--  - 관련 정책 연결 테이블: 같은 category의 공개 정책을 조회하는 API로 대체(후속 STEP).
--
-- 날짜 규칙 — NULL의 의미를 단정하지 않는다(중요한 정정)
--  - DATE 컬럼(effective_date, end_date, announced_on, last_verified_on, checked_on)은 모두
--    "정책 기준일"이며 KST 달력 날짜다(motorsport_events.starts_on/ends_on과 같은 규칙, 시간대 변환 없음).
--  - end_date는 포함 종료일이다 — 그 날까지 적용되고 다음 날부터 적용되지 않는다.
--  - **end_date가 NULL이라는 것은 "종료일 정보가 없다"는 뜻일 뿐, "무기한"을 보장하지 않는다.**
--    종료일을 아직 조사하지 못했을 수도 있고, 공식적으로 "종료일 없이 계속 운영한다"고 확인된
--    경우도 있을 수 있다 — 이 둘은 다른 사실이므로 end_date_indefinite 컬럼으로 명시적으로
--    구분한다(아래). API·화면은 이 구분 없이 "end_date가 NULL이면 무기한"이라고 임의로
--    해석해서는 안 된다.
--  - effective_date가 NULL이면 "시행일 미정"이다(아직 확정되지 않았거나 조사되지 않음) —
--    end_date처럼 "확정된 무기한" 같은 대응 개념이 없으므로 별도 컬럼을 추가하지 않는다.
--  - TIMESTAMPTZ 컬럼(created_at/updated_at/published_at/cancelled_at)은 "이 시스템에 언제
--    기록됐는가"의 감사용 시각이며 정책 기준일과 혼동하지 않는다(공식 발표일 announced_on,
--    실제 시행일 effective_date, 등록·수정 시각 created_at/updated_at을 각각 별도 컬럼으로 분리).

-- 정책 항목(영구 식별자). 연도 없는 slug를 그대로 유지한다(motorsport_series.code와 같은 규칙).
CREATE TABLE policy_items (
 id SERIAL PRIMARY KEY,
 slug VARCHAR(80) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
 category VARCHAR(10) NOT NULL CHECK (category IN ('BUY','DRIVE')),   -- /ev/buy, /ev/drive 매핑
 -- 전국 공통/지역 한정 구분. 지역 마스터 테이블 없이 평문 설명만 둔다 — 지역별 수치를 구조화해
 -- 임의로 계산·추정하지 않는다는 원칙을 스키마로도 강제한다.
 scope VARCHAR(10) NOT NULL DEFAULT 'NATIONAL' CHECK (scope IN ('NATIONAL','REGIONAL')),
 region_note VARCHAR(300),   -- REGIONAL일 때 지역·조건 설명(예: "지자체별 조례로 상이, 관할 시·군 공고 확인")
 title VARCHAR(150) NOT NULL CHECK (length(btrim(title)) > 0),
 featured BOOLEAN NOT NULL DEFAULT false,   -- 메인 "주요 정책" 카드 노출(버전이 아니라 정책 단위 편집 플래그)

 -- 정책 전체 공개 게이트(이번 보완에서 추가). 버전별 publication과 별도 축이다(위 설명 참고).
 -- 공개 화면에 이 정책이 나타나려면 이것도 PUBLISHED여야 한다 — 그래야 특정 버전을 깜빡하고
 -- 숨기지 않아도 정책 전체를 한 번에 내릴 수 있다.
 publication VARCHAR(10) NOT NULL DEFAULT 'DRAFT' CHECK (publication IN ('DRAFT','PUBLISHED','HIDDEN')),
 published_at TIMESTAMPTZ,

 created_by BIGINT NOT NULL REFERENCES users(id),
 updated_by BIGINT REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ,
 deleted_at TIMESTAMPTZ,
 deleted_by BIGINT REFERENCES users(id),
 CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
 -- 지역 한정인데 설명이 비어 있거나 공백뿐인 경우를 막는다(IS NOT NULL만으로는 공백 문자열을
 -- 걸러내지 못한다 — length(btrim(...))>0을 반드시 같이 써야 한다. btrim(NULL)은 NULL이고
 -- Postgres CHECK는 NULL 결과를 "통과"로 취급하므로, IS NOT NULL을 빼면 이 CHECK는 NULL
 -- region_note를 조용히 허용해 버린다).
 CHECK (scope = 'NATIONAL' OR (region_note IS NOT NULL AND length(btrim(region_note)) > 0)),
 CHECK (publication = 'DRAFT' OR published_at IS NOT NULL)
);
CREATE INDEX policy_items_category ON policy_items(category) WHERE deleted_at IS NULL;

-- 정책 버전(내용 스냅샷). "현재 적용 내용"과 "미래 변경안"이 동시에 존재하는 핵심 장치.
-- is_current=true인 행이 목록·상세 화면의 대표 버전이다(법적 "지금 시행 중"과는 다른 뜻, 위 설명 참고).
CREATE TABLE policy_versions (
 id SERIAL PRIMARY KEY,
 policy_id INTEGER NOT NULL REFERENCES policy_items(id) ON DELETE CASCADE,
 version_no INTEGER NOT NULL CHECK (version_no > 0),   -- 정책별 1부터 증가하는 버전 번호(표시용)
 -- 정책 변경과 단순 오탈자 수정을 구분한다. INITIAL=최초 등록, CHANGE=실제 정책 변경,
 -- CORRECTION=이미 등록된 내용의 오탈자·표기 수정(제도 자체는 바뀌지 않음). 셋 다 새 행으로
 -- 쌓는다(기존 행을 고치지 않는다 — "변경 이력은 누적 보존") — CORRECTION도 append-only다.
 revision_kind VARCHAR(10) NOT NULL CHECK (revision_kind IN ('INITIAL','CHANGE','CORRECTION')),
 -- 이 버전이 대체하려는 버전. INITIAL은 대체할 버전이 없다. 아래 복합 FK가 "같은 policy_id의
 -- 버전만" 가리킬 수 있게 강제하고, CHECK(< id)가 자기참조·순환·미래 버전 참조를 전부 막는다
 -- (둘 다 DB 레벨 보장 — 이전 설계에서 "DB가 못 막는다"고 적었던 부분을 이번에 바로잡았다, 아래 참고).
 supersedes_version_id INTEGER,

 -- 내용 스냅샷(모두 평문 — 계산기·범용 CMS로 확대하지 않는다. 섹션형 리치 텍스트 없음).
 summary VARCHAR(300) NOT NULL CHECK (length(btrim(summary)) > 0),       -- 카드·목록 한 줄 요약
 key_points VARCHAR(2000) NOT NULL CHECK (length(btrim(key_points)) > 0),-- 핵심 내용 요약
 target VARCHAR(300) NOT NULL CHECK (length(btrim(target)) > 0),         -- 적용 대상
 benefit VARCHAR(2000) NOT NULL CHECK (length(btrim(benefit)) > 0),      -- 지원 내용·혜택
 how_to_apply VARCHAR(1000) NOT NULL CHECK (length(btrim(how_to_apply)) > 0), -- 신청 또는 이용 방법
 note VARCHAR(500),                                                     -- 보충 설명(선택, 평문)

 -- 시행 상태(정책 자체 상태) — 공개 상태·검증 상태와 분리. 자동 전환 없음(날짜가 지나도
 -- 시스템이 바꾸지 않는다 — 스케줄러·배치를 만들지 않았다. 아래 CHECK는 "저장 가능한 조합"만
 -- 제한하는 정적 규칙이고, "언제 바꾸는가"는 여전히 운영자의 명시적 작업이다).
 status VARCHAR(10) NOT NULL CHECK (status IN ('ACTIVE','SCHEDULED','PROPOSED','EXPIRED')),
 -- 변경 확정 여부. PROPOSED(정부안·입법예고)는 정의상 미확정이고, 그 외 상태(ACTIVE/SCHEDULED/
 -- EXPIRED)는 공식 확정 근거가 있어야 그 상태로 저장할 수 있다 — 이 관계는 결정론적이라
 -- (PROPOSED ⟺ 미확정) 두 컬럼이 서로 모순되는 조합을 CHECK로 직접 막는다(이전 설계는 이
 -- 모순을 막지 않았다 — 이번 보완에서 추가).
 change_confirmed BOOLEAN NOT NULL,
 announced_on DATE,     -- 공식 발표일(없으면 NULL. effective_date·created_at과 혼동하지 않음)
 effective_date DATE,   -- 시행일(미정이면 NULL)
 end_date DATE,         -- 종료일. NULL은 "정보 없음"일 뿐 무기한을 뜻하지 않는다(위 날짜 규칙 설명).
 -- 공식 근거로 "종료일이 없다(무기한)"고 확인된 경우에만 true로 둔다. false인데 end_date도
 -- NULL이면 "종료일 미확인"(단순히 모름)이라는 뜻이고, 이 둘을 API·화면에서 같은 것으로
 -- 취급해서는 안 된다(이번 보완에서 추가한 컬럼 — end_date NULL=무기한이라는 단정을 바로잡음).
 end_date_indefinite BOOLEAN NOT NULL DEFAULT false,

 -- 검증 상태 — 공개 상태와 독립적으로 관리한다. 확인일을 갱신한다고 자동으로 VERIFIED가
 -- 되지 않는다 — verification_status는 운영자가 명시적으로 바꿔야 한다(API 책임, 아래 참고).
 verification_status VARCHAR(10) NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('VERIFIED','UNVERIFIED')),
 last_verified_on DATE,
 verified_by BIGINT REFERENCES users(id),

 -- 공개 상태(이 버전 자체) — 스팟·모터스포츠와 같은 체계. 정책 전체 게이트(policy_items.publication)와는
 -- 별도 축이다(파일 상단 설명 참고). 미확인 정보는 공개하지 않는다: 공식적으로 확인된 정부안
 -- (PROPOSED + VERIFIED)은 공개할 수 있지만, UNVERIFIED는 공개할 수 없다.
 publication VARCHAR(10) NOT NULL DEFAULT 'DRAFT' CHECK (publication IN ('DRAFT','PUBLISHED','HIDDEN')),
 published_at TIMESTAMPTZ,

 -- 이 버전이 지금 목록·상세 화면의 "대표 버전"인지(법적으로 "지금 시행 중"이라는 뜻이 아니다 —
 -- 파일 상단 "is_current의 정의" 참고). 정부안 시행 예정일이 지나도 이 값은 저절로 바뀌지
 -- 않는다 — 운영자가 공식 근거를 확인한 뒤 명시적으로 승격한다(PROMOTE 작업).
 is_current BOOLEAN NOT NULL DEFAULT false,

 -- 취소되거나 대체된 예정 변경의 보존. 행을 지우지 않고 취소 시각·사유만 남긴다. 이력에는
 -- 남지만 "다가오는 변경/D-day" 조회에서는 cancelled_at IS NOT NULL인 행을 제외한다(API 책임).
 cancelled_at TIMESTAMPTZ,
 cancellation_note VARCHAR(500),

 -- 운영자가 쓰는 "무엇이 왜 바뀌었는지"(INITIAL 등록 사유는 선택, CHANGE·CORRECTION은 필수 —
 -- 비워 두고 저장하는 "조용한 수정"을 막는다. 이전/이후 전체 내용은 supersedes_version_id로
 -- 이전 행을 그대로 조회해 비교하므로 여기 다시 옮겨 적지 않는다).
 change_summary VARCHAR(500),

 created_by BIGINT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_by BIGINT REFERENCES users(id),
 updated_at TIMESTAMPTZ,

 UNIQUE (policy_id, version_no),
 -- 복합 FK의 참조 대상이 되려면 (policy_id, id)가 유니크해야 한다. id는 이미 PK로 전역
 -- 유니크하므로 이 제약은 추가로 (policy_id, id) 조합도 유니크하다고 선언하는 것뿐이고,
 -- 바로 아래 복합 FK가 이 조합을 참조한다.
 UNIQUE (policy_id, id),
 -- "다른 정책의 버전을 현재 버전으로 지정" 문제와 같은 종류의 문제를, supersedes_version_id에도
 -- 적용한다: supersedes_version_id가 가리키는 행은 반드시 **같은 policy_id**를 가져야 한다.
 -- 복합 FK (policy_id, supersedes_version_id) → policy_versions(policy_id, id)로 강제한다 —
 -- 이전 설계는 "DB가 policy_id 일치까지 검사하지 못한다"고 적었는데, 이 복합 FK로 바로잡았다.
 -- supersedes_version_id가 NULL이면(INITIAL) 복합 FK는 검사되지 않는다(FK 컬럼 중 하나라도
 -- NULL이면 MATCH SIMPLE 규칙상 자동으로 통과 — PostgreSQL 기본 동작).
 FOREIGN KEY (policy_id, supersedes_version_id) REFERENCES policy_versions(policy_id, id),
 CHECK (end_date IS NULL OR effective_date IS NULL OR end_date >= effective_date),
 -- "무기한"을 주장하면서 동시에 "이미 종료됨"일 수는 없다(논리적으로 모순).
 CHECK (NOT end_date_indefinite OR status <> 'EXPIRED'),
 CHECK (publication = 'DRAFT' OR published_at IS NOT NULL),
 -- 미확인 정보는 공개하지 않는다 — DB 레벨로 강제.
 CHECK (publication <> 'PUBLISHED' OR verification_status = 'VERIFIED'),
 -- ACTIVE/SCHEDULED/EXPIRED(= PROPOSED가 아닌 모든 상태)는 "공식적으로 확정됐다"는 뜻이므로,
 -- 공개 여부와 무관하게 검증을 거치지 않은 채 이 상태로 저장할 수 없다(이번 보완에서 추가 —
 -- 이전에는 publish할 때만 검증을 요구했는데, 이 요구는 공개 여부와 무관하게 적용돼야 한다).
 CHECK (status = 'PROPOSED' OR verification_status = 'VERIFIED'),
 -- change_confirmed와 status의 모순을 막는다: PROPOSED면 반드시 미확정(false), 그 외 상태면
 -- 반드시 확정(true). 이 관계는 결정론적이므로 둘 다 두되 서로 어긋나는 값을 저장할 수 없게 한다.
 CHECK (change_confirmed = (status <> 'PROPOSED')),
 -- DRAFT는 "대표 버전"이 될 수 없다(아직 아무에게도 보여준 적 없는 내용을 대표로 쓸 수 없음).
 CHECK (NOT is_current OR publication = 'PUBLISHED'),
 -- 취소된 버전은 대표 버전이 될 수 없다(이번 보완에서 추가 — 이전 설계는 이 조합을 막지 않았다).
 CHECK (NOT is_current OR cancelled_at IS NULL),
 -- VERIFIED면 확인일·확인자가 반드시 있어야 한다(확인일만 갱신해 검증된 것으로 취급하는 것을
 -- 막는 1차 방어선 — "명시적 확인 행위"가 있었다는 최소한의 증거를 강제한다).
 CHECK (verification_status = 'UNVERIFIED' OR (last_verified_on IS NOT NULL AND verified_by IS NOT NULL)),
 CHECK ((cancelled_at IS NULL) = (cancellation_note IS NULL)),
 CHECK (cancellation_note IS NULL OR length(btrim(cancellation_note)) > 0),
 -- INITIAL은 대체할 버전이 없고, CHANGE·CORRECTION은 반드시 있어야 한다.
 CHECK ((revision_kind = 'INITIAL') = (supersedes_version_id IS NULL)),
 -- 자기참조·순환·미래 버전 참조를 한 번에 막는다: 대체하려는 버전은 항상 "이미 존재하는(=더
 -- 작은 id를 가진)" 버전이어야 한다. 이 스키마는 policy_versions 행을 삭제하지 않으므로 id는
 -- 삽입 순서와 그대로 일치하고, 모든 supersedes 관계가 "더 작은 id만 가리킨다"는 이 하나의
 -- 부등식만으로 순환(A→B→A 같은 고리)이 구조적으로 불가능해진다 — 그래프의 모든 변이 id가
 -- 감소하는 방향으로만 나 있으면 고리가 생길 수 없다(엄격한 부분순서). 자기참조(=id)도 같은
 -- 조건으로 막힌다. "다른 정책의 버전 참조" 금지는 위 복합 FK가 맡는다 — 이 CHECK는 같은
 -- 정책 안에서의 순서만 본다.
 CHECK (supersedes_version_id IS NULL OR supersedes_version_id < id),
 -- CHANGE·CORRECTION은 변경 요약 없이 저장할 수 없다("조용한 수정" 방지, DB 레벨 강제).
 CHECK (revision_kind = 'INITIAL' OR (change_summary IS NOT NULL AND length(btrim(change_summary)) > 0))
);
-- 정책마다 "대표 버전"은 최대 1개. 다른 정책의 버전을 대표 버전으로 잘못 지정하는 문제는 이
-- 설계 자체로 방지된다 — is_current가 부모를 가리키는 포인터가 아니라 자식 행의 플래그이므로
-- policy_id가 항상 그 행 자신의 것과 일치한다(상위에서 다른 정책의 version_id를 잘못 대입할
-- 여지 자체가 없음).
CREATE UNIQUE INDEX policy_versions_one_current ON policy_versions(policy_id) WHERE is_current;
CREATE INDEX policy_versions_policy ON policy_versions(policy_id, version_no DESC);
-- /ev/changes 타임라인(시행 예정·최근 시행·종료 예정·종료 필터)과 메인/상세의 "곧 달라지는 정책".
CREATE INDEX policy_versions_timeline ON policy_versions(effective_date) WHERE publication = 'PUBLISHED';
-- 재확인 대기열(모터스포츠 verified_on 패턴과 동일 개념).
CREATE INDEX policy_versions_verified ON policy_versions(last_verified_on) WHERE publication = 'PUBLISHED';
CREATE INDEX policy_versions_supersedes ON policy_versions(supersedes_version_id);

-- 공식 출처. 정책이 아니라 "버전"에 연결한다 — 버전마다 그 시점에 확인한 근거를 남긴다.
-- 과거 출처가 바뀌지 않도록, 이미 만들어진 출처 행의 url/publisher/title/checked_on은 API가
-- 수정 엔드포인트를 제공하지 않는다(새 출처 행을 추가하는 방식만 허용). 그리고 **이미 한 번이라도
-- 공개됐던 버전(published_at IS NOT NULL)에는 출처를 추가로 붙이지도 않는다** — 그렇게 하면
-- "이미 공개돼 있던 근거"가 조용히 늘어나 보여 마치 처음부터 그 근거로 공개됐던 것처럼 보일 수
-- 있기 때문이다. 근거가 보강되면 새 CHANGE/CORRECTION 버전을 만들고 그 버전에 출처를 단다
-- (DB는 UPDATE·사후 INSERT 자체를 막지 못한다 — 이 규칙 전체가 API 트랜잭션 책임, 아래
-- "SQL 제약 vs API 책임" 참고).
CREATE TABLE policy_sources (
 id SERIAL PRIMARY KEY,
 policy_version_id INTEGER NOT NULL REFERENCES policy_versions(id) ON DELETE CASCADE,
 publisher VARCHAR(100) NOT NULL CHECK (length(btrim(publisher)) > 0),  -- 발행 기관(예: 환경부, 한국도로공사)
 title VARCHAR(200) NOT NULL CHECK (length(btrim(title)) > 0),          -- 출처 자료명
 url VARCHAR(500) NOT NULL CHECK (url ~ '^https?://'),
 checked_on DATE NOT NULL,         -- 확인일(정책 기준일, KST)
 checked_by BIGINT NOT NULL REFERENCES users(id),  -- 확인자
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX policy_sources_version ON policy_sources(policy_version_id);

-- content_admin_logs(V6)의 entity_type·action 체크를 넓힌다. V6/V7 파일은 수정하지 않는다
-- (ALTER로만 확장 — V7이 SPOT을 추가할 때 쓴 것과 같은 방식).
-- POLICY: policy_items 단위 작업(등록·전체 공개 게이트 전환·삭제·복원). POLICY_VERSION:
-- policy_versions 단위 작업(버전 등록·공개·비공개·확인·승격·취소).
--
-- 정적 근거(실행으로 확인한 것이 아님 — STEP 1 문서의 "향후 실행 검증 절차"에서 실제 확인 필요):
-- V6의 entity_type·action 컬럼은 둘 다 "컬럼 선언에 바로 붙은 CHECK"(테이블 레벨에 따로 이름
-- 붙여 선언한 게 아님)다. PostgreSQL은 이런 이름 없는 단일 컬럼 CHECK에 `<테이블명>_<컬럼명>_check`
-- 규칙으로 제약 이름을 자동 생성한다(해당 이름이 아직 테이블에 없을 때). entity_type 쪽
-- (`content_admin_logs_entity_type_check`)은 V7이 이미 같은 방식으로 DROP/ADD에 성공했고
-- V7은 커밋되어 main에 있다(병합 조건인 CI `mvn test`가 그 DROP CONSTRAINT 문장을 실행했다는
-- 뜻이므로 이름이 맞았다는 간접적 실행 증거가 이미 있다). action 쪽(`content_admin_logs_action_check`)은
-- 이번이 처음 확장하는 것이라 같은 규칙으로 이름을 추정했을 뿐, 실제로 그 이름이 맞는지 확인한
-- 적은 없다 — 이 ALTER 문장이 실제 DB에서 성공하는지는 격리된 일회용 PostgreSQL에서 먼저
-- 확인해야 한다(STEP 2 착수 전 전제 조건으로 문서에 남김).
ALTER TABLE content_admin_logs DROP CONSTRAINT content_admin_logs_entity_type_check;
ALTER TABLE content_admin_logs ADD CONSTRAINT content_admin_logs_entity_type_check
 CHECK (entity_type IN ('MOTORSPORT_SERIES','MOTORSPORT_VENUE','MOTORSPORT_EVENT','SPOT','POLICY','POLICY_VERSION'));
-- CANCEL(예정 변경 취소)·PROMOTE(버전을 대표 버전으로 승격)를 기존 동작 목록에 추가한다.
ALTER TABLE content_admin_logs DROP CONSTRAINT content_admin_logs_action_check;
ALTER TABLE content_admin_logs ADD CONSTRAINT content_admin_logs_action_check
 CHECK (action IN ('CREATE','UPDATE','PUBLISH','HIDE','VERIFY','DELETE','RESTORE','CANCEL','PROMOTE'));
