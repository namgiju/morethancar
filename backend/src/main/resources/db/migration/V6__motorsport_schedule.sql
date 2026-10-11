-- 모터스포츠 일정 1단계(docs/plans/MOTORSPORT-AND-SPOTS-PLAN.md §2 V6). 조회·관리 API는 board-service가 맡는다.
-- 기존 테이블에는 board_posts에 nullable 컬럼 하나만 더한다(기존 글·회원 데이터는 바뀌지 않는다).
--
-- 날짜·시간대 규칙
--  - starts_on/ends_on: 개최지 현지 날짜(주최 측 공식 일정에 적힌 날짜). 개최지 시간대는 motorsport_venues.timezone.
--  - starts_at: 시각이 공개된 경우에만 저장하는 절대 시각(TIMESTAMPTZ, UTC 저장). 화면이 KST·현지 시각으로 바꿔 보여 준다.
--  - verified_on: 운영자가 공식 출처에서 마지막으로 확인한 날(KST 날짜). 미래 날짜 거부는 API가 한다(CHECK에 now()를 쓸 수 없음).

-- 회원 역할: USER < MANAGER(콘텐츠 운영자) < ADMIN. 지금까지 role에는 허용값 제약이 없었다(USER/ADMIN만 쓰임).
-- NOT VALID: 새로 쓰는 값만 검사하고 기존 행은 검사하지 않는다(운영 DB에 예상 밖의 값이 있어도 마이그레이션이 실패하지 않게).
-- 기존 행 확인 후 VALIDATE CONSTRAINT는 별도로 한다. 기존 권한 검사는 모두 role='ADMIN' 비교라 MANAGER는 기존 관리 기능을 얻지 않는다.
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('USER','MANAGER','ADMIN')) NOT VALID;

-- 대회 시리즈(F1, WEC, 슈퍼레이스 등). 스포츠주행일처럼 시리즈가 없는 일정도 있다.
CREATE TABLE motorsport_series (
 id SERIAL PRIMARY KEY,
 code VARCHAR(40) NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9-]*$'),
 name VARCHAR(100) NOT NULL,
 scope VARCHAR(15) NOT NULL CHECK (scope IN ('DOMESTIC','INTERNATIONAL')),
 official_url VARCHAR(500) CHECK (official_url ~ '^https?://'),
 active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ
);

-- 서킷·경기장. timezone은 IANA 이름(예: Asia/Seoul). 실제 이름 검증은 API가 하고 여기서는 형식만 막는다.
CREATE TABLE motorsport_venues (
 id SERIAL PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 country CHAR(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
 region VARCHAR(100),
 timezone VARCHAR(64) NOT NULL CHECK (timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$'),
 official_url VARCHAR(500) CHECK (official_url ~ '^https?://'),
 latitude NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
 longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
 active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ,
 CHECK ((latitude IS NULL) = (longitude IS NULL))
);

-- 일정. 공식 출처(source_url·source_name)와 마지막 확인일(verified_on)은 필수다.
-- publication(공개 상태): DRAFT(작성 중) → PUBLISHED(공개) ↔ HIDDEN(비공개). 공개 API는 PUBLISHED이고 삭제되지 않은 일정만 보여 준다.
-- status(진행 상태)는 주최 측 일정의 상태로, 공개 상태와 따로 관리한다. 취소된 일정은 지우지 않고 status=CANCELLED로 둔다.
-- 삭제는 소프트 삭제(deleted_at, ADMIN 전용)라 연결된 후기 글이 끊기지 않는다.
CREATE TABLE motorsport_events (
 id SERIAL PRIMARY KEY,
 series_id INTEGER REFERENCES motorsport_series(id),
 venue_id INTEGER NOT NULL REFERENCES motorsport_venues(id),
 kind VARCHAR(10) NOT NULL CHECK (kind IN ('RACE','TRACK_DAY','EVENT')),
 title VARCHAR(150) NOT NULL CHECK (length(btrim(title)) > 0),
 starts_on DATE NOT NULL,
 ends_on DATE NOT NULL,
 starts_at TIMESTAMPTZ,
 status VARCHAR(10) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','TENTATIVE','CHANGED','CANCELLED')),
 publication VARCHAR(10) NOT NULL DEFAULT 'DRAFT' CHECK (publication IN ('DRAFT','PUBLISHED','HIDDEN')),
 published_at TIMESTAMPTZ,
 source_url VARCHAR(500) NOT NULL CHECK (source_url ~ '^https?://'),
 source_name VARCHAR(100) NOT NULL CHECK (length(btrim(source_name)) > 0),
 verified_on DATE NOT NULL,
 verified_by BIGINT NOT NULL REFERENCES users(id),
 note VARCHAR(500),
 created_by BIGINT NOT NULL REFERENCES users(id),
 updated_by BIGINT REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ,
 deleted_at TIMESTAMPTZ,
 deleted_by BIGINT REFERENCES users(id),
 CHECK (ends_on >= starts_on AND ends_on - starts_on <= 31),
 CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
 -- published_at: 처음 공개한 시각. 공개된 적 없는 초안에는 없다.
 CHECK (publication = 'DRAFT' OR published_at IS NOT NULL)
);
-- 기간 겹침 조회(ends_on >= from AND starts_on <= to)와 재확인 대기열(verified_on 오래된 순).
CREATE INDEX motorsport_events_dates ON motorsport_events(starts_on, ends_on) WHERE deleted_at IS NULL AND publication = 'PUBLISHED';
CREATE INDEX motorsport_events_series ON motorsport_events(series_id, starts_on) WHERE deleted_at IS NULL;
CREATE INDEX motorsport_events_verified ON motorsport_events(verified_on) WHERE deleted_at IS NULL;

-- 커뮤니티 글 ↔ 일정 연결(후기). vehicle_id와 같은 방식. 연결 UI·API는 4단계에서 만든다.
ALTER TABLE board_posts ADD COLUMN motorsport_event_id INTEGER REFERENCES motorsport_events(id) ON DELETE SET NULL;
CREATE INDEX board_posts_motorsport_event ON board_posts(motorsport_event_id, id DESC) WHERE motorsport_event_id IS NOT NULL;

-- 운영자(MANAGER·ADMIN)의 콘텐츠 변경 감사 로그(일정·시리즈·장소, 이후 스팟). 누가(actor_id·당시 역할), 무엇을
-- (entity_type·entity_id), 어떤 작업을(action), 언제(created_at) 했는지와 변경 전후 행(JSON)을 남긴다.
-- moderation_logs는 글·댓글 삭제 전용이라 따로 둔다. 새 대상 종류는 이후 마이그레이션에서 CHECK를 넓힌다.
CREATE TABLE content_admin_logs (
 id BIGSERIAL PRIMARY KEY,
 entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('MOTORSPORT_SERIES','MOTORSPORT_VENUE','MOTORSPORT_EVENT')),
 entity_id BIGINT NOT NULL,
 action VARCHAR(10) NOT NULL CHECK (action IN ('CREATE','UPDATE','PUBLISH','HIDE','VERIFY','DELETE','RESTORE')),
 before JSONB,
 after JSONB,
 reason VARCHAR(500),
 actor_id BIGINT NOT NULL REFERENCES users(id),
 actor_role VARCHAR(10) NOT NULL CHECK (actor_role IN ('MANAGER','ADMIN')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX content_admin_logs_entity ON content_admin_logs(entity_type, entity_id, id DESC);
CREATE INDEX content_admin_logs_actor ON content_admin_logs(actor_id, id DESC);
