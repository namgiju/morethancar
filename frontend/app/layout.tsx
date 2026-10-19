import './globals.css';
import {connection} from 'next/server';
import Toaster from '../components/common/toast';
export const metadata = { title: {default: 'morethancar', template: '%s | morethancar'}, description: '차, 그 이상. 자동차 오너 커뮤니티 morethancar' };
// The per-request CSP nonce (proxy.ts) is only applied during dynamic rendering,
// so every route must render per request instead of being prerendered at build.
export default async function RootLayout({children}:{children:React.ReactNode}){await connection();return <html lang="ko"><body>{children}<Toaster /></body></html>}
