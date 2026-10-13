import styles from '../../components/ev/ev.module.css';

// policy/[slug]가 notFound()를 부르면(없음/비공개 정책을 같은 404로 처리) 여기로 온다.
export default function EvNotFound() {
  return (
    <div className={styles.errorBox}>
      <h1>정책을 찾을 수 없어요</h1>
      <p>주소가 바뀌었거나, 비공개로 전환됐거나, 존재하지 않는 정책입니다.</p>
      <a href="/ev">전기차 정책·혜택으로 돌아가기</a>
    </div>
  );
}
