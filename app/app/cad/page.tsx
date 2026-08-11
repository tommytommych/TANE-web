import type { Metadata } from 'next';
import CadPageShell from '../../components/cad/CadPageShell';

export const metadata: Metadata = {
  title: 'TANE:i ブラウザCAD',
};

export default function CadPage() {
  return <CadPageShell />;
}
