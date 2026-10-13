// /ev/* 공개 화면이 쓰는 타입. 필드 이름은 board-service의 실제 응답(board-service/src/ev.js)과
// 그대로 맞춘다 — MORETHANCAR_EV_TASKS.md §4.1의 계약과 동일하다.
export type EvCategory = 'BUY' | 'DRIVE';
export type EvScope = 'NATIONAL' | 'REGIONAL';
export type EvStatus = 'ACTIVE' | 'SCHEDULED' | 'PROPOSED' | 'EXPIRED';
export type EvRevisionKind = 'INITIAL' | 'CHANGE' | 'CORRECTION';
export type EvChangeFilter = 'scheduled' | 'recent' | 'ending' | 'expired' | 'proposed';

export type EvSource = {publisher: string; title: string; url: string; checkedOn: string};

// 이전 버전과 비교할 때 보여줄 최소 필드(요약만으로 부족해 상태·혜택도 공개, 전문은 아님).
export type EvPreviousVersion = {
  versionNo: number;
  summary: string;
  status: EvStatus;
  benefit: string;
  effectiveDate: string | null;
  endDate: string | null;
};

// 버전 하나(현재·예정 변경·이력·타임라인 항목이 모두 이 모양을 쓴다).
export type EvVersion = {
  versionNo: number;
  revisionKind: EvRevisionKind;
  summary: string;
  keyPoints: string;
  target: string;
  benefit: string;
  howToApply: string;
  note: string | null;
  status: EvStatus;
  changeConfirmed: boolean;
  // 시행일/종료일이 지났는데 상태가 그대로면 true — "확정 시행"으로 단정하지 않고 재확인 필요만 표시.
  needsReview: boolean;
  announcedOn: string | null;
  effectiveDate: string | null;
  endDate: string | null;
  // endDate가 null이라는 것만으로 "무기한"을 뜻하지 않는다 — 이 값이 true일 때만 무기한이 확정된 것.
  endDateIndefinite: boolean;
  lastVerifiedOn: string | null;
  changeSummary: string | null;
  cancelled: boolean;
  cancellationNote: string | null;
  sources: EvSource[];
  previousVersion: EvPreviousVersion | null;
  previousVersionNote: string | null;
};

// 목록("카드")에 쓰는 가벼운 모양 — 상세와 달리 본문 전체/출처/이력이 없다.
export type EvPolicyCard = {
  slug: string;
  title: string;
  category: EvCategory;
  scope: EvScope;
  regionNote: string | null;
  featured: boolean;
  versionNo: number;
  summary: string;
  target: string;
  status: EvStatus;
  changeConfirmed: boolean;
  effectiveDate: string | null;
  endDate: string | null;
  endDateIndefinite: boolean;
  lastVerifiedOn: string | null;
};

export type EvRelatedPolicy = {slug: string; title: string; summary: string; status: EvStatus};

export type EvPolicyDetail = {
  slug: string;
  title: string;
  category: EvCategory;
  scope: EvScope;
  regionNote: string | null;
  featured: boolean;
  current: EvVersion;
  upcomingChanges: EvVersion[];
  history: EvVersion[];
  relatedPolicies: EvRelatedPolicy[];
};

export type EvChangeEntry = EvVersion & {slug: string; title: string; category: EvCategory};

export type EvChangesResponse = {today: string; filter: string; changes: EvChangeEntry[]};
