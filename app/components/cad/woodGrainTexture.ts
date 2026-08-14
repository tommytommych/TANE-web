// 木目調のプロシージャルテクスチャ生成（Phase D「木材表現」）。
//
// 外部の木目画像ファイルは一切追加せず、Canvas 2D APIで実行時に生成する
// （DIY初心者向けアプリとして依存を増やさない・追加アセットの管理コストを避ける方針）。
// 同じ色に対する下絵（Canvas）は使い回し、パネルごとに毎回ピクセルを描き直さない。
// ただしTHREE.Textureの repeat（板のサイズに応じた木目の密度）はパネルごとに異なるため、
// Textureオブジェクト自体はパネルごとに新しく作り、下絵（HTMLCanvasElement）だけ共有する。

import * as THREE from 'three';

const TEXTURE_SIZE = 256;
const canvasCache = new Map<string, HTMLCanvasElement>();

function darkenHexColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.min(255, (num & 0xff) * (1 - amount)));
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

// 疑似乱数（シード固定）。Math.randomをそのまま使うと、パネルの再レンダリングのたびに
// 木目の模様が変わってしまい「同じ家具なのに見た目がちらつく」ことになるため、
// 色ごとに毎回同じ模様が再現されるようシンプルな線形合同法で決定的にする
function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function hashStringToSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) & 0x7fffffff;
  }
  return hash || 1;
}

function generateWoodGrainCanvas(colorHex: string): HTMLCanvasElement {
  const cached = canvasCache.get(colorHex);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  // 木目（年輪のような、わずかに揺らいだ横縞）を重ねて描く。線の本数・太さ・濃さに
  // ランダム性を持たせることで、単調な縞模様にならないようにする
  const grainColor = darkenHexColor(colorHex, 0.18);
  const random = createSeededRandom(hashStringToSeed(colorHex));
  const LINE_COUNT = 22;
  ctx.strokeStyle = grainColor;
  for (let i = 0; i < LINE_COUNT; i++) {
    const baseY = (i / LINE_COUNT) * TEXTURE_SIZE;
    ctx.globalAlpha = 0.06 + random() * 0.1;
    ctx.lineWidth = 0.6 + random() * 1.8;
    ctx.beginPath();
    let y = baseY + (random() - 0.5) * 5;
    ctx.moveTo(0, y);
    for (let x = 8; x <= TEXTURE_SIZE; x += 8) {
      y += (random() - 0.5) * 3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  canvasCache.set(colorHex, canvas);
  return canvas;
}

/** 指定した色・繰り返し回数の木目テクスチャを新規作成して返す。
 * 下絵（Canvas）はcolorHexごとに使い回すが、repeatはパネルサイズごとに異なるため
 * Textureインスタンス自体は呼び出しごとに新規作成する（呼び出し側でuseMemo等により
 * 不要な再生成を避け、不要になったら.dispose()すること） */
export function createWoodGrainTexture(colorHex: string, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const canvas = generateWoodGrainCanvas(colorHex);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
