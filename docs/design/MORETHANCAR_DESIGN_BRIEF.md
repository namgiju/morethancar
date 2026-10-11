# morethancar 디자인 리뉴얼 브리프

> **2026-10-11 갱신:** 시각 방향은 이 문서의 9~13장("Night Drive Journal" 제안) 대신 화이트 테마 레퍼런스
> `references/badges/레퍼런스최종.png`를 따른다(메인 `/`는 `8eae7e0`에서 구현). 부품장터는 잠정 보류되어
> 메뉴에서 빠졌다(`89f92fb`). 3~8장의 기능 분석은 여전히 유효하다.

> 작성일: 2026-10-11 · 기준 코드: `main` (`0c9478c`), `frontend/` (Next.js App Router)
> 용도: AI 이미지 생성 도구(ChatGPT 등)로 **웹사이트 화면 레퍼런스 이미지**를 만들기 위한 브리프. 코드 수정용 명세가 아니다.

## 0. 이 문서를 읽는 AI에게

- 이 문서의 모든 기능 설명은 **실제 코드에 구현된 기능**만 다룬다. 표기 규칙:
  - **[현재]**: 지금 코드와 화면에 실제로 있는 것.
  - **[제안]**: 리뉴얼을 위한 새 디자인 아이디어. 시각 표현, 배치, 스타일만 바꾸며 **새 기능을 뜻하지 않는다**.
  - **[없음]**: 레퍼런스에 넣으면 안 되는 기능. 실제로 존재하지 않는다.
- 레퍼런스 이미지의 UI 텍스트는 **한국어**로 쓴다. 서비스 대상이 한국 사용자다.
- 실제 브랜드의 로고, 엠블럼, 번호판 숫자는 이미지에 넣지 않는다. 차량은 특정 제조사가 드러나지 않는 일반적인 형태로 표현한다.

---

## 1. 프로젝트 소개와 브랜드 정체성

| 항목 | 내용 |
|---|---|
| 서비스명 | **morethancar** (항상 소문자 한 단어) |
| 도메인 | morethancar.kr |
| 태그라인 [현재] | "차, 그 이상." / 메인 헤드라인 "당신의 드라이빙이 콘텐츠가 되는 곳" |
| 보조 카피 [현재] | 로그인 화면 eyebrow "DRIVE · SHARE · CONNECT", 푸터 "Built for car people.", 부품장터 "좋은 부품, 새로운 드라이브." |
| 성격 | 자동차 오너와 애호가를 위한 커뮤니티 플랫폼 |
| 브랜드 방향 | 자동차를 이동 수단이 아닌 **취향과 라이프스타일**로 바라본다. 핵심 가치는 **경험 · 기록 · 소통** |
| 기술 | Next.js(TypeScript), Spring Boot, Node.js(Express), PostgreSQL, Redis |

### 로고 [현재]
- 파일: `public/main/morethancarLogo.png`
- 형태: 검정색 **굵은 소문자 산세리프 워드마크** "morethancar". 자간이 좁은 헤비 그로테스크 계열이며 심볼이나 아이콘은 없다.
- 헤더에서는 높이 56px, 푸터 32px, 로그인 카드 30px로 쓰인다.
- 리뉴얼에서도 워드마크 형태는 유지하는 것을 전제로 한다. 어두운 배경에서는 흰색 반전 버전을 쓴다고 가정한다.

### 메인 비주얼 [현재]
- 파일: `public/main/hero-drive.jpg` (1983×793, 초광폭)
- 내용: 해 질 녘 산 위 와인딩 도로의 전망대. 실버 계열의 고성능 세단이 오른쪽에 뒷모습으로 서 있고, 일자형 테일램프가 붉게 빛난다. 아래로는 바다, 섬, 해안 도시의 야경이 펼쳐진다. 하늘은 남색에서 주황으로 넘어가는 그라데이션이다.
- 분위기: 시네마틱하고 감성적인 "드라이브의 한 장면". 이 톤이 브랜드 무드의 출발점이다.

---

## 2. 핵심 사용자와 사용 목적

| 사용자 | 목적 | 대응 기능 [현재] |
|---|---|---|
| 자동차 오너 | 내 차를 등록하고 정비·튜닝·부품 기록을 남긴다. 오너 인증을 받는다 | 내 차고(`/home`), 차량 등록, 오너 인증 신청, 기록 관리 |
| 자동차 애호가 | 다른 오너의 이야기를 읽고 차고를 구경하고 소통한다 | 커뮤니티, 공개 차고, 방명록, 댓글, 추천 |
| DIY·정비 관심층 | 정비 노하우와 부품 장착 후기를 공유한다 | 커뮤니티 "정비 / DIY", "부품 이야기" 게시판 |
| 부품 판매자·구매자 | 중고 부품을 직거래한다 | 부품장터(`/parts`), 판매글, 관심 매물 |
| 운영자(ADMIN) | 신고 처리, 회원·차량 인증 관리 | 관리자 화면(`/admin`). **리뉴얼 레퍼런스 범위에서는 제외** |

---

## 3. 사이트 구조 (실제 라우트)

| 경로 | 화면 | 비고 |
|---|---|---|
| `/` | 메인 | 서버 렌더링(SSR). 오늘의 인기글, 실시간 인기, 오늘의 차고, 장터 새 매물 |
| `/login`, `/signup`, `/password-reset` | 로그인 / 회원가입 / 비밀번호 재설정 | 중앙 카드형. 로그인에는 카카오 로그인 버튼이 있다 |
| `/community` | 커뮤니티 목록 | 3단 레이아웃 |
| `/community/{category}/{id}` | 게시글 상세 | category: free, maintenance, parts, drive |
| `/community/new`, `/community/{category}/{id}/edit` | 글쓰기 / 수정 | |
| `/community/members/{id}` | 회원의 공개 차고 | 차량 카드, 방명록, 최근 글 |
| `/community/cars/{id}` | 공개 차량 페이지 | 차량 사진·소개, 정비·튜닝·부품 기록 |
| `/home` | **내 차고** (개인) | 로그인 필요 |
| `/parts` | 부품장터 목록 | |
| `/parts/{id}`, `/parts/new`, `/parts/{id}/edit` | 매물 상세 / 등록 / 수정 | |
| `/admin` | 관리자 | 레퍼런스 범위 제외 |
| `/garage`, `/garage/new`, `/vehicles/{id}` | 초기 프로토타입 "My Garage" | 내비게이션에서 연결되지 않는 예전 화면이다. 실제 내 차고는 `/home`. **레퍼런스 범위 제외** |

