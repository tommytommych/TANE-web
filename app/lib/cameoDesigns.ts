// シルエットカメオ（カッティングマシン）向けデザイン候補の型定義

export interface CameoDesignCandidate {
  title: string;
  description: string;
  imagePrompt: string;
}

export const isValidCameoDesignCandidate = (value: unknown): value is CameoDesignCandidate => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === 'string' &&
    typeof v.description === 'string' &&
    typeof v.imagePrompt === 'string'
  );
};
