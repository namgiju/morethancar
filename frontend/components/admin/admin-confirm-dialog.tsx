'use client';

import {useEffect, useRef, useState, type FormEvent, type ReactNode} from 'react';
import styles from './admin.module.css';

export type ConfirmSpec = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  // Reason input: 'optional' shows it, 'required' also blocks an empty value.
  reason?: 'optional' | 'required';
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<unknown>;
};

// Confirmation step for admin actions (hide, delete, restore, verify, role
// change). Server errors are shown in place; the dialog closes only on success.
export default function AdminConfirmDialog({spec, onClose, onDone}: {spec: ConfirmSpec; onClose: () => void; onDone: () => void}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = reason.trim();
    if (spec.reason === 'required' && !trimmed) {
      setError(`${spec.reasonLabel ?? '사유'}를 입력해주세요.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await spec.onConfirm(trimmed);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했어요.');
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="admin-confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="admin-confirm-title">{spec.title}</h2>
      <div className={styles.confirmBox}>{spec.message}</div>
      <form onSubmit={submit}>
        {spec.reason && (
          <label>
            <span>
              {spec.reasonLabel ?? '사유'} {spec.reason === 'required' ? <span className={styles.required}>*</span> : '(선택)'}
            </span>
            <textarea rows={3} maxLength={spec.reason === 'required' ? 200 : 500} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
          </label>
        )}
        {error && (
          <p className={styles.dialogError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogCancel} disabled={busy} onClick={onClose}>
            취소
          </button>
          <button type="submit" className={spec.danger ? styles.dangerButton : styles.dark} disabled={busy}>
            {busy ? '처리 중…' : spec.confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
