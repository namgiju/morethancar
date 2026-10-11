'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {
  saveSeries,
  saveVenue,
  SCOPE_LABELS,
  type MotorsportSeries,
  type MotorsportVenue,
  type SeriesScope,
} from '../../lib/admin-motorsport';
import styles from './admin.module.css';

// Common venue time zones offered in a list; any other IANA name can be typed.
const ZONES = ['Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Dubai', 'Europe/London', 'Europe/Monaco', 'Europe/Rome',
  'America/Los_Angeles', 'America/New_York', 'America/Sao_Paulo', 'Australia/Melbourne'];

// 시리즈·장소 관리. There is no delete: a series or venue already used by
// events is turned off with "사용 안 함" (active=false) instead.
export default function MotorsportCatalog({
  series,
  venues,
  onChanged,
}: {
  series: MotorsportSeries[];
  venues: MotorsportVenue[];
  onChanged: (message: string) => void;
}) {
  const [editSeries, setEditSeries] = useState<MotorsportSeries | 'new' | null>(null);
  const [editVenue, setEditVenue] = useState<MotorsportVenue | 'new' | null>(null);

  return (
    <>
      <section className={styles.panel} aria-labelledby="series-title">
        <div className={styles.panelTop}>
          <h2 id="series-title">시리즈</h2>
          <button type="button" className={styles.dark} onClick={() => setEditSeries('new')}>
            ＋ 시리즈 추가
          </button>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>코드</th>
                <th>구분</th>
                <th>공식 사이트</th>
                <th>사용</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {series.length === 0 ? (
                <tr>
                  <td colSpan={6}>등록된 시리즈가 없어요.</td>
                </tr>
              ) : (
                series.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className={styles.rowTitle}>{s.name}</span>
                    </td>
                    <td>{s.code}</td>
                    <td>{SCOPE_LABELS[s.scope]}</td>
                    <td>{s.officialUrl ? <a className={styles.textLink} href={s.officialUrl} target="_blank" rel="noopener noreferrer">열기</a> : '—'}</td>
                    <td>
                      <span className={`${styles.chip} ${s.active ? styles.chipOk : styles.chipNeutral}`}>{s.active ? '사용' : '사용 안 함'}</span>
                    </td>
                    <td>
                      <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => setEditSeries(s)}>
                        수정
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="venues-title">
        <div className={styles.panelTop}>
          <h2 id="venues-title">장소</h2>
          <button type="button" className={styles.dark} onClick={() => setEditVenue('new')}>
            ＋ 장소 추가
          </button>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>국가·지역</th>
                <th>시간대</th>
                <th>공식 사이트</th>
                <th>사용</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {venues.length === 0 ? (
                <tr>
                  <td colSpan={6}>등록된 장소가 없어요.</td>
                </tr>
              ) : (
                venues.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className={styles.rowTitle}>{v.name}</span>
                    </td>
                    <td>
                      {v.country}
                      {v.region ? ` · ${v.region}` : ''}
                    </td>
                    <td>{v.timezone}</td>
                    <td>{v.officialUrl ? <a className={styles.textLink} href={v.officialUrl} target="_blank" rel="noopener noreferrer">열기</a> : '—'}</td>
                    <td>
                      <span className={`${styles.chip} ${v.active ? styles.chipOk : styles.chipNeutral}`}>{v.active ? '사용' : '사용 안 함'}</span>
                    </td>
                    <td>
                      <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => setEditVenue(v)}>
                        수정
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editSeries && (
        <SeriesDialog
          item={editSeries === 'new' ? null : editSeries}
          onClose={() => setEditSeries(null)}
          onSaved={() => onChanged('시리즈를 저장했어요.')}
        />
      )}
      {editVenue && (
        <VenueDialog
          item={editVenue === 'new' ? null : editVenue}
          onClose={() => setEditVenue(null)}
          onSaved={() => onChanged('장소를 저장했어요.')}
        />
      )}
    </>
  );
}

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return ref;
}

