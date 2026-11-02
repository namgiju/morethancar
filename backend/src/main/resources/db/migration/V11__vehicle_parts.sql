-- MVP 단계 3 부품 장착·탈거 이력. 새 테이블과 board_posts의 nullable 컬럼만 더한다(기존 행은 바뀌지 않는다).
--  - 현재 장착 = removed_on IS NULL. 별도 상태 컬럼은 두지 않는다. 탈거는 removed_on·remove_mileage를 채운다.
--  - 증빙은 저장하지 않고 cardinality(image_ids) > 0이면 "사진 첨부", 아니면 "사용자 입력"으로 계산만 한다.
--  - cost는 소유자에게만 내려준다(API에서 판단). is_public=false면 소유자 외에는 부품과 사진이 보이지 않는다.
--  - 차량을 지우면(회원 탈퇴 포함) 부품도 지워지고, 글의 part_id는 NULL이 된다.
--  - 기존 vehicle_records의 "부품" 종류 기록은 그대로 둔다(전환하지 않는다).
CREATE TABLE vehicle_parts (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES owner_vehicles(id) ON DELETE CASCADE,
  brand VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  spec VARCHAR(200) NOT NULL DEFAULT '',
  installed_on DATE NOT NULL,
  removed_on DATE,
  install_mileage INTEGER CHECK (install_mileage BETWEEN 0 AND 2000000),
  remove_mileage INTEGER CHECK (remove_mileage BETWEEN 0 AND 2000000),
  cost INTEGER CHECK (cost BETWEEN 0 AND 2000000000),
  image_ids INTEGER[] NOT NULL DEFAULT '{}',
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  CHECK (removed_on IS NULL OR removed_on >= installed_on),
  CHECK (remove_mileage IS NULL OR install_mileage IS NULL OR remove_mileage >= install_mileage)
);
CREATE INDEX vehicle_parts_vehicle ON vehicle_parts(vehicle_id, installed_on DESC);
CREATE INDEX vehicle_parts_image_ids_gin ON vehicle_parts USING GIN (image_ids);
ALTER TABLE board_posts ADD COLUMN part_id INTEGER REFERENCES vehicle_parts(id) ON DELETE SET NULL;
CREATE INDEX board_posts_part ON board_posts(part_id) WHERE part_id IS NOT NULL;
