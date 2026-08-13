import type { Metadata } from 'next';
import { Suspense } from 'react';
import StudioEmbed from '../../components/studio/StudioEmbed';

export const metadata: Metadata = {
  title: 'TANE:i 設計スタジオ',
};

export default function StudioPage() {
  // StudioEmbed内でuseSearchParams()（?from=cad等の判定用）を使うため、
  // Next.jsの要件どおりSuspense境界で包む。StudioEmbed自体のロジックは変更しない
  return (
    <Suspense fallback={null}>
      <StudioEmbed />
    </Suspense>
  );
}
