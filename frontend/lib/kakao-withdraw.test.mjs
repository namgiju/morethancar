// Run: cd frontend && node --test --experimental-strip-types lib/kakao-withdraw.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {kakaoWithdrawMessage} from './kakao-withdraw.ts';

test('no code means no message', () => {
  assert.equal(kakaoWithdrawMessage(null), null);
  assert.equal(kakaoWithdrawMessage(''), null);
});

test('every server code has its own message and unknown codes fall back', () => {
  const codes = ['CANCELLED', 'SESSION_CHANGED', 'SESSION_EXPIRED', 'KAKAO_MISMATCH', 'UNLINK_FAILED', 'KAKAO_FAILED', 'RESERVED_LISTINGS', 'ADMIN_ROLE', 'UNLINKED_NOT_WITHDRAWN'];
  const fallback = kakaoWithdrawMessage('SOMETHING_NEW');
  for (const code of codes) assert.notEqual(kakaoWithdrawMessage(code), fallback, code);
  assert.equal(kakaoWithdrawMessage('UNAVAILABLE'), fallback);
  assert.doesNotMatch(kakaoWithdrawMessage('KAKAO_FAILED'), /연결 해제/, 'no unlink was attempted');
});

test('unlinked-but-not-withdrawn says the Kakao link is gone, gives the reason, and warns about the second consent', () => {
  const m = kakaoWithdrawMessage('UNLINKED_NOT_WITHDRAWN', 'RESERVED_LISTINGS');
  assert.match(m, /카카오 연결은 해제됐지만 탈퇴는 완료되지 않았어요/);
  assert.match(m, /예약중인 매물/);
  assert.match(m, /동의 화면이 한 번 더/);
  assert.match(kakaoWithdrawMessage('UNLINKED_NOT_WITHDRAWN', 'DB_ERROR'), /일시적인 오류/);
  assert.match(kakaoWithdrawMessage('UNLINKED_NOT_WITHDRAWN', '<script>'), /일시적인 오류/, 'unknown reasons are not echoed');
});