주 메뉴 [현재]: **홈 · 커뮤니티 · 내 차고 · 부품장터** (+ ADMIN에게만 "관리")

---

## 4. 현재 디자인 시스템 [현재]

### 색상
라이트 테마를 쓴다. 각 화면의 CSS Module에 같은 토큰이 반복 정의되어 있다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#ffffff` | 페이지 배경 (인증 화면은 `#f5f6f8`) |
| `--ink` | `#262a2f` | 본문 텍스트 |
| `--muted` | `#85888d` | 보조 텍스트 |
| `--line` | `#edeef0` | 구분선, 카드 테두리 |
| `--accent` | `#3478c7` | 링크, 현재 메뉴, 강조 (차분한 블루) |
| 필터 활성 | `#292e32` | 선택된 필터 칩 배경 (흰 글자) |
| 위험 | `#c4413a` | 삭제, 오류 |
| 성공 | `#2f8a4c` | 인증 완료 등 |
| 히어로 오버레이 | `#10131a` → 투명 그라데이션 | 메인 히어로 사진 왼쪽 텍스트 영역 |

- 참고: `app/globals.css`에는 초기 다크 테마(`#0b0c0f` 배경) 규칙이 남아 있다. 지금 실제 화면은 라이트 테마다.

### 타이포그래피
- 폰트: 시스템 폰트 스택 `-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`. 별도 웹폰트는 없다.
- 메인 히어로 제목: 24–34px, weight 800, 자간 -1.2px
- 메뉴: 14px, weight 650 / 본문 기본 line-height 1.6

### 형태
- 카드: 흰 배경, 1px 연회색 테두리, radius 14px. 호버하면 테두리가 연한 파랑(`#c7d4e6`)으로 바뀐다.
- 버튼: 히어로 CTA는 흰색 알약형(radius 999px). 나머지는 작은 보조 버튼이다.
- 아이콘: 별도 아이콘 세트가 없다. 이모지(🔍 👁 💬 ♥ 🚗)와 텍스트 기호(→ ＋ ✓)를 쓴다.
- 사진 비율: 게시글 카드 16:10, 장터 매물 4:3
- 모션: 메인 카드가 스크롤하면 나타나는 reveal 애니메이션이 있고, `prefers-reduced-motion`을 지원한다.

### 레이아웃 폭
- 헤더와 본문 최대 폭: 메인 1600px, 커뮤니티 1800px, 부품장터 1600px, 내 차고 1100px. 화면마다 다르다.

---

## 5. 공통 헤더 · 내비게이션 · 푸터 [현재]

### 헤더 (높이 72px, sticky, 반투명 흰색 + blur)
왼쪽부터 다음 순서로 놓인다.
1. 로고 (워드마크)
2. 통합 검색창: placeholder "차종, 게시글, 유저 검색", 최대 폭 540px, 연회색 배경. 제출하면 `/community?q=`로 이동한다.
3. 주 메뉴: 홈 / 커뮤니티 / 내 차고 / 부품장터 (/ 관리). 현재 메뉴는 accent 색에 밑줄 2px.
4. 우측 액션
   - 비로그인: "로그인 / 가입"
   - 로그인(커뮤니티 계열 헤더): "내 활동" 버튼, "알림" 버튼(읽지 않은 수 배지), "{아이디} 님", "로그아웃"
   - 메인 헤더: "알림" 표시와 배지, 이니셜 아바타, "{아이디} 님", "로그아웃"

"내 활동" 패널 [현재]: 내가 쓴 글 / 댓글 남긴 글 / 저장한 글 / 내 차고 / 내 신고 내역
"알림" 패널 [현재]: "{이름} 님이 댓글을 남겼어요 · {글 제목}" 목록. 열면 모두 읽음 처리된다.

### 푸터
- 로고와 "차, 그 이상."
- 서비스 링크: 커뮤니티 / 내 차고 / 부품 찾기
- 사업자 정보 블록: 대표, 사업자등록번호, 소재지, 이메일. **현재는 UI 테스트용 임시 정보**라서 레퍼런스에서는 회색 더미 텍스트로 표현한다.
- "© 2026 morethancar · Built for car people.", 개발 중 안내 문구, "맨 위로 ↑" 버튼

---

## 6. 페이지별 기능과 콘텐츠 구성

### 6-1. 메인 `/` [현재]
1. **헤더**
2. **히어로**: 전폭 초광폭 사진(최소 높이 360px). 왼쪽에 어두운 그라데이션을 깔고 흰색 3줄 헤드라인을 올린다.
   "당신의 드라이빙이 / 콘텐츠가 되는 곳 / morethancar" + 흰색 알약 CTA "지금, 내 차고 만들기 →". 비로그인이면 로그인으로, 로그인 상태면 `/home`으로 이동한다.
3. **메인 그리드** (본문 + 360px 사이드바)
   - 왼쪽 "오늘의 인기글" + "더보기 →"
     - 필터 칩 두 그룹: 카테고리(전체 / 자유 / 정비/DIY / 부품 / 드라이브), 기간(오늘 / 주간 / 전체)
     - 2열 카드 4개: 대표 사진(16:10) 또는 빈 그라데이션, 카테고리 라벨, 제목, 👁 조회 · 💬 댓글 · ♥ 추천
   - 오른쪽 "실시간 인기": 추천순 TOP 10 순위 리스트(번호 + 제목). 1–3위 번호는 강조한다.
