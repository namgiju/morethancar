-- 모터스포츠 일정 댓글(답글 1단계)과 댓글 신고. 새 테이블만 더한다(기존 행은 바뀌지 않는다).
--  - 공개 API는 공개(PUBLISHED)·삭제되지 않은 일정의 댓글만 보여 준다. 일정이 비공개·삭제되면 댓글도 보이지 않는다.
--  - 삭제는 행을 지우지 않고 deleted=true로 둔다(답글·신고 참조 유지). 작성자 삭제는 AUTHOR, 관리자 삭제는 ADMIN.
--    원문(content)은 신고 검토를 위해 DB에 남기고, 공개 API는 삭제 문구로 바꿔 내려준다.
--    관리자 삭제 사유는 moderation_note, 삭제한 관리자는 deleted_by(회원 표시명은 조회 시 계산 — 탈퇴 익명화가 따로 필요 없다).
--  - 탈퇴 회원의 댓글은 게시판 댓글과 같이 남고 작성자만 "탈퇴한 회원"으로 보인다(member-display.js).
CREATE TABLE motorsport_event_comments (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES motorsport_events(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES users(id),
  parent_id INTEGER REFERENCES motorsport_event_comments(id) ON DELETE CASCADE,
  content VARCHAR(1000) NOT NULL CHECK (length(btrim(content)) > 0),
  deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_reason VARCHAR(10) CHECK (deleted_reason IN ('AUTHOR','ADMIN')),
  deleted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  moderation_note VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (deleted = (deleted_reason IS NOT NULL))
);
CREATE INDEX motorsport_event_comments_event ON motorsport_event_comments(event_id, id);

-- 게시글 신고(community_reports)와 같은 흐름: 회원당 댓글 하나에 신고 하나, 검토 대기 중에는 사유만 바꿀 수 있다.
CREATE TABLE motorsport_comment_reports (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id INTEGER NOT NULL REFERENCES motorsport_event_comments(id) ON DELETE CASCADE,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution_note VARCHAR(500) NOT NULL DEFAULT '',
  UNIQUE(user_id, comment_id)
);
CREATE INDEX motorsport_comment_reports_status_id ON motorsport_comment_reports(status, id DESC);
