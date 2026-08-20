'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

import { KOHNAN_WOOD_LIST, AMAZON_TOOLS, shuffleArray } from '../lib/constants';
import {
  type Message,
  type MaterialGroup,
  type SheetLayout,
  type AssemblyManual,
  extractContextFromContent,
  stripInternalBlocks,
} from '../lib/cutlist';
import { buildUniversalCutSheetPdf } from '../lib/cutSheetPdf';
import { buildBlankCutSheetPdf } from '../lib/blankCutSheetPdf';
import { buildAssemblyInstructionsPdf } from '../lib/assemblyPdf';
import type { SavedItem, SavedItemType } from '../lib/types';
import {
  loadAllSavedItems,
  putSavedItem,
  deleteSavedItem,
  migrateLegacyLocalStorageItems,
  bytesToDataUrl,
} from '../lib/savedItemsStore';
import { downloadPdfBytes } from '../lib/download';
import {
  getLocalRemainingCount,
  consumeLocalUsage,
  setLocalRemainingCount,
  DAILY_IMAGE_LIMIT,
  IMAGE_USAGE_STORAGE_KEY,
} from '../lib/localUsage';

import TopBar from '../components/layout/TopBar';
import LeftSidebar from '../components/layout/LeftSidebar';
import RightPanel from '../components/layout/RightPanel';
import SavedItemsModal from '../components/layout/SavedItemsModal';
import MessageList from '../components/chat/MessageList';
import ChatInput from '../components/chat/ChatInput';
import StartCards from '../components/chat/StartCards';

// LINE bot(app/api/line/route.js)・app/lib/rateLimit.tsと同じ回数・仕様
const DAILY_MESSAGE_LIMIT = 10;
const MESSAGE_USAGE_STORAGE_KEY = 'tanei-message-usage-v1';
// DAILY_IMAGE_LIMIT・IMAGE_USAGE_STORAGE_KEYはapp/lib/localUsage.tsからimport
// チャットと/app/cad（TANE:i 3D家具設計）を行き来しても会話が消えないよう、
// タブを閉じるまで保持されるsessionStorageに会話状態を退避する（詳細は下のuseEffect参照）
const CHAT_SESSION_STORAGE_KEY = 'tanei-chat-session-v1';

