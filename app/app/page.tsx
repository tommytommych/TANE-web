'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import { KOHNAN_WOOD_LIST, AMAZON_TOOLS, shuffleArray } from '../lib/constants';
import {
  type Message,
  type MaterialGroup,
  type SheetLayout,
  type AssemblyManual,
  extractContextFromContent,
  stripInternalBlocks,
} from '../lib/cutlist';
import { deriveProjectFlags } from '../lib/projectStatus';
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
import { getLocalRemainingCount, consumeLocalUsage, setLocalRemainingCount } from '../lib/localUsage';

import TopBar from '../components/layout/TopBar';
import LeftSidebar from '../components/layout/LeftSidebar';
import RightPanel from '../components/layout/RightPanel';
import SavedItemsModal from '../components/layout/SavedItemsModal';
import MessageList from '../components/chat/MessageList';
import ChatInput from '../components/chat/ChatInput';
import StartCards from '../components/chat/StartCards';

// LINE bot(app/api/line/route.js)・app/lib/rateLimit.tsと同じ回数・仕様
const DAILY_MESSAGE_LIMIT = 10;
const DAILY_IMAGE_LIMIT = 5;
const MESSAGE_USAGE_STORAGE_KEY = 'tanei-message-usage-v1';
const IMAGE_USAGE_STORAGE_KEY = 'tanei-image-usage-v1';

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
  // SSRとの整合性のため初期値はfalse（閉）にしておき、デスクトップ幅の場合だけ
  // マウント後に開く。true始まりだとモバイルで初回表示時に全画面ドロワーが
  // かぶさってしまうため（スマホ体験の改善）
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [shuffledTools, setShuffledTools] = useState(AMAZON_TOOLS);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    // 画像生成回数はサーバー側で管理していないため、localStorageの値のみで
    // マウント時に同期する（初期値5のままだとリロードで毎回リセットされてしまうため）。
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

  const handleNewConversation = useCallback(() => {
    if (messages.length > 1 && !window.confirm('現在の会話をリセットして、新しい相談を始めますか？\n（これまでの相談内容は「相談履歴」に保存されています）')) {
      return;
    }
    setMessages([WELCOME_MESSAGE]);
    setSelectedImage(null);
    setInput('');
    setHasGeneratedPdf(false);
    setHasGeneratedAssembly(false);
    showToast('新しい相談を始めましょう🌱');
  }, [messages.length, showToast]);

  // 木取り図・PDF・組立説明書の各生成機能は、必要な状態に達するまで実行できないようにする
  // （ProjectStatus: Draft → Interviewing → DesignReady → CutListReady → PdfReady → AssemblyReady）
  const projectFlags = useMemo(
    () => deriveProjectFlags(messages, hasGeneratedPdf, hasGeneratedAssembly),
    [messages, hasGeneratedPdf, hasGeneratedAssembly]
  );

  const addItem = useCallback(
    async (type: SavedItemType, title: string, content: string, file?: { dataUrl: string; mimeType: string }) => {
      const newItem: SavedItem = {
        id: Date.now().toString(),
        type,
        title,
        content,
        fileDataUrl: file?.dataUrl,
        fileMimeType: file?.mimeType,
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
    async (id: string, updates: { title?: string; content?: string }) => {
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

  const handleDownloadCutSheetPdf = useCallback(async (
    materialGroups?: MaterialGroup[] | 'blank',
    sheetLayouts?: SheetLayout[]
  ) => {
    const isBlank = materialGroups === 'blank';
    const usingChatData = !isBlank && ((!!materialGroups && materialGroups.length > 0) || (!!sheetLayouts && sheetLayouts.length > 0));
    setIsGeneratingPdf(true);
    showToast(
      isBlank
        ? 'TANE:iカット申込書（原紙）を生成しています…'
        : usingChatData
        ? 'この会話の木取り図をもとにPDFを生成しています…'
        : 'TANE:iオリジナル汎用カット申込書PDFを生成しています…'
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
        isBlank ? 'カット申込書（原紙）' : '①ホームセンター提出用PDF',
        isBlank
          ? '手書き記入用の白紙カット申込書です。'
          : usingChatData
          ? 'この会話の木取り図データをもとに生成したカット申込書です。'
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
      showToast('PDFの生成に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [addItem, showToast]);

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
  }, [messages, selectedImage, isLoading, addItem, remainingCount, showToast]);

  // 現状はベータ版のため、画像生成は外部のGemini Web版に任せる（プロンプトをコピーして新規タブで開く）。
  // 本格稼働時にAPI化する想定で、promptOverrideを渡せば任意のプロンプト（カメオのデザイン案など）でも同じ導線を使える
  const handleOpenGeminiImage = useCallback((promptOverride?: string) => {
    if (remainingImageCount <= 0) {
      showToast('本日の画像生成回数が上限（5回）に達しました。');
      return;
    }

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

    setRemainingImageCount(consumeLocalUsage(IMAGE_USAGE_STORAGE_KEY, DAILY_IMAGE_LIMIT));
    window.open('https://gemini.google.com/', '_blank');
  }, [messages, remainingImageCount, showToast]);

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
          />

          {messages.length === 1 && (
            <StartCards
              onSendMessage={sendMessage}
              onOpenPhotoPicker={() => fileInputRef.current?.click()}
            />
          )}
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
          onOpenGeminiImage={() => handleOpenGeminiImage()}
          remainingImageCount={remainingImageCount}
        />
      </div>

      <RightPanel woodList={KOHNAN_WOOD_LIST} tools={shuffledTools} />

      <SavedItemsModal
        activeModal={activeModal}
        savedItems={savedItems}
        onClose={() => setActiveModal(null)}
        onRemove={removeItem}
        onUpdate={updateItem}
        onAdd={addItem}
      />
    </div>
  );
}
