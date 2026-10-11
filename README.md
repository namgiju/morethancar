# morethancar

자동차 오너 커뮤니티 morethancar(morethancar.kr)입니다.

## 구성
- `frontend/`: Next.js 프론트엔드 (운영 화면)
- `backend/`: Java 23 + Spring Boot API (`core`)
- `board-service/`: Node.js/Express 커뮤니티·장터 API (`board`)
- `nginx/`: 단일 진입점 proxy (`/api/board`, `/api/parts` → board, `/api/*` → core, 나머지 → frontend)
- `docker-compose.yml`: proxy, frontend, core, board, redis, postgres
- `docker-compose.prod.yml`: 운영 오버레이 (Neon DB, Cloudflare Tunnel, 네트워크 분리)

기존 순수 HTML 프론트엔드(`assignment-frontend/`)는 Next.js로 모두 이전한 뒤 삭제했습니다.
필요하면 git 이력에서 확인할 수 있습니다.

## 핵심 서비스 방향
- Garage: 차량 프로필, 차량 인증, 튜닝/정비 기록
- Community: 게시글/댓글 + 차량 인장
- Parts: 차량 기반 중고부품 장터
- Drive: 합법적 드라이브/오너 모임

## Docker로 실행

```sh
docker compose up -d --build --wait
# http://localhost:8090
```

운영 배포는 반드시 운영 오버레이를 함께 지정합니다:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait
```

자세한 내용: [docs/DOCKER-SUBMISSION.md](docs/DOCKER-SUBMISSION.md), Docker 과제 기록: [ASSIGNMENT.md](ASSIGNMENT.md)

## 개별 개발 실행
### DB
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
```

### Spring Boot
```bash
cd backend
mvn spring-boot:run
```
API: `http://localhost:8080/api/vehicles`

### Next.js
```bash
cd frontend
npm install
npm run dev
```
웹: `http://localhost:3000`