function SeriesDialog({item, onClose, onSaved}: {item: MotorsportSeries | null; onClose: () => void; onSaved: () => void}) {
  const ref = useModal();
  const [code, setCode] = useState(item?.code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [scope, setScope] = useState<SeriesScope>(item?.scope ?? 'DOMESTIC');
  const [officialUrl, setOfficialUrl] = useState(item?.officialUrl ?? '');
  const [active, setActive] = useState(item?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveSeries({code, name, scope, officialUrl: officialUrl.trim(), active}, item?.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했어요.');
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="series-dialog-title" onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
      <h2 id="series-dialog-title">{item ? '시리즈 수정' : '시리즈 추가'}</h2>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className={styles.plainFieldset}>
          <label>
            <span>이름 <span className={styles.required}>*</span></span>
            <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 슈퍼레이스" />
          </label>
          <label>
            <span>코드 <span className={styles.required}>*</span></span>
            <input required pattern="[a-z0-9][a-z0-9-]*" maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: super-race" />
          </label>
          <p className={styles.fieldHelp}>영문 소문자·숫자·하이픈. 공개 화면 필터 주소에 쓰입니다.</p>
          <label>
            구분
            <select value={scope} onChange={(e) => setScope(e.target.value as SeriesScope)}>
              <option value="DOMESTIC">국내</option>
              <option value="INTERNATIONAL">해외</option>
            </select>
          </label>
          <label>
            공식 사이트 (선택)
            <input type="url" maxLength={500} value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="https://" />
          </label>
          <label>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 사용 (끄면 새 일정에서 고를 수 없어요)
          </label>
        </fieldset>
        {error && <p className={styles.dialogError} role="alert">{error}</p>}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogCancel} disabled={busy} onClick={onClose}>취소</button>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </dialog>
  );
}

function VenueDialog({item, onClose, onSaved}: {item: MotorsportVenue | null; onClose: () => void; onSaved: () => void}) {
  const ref = useModal();
  const [name, setName] = useState(item?.name ?? '');
  const [country, setCountry] = useState(item?.country ?? 'KR');
  const [region, setRegion] = useState(item?.region ?? '');
  const [timezone, setTimezone] = useState(item?.timezone ?? 'Asia/Seoul');
  const [officialUrl, setOfficialUrl] = useState(item?.officialUrl ?? '');
  const [latitude, setLatitude] = useState(item?.latitude != null ? String(item.latitude) : '');
  const [longitude, setLongitude] = useState(item?.longitude != null ? String(item.longitude) : '');
  const [active, setActive] = useState(item?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveVenue(
        {
          name,
          country: country.trim().toUpperCase(),
          region,
          timezone: timezone.trim(),
          officialUrl: officialUrl.trim(),
          latitude: latitude === '' ? null : Number(latitude),
          longitude: longitude === '' ? null : Number(longitude),
          active,
        },
        item?.id,
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했어요.');
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="venue-dialog-title" onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
      <h2 id="venue-dialog-title">{item ? '장소 수정' : '장소 추가'}</h2>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className={styles.plainFieldset}>
          <label>
            <span>이름 <span className={styles.required}>*</span></span>
            <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 인제 스피디움" />
          </label>
          <div className={styles.formRow}>
            <label>
              <span>국가 코드 <span className={styles.required}>*</span></span>
              <input required pattern="[A-Za-z]{2}" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="KR" />
            </label>
            <label>
              지역 (선택)
              <input maxLength={100} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="예: 강원 인제" />
            </label>
          </div>
          <label>
            <span>시간대 <span className={styles.required}>*</span></span>
            <input required list="venue-zones" maxLength={64} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            <datalist id="venue-zones">
              {ZONES.map((z) => <option key={z} value={z} />)}
            </datalist>
          </label>
          <p className={styles.fieldHelp}>IANA 이름(예: Asia/Seoul). 일정 날짜와 시작 시각은 이 시간대 기준입니다.</p>
          <label>
            공식 사이트 (선택)
            <input type="url" maxLength={500} value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="https://" />
          </label>
          <div className={styles.formRow}>
            <label>
              위도 (선택)
              <input type="number" step="0.000001" min={-90} max={90} value={latitude} onChange={(e) => setLatitude(e.target.value)} />
            </label>
            <label>
              경도 (선택)
              <input type="number" step="0.000001" min={-180} max={180} value={longitude} onChange={(e) => setLongitude(e.target.value)} />
            </label>
          </div>
          <label>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 사용 (끄면 새 일정에서 고를 수 없어요)
          </label>
        </fieldset>
        {error && <p className={styles.dialogError} role="alert">{error}</p>}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogCancel} disabled={busy} onClick={onClose}>취소</button>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </dialog>
  );
}
