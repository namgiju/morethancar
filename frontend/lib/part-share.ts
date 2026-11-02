// Part history sharing (MVP stage 5): the fixed share URL and the copy text.
// Kept free of imports so `node --test lib/part-share.test.mjs` can load it
// directly. The text never contains the license plate, cost, real name or
// contact — the inputs below don't carry them, and the test checks the output.

export const SITE_URL = 'https://morethancar.kr';

export type ShareablePart = {
  id: number;
  brand: string;
  name: string;
  spec: string;
  installedOn: string;
  removedOn: string | null;
  installMileage: number | null;
  removeMileage: number | null;
  hasPhoto: boolean;
};

export type ShareableVehicle = {
  id: number;
  model: string;
  year: number;
  verified?: boolean;
  archivedAt?: string | null;
};

export const partShareUrl = (vehicleId: number, partId: number) => `${SITE_URL}/community/cars/${vehicleId}/parts/${partId}`;

// Vehicle ownership axis, shown separately from the part's evidence label.
export function vehicleStatusLabel(vehicle: {verified?: boolean; archivedAt?: string | null}): string {
  return vehicle.archivedAt ? '이전 보유 차량' : vehicle.verified ? '인증 차량' : '등록 차량';
}

// Computed evidence label — never 인증/검증 for parts.
export const partEvidenceLabel = (part: {hasPhoto: boolean}) => (part.hasPhoto ? '사진 첨부' : '사용자 입력');

// Whole months from install to removal (or `today` while mounted), "1개월 미만" under one.
export function partSpan(part: {installedOn: string; removedOn: string | null}, today: string): string {
  const [y1, m1, d1] = part.installedOn.split('-').map(Number);
  const [y2, m2, d2] = (part.removedOn ?? today).split('-').map(Number);
  const months = Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
  return months < 1 ? '1개월 미만' : `${months}개월`;
}

// Distance used, only when both mileages are known (removal >= install is enforced server-side).
export function partDistance(part: {installMileage: number | null; removeMileage: number | null}): string {
  return part.installMileage !== null && part.removeMileage !== null
    ? `${(part.removeMileage - part.installMileage).toLocaleString('ko-KR')}km`
    : '';
}

// [부품 이력] {브랜드} {제품명} ({규격})
// 장착 {장착일} ~ {탈거일|현재} ({기간}{, 사용 거리})
// 차량: {연식} {모델} · {인증 차량|등록 차량|이전 보유 차량} / 부품 기록: {사진 첨부|사용자 입력}
// {고정 URL}
export function partShareText(part: ShareablePart, vehicle: ShareableVehicle, today: string): string {
  const distance = partDistance(part);
  return [
    `[부품 이력] ${part.brand} ${part.name}${part.spec ? ` (${part.spec})` : ''}`,
    `장착 ${part.installedOn} ~ ${part.removedOn ?? '현재'} (${partSpan(part, today)}${distance ? `, ${distance}` : ''})`,
    `차량: ${vehicle.year} ${vehicle.model} · ${vehicleStatusLabel(vehicle)} / 부품 기록: ${partEvidenceLabel(part)}`,
    partShareUrl(vehicle.id, part.id),
  ].join('\n');
}
