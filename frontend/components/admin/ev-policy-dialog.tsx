'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {CATEGORY_LABELS, createPolicy, updatePolicy, type AdminPolicy, type EvCategory, type EvScope, type NewSourceInput} from '../../lib/admin-ev';
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
  policy: AdminPolicy | null; // null = 새 정책(기본 정보 + 최초 버전을 함께 등록)
  onClose: () => void;
  onSaved: (message: string, policy: AdminPolicy) => void;
};

const SCOPE_LABELS: Record<EvScope, string> = {NATIONAL: '전국 공통', REGIONAL: '지역 한정'};
const slugPattern = /^[a-z0-9][a-z0-9-]*$/;

// 정책 항목(기본 정보)을 등록·수정한다. slug는 등록 후 바꿀 수 없다(§6) — 수정 모드에서는 입력란
// 자체를 보여주지 않는다. 신규 등록은 §4 설계대로 "정책 항목 + 최초 버전(INITIAL)"을 한 번에
// 만든다(공개는 별도 작업 — 등록과 동시 공개 단축 경로를 두지 않는다, board-service/src/ev.js 참고).
export default function EvPolicyDialog({policy, onClose, onSaved}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [slug, setSlug] = useState(policy?.slug ?? '');
  const [category, setCategory] = useState<EvCategory>(policy?.category ?? 'BUY');
  const [scope, setScope] = useState<EvScope>(policy?.scope ?? 'NATIONAL');
  const [regionNote, setRegionNote] = useState(policy?.regionNote ?? '');
  const [title, setTitle] = useState(policy?.title ?? '');
  const [featured, setFeatured] = useState(policy?.featured ?? false);
  const [form, setForm] = useState<VersionFormState>(defaultVersionForm(null));
  const [newSources, setNewSources] = useState<NewSourceInput[]>([emptySourceRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!policy && !slugPattern.test(slug)) return setError('정책 주소는 영문 소문자·숫자·하이픈으로만 입력해주세요(예: ev-subsidy).');
    if (scope === 'REGIONAL' && !regionNote.trim()) return setError('지역 한정일 경우 지역·조건 설명을 입력해주세요.');
    const rows = filledSourceRows(newSources);
    if (!policy) {
      if (form.verified && rows.length === 0) return setError('공식 출처로 확인했다고 체크했으면 출처를 1개 이상 입력해주세요.');
      if (requiresVerification(form.status) && !form.verified) return setError('적용 중·시행 예정·종료 상태는 "공식 출처로 확인했습니다"를 체크하고 출처를 입력해야 저장할 수 있어요.');
      if (rows.some((s) => !s.publisher.trim() || !s.title.trim() || !s.url.trim())) return setError('출처는 발행 기관·자료명·URL을 모두 입력해주세요.');
    }
    setBusy(true);
    setError('');
    try {
      let saved: AdminPolicy;
      if (!policy) {
        saved = await createPolicy({slug, category, scope, regionNote, title, featured, ...versionFormToInput(form), sources: rows});
        onSaved('정책을 등록했어요. 이제 출처를 등록하고 버전을 공개해주세요.', saved);
      } else {
        saved = await updatePolicy(policy.id, {category, scope, regionNote, title, featured, expectedUpdatedAt: policy.updatedAt});
        onSaved('정책 정보를 저장했어요.', saved);
      }
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
      aria-labelledby="ev-policy-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="ev-policy-dialog-title">{policy ? '정책 정보 수정' : '정책 등록'}</h2>
      <p>
        {policy
          ? `#${policy.id} /${policy.slug} · 분류·지역 구분·제목만 바꿉니다. 내용·상태·검증은 버전 관리에서 다룹니다.`
          : '기본 정보와 최초 버전 내용을 함께 등록합니다. 등록만으로 공개되지 않아요 — 출처를 등록하고 검증을 마친 뒤 버전 관리에서 공개해주세요.'}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className={styles.plainFieldset}>
          <div className={styles.formGrid}>
            {!policy && (
              <label>
                <span>정책 주소(slug) <span className={styles.required}>*</span></span>
                <input required maxLength={80} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="예: ev-subsidy-2026" />
              </label>
            )}
            <label>
              <span>분류 <span className={styles.required}>*</span></span>
              <select value={category} onChange={(e) => setCategory(e.target.value as EvCategory)}>
                {(Object.keys(CATEGORY_LABELS) as EvCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>전국/지역 <span className={styles.required}>*</span></span>
              <select value={scope} onChange={(e) => setScope(e.target.value as EvScope)}>
                {(Object.keys(SCOPE_LABELS) as EvScope[]).map((s) => (
                  <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
                ))}
              </select>
            </label>
            {scope === 'REGIONAL' && (
              <label className={styles.full}>
                <span>지역·조건 설명 <span className={styles.required}>*</span></span>
                <input required maxLength={300} value={regionNote} onChange={(e) => setRegionNote(e.target.value)} placeholder="예: 지자체별 조례로 상이, 관할 시·군 공고 확인" />
              </label>
            )}
            <label className={styles.full}>
              <span>정책명 <span className={styles.required}>*</span></span>
              <input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
              메인 "주요 정책"에 노출
            </label>
          </div>
          {!policy && (
            <>
              <p className={styles.fieldTitle}>최초 버전 내용</p>
              <VersionContentFields form={form} setForm={setForm} />
              <p className={styles.fieldTitle}>공식 출처</p>
              <NewSourceRows rows={newSources} setRows={setNewSources} />
            </>
          )}
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