4. **하단 2열**
   - "오늘의 차고": 공개 차량 중 하루 단위로 고른 한 대. 사진, 모델명, "연식 · 트림", "{오너} 님 · 기록 N개", "차고 구경하기 →"
   - "장터 새 매물" + "전체보기 →": 최근 판매중 매물 2건(썸네일, 제목, 가격 "000,000원", "3시간 전")
5. **푸터**

### 6-2. 커뮤니티 목록 `/community` [현재]
3단 레이아웃(180px / 본문 / 300px)이다.
- **왼쪽 내비게이션**: "커뮤니티" 제목
  - 게시판: 전체 게시글 / 자유게시판 / 정비 / DIY / 부품 이야기 / 드라이브
  - "＋ 글쓰기"
  - "빠른 이동": 내가 쓴 글 / 댓글 남긴 글 / 저장한 글 / 최근 본 글
- **본문**
  - eyebrow "COMMUNITY", 게시판 제목과 설명(예: "정비 / DIY — 정비 경험과 직접 관리하는 노하우를 나눠보세요."), "＋ 글쓰기"
  - 검색: "제목, 내용, 작성자 검색" + 검색 버튼
  - 컨트롤: 정렬(최신순 / 추천순), 차종 입력(예: 아반떼 N) + 적용, 초기화
  - **표 형식 목록**: 컬럼은 제목 · 작성자 · 작성일 · 조회 · 추천 · 댓글. 제목 셀에는 사진이 있을 때만 작은 썸네일을 붙이고 카테고리 라벨을 단다. 탈퇴 회원은 "탈퇴한 회원"으로 표시한다.
  - "이야기 더 보기" 버튼으로 20개씩 추가로 불러온다(무한 스크롤이 아님).
- **오른쪽 사이드바**
  - "지금 인기글": 추천순 TOP 5
  - "MY GARAGE": 로그인 사용자의 대표 차량 미니 카드. 비로그인이면 안내를 보여준다.
  - "최근 본 글": 이 브라우저에서 읽은 글

### 6-3. 게시글 상세 `/community/{category}/{id}` [현재]
3단 레이아웃(280px / 본문 / 320px)이다.
- **왼쪽 작성자 카드**
  - 커버 사진(프로필 커버 또는 대표 차량 사진)과 아바타(사진 또는 이니셜)
  - 가입일, 게시글 / 댓글 / 받은 추천 수
  - "✓ 오너 인증 완료" 표시, 인장(배지) 목록, 등록 차량
- **본문**
  - 제목, 메타 정보, "수정됨" 표시, 본문(일반 텍스트), 사진 최대 3장
  - 액션: "♡ 추천 N", 북마크(저장됨), 링크 복사, 수정(작성자) / 삭제(작성자·관리자) / 신고(작성자 외)
  - "작성자의 인장"
  - **댓글**: 작성 폼이 목록 위에 있고, 답글은 1단계까지만 달 수 있다.
- **오른쪽 맥락 패널**
  - "이 글에 연결된 차량" 또는 "관련 차종"
  - "이 차종의 인기글"
  - "같은 카테고리의 최신글"
- 인장(배지) [현재]: **별도 아트워크가 없고** 텍스트와 체크 표시다. [제안] 금속 엠블럼 느낌의 작은 육각형 배지로 시각화할 수 있다.

### 6-4. 글쓰기 `/community/new` [현재]
- 게시판 선택(자유게시판 / 정비 / DIY / 부품 이야기 / 드라이브)
- 제목(150자, 글자 수 카운터)
- **내 차량 연결** 선택: "연결하지 않음" 또는 등록 차량 중 하나
- 본문(5000자, 일반 텍스트)
- 사진: JPG · PNG · WebP, 장당 3MB, 최대 3장
- 오른쪽에는 "커뮤니티 이용 수칙"과 "글 작성 팁" 카드가 있다.

### 6-5. 공개 차고 `/community/members/{id}` · 공개 차량 `/community/cars/{id}` [현재]
- 공개 차고: "{이름} 님의 차고" 차량 카드(사진, 모델, 연식·트림, 기록 수), **방명록**(20개씩 더 보기), 최근 작성한 이야기
- 공개 차량: 오너, 연식·트림, 사진, 차 소개, **정비 / 튜닝 / 부품 기록**(날짜, 제목, 내용, 비용, 주행거리)

### 6-6. 내 차고 `/home` [현재] (로그인 필요)
최대 폭 1100px. 위에서 아래로 다음 순서다.
1. 페이지 제목 "내 차고" — "나의 자동차 생활을 기록하는 공간, morethancar"
2. **내 프로필** 패널
   - 커버 이미지, 아바타, 아이디, 한 줄 소개
   - 획득 인장 목록 (없으면 "차량 인증을 완료하면 오너 인장이…" 안내)
   - "프로필 편집", "회원 탈퇴"(빨간 텍스트)
3. **2:1 그리드**
   - 왼쪽 "대표 차량" 카드
     - 큰 사진(없으면 🚗 플레이스홀더), 제조사(eyebrow), 닉네임 또는 모델명, 연식 · 트림
     - 인증 상태 칩: 인증 전 / 인증 검토 중 / 인증 반려 / 인증 완료
     - 차 소개, "차량 상세 보기 →", "수정", "오너 인증 신청" 또는 "인증 재신청"
   - 오른쪽 "보유 차량" 리스트 + "차량 등록": 행마다 썸네일, 이름, 연식·트림, "대표 차량 설정"/"대표 차량", "수정"