// シルエットカメオ5でのカット作業（カス取り）を前提とした固定デザインルール。
// AIが生成したimagePromptの内容によらず、カメオデザイン案の画像生成には常にこれを付加する
const CAMEO_DESIGN_FIXED_REQUIREMENTS =
  'Strict cutting requirements: must be cuttable and weedable on a Silhouette Cameo 5 cutting machine. ' +
  'Simple, sharp, monochrome (pure black and white only, no gradients, no shading, no color) vector-style design. ' +
  'Lines must not be too thin, with solid connecting bridges between all parts (no isolated floating islands). ' +
  'Avoid overly complex fills or overly fine details. Flat die-cut sticker style, white background.';

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: '🌱ようこそ、TANE:i（たねあい）へ。\nあなたの「作りたい」を、一緒にカタチにします。\n作りたいもの、悩んでいること、または「写真で相談」からお部屋の写真を送ってください😊',
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [remainingCount, setRemainingCount] = useState(10);
  const [remainingImageCount, setRemainingImageCount] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  // ProjectStatusの導出に使う「生成実績」。会話履歴からは分からない（PDFはクライアント側で
  // 生成するため）ので、専用のstateとして持つ。新しい相談を始めたらリセットする
  const [hasGeneratedPdf, setHasGeneratedPdf] = useState(false);
  const [hasGeneratedAssembly, setHasGeneratedAssembly] = useState(false);

  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [activeModal, setActiveModal] = useState<SavedItemType | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // ブラウザCAD（/app/cad）の「完成作品として保存する」から /app?openFinished=1&finishedTitle=...
  // で来た場合のみ使う（Phase 3-1）。CAD側からこのページの関数を直接importするのではなく、
  // URLのクエリパラメータだけを橋渡しに使うことで、ルート間の依存を増やさないようにしている
  const [pendingFinishedTitle, setPendingFinishedTitle] = useState<string | undefined>(undefined);
  // 完成作品の元になったCADプロジェクトのid（Phase 3-14）。保存前の設計（projectIdがまだ
  // 無い）から完成作品として保存した場合はundefinedのままになる（それ自体は問題なく、
  // その完成作品には単に「元の設計を開く」導線が出ないだけ）
  const [pendingFinishedProjectId, setPendingFinishedProjectId] = useState<string | undefined>(undefined);
  const [autoOpenFinishedAdd, setAutoOpenFinishedAdd] = useState(false);
  // SSRとの整合性のため初期値はfalse（閉）にしておき、デスクトップ幅の場合だけ
  // マウント後に開く。true始まりだとモバイルで初回表示時に全画面ドロワーが
  // かぶさってしまうため（スマホ体験の改善）
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [shuffledTools, setShuffledTools] = useState(AMAZON_TOOLS);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 保存用effectが、読み込み用effectより先に「読み込み前の初期state」で発火して
  // sessionStorageを上書きしてしまわないようにするためのガード（マウント直後の1回だけスキップする）
  const skipNextSaveRef = useRef(true);

  useEffect(() => {
    // /app/cad（TANE:i 3D家具設計）へ画面遷移して戻ってきた際にNext.jsがこのページを
    // 再マウントしても会話が消えないよう、sessionStorageから復元する。タブを閉じれば
    // 自然に消える（会話を無期限に残したいわけではないため、localStorageではなくこちらを使う）
    try {
      const raw = sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          messages?: Message[];
          hasGeneratedPdf?: boolean;
          hasGeneratedAssembly?: boolean;
        };
        if (Array.isArray(saved.messages) && saved.messages.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setMessages(saved.messages);
          setHasGeneratedPdf(Boolean(saved.hasGeneratedPdf));
          setHasGeneratedAssembly(Boolean(saved.hasGeneratedAssembly));
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    try {
      sessionStorage.setItem(
        CHAT_SESSION_STORAGE_KEY,
        JSON.stringify({ messages, hasGeneratedPdf, hasGeneratedAssembly })
      );
    } catch (e) {
      console.error(e);
    }
  }, [messages, hasGeneratedPdf, hasGeneratedAssembly]);

  useEffect(() => {
    (async () => {
      try {
        await migrateLegacyLocalStorageItems();
        const items = await loadAllSavedItems();
        setSavedItems(items.sort((a, b) => Number(b.id) - Number(a.id)));
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    // ブラウザCADの「完成作品として保存する」からの遷移を検出し、既存の「完成作品」保存
    // モーダルを自動的に開く（Phase 3-1）。history.replaceStateはCadStudio.tsxと同じ
    // 既存パターンを踏襲し、URLを元に戻して再読み込み時に再トリガーしないようにする
    const params = new URLSearchParams(window.location.search);
    if (params.get('openFinished') !== '1') return;
    const title = params.get('finishedTitle') ?? undefined;
    const relatedProjectId = params.get('finishedProjectId') ?? undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveModal('finished');
    setPendingFinishedTitle(title);
    setPendingFinishedProjectId(relatedProjectId);
    setAutoOpenFinishedAdd(true);
    window.history.replaceState(null, '', '/app');
  }, []);

  useEffect(() => {
    // AI機能利用回数（カット申込書PDF・写真AI空間診断・外部Gemini画像生成）は
    // サーバー側で管理していないため、localStorageの値のみでマウント時に同期する
    // （初期値5のままだとリロードで毎回リセットされてしまうため）。
    // 意図的なクライアント専用の外部システム同期のため、react-hooks/set-state-in-effectを明示的に抑制する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemainingImageCount(getLocalRemainingCount(IMAGE_USAGE_STORAGE_KEY, DAILY_IMAGE_LIMIT));

    // 「本日の無料相談」の残り回数は、本来はサーバー（Vercel KV）が真実のソース。
    // ただしKV未接続の環境では常に上限値が返ってきてしまうため、localStorageに
    // 保存した消費済みの回数と突き合わせ、より厳しい（小さい）方を採用する
    (async () => {
      const localRemaining = getLocalRemainingCount(MESSAGE_USAGE_STORAGE_KEY, DAILY_MESSAGE_LIMIT);
      setRemainingCount(localRemaining);
      try {
        const res = await fetch('/api/usage');
        const data = await res.json();
        if (typeof data?.remaining === 'number') {
          const merged = Math.min(localRemaining, data.remaining);
          setRemainingCount(merged);
          setLocalRemainingCount(MESSAGE_USAGE_STORAGE_KEY, DAILY_MESSAGE_LIMIT, merged);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    // SSR時とクライアントでMath.random()の結果が異なりhydrationエラーになるため、
    // マウント後（クライアント側のみ）にシャッフルする。意図的なクライアント専用処理のため、
    // react-hooks/set-state-in-effect（外部システム同期以外でのsetState呼び出しを警告するルール）を明示的に抑制する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShuffledTools(shuffleArray(AMAZON_TOOLS));

    // デスクトップ幅（Tailwindのlgブレークポイント=1024px）の場合のみ、
    // 左サイドバーを開いた状態にする
    if (window.innerWidth >= 1024) {
      setIsLeftSidebarOpen(true);
    }
  }, []);

  // 以下のハンドラはすべてuseCallbackでメモ化している。MessageList/MessageBubbleに
  // React.memoを適用しても、渡す関数の参照が毎レンダー変わってしまうと意味がないため
  // （例：チャット入力欄への1文字入力のたびに、無関係なメッセージ履歴全体が再レンダーされてしまう）
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  const handleAutoOpenFinishedAddHandled = useCallback(() => {
    setAutoOpenFinishedAdd(false);
  }, []);

  const handleNewConversation = useCallback(() => {
    if (messages.length > 1 && !window.confirm('現在の会話をリセットして、新しい相談を始めますか？\n（これまでの相談内容は「相談履歴」に保存されています）')) {
      return;
    }
    setMessages([WELCOME_MESSAGE]);
    setSelectedImage(null);
    setInput('');
    setHasGeneratedPdf(false);
    setHasGeneratedAssembly(false);
    try {
      sessionStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
    } catch (e) {
      console.error(e);
    }
    showToast('新しい相談を始めましょう🌱');
  }, [messages.length, showToast]);

  const addItem = useCallback(
    async (
      type: SavedItemType,
      title: string,
      content: string,
      file?: { dataUrl: string; mimeType: string },
      relatedProjectId?: string
    ) => {
      const newItem: SavedItem = {
        id: Date.now().toString(),
        type,
        title,
        content,
        fileDataUrl: file?.dataUrl,
        fileMimeType: file?.mimeType,
        relatedProjectId,
        date: new Date().toLocaleDateString('ja-JP') + ' ' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      };
      // IndexedDBへの保存に失敗しても（プライベートブラウジング等）、画面上の表示は継続させる
      try {
        await putSavedItem(newItem);
      } catch (e) {
        console.error(e);
        showToast('データの保存に失敗しました（ブラウザの設定をご確認ください）。');
      }
      setSavedItems((prev) => [newItem, ...prev]);
    },
    [showToast]
  );

  const removeItem = useCallback(
    async (id: string) => {
      try {
        await deleteSavedItem(id);
      } catch (e) {
        console.error(e);
        showToast('削除に失敗しました。時間をおいて再度お試しください。');
        return;
      }
      setSavedItems((prev) => prev.filter((item) => item.id !== id));
    },
    [showToast]
  );

  const updateItem = useCallback(
    async (id: string, updates: { title?: string; content?: string; date?: string }) => {
      const existing = savedItems.find((item) => item.id === id);
      if (!existing) return;
      const updated: SavedItem = { ...existing, ...updates };
      try {
        await putSavedItem(updated);
      } catch (e) {
        console.error(e);
        showToast('更新の保存に失敗しました。時間をおいて再度お試しください。');
        return;
      }
      setSavedItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    },
    [savedItems, showToast]
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          setSelectedImage(reader.result as string);
          showToast('写真を添付しました。「写真で相談」内容を入力して送信してください。');
        };
        reader.onerror = () => {
          showToast('写真の読み込みに失敗しました。別の画像でお試しください。');
        };
        reader.readAsDataURL(file);
      }
    },
    [showToast]
  );

  // カット申込書PDF・写真AI空間診断・シルエットカメオ用の外部Gemini画像生成は、
  // いずれも通常のテキスト相談より負荷の大きいAI機能のため、「本日のAI機能利用」として共通の1日5回の
  // 上限で管理する（本日の無料相談＝テキストチャットの回数制限とは別枠）
  const consumeImageUsage = useCallback((): boolean => {
    if (remainingImageCount <= 0) {
      showToast('本日のAI機能のご利用回数が上限（5回）に達しました🙏 また明日ご利用ください。');
      return false;
    }
    setRemainingImageCount(consumeLocalUsage(IMAGE_USAGE_STORAGE_KEY, DAILY_IMAGE_LIMIT));
    return true;
  }, [remainingImageCount, showToast]);

  const handleDownloadCutSheetPdf = useCallback(async (
    materialGroups?: MaterialGroup[] | 'blank',
    sheetLayouts?: SheetLayout[],
    itemName?: string
  ) => {
    if (!consumeImageUsage()) return;
    const isBlank = materialGroups === 'blank';
    const usingChatData = !isBlank && ((!!materialGroups && materialGroups.length > 0) || (!!sheetLayouts && sheetLayouts.length > 0));
    // 「テーブル」「棚」など、AIが会話コンテキスト（tanei-context）に記録した作品名。
    // 保存したカット申込書が複数あるとき、一覧のメモだけで何のデータか分かるようにするため
    // （Phase「カット申込書のメモ自動入力」）。無ければ従来どおりの汎用文言にフォールバックする
    const itemLabel = itemName?.trim() || null;
    setIsGeneratingPdf(true);
    showToast(
      isBlank
        ? 'TANE:iカット申込書（原紙）を生成しています…'
        : usingChatData
        ? 'この会話の木取り図をもとにカット申込書を生成しています…'
        : 'TANE:iオリジナル汎用カット申込書を生成しています…'
    );

    try {
      const pdfBytes = isBlank
        ? await buildBlankCutSheetPdf()
        : usingChatData
        ? await buildUniversalCutSheetPdf(
            materialGroups && materialGroups.length > 0 ? (materialGroups as MaterialGroup[]) : [],
            sheetLayouts
          )
        : await buildUniversalCutSheetPdf();

      const pdfByteArray = new Uint8Array(pdfBytes);
      downloadPdfBytes(pdfByteArray, 'TANEi_Universal_Cut_Sheet.pdf');

      await addItem(
        'pdf',
        isBlank ? 'カット申込書（原紙）' : '①ホームセンター提出用カット申込書',
        isBlank
          ? '手書き記入用の白紙カット申込書です。'
          : usingChatData
          ? itemLabel
            ? `${itemLabel}の木取り図データをもとに生成したカット申込書です。`
            : 'この会話の木取り図データをもとに生成したカット申込書です。'
          : 'サンプルデータで生成したカット申込書です。',
        { dataUrl: bytesToDataUrl(pdfByteArray, 'application/pdf'), mimeType: 'application/pdf' }
      );

      showToast(
        isBlank
          ? 'TANE:iカット申込書（原紙）のダウンロードが完了しました！手書きでご記入いただけます。'
          : usingChatData
          ? 'この会話の内容を反映したカット申込書のダウンロードが完了しました！'
          : 'TANE:iオリジナル汎用カット申込書のダウンロードが完了しました！（サンプルデータで作成）'
      );
    } catch (error) {
      console.error(error);
      showToast('カット申込書の生成に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [addItem, showToast, consumeImageUsage]);

  const handleDownloadAssemblyManualPdf = useCallback(async (manual?: AssemblyManual) => {
    const usingChatData = !!manual;
    setIsGeneratingPdf(true);
    showToast(
      usingChatData
        ? 'この会話の内容をもとに組立説明書PDFを生成しています…'
        : 'TANE:i組立説明書PDFを生成しています…'
    );

    try {
      const pdfBytes = usingChatData ? await buildAssemblyInstructionsPdf(manual) : await buildAssemblyInstructionsPdf();

      const pdfByteArray = new Uint8Array(pdfBytes);
      downloadPdfBytes(pdfByteArray, 'TANEi_Assembly_Manual.pdf');

      await addItem(
        'pdf',
        '②組立説明書PDF',
        usingChatData ? 'この会話の内容をもとに生成した組立説明書です。' : 'サンプルデータで生成した組立説明書です。',
        { dataUrl: bytesToDataUrl(pdfByteArray, 'application/pdf'), mimeType: 'application/pdf' }
      );

      showToast(
        usingChatData
          ? 'この会話の内容を反映した組立説明書のダウンロードが完了しました！'
          : 'TANE:i組立説明書のダウンロードが完了しました！（サンプルデータで作成）'
      );
    } catch (error) {
      console.error(error);
      showToast('PDFの生成に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [addItem, showToast]);

  const sendMessage = useCallback(async (textToSend: string, countUp: boolean = false) => {
    if ((!textToSend.trim() && !selectedImage) || isLoading) return;

    // サーバー(Vercel KV)が管理する「本日の無料相談」の残り回数を、ここでも即座にチェックする
    // （実際の上限判定は/api/chat側で行うが、明らかに0回のときは通信せず先にお知らせする）
    if (countUp && remainingCount <= 0) {
      showToast('本日の無料相談回数の上限（10回）に達しました🙏 また明日ご利用ください。');
      return;
    }

    // 「本日の無料相談」としてカウントする送信は、ここで即座にlocalStorageへも反映する。
    // サーバー(Vercel KV)側でも同時に消費するが、KV未接続の環境（本番でKV未接続の場合を含む）
    // では常に上限値が返ってきてしまい消費が反映されないため、ブラウザ側でも確実に残数を減らす
    if (countUp) {
      setRemainingCount(consumeLocalUsage(MESSAGE_USAGE_STORAGE_KEY, DAILY_MESSAGE_LIMIT));
    }

    if (textToSend.includes('コーナン') && (textToSend.includes('木材') || textToSend.includes('価格') || textToSend.includes('サイズ') || textToSend.includes('リスト'))) {
      const woodText = KOHNAN_WOOD_LIST.map(w => `■ ${w.name}\n・特徴: ${w.feature}\n・サイズ: ${w.size}\n・長さ: ${w.length}\n・価格目安: ${w.price}\n`).join('\n');
      const replyText = `コーナンで取り扱われている代表的な木材のリストです。\n\n${woodText}\n（※価格は店舗や時期によって前後します。）`;

      const newMessages = [...messages, { role: 'user', content: textToSend, image: selectedImage || undefined }, { role: 'assistant', content: replyText }];
      setMessages(newMessages);
      setInput('');
      setSelectedImage(null);
      addItem('history', textToSend, replyText);
      return;
    }

    const currentImg = selectedImage;
    // 写真AI空間診断（写真添付での相談）も、通常のテキスト相談より負荷の大きいAI機能のため
    // 「本日のAI機能利用」の対象とする
    if (currentImg && !consumeImageUsage()) {
      return;
    }
    const newMessages = [...messages, { role: 'user', content: textToSend, image: currentImg || undefined }];
    setMessages(newMessages);
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);
    if (currentImg) setIsAnalyzingPhoto(true);

    addItem('history', textToSend, textToSend);

    try {
      const history = newMessages.map((m) => ({
        role: m.role,
        content: stripInternalBlocks(m.content),
        image: m.image,
      }));

      const lastAssistantContent = [...newMessages].reverse().find((m) => m.role === 'assistant')?.content;
      const context = lastAssistantContent ? extractContextFromContent(lastAssistantContent) : null;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, context, countUsage: countUp }),
      });

      const data = await response.json();

      // サーバー側の値とlocalStorage側の値のうち、より厳しい（小さい）方を残り回数として採用する。
      // KV未接続時はサーバーが常に上限値を返すためlocalStorage側の値がそのまま使われ、
      // KV接続済みで他端末等の利用がある場合はサーバー側のより少ない値が優先される
      if (typeof data?.remaining === 'number') {
        setRemainingCount((prev) => {
          const merged = Math.min(prev, data.remaining);
          setLocalRemainingCount(MESSAGE_USAGE_STORAGE_KEY, DAILY_MESSAGE_LIMIT, merged);
          return merged;
        });
      }

      if (!response.ok) {
        // サーバー側で分類済みの、初心者にも分かるエラーメッセージをそのまま使う
        // （例：AI利用回数の上限に達した場合など）。再送信ボタンを出すため元のテキストを保持する
        const friendlyMessage =
          data && typeof data.reply === 'string' ? data.reply : '通信エラーが発生しました。もう一度お試しください。';
        setMessages([
          ...newMessages,
          { role: 'assistant', content: friendlyMessage, isError: true, retryText: textToSend },
        ]);
        return;
      }

      const replyText = data && data.reply ? data.reply : '回答を受け取れませんでした。';

      setMessages([...newMessages, { role: 'assistant', content: replyText }]);
    } catch (error) {
      console.error(error);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: '通信できませんでした。インターネット接続をご確認のうえ、もう一度お試しください。',
          isError: true,
          retryText: textToSend,
        },
      ]);
    } finally {
      setIsLoading(false);
      setIsAnalyzingPhoto(false);
    }
  }, [messages, selectedImage, isLoading, addItem, remainingCount, showToast, consumeImageUsage]);

  // 現状はベータ版のため、画像生成は外部のGemini Web版に任せる（プロンプトをコピーして新規タブで開く）。
  // 本格稼働時にAPI化する想定で、promptOverrideを渡せば任意のプロンプト（カメオのデザイン案など）でも同じ導線を使える
  const handleOpenGeminiImage = useCallback((promptOverride?: string) => {
    if (!consumeImageUsage()) return;

    let promptText = promptOverride;
    if (promptText) {
      // シルエットカメオ用デザイン案（CameoDesignGalleryの各案）は、AIが書いたimagePromptの
      // 内容によらず、カット作業を前提とした固定ルールを必ず末尾に付加してから画像生成に使う
      promptText = `${promptText}\n\n${CAMEO_DESIGN_FIXED_REQUIREMENTS}`;
    } else {
      const roles = messages.map((m) => m.role);
      const lastAssistantIndex = roles.lastIndexOf('assistant');
      const lastUserIndex = roles.lastIndexOf('user');
      const lastUserMsg = (lastUserIndex >= 0 ? messages[lastUserIndex].content : '') || 'DIYの完成イメージ';

      // アシスタントの最新Context（tanei-context）は、それが生成された時点までの会話しか
      // 反映していない。ユーザーが直近で話題を変えたばかりでまだAIの返答がついていない場合
      // （lastUserIndex > lastAssistantIndex）、Contextは古い話題のまま止まっている可能性が
      // あるため信用せず、最新のユーザーメッセージ自体を優先する
      const context =
        lastAssistantIndex > lastUserIndex ? extractContextFromContent(messages[lastAssistantIndex].content) : null;

      promptText = context?.item
        ? `画像生成：${context.item}の完成イメージ、木製DIY家具、ナチュラルテイスト、高品質レンダリング`
        : `画像生成：${lastUserMsg}のリアルな完成イメージ、木製DIY家具、ナチュラルテイスト、高品質レンダリング`;
    }

    navigator.clipboard.writeText(promptText).then(() => {
      showToast(`「${promptText}」をコピーしました！Geminiに貼り付けてください。`);
    }).catch(() => {
      showToast(`Geminiのページを開きます。`);
    });

    window.open('https://gemini.google.com/', '_blank');
  }, [messages, showToast, consumeImageUsage]);

  // RightPanel「ご意見、リクエストはこちらから」用。ご意見・ご質問フォームへ遷移する前に、
  // 一言添えることでLINE Bot側のハンドオフ案内メッセージと体験を揃える（docs/survey-schema.md参照）
  const handleOpenFeedbackLink = useCallback(() => {
    showToast('ご意見・ご質問フォームを開きます🌱 どんな内容でも歓迎です！');
    window.open(
      'https://docs.google.com/forms/d/e/1FAIpQLSe_AS7xrjQuaa90Ao_E9bwbMwJFvqrNbM2UtKzQvq9sCNg14w/viewform',
      '_blank'
    );
  }, [showToast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage(input, true);
    }
  };

  return (
    <div className="flex h-screen bg-tanei-bg text-tanei-ink font-sans relative overflow-hidden">
      {toastMessage && (
        <div
          role="status"
          className="fixed top-5 left-1/2 transform -translate-x-1/2 z-50 bg-tanei-brand-dark text-white px-5 py-3 rounded-2xl shadow-xl text-sm flex items-center gap-3 animate-fade-in border border-tanei-brand max-w-[90vw]"
        >
          <span>🌱</span>
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            aria-label="通知を閉じる"
            className="text-white/70 hover:text-white text-xs font-bold flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      <LeftSidebar
        isOpen={isLeftSidebarOpen}
        onClose={() => setIsLeftSidebarOpen(false)}
        remainingCount={remainingCount}
        remainingImageCount={remainingImageCount}
        onSendMessage={sendMessage}
        onDownloadBlankCutSheet={() => handleDownloadCutSheetPdf('blank')}
        isGeneratingPdf={isGeneratingPdf}
        onOpenModal={(type) => setActiveModal(type)}
      />

      {/* メインチャット画面 */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          isLeftSidebarOpen={isLeftSidebarOpen}
          onToggleSidebar={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
          onNewConversation={handleNewConversation}
        />

        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          <MessageList
            messages={messages}
            isLoading={isLoading}
            isAnalyzingPhoto={isAnalyzingPhoto}
            messagesEndRef={messagesEndRef}
            onOpenGeminiImage={handleOpenGeminiImage}
            onSendMessage={sendMessage}
            onDownloadCutSheet={handleDownloadCutSheetPdf}
            onDownloadAssemblyManual={handleDownloadAssemblyManualPdf}
            isGeneratingPdf={isGeneratingPdf}
            addItem={addItem}
            showToast={showToast}
            onFocusChatInput={() => textInputRef.current?.focus()}
          />

          {messages.length === 1 && <StartCards onSendMessage={sendMessage} />}
        </div>

        <ChatInput
          input={input}
          onInputChange={setInput}
          onKeyDown={handleKeyDown}
          onSend={() => sendMessage(input, true)}
          isLoading={isLoading}
          selectedImage={selectedImage}
          onSelectImage={handleImageSelect}
          onClearImage={() => setSelectedImage(null)}
          fileInputRef={fileInputRef}
          textInputRef={textInputRef}
        />
      </div>

      <RightPanel woodList={KOHNAN_WOOD_LIST} tools={shuffledTools} onOpenFeedbackLink={handleOpenFeedbackLink} />

      <SavedItemsModal
        activeModal={activeModal}
        savedItems={savedItems}
        onClose={() => setActiveModal(null)}
        onRemove={removeItem}
        onUpdate={updateItem}
        onAdd={addItem}
        showToast={showToast}
        initialAddTitle={pendingFinishedTitle}
        initialAddRelatedProjectId={pendingFinishedProjectId}
        autoOpenAdd={autoOpenFinishedAdd}
        onAutoOpenAddHandled={handleAutoOpenFinishedAddHandled}
      />
    </div>
  );
}
