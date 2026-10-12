import {NextRequest, NextResponse} from 'next/server';

// App Router injects inline scripts (RSC payload), so the strict nginx CSP
// (`script-src 'self'`) would block hydration. Each page response carries its
// own nonce-based CSP instead; nginx only adds its strict CSP when the upstream
// sent none (nginx/default.conf). Inline `style={...}` attributes can't carry a
// nonce, and a nonce in style-src would disable 'unsafe-inline', so styles stay
// on 'unsafe-inline'.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // 카카오맵 JS SDK(lib/kakao-maps.ts)의 타일·마커 이미지·XHR용. 이 <script>는 strict-dynamic이
    // 신뢰된 코드(Next의 nonce 붙은 번들)가 동적으로 추가하므로 script-src에 호스트를 더할 필요는
    // 없다. 실제 발급된 키로 /spots를 띄워 Network 탭으로 확인한 실제 도메인:
    // dapi.kakao.com(SDK 스크립트, 이미 허용됨), t1.kakaocdn.net(SDK 본체·커서 이미지),
    // mts.kakaocdn.net(지도 타일) — 최초 작성 시 추정했던 daumcdn.net이 아니라 kakaocdn.net이었다
    // (이 CSP가 막고 있어서 지도 컨테이너·현재 위치 마커는 뜨는데 타일만 안 보이는 증상이 있었다,
    // 2026-10-12 확인). 스킴을 지정하지 않아 로컬 http와 운영 https 둘 다에서 매치된다.
    "img-src 'self' blob: data: *.kakaocdn.net *.daumcdn.net",
    "connect-src 'self' https://dapi.kakao.com *.kakaocdn.net *.daumcdn.net",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({request: {headers: requestHeaders}});
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|main/|brand/).*)',
      missing: [
        {type: 'header', key: 'next-router-prefetch'},
        {type: 'header', key: 'purpose', value: 'prefetch'},
      ],
    },
  ],
};
