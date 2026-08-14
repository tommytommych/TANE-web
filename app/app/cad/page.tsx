import type { Metadata } from 'next';
import CadPageShell from '../../components/cad/CadPageShell';

export const metadata: Metadata = {
  title: 'TANE:i 3D家具設計',
};

export default function CadPage() {
  return <CadPageShell />;
}
