import { fail } from './validation.js';

// Both the signed-in session and current database role must authorize moderation.
// 정지·비활성화·탈퇴 상태의 관리자는 app.js 인증 단계에서 이미 걸러지지만, 관리자 작업은 DB 상태로 한 번 더 확인한다.
export async function requireCurrentAdmin(db, user) {
  if (user?.role !== 'ADMIN') fail(403, '관리자만 접근할 수 있습니다.');
  const { rows } = await db.query(
    "SELECT id,username,role,COALESCE(account_status,'ACTIVE') AS status,suspended_until FROM users WHERE id=$1", [user.id]);
  const admin = rows[0];
  const blocked = !admin || admin.status === 'DISABLED' || admin.status === 'WITHDRAWN' ||
    (admin.status === 'SUSPENDED' && (!admin.suspended_until || new Date(admin.suspended_until) > new Date()));
  if (admin?.role !== 'ADMIN' || blocked) fail(403, '관리자만 접근할 수 있습니다.');
  return { id: admin.id, username: admin.username, role: admin.role };
}

// 콘텐츠 운영(모터스포츠 일정 등)용. 역할 순서 USER < MANAGER < ADMIN에서 minRole 이상만 통과한다.
// requireCurrentAdmin과 같이 세션 역할과 현재 DB 역할·상태를 모두 확인하며, 권한 판단은 DB 역할로 한다
// (세션은 MANAGER인데 DB에서 USER로 강등됐다면 거부, 세션 ADMIN·DB MANAGER면 MANAGER 권한만).
// 기존 /api/board/admin(신고·회원·게시글 관리)은 계속 requireCurrentAdmin만 쓰므로 MANAGER에게 열리지 않는다.
const RANK = { USER: 0, MANAGER: 1, ADMIN: 2 };
export async function requireCurrentStaff(db, user, minRole = 'MANAGER') {
  const message = minRole === 'ADMIN' ? '관리자만 할 수 있는 작업입니다.' : '운영자만 접근할 수 있습니다.';
  if (!((RANK[user?.role] ?? 0) >= RANK[minRole])) fail(403, message);
  const { rows } = await db.query(
    "SELECT id,username,role,COALESCE(account_status,'ACTIVE') AS status,suspended_until FROM users WHERE id=$1", [user.id]);
  const staff = rows[0];
  const blocked = !staff || staff.status === 'DISABLED' || staff.status === 'WITHDRAWN' ||
    (staff.status === 'SUSPENDED' && (!staff.suspended_until || new Date(staff.suspended_until) > new Date()));
  if (blocked || !((RANK[staff.role] ?? 0) >= RANK[minRole])) fail(403, message);
  return { id: staff.id, username: staff.username, role: staff.role };
}