4. **방명록** (다른 회원이 남긴 메시지)
5. 다이얼로그 [현재]
   - 차량 등록: 제조사, 모델명, 차량번호, 연식, 트림 → 다음 단계에서 자동차등록증 업로드(오너 인증)
   - 차량 정보 수정: 차량 사진, 차 소개, **정비 · 튜닝 · 부품 기록**(종류, 날짜, 제목, 내용, 비용, 주행거리), 차량 삭제
   - 프로필 수정: 프로필 이미지, 커버 이미지, 한 줄 소개
   - 회원 탈퇴 안내

### 6-7. 부품장터 `/parts` [현재]
3단 레이아웃(220px / 본문 / 280px)이다. **현재 반응형 CSS가 없다.**
- 상단: "부품장터" — "오너와 오너를 연결하는 자동차 부품 직거래 장터" / "좋은 부품, 새로운 드라이브.", "판매글 등록"
- **왼쪽**
  - 전체 매물 / 내 판매글 / 관심 매물
  - 부품 카테고리: 휠 / 타이어 · 서스펜션 · 브레이크 · 배기 / 흡배기 · 외장 / 바디 · 내장 · 전장 / ECU · 엔진 / 구동계 · 기타
  - "부품 질문·후기 게시판" 링크(커뮤니티 부품 이야기로 이동)
- **본문**
  - 검색 "부품명, 적용 차종, 키워드 검색"
  - 필터: 카테고리, 거래 상태(판매중 / 예약중 / 판매완료), 지역, 적용 차종
  - 정렬: 최신순 / 인기순 / 낮은 가격순 / 높은 가격순, "필터 초기화"
  - **카드 그리드**(최소 220px, 자동 배치): 4:3 사진(없으면 "등록된 사진 없음"), 상태, 제목, 가격, "판매자 제공 차종 · …", "관심 N"
  - 페이지 이동: 이전 / 다음
- **오른쪽**: "인기 매물"(관심 수 · 조회수 기준), "최근 본 매물"(이 브라우저 기준)

### 6-8. 매물 상세 `/parts/{id}` · 등록 `/parts/new` [현재]
- 상세
  - 사진, 제목, 가격, 판매 상태, 카테고리, 거래 지역, 조회, "♡/♥ 관심 N", "매물 링크 복사"
  - "판매자 제공 적용 차량"
  - **연락 방법은 로그인한 회원에게만 공개**된다(판매자가 적은 이메일 또는 카카오 오픈채팅 주소).
  - 고지 문구: "적용 여부와 부품 상태는 판매자에게 확인해주세요. morethancar가 호환성을 보증하지 않습니다."
  - 판매자는 판매 상태 변경, 수정, 삭제를 할 수 있다.
- 등록
  - 제목, 카테고리, 가격(원), 판매 상태, 거래 지역(예: 경기 성남시 수정구)
  - 판매자 제공 적용 차량("내 등록 차량에서 적용 정보 가져오기" 또는 직접 입력)
  - 설명, 연락 방법, 사진 최대 3장

### 6-9. 로그인 / 회원가입 [현재]
- 연회색 배경 위 중앙 흰 카드: 로고 → eyebrow "DRIVE · SHARE · CONNECT" → 제목(예: "다시 만나서 반가워요.") → 폼 → "© 2026 morethancar · 차, 그 이상."
- 로그인: 아이디, 비밀번호, "비밀번호를 잊으셨나요?", "또는" 구분선, **카카오 로그인**, "아직 회원이 아니신가요?"
- 회원가입: 아이디(중복확인), 이메일(선택, 비밀번호 재설정용), 비밀번호와 확인(8자 이상), 약관·개인정보 처리방침 동의

---

## 7. 레퍼런스에 넣으면 안 되는 것 [없음]

다음은 **구현되어 있지 않다**. 이미지에 넣으면 잘못된 기대를 만든다.
- 채팅/DM, 실시간 메시지, 앱 내 결제·안전결제·배송
- 팔로우/팔로워, 좋아요 외의 리액션 이모지
- 동영상 업로드, 라이브, 스토리
- 지도 기반 드라이브 코스, 모임/이벤트 일정, 캘린더
- 차량 시세·견적 계산, 부품 호환성 자동 판정, AI 추천
- 별점·리뷰 점수, 판매자 신뢰도 점수
- 다크모드 토글 버튼, 다국어 전환
- 모바일 하단 탭바 (현재 없음. 제안으로만 다룰 수 있음, 9장 참고)
- 사진 4장 이상 갤러리 (게시글과 매물 모두 최대 3장)

---

## 8. 반드시 유지해야 하는 UX

1. **주 메뉴 4개**(홈 · 커뮤니티 · 내 차고 · 부품장터)와 상단 **통합 검색**.
2. **로그인하지 않아도 읽을 수 있다**: 메인, 커뮤니티, 게시글, 공개 차고, 장터 목록과 상세. 쓰기·추천·관심·연락처 보기에만 로그인이 필요하다.
3. 커뮤니티 카테고리 4종(자유 / 정비·DIY / 부품 / 드라이브)과 URL 구조 `/community/{category}/{id}`.
4. 게시글과 **내 차량 연결**: 글을 쓸 때 내 차량을 고르고, 상세 화면 오른쪽에 "이 글에 연결된 차량"이 나온다. morethancar만의 핵심 연결고리다.
5. **오너 인증 상태 표시**(인증 전 / 검토 중 / 반려 / 완료)와 "✓ 오너 인증 완료" 신뢰 표시.
6. 차량별 **정비 · 튜닝 · 부품 기록**(기록 = 브랜드 가치 "기록").
7. 공개 차고의 **방명록**(소통).
8. 장터의 **연락처 로그인 공개**와 **호환성 비보증 고지**. 직거래 연결만 하고 거래 중개는 하지 않는다.
9. 판매 상태 3단계(판매중 / 예약중 / 판매완료)와 관심(♡) 수.
10. 빈 상태·오류 문구의 친근한 말투("아직 이야기가 없어요. 첫 자동차 이야기를 남겨주세요.").
11. 접근성: 키보드 조작, `aria` 레이블, 모션 줄이기 설정 존중.
12. 사진 업로드 제한(3장, 3MB, JPG/PNG/WebP)과 자동차등록증의 개인정보 가리기 안내.

