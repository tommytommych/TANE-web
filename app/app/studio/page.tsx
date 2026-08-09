import type { Metadata } from 'next';
import StudioEmbed from '../../components/studio/StudioEmbed';

export const metadata: Metadata = {
  title: 'TANE:i 設計スタジオ',
};

export default function StudioPage() {
  return <StudioEmbed />;
}
