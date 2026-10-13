import type {EvSource} from '../../lib/ev-types';
import styles from './ev.module.css';

export default function SourceList({sources}: {sources: EvSource[]}) {
  if (!sources.length) return null;
  return (
    <ul className={styles.sourceList}>
      {sources.map((source, i) => (
        <li key={i}>
          <a href={source.url} target="_blank" rel="noreferrer noopener">
            {source.publisher} · {source.title}
          </a>
          {' — 확인일 '}
          {source.checkedOn}
        </li>
      ))}
    </ul>
  );
}
