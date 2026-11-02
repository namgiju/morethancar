'use client';

import {useRef, useState} from 'react';
import styles from './post-detail.module.css';

// "텍스트 복사" for part history (MVP stage 5). When the clipboard API is
// missing or refused (insecure context, permissions, some mobile browsers),
// show the text in a selectable read-only textarea instead.
export default function CopyTextButton({text, label = '텍스트 복사'}: {text: string; label?: string}) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const area = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('manual');
      requestAnimationFrame(() => area.current?.select());
    }
  }

  return (
    <div className={styles.copyBox}>
      <button type="button" className={styles.textButton} onClick={() => void copy()}>
        {state === 'copied' ? '복사했어요' : label}
      </button>
      {state === 'manual' && (
        <>
          <p className={styles.muted}>복사하지 못했어요. 아래 내용을 길게 눌러 직접 복사해 주세요.</p>
          <textarea
            ref={area}
            className={styles.copyArea}
            readOnly
            rows={5}
            value={text}
            aria-label="공유할 부품 이력"
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      )}
    </div>
  );
}