---

## 9. 디자인 리뉴얼 방향 [제안]

### 9-1. 현재 디자인의 개선 포인트 (분석 결과)
| # | 현재 상태 | 문제 |
|---|---|---|
| 1 | 화면마다 최대 폭이 다르다(1100 / 1600 / 1800px) | 페이지를 옮길 때 정렬선이 흔들린다 |
| 2 | 색 토큰이 화면별 CSS에 중복 정의되어 있고 globals.css에 예전 다크 테마가 남아 있다 | 시스템이 일관되지 않다 |
| 3 | 브랜드 개성이 히어로 사진에만 있고 나머지는 평범한 흰 화면 + 기본 블루 | "취향과 라이프스타일" 브랜드가 약하다 |
| 4 | 아이콘이 이모지(🔍 👁 💬 ♥ 🚗) | OS마다 다르게 보이고 프리미엄 톤과 맞지 않는다 |
| 5 | 커뮤니티 목록이 표 형식이고 텍스트가 많다 | 사진·차량 중심 서비스인데 시각성이 낮다 |
| 6 | 인장(배지)이 텍스트뿐 | 수집·인증의 즐거움이 드러나지 않는다 |
| 7 | 공통 헤더에서 내 차고·부품장터 화면에서도 "커뮤니티" 메뉴가 활성으로 표시된다 | 현재 위치를 잘못 알려준다 |
| 8 | 부품장터에 반응형 규칙이 없다 | 모바일에서 3단이 그대로 유지돼 깨진다 |
| 9 | 모바일에서 헤더 검색창이 숨겨지고 메뉴가 12px로 줄어든다 | 모바일 탐색성이 낮다 |
| 10 | 메인 히어로가 낮고(360px) 헤드라인이 작다(최대 34px) | 첫인상의 임팩트가 약하다 |
| 11 | 내 차고가 패널 나열식이다 | "나의 차고"라는 공간감과 기록의 축적감이 약하다 |

### 9-2. 디자인 콘셉트
**"Night Drive Journal"**: 해 질 녘 드라이브의 감성(현재 히어로 사진)을 브랜드 전체로 확장한다. 차를 기록하는 **매거진 겸 개인 아카이브** 같은 느낌을 낸다.

- **톤**: 기본은 밝고 깨끗한 화면(정보 가독성 우선). 히어로, 차고, 차량 카드 같은 **감성 영역**에만 딥 네이비/차콜 배경과 시네마틱 사진을 쓴다.
- **컬러 팔레트 [제안]**
  - Ink Black `#0F1115` (워드마크, 헤드라인)
  - Night Navy `#141A2A` (감성 영역 배경)
  - Paper `#F7F7F5` (페이지 배경, 살짝 따뜻한 오프화이트) / Surface `#FFFFFF`
  - Sunset Orange `#FF6B2C` (주요 CTA, 활성 상태: 히어로 노을 색에서 추출)
  - Tail-light Red `#E5322D` (추천·알림 배지에만 소량)
  - Dusk Blue `#4C6FFF` (링크, 보조 강조)
  - Graphite `#6B7079` (보조 텍스트), Line `#E6E7EA`
  - 상태: 인증 완료 Green `#1F9D55`, 검토 중 Amber `#E8A317`, 반려 Red `#D64545`
- **타이포그래피 [제안]**: 헤드라인은 굵고 자간이 좁은 그로테스크(워드마크와 같은 결)로 한다(예: Pretendard ExtraBold, 영문은 Inter Tight/Archivo). 본문은 Pretendard Regular 15–16px. 숫자(가격, 조회수, 주행거리)는 탭 숫자(tabular) 폰트로 계기판 느낌을 낸다.
- **형태 언어 [제안]**
  - 카드 radius 16px, 그림자는 아주 옅게
  - 사진은 크고 풀블리드로 쓴다
  - 칩과 필터는 알약형
  - 인장(배지)은 작은 육각형 금속 엠블럼
  - 아이콘은 1.5px 라인 아이콘 세트(이모지 대체)
- **모티프 [제안]**: 테일램프의 가로 빛줄기를 섹션 구분선과 활성 탭 밑줄로 쓴다. 계기판 숫자 스타일을 통계에 쓴다.

---

## 10. 데스크톱 1440px 기준 레이아웃 [제안]

### 공통 그리드
- 뷰포트 1440px, **콘텐츠 최대 폭 1280px**(좌우 여백 80px). 모든 화면에 통일한다.
- 12컬럼, 컬럼 간격 24px
- 3단 화면은 **좌 240 / 중 736 / 우 256** (간격 24)을 기준으로 한다.

### 헤더 (높이 72px, sticky)
`[워드마크 140px] [메뉴: 홈 · 커뮤니티 · 내 차고 · 부품장터] ——— [검색창 360px] [알림 아이콘+배지] [내 활동] [아바타 + 아이디 ▾]`
- 비로그인일 때 오른쪽은 "로그인" 텍스트 + "가입하기" 오렌지 알약 버튼
- 현재 메뉴는 테일램프 레드 → 오렌지 2px 밑줄

### 메인 `/`
| 영역 | 높이(약) | 구성 |
|---|---|---|
| 헤더 | 72 | 위와 같음 |
| 히어로 | 560 | 풀블리드 노을 드라이브 사진, 왼쪽 하단에 56px 3줄 헤드라인 + 오렌지 CTA "지금, 내 차고 만들기 →" |
| 오늘의 인기글 + 실시간 인기 | 640 | 8컬럼: 필터 칩 2그룹 + 2×2 카드(16:10 사진) / 4컬럼: TOP 10 순위(1–3위 큰 숫자) |
| 오늘의 차고 | 480 | 다크 네이비 밴드 전폭. 왼쪽 큰 차량 사진, 오른쪽 모델·연식·트림·오너·기록 수 + "차고 구경하기 →" |
| 장터 새 매물 | 320 | 매물 카드 2개 가로 배치 + "전체보기 →" |
| 푸터 | 280 | 다크 차콜 배경, 워드마크 화이트 |

