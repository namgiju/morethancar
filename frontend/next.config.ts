import type {NextConfig} from 'next';

// 브라우저는 Next.js와 같은 출처로 요청하고, 기존 nginx를 통해 API에 접근한다.
// Docker 이미지 빌드 시에는 http://proxy, 로컬 개발 시에는 localhost:8090을 사용한다.
const backendOrigin = process.env.REVCC_API_ORIGIN || 'http://localhost:8090';

// 부품장터는 잠정 보류(2026-10-11). 화면 코드(app/parts, components/parts)와
// board-service API·DB 데이터는 그대로 두고, 화면 주소로 직접 들어오면 커뮤니티
// "부품 이야기" 게시판으로 보낸다. 다시 열 때는 true로 바꾸고 메뉴(lib/services.ts)에
// 부품장터를 추가한다. 307(임시)이라 브라우저가 이 이동을 영구히 기억하지 않는다.
const PARTS_MARKET_ENABLED = false;

const config: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [{source: '/api/:path*', destination: `${backendOrigin}/api/:path*`}];
  },
  async redirects() {
    if (PARTS_MARKET_ENABLED) return [];
    return [
      {source: '/parts', destination: '/community?category=parts', permanent: false},
      {source: '/parts/:path*', destination: '/community?category=parts', permanent: false},
    ];
  },
};
export default config;
