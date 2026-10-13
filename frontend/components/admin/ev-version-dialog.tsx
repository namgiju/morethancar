'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {REVISION_KIND_LABELS, createVersion, updateVersion, type AdminVersion, type NewSourceInput} from '../../lib/admin-ev';
import {
  NewSourceRows,
  VersionContentFields,
  defaultVersionForm,
  emptySourceRow,
  filledSourceRows,
  requiresVerification,
  versionFormToInput,
  type VersionFormState,
} from './ev-version-fields';
import styles from './admin.module.css';

type Props = {
  policyId: number;
  version: AdminVersion | null; // null = 새 버전(CHANGE/CORRECTION) 등록
  versions: AdminVersion[]; // 같은 정책의 기존 버전(대체할 버전 선택용) — 수정 모드에서는 쓰지 않음
  onClose: () => void;
  onSaved: (message: string) => void;
};

// 버전을 등록·수정한다. revisionKind·supersedesVersionId는 등록 시점에만 고르고 이후 바꿀 수
// 없다(구조적 식별자). 한 번이라도 공개된 버전은 이 다이얼로그를 열 수 없다(ev-admin.tsx의
// VersionTable이 "수정" 버튼을 published_at이 없을 때만 보여준다). 새로 입력한 출처는 등록·수정
// 요청과 **같은 트랜잭션**으로 함께 저장된다(board-service/src/ev.js) — 검증(confirmVerification)을
// 선언하려면 이미 저장된 출처나 지금 입력하는 출처 중 최소 1개가 있어야 한다는 서버 규칙과
// 맞추기 위해, 별도 호출로 나중에 추가하지 않고 같은 제출에 포함한다.
export default function EvVersionDialog({policyId, version, versions, onClose, onSaved}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const candidates = versions.filter((v) => !v.cancelledAt);
  const defaultSupersedes = candidates.find((v) => v.isCurrent) ?? candidates[candidates.length - 1] ?? null;
  const [revisionKind, setRevisionKind] = useState<'CHANGE' | 'CORRECTION'>('CHANGE');
  const [supersedesVersionId, setSupersedesVersionId] = useState<number | ''>(defaultSupersedes?.id ?? '');
  const [changeSummary, setChangeSummary] = useState(version?.changeSummary ?? '');
  const [form, setForm] = useState<VersionFormState>(defaultVersionForm(version));
  const [newSources, setNewSources] = useState<NewSourceInput[]>(version ? [] : [emptySourceRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const existingSourceCount = version?.sources.length ?? 0;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!version && !supersedesVersionId) return setError('대체할 이전 버전을 선택해주세요.');
    const requireSummary = !version || version.revisionKind !== 'INITIAL';
    if (requireSummary && !changeSummary.trim()) return setError('변경 요약을 입력해주세요.');
    const rows = filledSourceRows(newSources);
    if (rows.some((s) => !s.publisher.trim() || !s.title.trim() || !s.url.trim())) return setError('출처는 발행 기관·자료명·URL을 모두 입력해주세요.');
    if (requiresVerification(form.status) && !form.verified)
      return setError('적용 중·시행 예정·종료 상태는 "공식 출처로 확인했습니다"를 체크하고 출처를 입력해야 저장할 수 있어요.');
    if (form.verified && rows.length === 0 && existingSourceCount === 0)
      return setError('공식 출처로 확인했다고 체크했으면 출처를 1개 이상 입력해주세요(이미 등록된 출처가 있다면 새로 입력하지 않아도 돼요).');

    setBusy(true);
    setError('');
    try {
      const content = versionFormToInput(form);
      if (!version) {
        await createVersion(policyId, {
          ...content,
          revisionKind,
          supersedesVersionId: Number(supersedesVersionId),
          changeSummary,
          sources: rows,
        });
      } else {
        await updateVersion(version.id, {
          ...content,
          changeSummary: version.revisionKind === 'INITIAL' ? undefined : changeSummary,
          expectedUpdatedAt: version.updatedAt,
          sources: rows,
        });
      }
      onSaved(!version ? '버전을 등록했어요.' : '버전을 저장했어요.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했어요.');
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${styles.dialogWide}`}
      aria-labelledby="ev-version-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="ev-version-dialog-title">{version ? `버전 #${version.versionNo} 수정` : '새 버전 등록'}</h2>
      <p>
        {version
          ? '아직 한 번도 공개되지 않은 버전만 수정할 수 있어요. 이미 공개됐던 버전은 새 버전으로 등록해주세요.'
          : '정책 변경(CHANGE)이나 오탈자 수정(CORRECTION)을 새 버전으로 등록합니다. 등록해도 대표 버전은 바로 바뀌지 않아요 — 공개한 뒤 버전 관리에서 "대표로 지정"을 따로 눌러주세요.'}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className={styles.plainFieldset}>
          {!version && (
            <div className={styles.formGrid}>
              <label>
                <span>버전 종류 <span className={styles.required}>*</span></span>
                <select value={revisionKind} onChange={(e) => setRevisionKind(e.target.value as 'CHANGE' | 'CORRECTION')}>
                  <option value="CHANGE">정책 변경</option>
                  <option value="CORRECTION">오탈자 수정</option>
                </select>
              </label>
              <label>
                <span>대체할 이전 버전 <span className={styles.required}>*</span></span>
                <select value={supersedesVersionId} onChange={(e) => setSupersedesVersionId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">선택</option>
                  {candidates.map((v) => (
                    <option key={v.id} value={v.id}>
                      #{v.versionNo} {REVISION_KIND_LABELS[v.revisionKind]}{v.isCurrent ? ' (대표)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {(!version || version.revisionKind !== 'INITIAL') && (
            <label className={styles.full}>
              <span>변경 요약 <span className={styles.required}>*</span></span>
              <input required maxLength={500} value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} placeholder="예: 보조금 상한 100만원 → 150만원 인상" />
            </label>
          )}

          <VersionContentFields form={form} setForm={setForm} />

          <p className={styles.fieldTitle}>공식 출처</p>
          {version && version.sources.length > 0 && (
            <ul className={styles.actionList}>
              {version.sources.map((s) => (
                <li key={s.id}>
                  {s.publisher} · {s.title} · <a className={styles.textLink} href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a> · {s.checkedOn} 확인
                </li>
              ))}
            </ul>
          )}
          <p className={styles.fieldHelp}>등록된 출처는 수정·삭제할 수 없어요(근거가 바뀐 척 보이지 않도록). 추가할 출처만 아래에 입력해주세요.</p>
          <NewSourceRows rows={newSources} setRows={setNewSources} />
        </fieldset>
        {error && (
          <p className={styles.dialogError} role="alert">{error}</p>
        )}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogCancel} disabled={busy} onClick={onClose}>취소</button>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </dialog>
  );
}
