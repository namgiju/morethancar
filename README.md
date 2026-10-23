# morethancar

자동차 오너 커뮤니티입니다. 내 차를 등록·인증하고, 차량 정보와 함께 글을 쓰고, 드라이브 코스와 모터스포츠 일정을 찾을 수 있습니다.

**[morethancar.kr 바로가기](https://morethancar.kr)**

## 주요 기능

| 기능 | 내용 |
|---|---|
| Garage | 차량 프로필 등록, 등록증 기반 차량 인증 및 관리자 승인, 튜닝·정비 기록 |
| Community | 게시글·댓글, 이미지 첨부, 신고, 인증 차량 오너 인장 |
| Drive | 드라이브 게시판, 와인딩 코스·심레이싱 시설을 찾는 스팟 지도 |
| Motorsport | 경기·스포츠주행 일정 캘린더, 한국 시각(KST)과 현지 시각 표시 |
| EV | 전기차 정책·정보 허브 |
| Admin | 회원·게시글·신고·차량 인증·일정 관리 |

차량 기반 중고부품 장터(Parts)는 개발 보류 상태이며, 현재 `/parts`는 커뮤니티의 ‘부품 이야기’ 게시판으로 연결됩니다. 오너 모임 기능은 아직 제공하지 않습니다.

### 모터스포츠 일정 수집

공식 출처에서 일정을 수집해 초안(DRAFT)으로 저장하고, 운영자가 관리자 화면에서 검토한 뒤 공개합니다. 수집기는 일정을 직접 공개하지 않습니다.

지원 출처와 제한 사항, 출처별 활성화 설정, 실행 방법 및 실패 알림은 [모터스포츠 일정 수집 문서](docs/MOTORSPORT-IMPORT.md)를 참고하세요.

## 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | Next.js 16 · React 19 · TypeScript |
| Core API | Java 23 · Spring Boot 3.5 · Spring Data JPA · Flyway |
| Board API | Node.js 22 · Express 5 |
| Proxy | Nginx |
| Database | PostgreSQL 16 · 운영 환경: Neon |
| Session | Redis 7 · core와 board의 로그인 세션 공유 |
| Infrastructure | Docker Compose · Cloudflare Tunnel |
| CI | GitHub Actions |

### 요청 흐름

Nginx를 단일 진입점으로 사용하며, 요청 경로에 따라 각 서비스로 전달합니다.

```text
Client → Nginx
           ├─ /api/board, /api/parts → Board API (Express)
           ├─ 나머지 /api/*         → Core API (Spring Boot)
           └─ 그 외                → Frontend (Next.js)
```

## 디렉터리 구조

```text
morethancar/
├── frontend/                 # Next.js 프론트엔드
├── backend/                  # Core API, Flyway 마이그레이션
├── board-service/            # 커뮤니티·스팟·모터스포츠·EV·관리자 API
├── nginx/                    # 리버스 프록시 설정
├── scripts/                  # 시스템 테스트·스케줄 실행·점검 스크립트
├── docs/                     # 개발·설계·운영 문서
├── docker-compose.yml        # 로컬 전체 서비스 구성
├── docker-compose.dev.yml    # 개별 개발용 DB 포트 설정
└── docker-compose.prod.yml   # 운영 환경 설정
```

## 로컬 실행

Docker 환경에서 다음 명령으로 실행합니다.

```sh
docker compose up -d --build --wait
```

실행 후 [http://localhost:8090](http://localhost:8090)에서 확인할 수 있습니다.

카카오 로그인·지도·메일 발송 등 외부 연동 설정과 서비스별 개별 실행 방법은 [개발 환경 가이드](docs/DEVELOPMENT.md)를 참고하세요.

운영 배포 시에는 반드시 `docker-compose.prod.yml`을 함께 지정해야 합니다. 자세한 절차는 아래 운영 배포 가이드를 참고하세요.

## 문서

| 주제 | 링크 |
|---|---|
| 개발 환경 설정 및 테스트 | [개발 환경 가이드](docs/DEVELOPMENT.md) |
| 운영 배포 | [운영 배포 가이드](docs/DEPLOYMENT.md) |
| 모터스포츠 일정 수집 | [일정 수집 가이드](docs/MOTORSPORT-IMPORT.md) |
| DB 스키마 변경 관리 | [DB 마이그레이션 가이드](docs/DATABASE-MIGRATIONS.md) |