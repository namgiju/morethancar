// 서버 컴포넌트에서 JSON-LD <script> 태그에 안전하게 집어넣을 문자열을 만든다.
// JSON.stringify만 쓰면 콘텐츠 값에 "</script>"가 들어 있을 때 태그가 깨질 수 있으므로
// "<"를 유니코드 탈출 시퀀스로 바꿔 스크립트 경계를 넘지 못하게 한다.
export function toJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
