interface TaneminMascotProps {
  leaf?: string;
  seed?: string;
  bg?: string;
  cheek?: string;
  className?: string;
}

// たねみんのビジュアルコンセプト（双葉・種・笑顔・丸いフォルム・円）を表現した
// オリジナルの簡易マスコットアイコン。配色だけ差し替えて複数体を並べられるようにしている
export default function TaneminMascot({
  leaf = '#6BAA4A',
  seed = '#5A3E1E',
  bg = '#F6EAD1',
  cheek = '#F08A2A',
  className = '',
}: TaneminMascotProps) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <circle cx="100" cy="100" r="96" fill={bg} />
      <path d="M100 96 C78 96 62 78 62 54 C86 54 100 70 100 96Z" fill={leaf} />
      <path d="M100 96 C122 96 138 78 138 54 C114 54 100 70 100 96Z" fill={leaf} />
      <ellipse cx="100" cy="130" rx="38" ry="34" fill={seed} />
      <circle cx="88" cy="124" r="4" fill={bg} />
      <circle cx="112" cy="124" r="4" fill={bg} />
      <path d="M86 138 Q100 150 114 138" stroke={bg} strokeWidth="4" strokeLinecap="round" fill="none" />
      <circle cx="75" cy="134" r="5" fill={cheek} opacity="0.6" />
      <circle cx="125" cy="134" r="5" fill={cheek} opacity="0.6" />
    </svg>
  );
}
