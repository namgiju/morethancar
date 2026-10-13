'use client';

import {type Dispatch, type SetStateAction} from 'react';
import {STATUS_LABELS, type AdminVersion, type EvStatus, type NewSourceInput, type VersionContentInput} from '../../lib/admin-ev';
import styles from './admin.module.css';

// 정책 등록(INITIAL)과 새 버전 등록(CHANGE/CORRECTION)·초안 수정이 공유하는 "내용+상태+검증"
// 입력 필드. 세 곳에서 똑같이 12개 필드가 반복돼 ev-policy-dialog.tsx/ev-version-dialog.tsx가
// 이 하나를 같이 쓴다(§5 다이얼로그는 "정책 항목"과 "버전"으로 나뉘지만, 버전 쪽 입력 모양은
// 등록이든 수정이든 같다).
export type VersionFormState = {
  summary: string;
  keyPoints: string;
  target: string;
  benefit: string;
  howToApply: string;
  note: string;
  status: EvStatus;
  announcedOn: string;
  effectiveDate: string;
  endDate: string;
  endDateIndefinite: boolean;
  // 검증 — 사용자가 실제로 체크한 값만 담는다. status가 PROPOSED가 아니면 서버가 이 값이
  // true가 아닌 요청을 거부하지만(board-service/src/ev.js versionContentInput), 이 체크박스를
  // 상태 선택에 맞춰 자동으로 켜거나 비활성화하지 않는다 — "상태를 골랐다"는 사실이 "공식
  // 출처로 확인했다"는 선언이 되면 안 된다(STEP 7 사후 검토에서 발견한 결함 수정).
  verified: boolean;
  verifiedOn: string;
};

// 시행 상태가 검증(확정 근거)을 요구하는지 — 다이얼로그의 제출 검증(출처 필요 등)도 이 값을 쓴다.
export const requiresVerification = (status: EvStatus) => status !== 'PROPOSED';

const today = () => new Date().toISOString().slice(0, 10);

export function defaultVersionForm(version?: AdminVersion | null): VersionFormState {
  return {
    summary: version?.summary ?? '',
    keyPoints: version?.keyPoints ?? '',
    target: version?.target ?? '',
    benefit: version?.benefit ?? '',
    howToApply: version?.howToApply ?? '',
    note: version?.note ?? '',
    status: version?.status ?? 'PROPOSED',
    announcedOn: version?.announcedOn ?? '',
    effectiveDate: version?.effectiveDate ?? '',
    endDate: version?.endDate ?? '',
    endDateIndefinite: version?.endDateIndefinite ?? false,
    verified: version ? version.verificationStatus === 'VERIFIED' : false,
    verifiedOn: version?.lastVerifiedOn ?? today(),
  };
}

// confirmVerification은 항상 명시적으로 보낸다(서버도 이 필드가 정확히 true일 때만 검증된
// 것으로 받아들인다) — status나 날짜 입력으로는 추론하지 않는다.
export function versionFormToInput(form: VersionFormState): VersionContentInput {
  return {
    summary: form.summary,
    keyPoints: form.keyPoints,
    target: form.target,
    benefit: form.benefit,
    howToApply: form.howToApply,
    note: form.note,
    status: form.status,
    announcedOn: form.announcedOn,
    effectiveDate: form.effectiveDate,
    endDate: form.endDateIndefinite ? '' : form.endDate,
    endDateIndefinite: form.endDateIndefinite,
    confirmVerification: form.verified,
    ...(form.verified ? {verifiedOn: form.verifiedOn || today()} : {}),
  };
}