### 커뮤니티 `/community`
- 좌 240: 게시판 목록(활성 = 오렌지 바), "＋ 글쓰기" 큰 버튼, 빠른 이동
- 중 736
  - 게시판 타이틀 블록, 검색, 정렬·차종 필터 바
  - [제안] 표 대신 **피드형 행**: 왼쪽 96×72 썸네일(사진이 있을 때), 제목 · 카테고리 칩 · 작성자 · 작성일, 오른쪽에 조회 · 추천 · 댓글을 아이콘과 숫자로
  - 하단 "이야기 더 보기"
- 우 256: 지금 인기글 TOP 5, MY GARAGE 미니 카드(대표 차량 사진 + 인증 칩), 최근 본 글

### 게시글 상세
- 좌 240 작성자 카드(커버 + 아바타 + 인증 + 인장 육각 배지 + 통계 3칸)
- 중 736 본문(제목 32px, 사진 최대 3장 그리드, 액션 바, 댓글)
- 우 256 연결 차량 카드 + 이 차종의 인기글 + 같은 카테고리 최신글

### 내 차고 `/home`
- 상단 **차고 히어로 밴드**(높이 360): 프로필 커버 이미지 위에 아바타, 아이디, 한 줄 소개, 인장 엠블럼 줄, "프로필 편집"
- 본문 8:4
  - 왼쪽: 대표 차량을 **쇼룸 카드**로(16:9 대형 사진, 제조사 eyebrow, 모델 40px, 연식·트림, 인증 칩, 차 소개, 액션 버튼). 아래에 **기록 타임라인**(정비 / 튜닝 / 부품 아이콘, 날짜, 비용, 주행거리). 기록 데이터 자체는 실제 기능이고 [현재]는 차량 수정 다이얼로그와 공개 차량 페이지에 있다.
  - 오른쪽: 보유 차량 리스트(썸네일 + "대표 차량 설정") + "차량 등록" 버튼
- 하단: 방명록(말풍선 카드 형태)

### 부품장터 `/parts`
- 상단 타이틀 밴드: "부품장터 — 좋은 부품, 새로운 드라이브." + 오렌지 "판매글 등록"
- 좌 240: 전체 매물 / 내 판매글 / 관심 매물, 카테고리 9종(라인 아이콘 포함)
- 중 736: 검색 + 필터 바(카테고리, 거래 상태, 지역, 적용 차종, 정렬) → **3열 매물 카드**(4:3 사진, 상태 배지 오버레이, 제목, 가격 굵게, 적용 차종 회색, ♡ 관심 수) → 이전/다음
- 우 256: 인기 매물, 최근 본 매물

---

## 11. 모바일 반응형 고려사항 [제안]

| 기준 | 내용 |
|---|---|
| 브레이크포인트 | 1280+ 데스크톱 / 1024 태블릿 가로(우측 사이드바 하단 이동) / 768 태블릿(좌측 내비 → 상단 가로 스크롤 칩) / 390 모바일 기준 |
| 헤더(모바일) | 56px: 워드마크 + 검색 아이콘(누르면 전체 화면 검색) + 알림 + 햄버거 또는 아바타. [현재]처럼 검색을 숨기지 않고 아이콘으로 남긴다 |
| 내비게이션 | [제안] 하단 탭바 4개(홈 / 커뮤니티 / 내 차고 / 부품장터). **새 기능이 아니라 기존 주 메뉴의 모바일 배치** |
| 메인 | 히어로 높이 420px, 헤드라인 32px, 사진은 차량 쪽으로 크롭. 인기글 카드는 1열 또는 가로 스와이프. 실시간 인기는 카드 아래로 |
| 커뮤니티 | 게시판 카테고리를 상단 가로 스크롤 칩으로. 목록 행은 썸네일 + 제목 2줄 + 메타 1줄. 글쓰기는 우하단 플로팅 버튼 |
| 게시글 상세 | 1단: 본문 → 작성자 카드(축약) → 연결 차량 → 관련 글 |
| 내 차고 | 1단: 프로필 밴드 → 대표 차량 → 기록 → 보유 차량 → 방명록 |
| 부품장터 | **[현재] 반응형이 없어 가장 우선**. 2열 카드 그리드, 필터는 바텀시트, 카테고리는 가로 칩 |
| 터치 | 최소 터치 영역 44px, 사진은 스와이프 갤러리(최대 3장) |

---

## 12. 이미지 생성 AI용 공통 설명

다음 공통 스타일 블록을 각 프롬프트 앞에 붙여 쓸 수 있다.

