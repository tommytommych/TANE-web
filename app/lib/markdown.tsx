import type { ComponentProps } from 'react';
import type { Components } from 'react-markdown';

export const getMarkdownComponents = (isUser: boolean): Components => {
  const linkClass = isUser ? 'text-white underline' : 'text-blue-600 underline';
  const codeClass = isUser ? 'bg-white/20' : 'bg-black/[.05]';
  const borderClass = isUser ? 'border-white/30' : 'border-[#E6DEC9]';

  return {
    p: ({ ...props }: ComponentProps<'p'>) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
    a: ({ ...props }: ComponentProps<'a'>) => (
      <a target="_blank" rel="noopener noreferrer" className={linkClass} {...props} />
    ),
    strong: ({ ...props }: ComponentProps<'strong'>) => <strong className="font-bold" {...props} />,
    em: ({ ...props }: ComponentProps<'em'>) => <em className="italic" {...props} />,
    ul: ({ ...props }: ComponentProps<'ul'>) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
    ol: ({ ...props }: ComponentProps<'ol'>) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
    li: ({ ...props }: ComponentProps<'li'>) => <li {...props} />,
    h1: ({ ...props }: ComponentProps<'h1'>) => <h1 className="text-base font-bold mt-3 mb-1.5" {...props} />,
    h2: ({ ...props }: ComponentProps<'h2'>) => <h2 className="text-base font-bold mt-3 mb-1.5" {...props} />,
    h3: ({ ...props }: ComponentProps<'h3'>) => <h3 className="text-sm font-bold mt-2.5 mb-1" {...props} />,
    blockquote: ({ ...props }: ComponentProps<'blockquote'>) => (
      <blockquote className={`border-l-4 ${borderClass} pl-3 my-2 opacity-80 italic`} {...props} />
    ),
    hr: ({ ...props }: ComponentProps<'hr'>) => <hr className={`my-3 ${borderClass}`} {...props} />,
    code: ({ className, ...props }: ComponentProps<'code'>) =>
      className ? (
        // コードブロック（```で囲まれた複数行）: rehype/remark が親の <pre> に className を付けるため、ここは素のまま表示
        <code className={`${className} font-mono text-xs`} {...props} />
      ) : (
        <code className={`${codeClass} rounded px-1.5 py-0.5 font-mono text-xs`} {...props} />
      ),
    pre: ({ ...props }: ComponentProps<'pre'>) => (
      <pre className={`${codeClass} rounded-lg p-3 my-2 overflow-x-auto text-xs`} {...props} />
    ),
    table: ({ ...props }: ComponentProps<'table'>) => (
      <div className="overflow-x-auto my-2">
        <table className={`w-full border-collapse border ${borderClass} text-xs`} {...props} />
      </div>
    ),
    th: ({ ...props }: ComponentProps<'th'>) => (
      <th className={`border ${borderClass} px-2 py-1.5 text-left font-bold bg-black/[.03]`} {...props} />
    ),
    td: ({ ...props }: ComponentProps<'td'>) => <td className={`border ${borderClass} px-2 py-1.5`} {...props} />,
  };
};
