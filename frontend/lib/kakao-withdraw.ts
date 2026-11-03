// Kakao account withdrawal results (LATER-1). The Spring callback
// (AuthController.kakaoWithdrawCallback) is a browser redirect, so it reports
// the outcome as ?kakaoWithdraw=<code>[&reason=<code>] on /home (or /login
// when the session is gone). Success goes to "/" like the password flow.
// No dependencies so the message table can be unit-tested with node --test.

const REASONS: Record<string, string> = {
  RESERVED_LISTINGS: '예약중인 매물이 생겼어요. 거래를 마치거나 판매중으로 바꾼 뒤',
  ADMIN_ROLE: '관리자·운영자 권한이 생겼어요. 권한을 먼저 해제한 뒤',
  KAKAO_MISMATCH: '계정에 연결된 카카오 계정이 바뀌었어요. 확인한 뒤',
  SESSION_EXPIRED: '로그인 상태가 바뀌었어요. 다시 로그인한 뒤',
};

// Codes whose message still matters when the dialog is blocked for another
// reason (the blocked message already covers RESERVED_LISTINGS / ADMIN_ROLE).
export const KEEP_WHEN_BLOCKED = new Set(['UNLINKED_NOT_WITHDRAWN']);

export function kakaoWithdrawMessage(code: string | null, reason?: string | null): string | null {
  switch (code) {
    case null:
    case '':
      return null;
    case 'CANCELLED':
      return '카카오 인증을 취소해 탈퇴하지 않았어요.';
    case 'SESSION_CHANGED':
      return '탈퇴를 시작한 로그인과 달라 탈퇴하지 않았어요. 다시 시도해주세요.';
    case 'SESSION_EXPIRED':
      return '로그인이 만료되어 탈퇴하지 않았어요. 다시 로그인한 뒤 내 차고에서 탈퇴를 진행해주세요.';
    case 'KAKAO_MISMATCH':
      return '이 계정에 연결된 카카오 계정과 다른 계정으로 인증해 탈퇴하지 않았어요. 연결된 카카오 계정으로 다시 시도해주세요.';
    case 'UNLINK_FAILED':
      return '카카오 연결 해제에 실패해 탈퇴하지 않았어요. 잠시 후 다시 시도해주세요.';
    case 'KAKAO_FAILED':
      return '카카오 인증을 마치지 못해 탈퇴하지 않았어요. 잠시 후 다시 시도해주세요.';
    case 'RESERVED_LISTINGS':
      return '예약중인 매물이 있어 탈퇴하지 않았어요. 거래를 마치거나 판매중으로 바꾼 뒤 탈퇴해주세요.';
    case 'ADMIN_ROLE':
      return '관리자·운영자 권한을 먼저 해제해야 탈퇴할 수 있어요.';
    case 'UNLINKED_NOT_WITHDRAWN': {
      const why = (reason && REASONS[reason]) || '일시적인 오류가 있었어요. 잠시 후';
      return `카카오 연결은 해제됐지만 탈퇴는 완료되지 않았어요. ${why} 다시 시도해주세요. 다시 시도하면 카카오 동의 화면이 한 번 더 나와요.`;
    }
    default:
      return '지금은 탈퇴를 처리할 수 없어요. 잠시 후 다시 시도해주세요.';
  }
}
