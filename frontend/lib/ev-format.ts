import type {EvCategory, EvChangeFilter, EvScope, EvStatus} from './ev-types';

export const CATEGORY_LABELS: Record<EvCategory, string> = {BUY: '구매·지원', DRIVE: '운행·혜택'};
export const SCOPE_LABELS: Record<EvScope, string> = {NATIONAL: '전국 공통', REGIONAL: '지역 한정'};
// PROPOSED는 "검토 중·미확정"으로 명확히 표시한다 — 확정 정책처럼 보이지 않게(원 지시).
export const STATUS_LABELS: Record<EvStatus, string> = {
  ACTIVE: '적용 중',
  SCHEDULED: '시행 예정',
  PROPOSED: '검토 중·미확정',
  EXPIRED: '종료',
};
export const CHANGE_FILTER_LABELS: Record<EvChangeFilter, string> = {
  scheduled: '시행 예정',
  recent: '최근 시행',
  ending: '종료 예정',
  expired: '종료',
  proposed: '검토 중',
};

// /ev, /ev/buy, /ev/drive가 공용으로 쓰는 "전체 정책 목록" 상태 필터 — 지시 §3 "필터: 전체/적용
// 중/시행 예정/검토 중/종료"와 같다.
export const STATUS_FILTER_OPTIONS: {key: string; label: string; status?: EvStatus}[] = [
  {key: 'all', label: '전체'},
  {key: 'ACTIVE', label: '적용 중', status: 'ACTIVE'},
  {key: 'SCHEDULED', label: '시행 예정', status: 'SCHEDULED'},
  {key: 'PROPOSED', label: '검토 중', status: 'PROPOSED'},
  {key: 'EXPIRED', label: '종료', status: 'EXPIRED'},
];

export function formatDate(date: string | null): string {
  return date ?? '미정';
}

// endDate가 null이라는 사실만으로 "무기한"이라고 적지 않는다 — endDateIndefinite를 함께 봐야 한다.
export function formatEndDate(endDate: string | null, endDateIndefinite: boolean): string {
  if (endDateIndefinite) return '종료일 없음(무기한)';
  if (endDate) return endDate;
  return '종료일 확인 중';
}

// D-day는 effectiveDate가 있을 때만 계산한다(그 외엔 null — 호출부가 표시를 생략해야 한다).
// KST 달력 날짜 문자열(YYYY-MM-DD) 간 차이이므로 UTC 자정 기준으로 빼면 시간대 영향이 없다.
export function dDay(effectiveDate: string | null, today: string): number | null {
  if (!effectiveDate) return null;
  const diff = Date.parse(`${effectiveDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(diff / 86_400_000);
}

export function dDayLabel(days: number): string {
  if (days === 0) return 'D-day';
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}
