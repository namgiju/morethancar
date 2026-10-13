import styles from './ev.module.css';

// 전부 일반 링크다 — 클릭하면 URL query가 바뀌고 서버 컴포넌트가 그 query로 다시 렌더링한다
// (클라이언트 상태나 useEffect 패칭 없음, 서버 렌더링과 필터가 항상 같은 값을 쓴다).
export default function TabLinks({items, active}: {items: {key: string; label: string; href: string}[]; active: string}) {
  return (
    <nav className={styles.tabs} aria-label="필터">
      {items.map((item) => (
        <a key={item.key} href={item.href} className={`${styles.tab} ${item.key === active ? styles.tabActive : ''}`} aria-current={item.key === active ? 'page' : undefined}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
