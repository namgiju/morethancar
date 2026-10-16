import type {MetadataRoute} from 'next';

const BASE_URL = 'https://morethancar.kr';

// 저장소에 robots.txt가 처음 생기는 것이라 보수적인 기본값만 둔다 — 관리자 화면(/admin 전체)만
// 크롤링 자체를 막고, 그 외 공개 라우트는 각 페이지의 metadata.robots(이미 존재, 예:
// /admin/ev·빈 목록인 /ev/* 등)가 개별적으로 noindex를 판단한다. 두 메커니즘이 겹치지 않게
// 여기서는 "크롤링 허용 여부"만 다루고 "색인 허용 여부" 판단은 각 페이지에 그대로 둔다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {userAgent: '*', allow: '/', disallow: '/admin/'},
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
