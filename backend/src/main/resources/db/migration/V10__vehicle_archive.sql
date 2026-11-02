-- MVP 단계 2 차량 보관. 팔았거나 더 타지 않는 차량을 지우지 않고 "이전 차량"으로 남긴다.
-- nullable 컬럼 하나만 더한다(기존 행은 모두 NULL = 현재 차량, 기존 데이터는 바뀌지 않는다).
--  - 보관(board PATCH /api/board/garage/:id/archive)은 이 값만 채우고 기록·연결 글·인증 이력은 그대로 둔다.
--  - 보관한 차량은 인증을 신청할 수 없고, 심사 중(PENDING) 차량은 보관할 수 없다(API에서 판단).
--  - 인증 오너 인장은 보관하지 않은 인증 차량으로만 계산한다.
ALTER TABLE owner_vehicles ADD COLUMN archived_at TIMESTAMPTZ;
