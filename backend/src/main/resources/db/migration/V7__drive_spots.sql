-- 와인딩·심레이싱 스팟(docs/plans/MOTORSPORT-AND-SPOTS-PLAN.md §2 V7을 기반으로 하되, 2026-10-12 지시에 따라
-- 스팟 범위를 와인딩(WINDING)·심레이싱(SIM_RACING) 2개 카테고리로 조정했다 — 계획의 "결정 2"(심레이싱 제외)는
-- 이 지시로 뒤집혔다. 조회·관리 API는 motorsport.js와 같은 방식으로 board-service가 맡는다.
-- 이번 단계는 관리자 직접 등록만 지원한다(제보·검토 대기열은 만들지 않는다. 계획의 spot_photos·
-- spot_corrections·spot_content_removals는 이번 범위가 아니다 — 대표 이미지는 URL 한 장만 관리자가 입력).

-- 스팟. category에 따라 와인딩 전용·심레이싱 전용 컬럼의 필요 여부가 달라진다(모두 nullable로 두고
-- CHECK로 카테고리별 필수값을 강제한다 — API도 같은 규칙을 다시 검증한다).
-- publication(공개 상태): motorsport_events와 같은 DRAFT → PUBLISHED ↔ HIDDEN.
CREATE TABLE drive_spots (
 id SERIAL PRIMARY KEY,
 category VARCHAR(12) NOT NULL CHECK (category IN ('WINDING','SIM_RACING')),
 name VARCHAR(100) NOT NULL CHECK (length(btrim(name)) > 0),
 region VARCHAR(100),
 address VARCHAR(300) NOT NULL CHECK (length(btrim(address)) > 0),
 latitude NUMERIC(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
 longitude NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
 description VARCHAR(2000),
 image_url VARCHAR(500) CHECK (image_url ~ '^https?://'),
 publication VARCHAR(10) NOT NULL DEFAULT 'DRAFT' CHECK (publication IN ('DRAFT','PUBLISHED','HIDDEN')),
 published_at TIMESTAMPTZ,

 -- WINDING(와인딩·드라이브 코스) 전용. 경로 기반 장소라 시작·종료 지점이 있다.
 route_start VARCHAR(100),
 route_end VARCHAR(100),
 distance_km NUMERIC(5,1) CHECK (distance_km IS NULL OR distance_km > 0),
 duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
 route JSONB,                      -- 경유지·경로 좌표 배열([{"lat":...,"lng":...}, ...]). 없으면 점 하나(주 좌표)만 지도에 표시.
 recommended_time VARCHAR(200),    -- 추천 방문 시간·계절(선택)
 caution VARCHAR(500),             -- 주의사항(선택) — 급커브·낙석·단속 구간 등. 안전 운전 안내 문구 자체는 화면 고정 문구로 둔다.

 -- SIM_RACING(심레이싱 시설) 전용. 단일 위치 기반 장소라 운영 정보가 중심이다.
 business_hours VARCHAR(200),
 official_url VARCHAR(500) CHECK (official_url IS NULL OR official_url ~ '^https?://'),
 reservation_url VARCHAR(500) CHECK (reservation_url IS NULL OR reservation_url ~ '^https?://'),
 facility_info VARCHAR(500),
 price_info VARCHAR(500),

 created_by BIGINT NOT NULL REFERENCES users(id),
 updated_by BIGINT REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ,
 deleted_at TIMESTAMPTZ,
 deleted_by BIGINT REFERENCES users(id),

 CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
 CHECK (publication = 'DRAFT' OR published_at IS NOT NULL),
 -- 카테고리별 필수값. API(spots.js)가 등록·수정 시 다시 검증하지만, 직접 DB에 잘못된 값이 들어가는 것도 막는다.
 CHECK (category <> 'WINDING' OR (route_start IS NOT NULL AND route_end IS NOT NULL)),
 CHECK (category <> 'SIM_RACING' OR business_hours IS NOT NULL)
);
-- 지도 bbox 조회(위도·경도 범위, PostGIS 없이 BETWEEN으로 충분한 규모)와 카테고리·지역 필터.
CREATE INDEX drive_spots_location ON drive_spots(latitude, longitude) WHERE deleted_at IS NULL AND publication = 'PUBLISHED';
CREATE INDEX drive_spots_category ON drive_spots(category, region) WHERE deleted_at IS NULL AND publication = 'PUBLISHED';

-- 커뮤니티 글 ↔ 스팟 연결(후기). motorsport_event_id(V6)와 같은 방식. 이번 단계는 컬럼만 추가하고
-- 글쓰기·글 상세 연결 UI는 만들지 않는다(향후 확장 대비, STEP 8).
ALTER TABLE board_posts ADD COLUMN spot_id INTEGER REFERENCES drive_spots(id) ON DELETE SET NULL;
CREATE INDEX board_posts_spot ON board_posts(spot_id, id DESC) WHERE spot_id IS NOT NULL;

-- content_admin_logs(V6)의 entity_type 체크를 SPOT까지 넓힌다. V6는 수정하지 않고 ALTER로 확장한다.
ALTER TABLE content_admin_logs DROP CONSTRAINT content_admin_logs_entity_type_check;
ALTER TABLE content_admin_logs ADD CONSTRAINT content_admin_logs_entity_type_check
 CHECK (entity_type IN ('MOTORSPORT_SERIES','MOTORSPORT_VENUE','MOTORSPORT_EVENT','SPOT'));
-- action은 기존 체크(CREATE/UPDATE/PUBLISH/HIDE/VERIFY/DELETE/RESTORE)를 그대로 쓴다(스팟은 VERIFY를 쓰지 않을 뿐).