export function VersionContentFields({form, setForm}: {form: VersionFormState; setForm: Dispatch<SetStateAction<VersionFormState>>}) {
  const set = <K extends keyof VersionFormState>(key: K, value: VersionFormState[K]) => setForm((f) => ({...f, [key]: value}));
  const needsVerification = requiresVerification(form.status);
  const needsEffectiveDate = form.status === 'ACTIVE' || form.status === 'SCHEDULED';

  return (
    <>
      <div className={styles.formGrid}>
        <label className={styles.full}>
          <span>한 줄 요약 <span className={styles.required}>*</span></span>
          <input required maxLength={300} value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="목록·카드에 보이는 한 줄" />
        </label>
        <label className={styles.full}>
          <span>핵심 내용 <span className={styles.required}>*</span></span>
          <textarea required rows={3} maxLength={2000} value={form.keyPoints} onChange={(e) => set('keyPoints', e.target.value)} />
        </label>
        <label className={styles.full}>
          <span>적용 대상 <span className={styles.required}>*</span></span>
          <input required maxLength={300} value={form.target} onChange={(e) => set('target', e.target.value)} />
        </label>
        <label className={styles.full}>
          <span>지원 내용·혜택 <span className={styles.required}>*</span></span>
          <textarea required rows={3} maxLength={2000} value={form.benefit} onChange={(e) => set('benefit', e.target.value)} />
        </label>
        <label className={styles.full}>
          <span>신청·이용 방법 <span className={styles.required}>*</span></span>
          <textarea required rows={2} maxLength={1000} value={form.howToApply} onChange={(e) => set('howToApply', e.target.value)} />
        </label>
        <label className={styles.full}>
          보충 설명
          <textarea rows={2} maxLength={500} value={form.note} onChange={(e) => set('note', e.target.value)} />
        </label>
        <label>
          <span>시행 상태 <span className={styles.required}>*</span></span>
          <select value={form.status} onChange={(e) => set('status', e.target.value as EvStatus)}>
            {(Object.keys(STATUS_LABELS) as EvStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label>
          공식 발표일
          <input type="date" value={form.announcedOn} onChange={(e) => set('announcedOn', e.target.value)} />
        </label>
        <label>
          <span>시행일{needsEffectiveDate && <span className={styles.required}> *</span>}</span>
          <input type="date" required={needsEffectiveDate} value={form.effectiveDate} onChange={(e) => set('effectiveDate', e.target.value)} />
        </label>
        <label>
          종료일
          <input
            type="date"
            disabled={form.endDateIndefinite}
            value={form.endDateIndefinite ? '' : form.endDate}
            onChange={(e) => set('endDate', e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.endDateIndefinite}
            disabled={form.status === 'EXPIRED'}
            onChange={(e) => setForm((f) => ({...f, endDateIndefinite: e.target.checked, endDate: e.target.checked ? '' : f.endDate}))}
          />
          종료일 없음(무기한, 공식 확인됨)
        </label>
      </div>
      <p className={styles.fieldTitle}>검증</p>
      <div className={styles.formGrid}>
        <label>
          <input type="checkbox" checked={form.verified} onChange={(e) => set('verified', e.target.checked)} />
          제가 직접 공식 출처로 이 내용을 확인했습니다
        </label>
        {form.verified && (
          <label>
            확인일
            <input type="date" max={today()} value={form.verifiedOn} onChange={(e) => set('verifiedOn', e.target.value)} />
          </label>
        )}
      </div>
      {needsVerification && !form.verified && (
        <p className={styles.dialogError} role="alert">
          적용 중·시행 예정·종료 상태로 저장하려면 위 체크박스를 직접 켜고, 아래에 공식 출처를 1개 이상 입력해야 해요. 아직 확인 전이면 시행 상태를 "검토 중·미확정"으로 바꿔 초안으로 저장해주세요.
        </p>
      )}
      {!needsVerification && !form.verified && (
        <p className={styles.fieldHelp}>검토 중·미확정(PROPOSED)은 검증 없이도 초안으로 저장할 수 있어요. 공개하려면 출처를 등록하고 검증을 확인해야 해요.</p>
      )}
      {form.verified && (
        <p className={styles.fieldHelp}>검증을 확인하려면 아래에 공식 출처를 1개 이상 함께 입력해주세요(이미 등록된 출처가 있다면 새로 입력하지 않아도 돼요).</p>
      )}
    </>
  );
}

// 새로 추가할 출처 입력 행(등록·수정 다이얼로그가 공유). 서버에 보낼 때는 비어 있는 행을
// 걸러낸다(filledSourceRows) — 사용자가 "출처 추가"를 눌렀다가 아무것도 안 적고 그대로 둔
// 빈 행까지 전송하지 않는다.
export const emptySourceRow = (): NewSourceInput => ({publisher: '', title: '', url: '', checkedOn: today()});
export const filledSourceRows = (rows: NewSourceInput[]) => rows.filter((s) => s.publisher.trim() || s.title.trim() || s.url.trim());

export function NewSourceRows({rows, setRows}: {rows: NewSourceInput[]; setRows: Dispatch<SetStateAction<NewSourceInput[]>>}) {
  const update = (i: number, patch: Partial<NewSourceInput>) => setRows((r) => r.map((row, idx) => (idx === i ? {...row, ...patch} : row)));
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  return (
    <>
      {rows.map((row, i) => (
        <div key={i} className={styles.formGrid}>
          <label>
            발행 기관
            <input maxLength={100} value={row.publisher} onChange={(e) => update(i, {publisher: e.target.value})} placeholder="예: 환경부" />
          </label>
          <label>
            자료명
            <input maxLength={200} value={row.title} onChange={(e) => update(i, {title: e.target.value})} placeholder="예: 2026년 전기차 보조금 업무처리지침" />
          </label>
          <label className={styles.full}>
            URL
            <input type="url" maxLength={500} value={row.url} onChange={(e) => update(i, {url: e.target.value})} placeholder="https://" />
          </label>
          <label>
            확인일
            <input type="date" max={today()} value={row.checkedOn} onChange={(e) => update(i, {checkedOn: e.target.value})} />
          </label>
          <div className={styles.alignEnd}>
            <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => remove(i)}>이 출처 빼기</button>
          </div>
        </div>
      ))}
      <button type="button" className={styles.secondary} onClick={() => setRows((r) => [...r, emptySourceRow()])}>＋ 출처 추가</button>
    </>
  );
}
