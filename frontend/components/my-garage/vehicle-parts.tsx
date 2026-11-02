'use client';

import {useState, type FormEvent} from 'react';
import {createVehiclePart, deleteVehiclePart, updateVehiclePart, uploadImage} from '../../lib/community-api';
import type {PublicVehicle, VehiclePart, VehiclePartInput} from '../../lib/community-types';
import {partShareText, partShareUrl} from '../../lib/part-share';
import CopyTextButton from '../community/copy-text-button';
import {imageUrl, partPeriodLabel} from '../../lib/format';
import {kstToday} from '../../lib/motorsport';
import CommunityDialog, {type DialogSpec} from '../community/community-dialog';
import styles from './my-garage.module.css';

const MAX_PHOTOS = 3;

function toInput(part: VehiclePart): VehiclePartInput {
  return {
    brand: part.brand,
    name: part.name,
    spec: part.spec,
    installedOn: part.installedOn,
    removedOn: part.removedOn,
    installMileage: part.installMileage,
    removeMileage: part.removeMileage,
    cost: part.cost ?? null,
    imageIds: part.imageIds,
    isPublic: part.isPublic,
  };
}

function numberOrNull(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text === '' ? null : Number(text);
}

// "현재 장착 / 과거 부품" inside the /home vehicle manage dialog (MVP stage 3).
// Mounted now = no removedOn. Only brand/name/installedOn are required; the
// rest sits under "더보기". Removal is a small form (date + mileage) that PUTs
// the same part with removedOn/removeMileage. The evidence label is computed
// ("사진 첨부" / "사용자 입력") and kept apart from the vehicle's ownership
// verification. Cost is shown here because this is the owner's own view.
export default function VehicleParts({
  vehicleId,
  vehicle,
  archived,
  parts,
  onChanged,
}: {
  vehicleId: number;
  // The owner's view of the vehicle (model/year/verified/archivedAt) for the share text.
  vehicle: PublicVehicle;
  // Parts of an archived vehicle can't be linked to new posts, so no "후기 쓰기".
  archived: boolean;
  parts: VehiclePart[];
  onChanged: () => void;
}) {
  // null = closed, 'new' = add form, number = editing that part.
  const [editing, setEditing] = useState<'new' | number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [imageIds, setImageIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmSpec, setConfirmSpec] = useState<DialogSpec | null>(null);

  const current = parts.filter((p) => !p.removedOn);
  const past = parts.filter((p) => p.removedOn);
  const editingPart = typeof editing === 'number' ? parts.find((p) => p.id === editing) ?? null : null;

  function openForm(part: VehiclePart | null) {
    setEditing(part ? part.id : 'new');
    setRemoving(null);
    setImageIds(part ? part.imageIds : []);
    setError('');
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      setEditing(null);
      setRemoving(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '부품을 저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - imageIds.length;
    if (room <= 0) {
      setError(`사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const ids: number[] = [];
      for (const file of Array.from(files).slice(0, room)) ids.push(await uploadImage(file));
      setImageIds((prev) => [...prev, ...ids]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 올리지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  function submitPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const input: VehiclePartInput = {
      brand: String(form.get('brand') || '').trim(),
      name: String(form.get('name') || '').trim(),
      spec: String(form.get('spec') || '').trim(),
      installedOn: String(form.get('installedOn') || ''),
      removedOn: editingPart?.removedOn ? String(form.get('removedOn') || '') || null : null,
      installMileage: numberOrNull(form.get('installMileage')),
      removeMileage: editingPart?.removedOn ? numberOrNull(form.get('removeMileage')) : null,
      cost: numberOrNull(form.get('cost')),
      imageIds,
      isPublic: form.get('isPublic') === 'on',
    };
    void run(() => (editingPart ? updateVehiclePart(vehicleId, editingPart.id, input) : createVehiclePart(vehicleId, input)));
  }

  function submitRemoval(event: FormEvent<HTMLFormElement>, part: VehiclePart) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const input = {
      ...toInput(part),
      removedOn: String(form.get('removedOn') || ''),
      removeMileage: numberOrNull(form.get('removeMileage')),
    };
    void run(() => updateVehiclePart(vehicleId, part.id, input));
  }

  function requestDelete(part: VehiclePart) {
    setConfirmSpec({
      kind: 'confirm',
      title: '부품 기록을 삭제할까요?',
      message: '이 부품의 장착·탈거 기록을 삭제해요. 연결된 글은 남고 장착 정보만 사라져요. 되돌릴 수 없어요.',
      confirmLabel: '삭제',
      onConfirm: async () => {
        await deleteVehiclePart(vehicleId, part.id);
        onChanged();
      },
    });
  }

  function partCard(part: VehiclePart) {
    return (
      <div key={part.id} className={styles.recordRow}>
        <div>
          <small className={styles.empty}>{partPeriodLabel(part, kstToday())}</small>
          <strong>
            {part.brand} {part.name}
          </strong>
          {part.spec && <p>{part.spec}</p>}
          {part.isPublic ? (
            <>
              <a className={styles.empty} href={partShareUrl(vehicleId, part.id).replace(/^https:\/\/[^/]+/, '')}>
                공유 링크
              </a>
              <CopyTextButton text={partShareText(part, vehicle, kstToday())} />
            </>
          ) : (
            <small className={styles.empty}>비공개 부품은 공유 링크가 열리지 않아요.</small>
          )}
          <small className={styles.empty}>
            {[
              part.isPublic ? '' : '비공개',
              part.cost != null ? `${part.cost.toLocaleString()}원` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </small>
          {removing === part.id && (
            <form className={styles.partInlineForm} onSubmit={(e) => submitRemoval(e, part)}>
              <div className={styles.formRow}>
                <label>
                  탈거일
                  <input
                    name="removedOn"
                    type="date"
                    required
                    min={part.installedOn}
                    max={kstToday()}
                    defaultValue={kstToday()}
                    disabled={busy}
                  />
                </label>
                <label>
                  탈거 시 주행거리(km)
                  <input name="removeMileage" type="number" min={part.installMileage ?? 0} max={2000000} disabled={busy} />
                </label>
              </div>
              <div className={styles.partActions}>
                <button type="button" className={styles.dialogCancel} disabled={busy} onClick={() => setRemoving(null)}>
                  취소
                </button>
                <button type="submit" className={styles.primary} disabled={busy}>
                  탈거 기록
                </button>
              </div>
            </form>
          )}
        </div>
        <div className={styles.partButtons}>
          {!archived && (
            <a
              className={styles.repButton}
              href={`/community/new?category=parts&vehicleId=${vehicleId}&partId=${part.id}`}
            >
              후기 쓰기
            </a>
          )}
          <button type="button" className={styles.repButton} disabled={busy} onClick={() => openForm(part)}>
            수정
          </button>
          {!part.removedOn && (
            <button
              type="button"
              className={styles.repButton}
              disabled={busy}
              onClick={() => {
                setRemoving(part.id);
                setEditing(null);
                setError('');
              }}
            >
              탈거
            </button>
          )}
          <button type="button" className={styles.dangerText} disabled={busy} onClick={() => requestDelete(part)}>
            삭제
          </button>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="vehicle-parts-title">
      <h3 id="vehicle-parts-title">부품 {parts.length}</h3>
      <p className={styles.empty}>현재 장착 {current.length}</p>
      {!current.length && <p className={styles.empty}>장착 중인 부품이 없어요.</p>}
      <div className={styles.recordList}>{current.map(partCard)}</div>
      {past.length > 0 && (
        <>
          <p className={styles.empty}>과거 부품 {past.length}</p>
          <div className={styles.recordList}>{past.map(partCard)}</div>
        </>
      )}
      {error && (
        <p className={styles.dialogError} role="alert">
          {error}
        </p>
      )}
      {editing === null ? (
        <button type="button" className={styles.repButton} disabled={busy} onClick={() => openForm(null)}>
          부품 추가
        </button>
      ) : (
        <form key={String(editing)} onSubmit={submitPart}>
          <div className={styles.formRow}>
            <label>
              브랜드
              <input name="brand" required maxLength={100} defaultValue={editingPart?.brand ?? ''} disabled={busy} />
            </label>
            <label>
              제품명
              <input name="name" required maxLength={150} defaultValue={editingPart?.name ?? ''} disabled={busy} />
            </label>
          </div>
          <label>
            장착일
            <input
              name="installedOn"
              type="date"
              required
              max={kstToday()}
              defaultValue={editingPart?.installedOn ?? kstToday()}
              disabled={busy}
            />
          </label>
          {/* Removal fields stay outside "더보기" so browser validation can focus them. */}
          {editingPart?.removedOn && (
            <div className={styles.formRow}>
              <label>
                탈거일
                <input
                  name="removedOn"
                  type="date"
                  required
                  min={editingPart.installedOn}
                  max={kstToday()}
                  defaultValue={editingPart.removedOn}
                  disabled={busy}
                />
              </label>
              <label>
                탈거 시 주행거리(km)
                <input
                  name="removeMileage"
                  type="number"
                  min={editingPart.installMileage ?? 0}
                  max={2000000}
                  defaultValue={editingPart.removeMileage ?? ''}
                  disabled={busy}
                />
              </label>
            </div>
          )}
          <details>
            <summary>더보기 (규격·주행거리·비용·사진·공개)</summary>
            <label>
              규격
              <input name="spec" maxLength={200} defaultValue={editingPart?.spec ?? ''} placeholder="예: 245/40R18" disabled={busy} />
            </label>
            <div className={styles.formRow}>
              <label>
                장착 시 주행거리(km)
                <input name="installMileage" type="number" min={0} max={2000000} defaultValue={editingPart?.installMileage ?? ''} disabled={busy} />
              </label>
              <label>
                비용(원, 나만 보기)
                <input name="cost" type="number" min={0} max={2000000000} defaultValue={editingPart?.cost ?? ''} disabled={busy} />
              </label>
            </div>
            <label>
              사진 (최대 {MAX_PHOTOS}장)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={busy || imageIds.length >= MAX_PHOTOS}
                onChange={(e) => {
                  void addPhotos(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {imageIds.length > 0 && (
              <div className={styles.partPhotos}>
                {imageIds.map((id) => (
                  <span key={id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={styles.vehiclePhoto} src={imageUrl(id)} alt="부품 사진" />
                    <button
                      type="button"
                      className={styles.dangerText}
                      disabled={busy}
                      onClick={() => setImageIds((prev) => prev.filter((x) => x !== id))}
                    >
                      제거
                    </button>
                  </span>
                ))}
              </div>
            )}
            <label>
              <input name="isPublic" type="checkbox" defaultChecked={editingPart?.isPublic ?? true} disabled={busy} />
              공개 (끄면 나만 볼 수 있고 사진·공유 링크도 다른 사람에게 바로 보이지 않아요)
            </label>
          </details>
          <div className={styles.partActions}>
            <button type="button" className={styles.dialogCancel} disabled={busy} onClick={() => setEditing(null)}>
              취소
            </button>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? '저장 중…' : editingPart ? '부품 저장' : '부품 추가'}
            </button>
          </div>
        </form>
      )}
      {confirmSpec && <CommunityDialog spec={confirmSpec} onClose={() => setConfirmSpec(null)} />}
    </section>
  );
}
