'use client';

import styles from '../../components/ev/ev.module.css';

// /ev/*에서 서버 fetch가 실패하면(API 장애 등) 여기로 온다 — 빈 목록이나 404로 숨기지 않고
// 재시도 가능한 오류 화면을 보여준다. error.tsx는 Next.js 규칙상 클라이언트 컴포넌트여야 한다.
export default function EvError({reset}: {error: Error & {digest?: string}; reset: () => void}) {
  return (
    <div className={styles.errorBox}>
      <h2>전기차 정책 정보를 불러오지 못했어요</h2>
      <p>잠시 문제가 생겼습니다. 네트워크 상태를 확인하고 다시 시도해주세요.</p>
      <button type="button" onClick={() => reset()}>
        다시 시도
      </button>
    </div>
  );
}
