// Run: cd frontend && node --test --experimental-strip-types lib/motorsport.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  barTitle,
  gridRange,
  hiddenCounts,
  kstDateTimeLabel,
  localRangeLabel,
  monthGrid,
  seriesStyle,
  weekSegments,
} from './motorsport.ts';

const ev = (id, startsOn, endsOn) => ({id, startsOn, endsOn});

test('month grid shows only the weeks the month touches', () => {
  assert.equal(monthGrid('2026-11').length, 5); // Sun Nov 1 – Sat Dec 5
  assert.equal(monthGrid('2026-08').length, 6); // Sat Aug 1 … Mon Aug 31
  assert.equal(monthGrid('2026-02').length, 4); // Sun Feb 1 – Sat Feb 28
  assert.equal(monthGrid('2026-05').length, 6); // Fri May 1 … Sun May 31
  for (const m of ['2026-11', '2026-08', '2026-02', '2026-12', '2027-01']) {
    const flat = monthGrid(m).flat();
    assert.equal(flat[0].date.length, 10);
    assert.equal(new Date(`${flat[0].date}T00:00:00Z`).getUTCDay(), 0, `${m} starts on Sunday`);
    assert.equal(flat.filter((c) => c.inMonth).length, new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate());
  }
  assert.deepEqual(gridRange('2026-11'), {from: '2026-11-01', to: '2026-12-05'});
  assert.deepEqual(gridRange('2026-12'), {from: '2026-11-29', to: '2027-01-02'});
});

test('multi-day events become one bar per week and continue across weeks', () => {
  const [week1, week2] = monthGrid('2026-11').map((w) => w.map((c) => c.date));
  const crossing = ev(1, '2026-11-06', '2026-11-09'); // Fri → Mon
  const [first] = weekSegments(week1, [crossing]);
  assert.deepEqual({start: first.start, span: first.span, before: first.continuesBefore, after: first.continuesAfter}, {start: 5, span: 2, before: false, after: true});
  const [second] = weekSegments(week2, [crossing]);
  assert.deepEqual({start: second.start, span: second.span, before: second.continuesBefore, after: second.continuesAfter}, {start: 0, span: 2, before: true, after: false});
  // Crossing a month boundary into the greyed days of the last week.
  const last = monthGrid('2026-11')[4].map((c) => c.date);
  const [abuDhabi] = weekSegments(last, [ev(5, '2026-12-04', '2026-12-06')]);
  assert.deepEqual({start: abuDhabi.start, span: abuDhabi.span, after: abuDhabi.continuesAfter}, {start: 5, span: 2, after: true});
});

test('same-day events stack without overlapping and keep their lane within a week', () => {
  const week = monthGrid('2026-11')[0].map((c) => c.date);
  const segs = weekSegments(week, [ev(1, '2026-11-06', '2026-11-08'), ev(2, '2026-11-06', '2026-11-08'), ev(3, '2026-11-07', '2026-11-07'), ev(4, '2026-11-02', '2026-11-03')]);
  const lane = Object.fromEntries(segs.map((s) => [s.event.id, s.lane]));
  assert.equal(lane[4], 0); // earlier, nothing in the way
  assert.equal(lane[1], 0); // free again from Fri
  assert.equal(lane[2], 1);
  assert.equal(lane[3], 2); // Sat already holds lanes 0 and 1
  for (const a of segs)
    for (const b of segs)
      if (a !== b && a.lane === b.lane) assert.ok(a.start + a.span <= b.start || b.start + b.span <= a.start, 'no overlap in a lane');
  assert.deepEqual(hiddenCounts(segs, 2), [0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(hiddenCounts(segs, 3), [0, 0, 0, 0, 0, 0, 0]);
});

test('labels use venue-local dates and say the KST date for start times', () => {
  assert.equal(localRangeLabel('2026-11-06', '2026-11-08'), '2026년 11월 6일 (금) – 11월 8일 (일)');
  assert.equal(localRangeLabel('2026-12-30', '2027-01-02'), '2026년 12월 30일 (수) – 2027년 1월 2일 (토)');
  assert.equal(localRangeLabel('2026-11-19', '2026-11-19'), '2026년 11월 19일 (목)');
  // Interlagos first practice 12:30 local (UTC-3) = 11/7 00:30 KST.
  assert.equal(kstDateTimeLabel('2026-11-06T15:30:00Z'), '11월 7일 (토) 오전 12:30');
});

test('bars always carry a text label, not just a colour', () => {
  assert.equal(seriesStyle({kind: 'RACE', series: {code: 'f1', name: 'Formula 1'}}).label, 'F1');
  assert.equal(seriesStyle({kind: 'RACE', series: {code: 'gt-asia', name: 'GT Asia'}}).label, 'GT Asia');
  assert.equal(seriesStyle({kind: 'TRACK_DAY', series: null}).label, '스포츠주행');
  assert.notEqual(seriesStyle({kind: 'RACE', series: {code: 'f1', name: 'F1'}}).color, seriesStyle({kind: 'RACE', series: {code: 'wec', name: 'WEC'}}).color);
});

test('bar text drops a repeated series prefix only', () => {
  assert.equal(barTitle('F1 상파울루 그랑프리 2026', 'F1'), '상파울루 그랑프리 2026');
  assert.equal(barTitle('WEC 몬차 6시간 2026', 'WEC'), '몬차 6시간 2026');
  assert.equal(barTitle('F12 테스트', 'F1'), 'F12 테스트');
  assert.equal(barTitle('F1', 'F1'), 'F1');
});

test('a longer event wins the upper lane over a one-day event starting the same day', () => {
  const week = monthGrid('2026-11')[0].map((c) => c.date);
  const segs = weekSegments(week, [ev(1, '2026-11-06', '2026-11-08'), ev(2, '2026-11-06', '2026-11-08'), ev(6, '2026-11-07', '2026-11-07'), ev(7, '2026-11-07', '2026-11-10')]);
  const lane = Object.fromEntries(segs.map((s) => [s.event.id, s.lane]));
  assert.equal(lane[7], 2);
  assert.equal(lane[6], 3);
});
