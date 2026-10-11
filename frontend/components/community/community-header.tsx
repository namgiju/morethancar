// The community screens' header is now the site-wide header (same props:
// auth, search box hooks, login return path), so every page that imports
// this — list, post detail, editor, member/car pages, 내 차고, admin — shows
// the same menu, 내 활동 and 알림 panels. See components/common/site-header.tsx.
export {default} from '../common/site-header';