> **Common style block**
> A high-fidelity desktop website UI screenshot for "morethancar" (always lowercase), a Korean community platform for car owners and enthusiasts. Brand idea: "more than a car — experience, records, and connection"; tagline "차, 그 이상." Visual concept "Night Drive Journal": clean light off-white (#F7F7F5) content areas with white cards, combined with cinematic deep-navy (#141A2A) bands featuring golden-hour and dusk driving photography. Accent color sunset orange (#FF6B2C) for primary buttons and active states, small touches of tail-light red (#E5322D) for notification badges, dusk blue (#4C6FFF) for links. Typography: bold, tight-tracked grotesque sans-serif headlines (Pretendard ExtraBold style), clean Korean body text (Pretendard Regular), tabular numerals for prices and counts. 16px rounded cards with very soft shadows, pill-shaped filter chips, thin 1.5px line icons (no emoji). Logo: a heavy, tight black lowercase wordmark "morethancar" with no symbol (white version on dark backgrounds). Content max width 1280px on a 1440px viewport, 12-column grid. All UI text in Korean. Cars are generic modern sedans, hatchbacks and coupes with no real manufacturer logos, emblems or readable license plates. Realistic product design, Dribbble/Behance quality, crisp, no device frame, no watermark.

---

## 13. 화면별 영어 프롬프트 (바로 입력용)

> 각 프롬프트는 공통 스타일 블록을 포함해 단독으로 쓸 수 있게 작성했다. 비율은 데스크톱 전체 페이지 기준으로 세로로 긴 이미지(예: 1440×2400)를 권장한다.

### 13-1. 메인 페이지
```
High-fidelity desktop website UI design, full landing page, 1440px wide, tall scrolling screenshot, for "morethancar" — a Korean community platform for car owners and enthusiasts (brand idea: more than a car; experience, records, connection). Visual concept "Night Drive Journal": light off-white (#F7F7F5) background, white cards, cinematic deep-navy (#141A2A) bands, sunset orange (#FF6B2C) accent, tail-light red (#E5322D) only for badges, bold tight grotesque headlines, Pretendard-style Korean body text, thin line icons, 16px rounded cards. All UI text in Korean. No real car brand logos or readable license plates.

Layout from top to bottom, content max width 1280px:
1) Sticky white header 72px: heavy black lowercase wordmark "morethancar" on the left, menu "홈 · 커뮤니티 · 내 차고 · 부품장터" with "홈" active (thin red-to-orange underline), a rounded search field "차종, 게시글, 유저 검색", a bell icon with a small red count badge, and on the right "로그인" text plus an orange pill button "가입하기".
2) Full-bleed cinematic hero, 560px tall: dusk mountain-top viewpoint road, a silver performance sedan seen from behind on the right with a glowing full-width red light-bar taillight, coastline city lights and islands below, navy-to-orange sky. Dark gradient on the left; large white three-line headline "당신의 드라이빙이 / 콘텐츠가 되는 곳 / morethancar" (56px, extra bold) and an orange pill CTA "지금, 내 차고 만들기 →".
3) Two-column section: left (8 columns) titled "오늘의 인기글" with "더보기 →", two rows of pill filter chips ("전체 · 자유 · 정비/DIY · 부품 · 드라이브" and "오늘 · 주간 · 전체", first ones selected in dark), then a 2×2 grid of post cards each with a 16:10 car photo (night drive, garage DIY wrench work, wheel close-up, coastal road), a small category label, a Korean title, and a stats row with eye, comment and heart line icons with numbers. Right (4 columns) white panel "실시간 인기": a numbered ranking list 1–10 of Korean post titles, numbers 1–3 large and orange.
4) Full-width deep-navy band "오늘의 차고": a large photo of one owner's car (modern hatchback in a moody garage) on the left; on the right the model name, "2022년 · 트림명", "오너닉네임 님 · 기록 12개", and a white outline button "차고 구경하기 →".
5) Section "장터 새 매물" with "전체보기 →": two horizontal listing cards with a 4:3 product photo (alloy wheel, brake caliper), Korean title, bold price like "450,000원", and "3시간 전".
6) Dark charcoal footer: white wordmark, "차, 그 이상.", service links "커뮤니티 · 내 차고 · 부품 찾기", gray placeholder company info lines, "© 2026 morethancar · Built for car people.", and a "맨 위로 ↑" button.
Premium, editorial, automotive-lifestyle mood, realistic UI, crisp details, no device mockup, no watermark.
```

### 13-2. 커뮤니티
```
High-fidelity desktop website UI design, community board list page, 1440px wide, for "morethancar", a Korean car-owner community. Style: light off-white background (#F7F7F5), white cards, sunset orange (#FF6B2C) active states and primary button, dusk blue links, bold tight grotesque headings, Pretendard-style Korean text, thin line icons, 16px radius, very subtle shadows. All text in Korean. No real car logos or readable license plates.

Header 72px: black lowercase wordmark "morethancar", menu "홈 · 커뮤니티 · 내 차고 · 부품장터" with "커뮤니티" active, search field "차종, 게시글, 유저 검색", and on the right "내 활동", a bell icon with a red badge "3", a round avatar and "드라이버 님".
Three-column layout within 1280px (240 / 736 / 256):
LEFT sidebar: heading "커뮤니티"; board list "전체 게시글, 자유게시판, 정비 / DIY, 부품 이야기, 드라이브" with "정비 / DIY" active (orange left bar, bold); a full-width orange button "＋ 글쓰기"; a small section "빠른 이동" with "내가 쓴 글, 댓글 남긴 글, 저장한 글, 최근 본 글".
CENTER: small eyebrow "COMMUNITY", large title "정비 / DIY", description "정비 경험과 직접 관리하는 노하우를 나눠보세요."; a search bar "제목, 내용, 작성자 검색" with a "검색" button; a control row with a "정렬: 최신순" dropdown, a "차종" text field with placeholder "예: 아반떼 N", an "적용" button and an "초기화" text link. Below, a feed of 8 post rows: rows with photos show a 96×72 rounded thumbnail (engine bay, oil change, brake pads, detailing), then a bold Korean title, a small category chip, author name and date in gray; on the right compact counters with eye, heart and comment line icons and numbers. Some rows have no thumbnail. At the bottom a wide outline button "이야기 더 보기".
RIGHT sidebar: card "지금 인기글" with a numbered top-5 list; card "MY GARAGE" with a small photo of the user's representative car, the model name, "2021 · 트림" and a green chip "인증 완료"; card "최근 본 글" with 3 short title links.
Footer in dark charcoal. Clean, information-dense but airy, editorial automotive community feel, realistic UI, no device frame, no watermark.
```

### 13-3. 내 차고
```
High-fidelity desktop website UI design, personal "My Garage" dashboard page, 1440px wide, for "morethancar", a Korean car-owner community. Concept "Night Drive Journal": a cinematic deep-navy (#141A2A) profile band on top, light off-white content below, white cards, sunset orange (#FF6B2C) primary actions, status chips in green/amber/red, bold tight grotesque headings, Pretendard-style Korean text, thin line icons. All text in Korean. Cars are generic, with no real logos or readable license plates.

Header 72px: black lowercase wordmark "morethancar", menu "홈 · 커뮤니티 · 내 차고 · 부품장터" with "내 차고" active, search field, bell with red badge, avatar and "드라이버 님".
Page title area: "내 차고" with subtitle "나의 자동차 생활을 기록하는 공간, morethancar".
Profile band (360px): wide cover photo of a twilight coastal road with a dark overlay; a round avatar, username "드라이버", one-line bio "주말마다 와인딩 가는 해치백 오너", a row of small hexagonal metallic emblem badges (one labeled "오너 인증"), and buttons "프로필 편집" (white outline) and a small red text link "회원 탈퇴".
Main grid 8:4 within 1280px:
LEFT: large "대표 차량" showroom card: a 16:9 photo of a dark gray hot hatch in a softly lit garage; small eyebrow manufacturer text "제조사", big model name "모델명 N", "2022 · 퍼포먼스 트림", a green status chip "인증 완료", a short intro "출퇴근과 주말 드라이브를 함께하는 차", a link "차량 상세 보기 →", and buttons "수정". Below it a card "정비 · 튜닝 · 부품 기록" shown as a vertical timeline: each entry has a line icon (wrench for 정비, gauge for 튜닝, gear for 부품), a date "2026.09.14", a Korean title like "엔진오일 교환", a short note, cost "85,000원" and mileage "32,400km".
RIGHT: card "보유 차량" with an orange button "차량 등록" and three rows, each with a thumbnail, car nickname, "연식 · 트림", and a small button "대표 차량" (selected state) or "대표 차량 설정", plus "수정"; one row shows an amber chip "인증 검토 중".
Bottom: a wide "방명록" card with a text input "서로를 존중하는 따뜻한 메시지를 남겨주세요.", a "방명록 등록" button, and three message bubbles from other users with names and dates.
Dark charcoal footer. Personal, warm, archive-like, premium automotive lifestyle, realistic UI, no device frame, no watermark.
```

### 13-4. 부품장터
```
High-fidelity desktop website UI design, used car parts marketplace list page, 1440px wide, for "morethancar", a Korean car-owner community that connects owners for direct parts trading (no in-app payment, no chat). Style: light off-white background (#F7F7F5), white cards, sunset orange (#FF6B2C) primary button and active filters, bold tight grotesque headings, Pretendard-style Korean text, tabular numerals for prices, thin line icons, 16px radius. All text in Korean. No real brand logos on parts or cars.

Header 72px: black lowercase wordmark "morethancar", menu "홈 · 커뮤니티 · 내 차고 · 부품장터" with "부품장터" active, search field, bell, avatar.
Title band: "부품장터" large, subtitle "오너와 오너를 연결하는 자동차 부품 직거래 장터", a short tagline "좋은 부품, 새로운 드라이브.", and an orange pill button "판매글 등록" on the right.
Three-column layout within 1280px (240 / 736 / 256):
LEFT: "전체 매물" (active), "내 판매글", "관심 매물"; heading "부품 카테고리" with line icons: "휠 / 타이어, 서스펜션, 브레이크, 배기 / 흡배기, 외장 / 바디, 내장, 전장 / ECU, 엔진 / 구동계, 기타"; a small link "부품 질문·후기 게시판 →".
CENTER: a search bar "부품명, 적용 차종, 키워드 검색"; a filter row with pill dropdowns "카테고리", "거래 상태", "지역", "적용 차종", a sort dropdown "최신순" and a text link "필터 초기화". Then a 3-column grid of 9 listing cards: each has a 4:3 studio-style product photo (18-inch alloy wheel, coilover suspension, big brake kit caliper, stainless exhaust muffler, carbon front lip, bucket seat, ECU unit, intake filter, LED headlights), a status badge overlaid on the photo ("판매중" dark, one "예약중" amber, one "판매완료" gray and dimmed), a Korean title, a bold price like "1,200,000원", a gray line "판매자 제공 차종 · 아반떼 N", and "♡ 관심 12". Pagination "이전 · 다음" at the bottom.
RIGHT: card "인기 매물" with a small caption "관심 수 · 조회수 기준" and 5 compact rows with thumbnail, title and price; card "최근 본 매물" with 3 compact rows and caption "이 브라우저에서 본 매물".
Dark charcoal footer. Trustworthy, clean, product-focused marketplace with an automotive enthusiast vibe, realistic UI, no device frame, no watermark.
```

### 13-5. (선택) 모바일 버전 프롬프트 접미사
위 프롬프트의 첫 줄을 다음으로 바꾸고, 3단 레이아웃 설명은 1단 순서로 다시 적는다.
```
High-fidelity mobile website UI design, 390×844 iPhone-size viewport, tall scrolling screenshot, single-column layout, 56px header with wordmark, search icon and bell, a bottom tab bar with four tabs "홈 · 커뮤니티 · 내 차고 · 부품장터" (line icons, active tab orange), board categories as a horizontally scrollable chip row, 44px minimum touch targets,
```

---

## 14. 레퍼런스 생성 후 체크리스트
- [ ] 7장의 [없음] 기능(채팅, 결제, 팔로우, 별점, 4장 이상 사진 등)이 들어가지 않았는가
- [ ] 메뉴가 정확히 "홈 · 커뮤니티 · 내 차고 · 부품장터"이고, 현재 페이지 메뉴가 활성으로 표시되는가
- [ ] 커뮤니티 카테고리 4종과 장터 카테고리 9종, 판매 상태 3종이 실제 이름과 일치하는가
- [ ] 실제 자동차 브랜드 로고나 번호판이 노출되지 않는가
- [ ] 워드마크가 소문자 "morethancar"로 표기되는가
