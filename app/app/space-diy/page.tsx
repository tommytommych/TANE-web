import type { Metadata } from 'next';
import SpaceDiyShell from '../../components/spaceDiy/SpaceDiyShell';

export const metadata: Metadata = {
  title: 'TANE:i AI空間DIY',
};

export default function SpaceDiyPage() {
  return <SpaceDiyShell />;
}
