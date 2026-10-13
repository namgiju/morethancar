import type {ReactNode} from 'react';
import EvPage from '../../components/ev/ev-page';

// /ev와 그 하위 전체(buy, drive, changes, policy/[slug])가 공유하는 틀. error.tsx·not-found.tsx도
// 이 레이아웃 안에 끼워지므로 헤더·푸터는 오류·404 상태에서도 그대로 보인다.
export default function EvLayout({children}: {children: ReactNode}) {
  return <EvPage>{children}</EvPage>;
}
