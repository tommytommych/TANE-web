'use client';

import { memo } from 'react';
import type { CameoDesignCandidate } from '../../lib/cutlist';

interface CameoDesignGalleryProps {
  designs: CameoDesignCandidate[];
  onOpenGeminiImage: (prompt: string) => void;
}

// AIが提案した3つのカメオデザイン候補を並べ、それぞれ外部Geminiで画像生成できるボタンを添える
function CameoDesignGallery({ designs, onOpenGeminiImage }: CameoDesignGalleryProps) {
  return (
    <div className="w-full mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
      {designs.map((design, index) => (
        <div
          key={index}
          className="bg-white border border-tanei-border rounded-tanei-card overflow-hidden shadow-sm flex flex-col p-3"
        >
          <div className="text-sm font-bold text-tanei-ink">{design.title}</div>
          <p className="text-xs text-tanei-ink-muted mt-1 flex-1">{design.description}</p>
          <button
            onClick={() => onOpenGeminiImage(design.imagePrompt)}
            className="mt-2 text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110 text-white px-2.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1"
          >
            <span>✨</span> この案をGeminiで生成する
          </button>
        </div>
      ))}
    </div>
  );
}

export default memo(CameoDesignGallery);
