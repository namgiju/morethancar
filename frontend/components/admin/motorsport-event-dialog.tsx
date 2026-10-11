'use client';

import {useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
import {
  createEvent,
  isoToVenueLocal,
  KIND_LABELS,
  kstToday,
  PUBLICATION_LABELS,
  setPublication,
  STATUS_LABELS,
  updateEvent,
  venueLocalToIso,
  type AdminEvent,
  type EventInput,
  type EventKind,
  type EventStatus,
  type MotorsportSeries,
  type MotorsportVenue,
  type Publication,
} from '../../lib/admin-motorsport';
import styles from './admin.module.css';

type Props = {
  event: AdminEvent | null; // null = new event
  series: MotorsportSeries[];
  venues: MotorsportVenue[];
  onClose: () => void;
  onSaved: (message: string) => void;
};

// Publication choices allowed from the current state (the API moves DRAFT →
// PUBLISHED ↔ HIDDEN; nothing goes back to DRAFT).
function publicationChoices(current: Publication | null): Publication[] {
  if (current === null || current === 'DRAFT') return ['DRAFT', 'PUBLISHED'];
  return ['PUBLISHED', 'HIDDEN'];
}

// 일정 등록·수정. Fields mirror board-service motorsport.js eventInput():
// title, seriesId?, venueId, kind, startsOn, endsOn, startsAt? (offset ISO),
// status, sourceUrl, sourceName, verifiedOn (≤ today KST), note?. The
// publication state is not part of PUT — it is applied with publish/hide
// after saving, so each change shows up separately in the audit log.
export default function MotorsportEventDialog({event, series, venues, onClose, onSaved}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(event?.title ?? '');
  const [seriesId, setSeriesId] = useState(event?.series ? String(event.series.id) : '');
  const [venueId, setVenueId] = useState(event ? String(event.venue.id) : '');
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'RACE');
  const [startsOn, setStartsOn] = useState(event?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(event?.endsOn ?? '');
  const [hasTime, setHasTime] = useState(!!event?.startsAt);
  const [startLocal, setStartLocal] = useState(
    event?.startsAt ? isoToVenueLocal(event.startsAt, event.venue.timezone) : '',
  );
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'SCHEDULED');
  const [sourceUrl, setSourceUrl] = useState(event?.sourceUrl ?? '');
  const [sourceName, setSourceName] = useState(event?.sourceName ?? '');
  const [verifiedOn, setVerifiedOn] = useState(event?.verifiedOn ?? kstToday());
  const [note, setNote] = useState(event?.note ?? '');
  const [publication, setPublicationChoice] = useState<Publication>(event?.publication ?? 'DRAFT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Active options, plus the event's current (possibly inactive) ones so an
  // edit never silently changes them.
  const seriesOptions = useMemo(
    () => series.filter((s) => s.active || String(s.id) === seriesId),
    [series, seriesId],
  );
  const venueOptions = useMemo(() => venues.filter((v) => v.active || String(v.id) === venueId), [venues, venueId]);
  const venue = venues.find((v) => String(v.id) === venueId);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!venue) return setError('장소를 선택해주세요.');
    if (hasTime && !startLocal) return setError('시작 시각을 입력하거나 "시작 시각 확인됨"을 해제해주세요.');
    const input: EventInput = {
      seriesId: seriesId ? Number(seriesId) : null,
      venueId: venue.id,
      kind,
      title,
      startsOn,
      endsOn: endsOn || startsOn,
      startsAt: hasTime ? venueLocalToIso(startLocal, venue.timezone) : null,
      status,
      sourceUrl: sourceUrl.trim(),
      sourceName,
      verifiedOn,
      note,
    };
    setBusy(true);
    setError('');
    try {
      if (!event) {
        await createEvent(input, publication === 'PUBLISHED');
        onSaved(publication === 'PUBLISHED' ? '일정을 공개로 등록했어요.' : '일정을 초안으로 저장했어요.');
      } else {
        await updateEvent(event.id, input);
        if (publication !== event.publication) {
          await setPublication(event.id, publication === 'PUBLISHED' ? 'publish' : 'hide');
        }
        onSaved('일정을 저장했어요.');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했어요.');
      setBusy(false);
    }
  }

  const choices = publicationChoices(event?.publication ?? null);
  const kstPreview =
    hasTime && startLocal && venue && venue.timezone !== 'Asia/Seoul'
      ? new Intl.DateTimeFormat('ko-KR', {
          timeZone: 'Asia/Seoul',
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(new Date(venueLocalToIso(startLocal, venue.timezone)))
      : '';

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${styles.dialogWide}`}
      aria-labelledby="event-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="event-dialog-title">{event ? '일정 수정' : '일정 등록'}</h2>
      <p>
        {event
          ? `#${event.id} · 다른 운영자가 등록한 일정도 수정할 수 있어요. 변경 내용은 변경 이력에 남습니다.`
          : '공식 출처에서 확인한 일정만 등록해주세요. 초안은 공개 화면에 보이지 않습니다.'}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className={styles.plainFieldset}>
          <div className={styles.formGrid}>
            <label className={styles.full}>
              <span>
                일정명 <span className={styles.required}>*</span>
              </span>
              <input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 슈퍼레이스 8라운드" />
            </label>
            <label>
              시리즈
              <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
                <option value="">시리즈 없음 (스포츠주행 등)</option>
                {seriesOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.active ? '' : ' (비활성)'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                장소 <span className={styles.required}>*</span>
              </span>
              <select required value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                <option value="">장소 선택</option>
                {venueOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.country}
                    {v.active ? '' : ' (비활성)'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                일정 종류 <span className={styles.required}>*</span>
              </span>
              <select value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
                {(Object.keys(KIND_LABELS) as EventKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                진행 상태 <span className={styles.required}>*</span>
              </span>
              <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
                {(Object.keys(STATUS_LABELS) as EventStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                시작일 (현지) <span className={styles.required}>*</span>
              </span>
              <input type="date" required value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </label>
            <label>
              종료일 (현지)
              <input type="date" min={startsOn || undefined} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </label>
            <p className={`${styles.fieldHelp} ${styles.full}`}>
              날짜는 개최지 현지 날짜입니다. 하루짜리 일정은 종료일을 비워두면 시작일과 같아집니다. 최대 32일.
            </p>
            <label className={styles.full}>
              <input type="checkbox" checked={hasTime} onChange={(e) => setHasTime(e.target.checked)} /> 시작 시각 확인됨 (공식 출처에
              시각이 있을 때만)
            </label>
            {hasTime && (
              <>
                <label>
                  시작 시각 ({venue ? venue.timezone : '장소 시간대'})
                  <input type="datetime-local" required value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
                </label>
                <p className={`${styles.fieldHelp} ${styles.alignEnd}`}>
                  {kstPreview ? `한국 시간 ${kstPreview}` : '장소의 현지 시각으로 입력하세요.'}
                </p>
              </>
            )}
            <label className={styles.full}>
              <span>
                공식 출처 URL <span className={styles.required}>*</span>
              </span>
              <input type="url" required maxLength={500} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" />
            </label>
            <label>
              <span>
                출처 이름 <span className={styles.required}>*</span>
              </span>
              <input required maxLength={100} value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="예: 주최 측 공식 공지" />
            </label>
            <label>
              <span>
                마지막 확인일 <span className={styles.required}>*</span>
              </span>
              <input type="date" required max={kstToday()} value={verifiedOn} onChange={(e) => setVerifiedOn(e.target.value)} />
            </label>
            <label className={styles.full}>
              메모 (선택)
              <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <span className={styles.srOnly} id="publication-label">
            공개 상태
          </span>
          <p className={styles.fieldTitle}>
            공개 상태
          </p>
          <div className={styles.segmented} role="radiogroup" aria-labelledby="publication-label">
            {choices.map((p) => (
              <label key={p}>
                <input type="radio" name="publication" value={p} checked={publication === p} onChange={() => setPublicationChoice(p)} />
                {PUBLICATION_LABELS[p]}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className={styles.dialogError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogCancel} disabled={busy} onClick={onClose}>
            취소
          </button>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy
              ? '저장 중…'
              : !event
                ? publication === 'PUBLISHED'
                  ? '저장 후 공개'
                  : '초안 저장'
                : '저장'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
