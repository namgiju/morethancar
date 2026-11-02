// Run: cd frontend && node --test --experimental-strip-types lib/part-share.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {partShareText, partShareUrl, vehicleStatusLabel} from './part-share.ts';

const part = {
  id: 7,
  brand: 'Michelin',
  name: 'Pilot Sport 4S',
  spec: '245/40R18',
  installedOn: '2025-03-02',
  removedOn: null,
  installMileage: 12000,
  removeMileage: null,
  hasPhoto: true,
};
const vehicle = {id: 3, model: '아반떼 N', year: 2024, verified: true, archivedAt: null};

test('share text follows the agreed four-line format', () => {
  assert.equal(
    partShareText(part, vehicle, '2025-10-15'),
    [
      '[부품 이력] Michelin Pilot Sport 4S (245/40R18)',
      '장착 2025-03-02 ~ 현재 (7개월)',
      '차량: 2024 아반떼 N · 인증 차량 / 부품 기록: 사진 첨부',
      'https://morethancar.kr/community/cars/3/parts/7',
    ].join('\n'),
  );
  const removed = {...part, spec: '', removedOn: '2025-10-01', removeMileage: 21000, hasPhoto: false};
  assert.equal(
    partShareText(removed, {...vehicle, verified: false, archivedAt: '2025-11-01T00:00:00Z'}, '2026-01-01'),
    [
      '[부품 이력] Michelin Pilot Sport 4S',
      '장착 2025-03-02 ~ 2025-10-01 (6개월, 9,000km)',
      '차량: 2024 아반떼 N · 이전 보유 차량 / 부품 기록: 사용자 입력',
      'https://morethancar.kr/community/cars/3/parts/7',
    ].join('\n'),
  );
  assert.equal(partShareText({...part, installedOn: '2025-10-10'}, vehicle, '2025-10-15').split('\n')[1], '장착 2025-10-10 ~ 현재 (1개월 미만)');
});

test('share text never carries cost, plate, name or contact even if the inputs do', () => {
  const leaky = {...part, cost: 1234567, licensePlate: '12가3456', contact: '010-1111-2222'};
  const leakyVehicle = {...vehicle, licensePlate: '12가3456', username: 'real-name', ownerId: 99, cost: 7654321};
  const text = partShareText(leaky, leakyVehicle, '2025-10-15');
  for (const secret of ['1234567', '1,234,567', '7654321', '12가3456', '010-1111-2222', 'real-name', '99'])
    assert.ok(!text.includes(secret), secret);
});

test('vehicle status and fixed URL', () => {
  assert.equal(vehicleStatusLabel({verified: true, archivedAt: null}), '인증 차량');
  assert.equal(vehicleStatusLabel({verified: false}), '등록 차량');
  assert.equal(vehicleStatusLabel({verified: true, archivedAt: '2025-01-01'}), '이전 보유 차량');
  assert.equal(partShareUrl(1, 2), 'https://morethancar.kr/community/cars/1/parts/2');
});
