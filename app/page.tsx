import Header from './components/lp/Header';
import Hero from './components/lp/Hero';
import Story from './components/lp/Story';
import Concept from './components/lp/Concept';
import TaneI from './components/lp/TaneI';
import Community from './components/lp/Community';
import Future from './components/lp/Future';
import Footer from './components/lp/Footer';

// TANE PROJECT 公式サイト（ブランド体験サイト）。TANE:iアプリ本体（/app）とは
// 独立しており、フォント・配色トークンもLP専用のものを使う（globals.cssの
// --font-inter / --font-noto-jp / --color-lp-* 参照。/appのfont-sansには影響しない）
export default function LpPage() {
  return (
    <main
      className="min-h-screen bg-[#FAF8F4] text-[#1F3028]"
      style={{ fontFamily: 'var(--font-inter), var(--font-noto-jp), sans-serif' }}
    >
      <Header />
      <Hero />
      <Story />
      <Concept />
      <TaneI />
      <Community />
      <Future />
      <Footer />
    </main>
  );
}
