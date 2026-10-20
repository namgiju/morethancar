-- 모터스포츠 공식 일정 자동 수집(board-service src/motorsport-import). 기존 일정·장소 테이블에 nullable 컬럼만 더한다
-- (기존 행과 운영자 등록 흐름은 바뀌지 않는다). 수집기는 새 일정을 항상 DRAFT로 넣고, 공개는 운영자가 한다.
--
--  - source_key: 출처의 안정 식별자(예: f1:1297, nascar:5631). 날짜·제목이 바뀌어도 같은 일정으로 찾는다.
--    삭제된 행도 포함해 유일하다 — 운영자가 삭제한 일정을 수집기가 다시 만들지 않는다.
--  - source_snapshot: 수집기가 마지막으로 반영한(또는 운영자가 확인한) 출처 값. 현재 행과 다르면 운영자가 고친 값이다.
--  - source_latest: 마지막 수집에서 읽은 출처 값. snapshot과 다르면 운영자 수정과 충돌해 반영하지 못한 변경이
--    있다는 뜻이며 재확인 대기열에 올라간다. 운영자가 확인(verify)하면 snapshot을 latest로 맞춘다.
--  - source_checked_at: 출처에서 이 일정을 마지막으로 성공 확인한 시각.
--  - booking_url: 예약 안내 페이지(스포츠주행 등). 예약 가능 여부·잔여석은 저장하지 않는다.
ALTER TABLE motorsport_events
 ADD COLUMN source_key VARCHAR(120) CHECK (source_key ~ '^[a-z0-9-]+:[A-Za-z0-9._:-]+$'),
 ADD COLUMN source_snapshot JSONB,
 ADD COLUMN source_latest JSONB,
 ADD COLUMN source_checked_at TIMESTAMPTZ,
 ADD COLUMN booking_url VARCHAR(500) CHECK (booking_url ~ '^https?://');
CREATE UNIQUE INDEX motorsport_events_source_key ON motorsport_events(source_key) WHERE source_key IS NOT NULL;

-- 수집기가 만든 장소(서킷)를 다시 찾기 위한 식별자(예: f1-circuit:9, kr:inje-speedium).
ALTER TABLE motorsport_venues ADD COLUMN source_key VARCHAR(120) CHECK (source_key ~ '^[a-z0-9-]+:[A-Za-z0-9._:-]+$');
CREATE UNIQUE INDEX motorsport_venues_source_key ON motorsport_venues(source_key) WHERE source_key IS NOT NULL;

-- 출처별 실행 기록. 관리자 화면이 출처별 마지막 실행 결과(실패·오래됨)를 보여 준다.
CREATE TABLE motorsport_import_runs (
 id BIGSERIAL PRIMARY KEY,
 source VARCHAR(30) NOT NULL,
 started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 finished_at TIMESTAMPTZ,
 ok BOOLEAN,
 summary JSONB,
 error VARCHAR(1000)
);
CREATE INDEX motorsport_import_runs_source ON motorsport_import_runs(source, id DESC);
