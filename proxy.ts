import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// TANE:iチャットアプリ専用ドメイン。同じコードベース・同じmainブランチを
// 複数のVercelプロジェクトにデプロイしているため、ホスト名で見た目を出し分ける。
// このドメインのルート("/")だけは、LP(app/page.tsx)ではなくチャットアプリ(app/app/page.tsx)を表示する
const TANEI_APP_HOSTS = ['tane-i.vercel.app', 'tanei.taneproject.com'];

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') || '';

  if (TANEI_APP_HOSTS.includes(host) && request.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL('/app', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/',
};
