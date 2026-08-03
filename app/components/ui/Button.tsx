import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-tanei-accent hover:bg-tanei-accent-dark text-white',
  brand: 'bg-tanei-brand hover:bg-tanei-brand-dark text-white',
  secondary: 'bg-tanei-brand-soft hover:bg-tanei-border text-tanei-ink',
  ghost: 'bg-tanei-surface hover:bg-tanei-surface-muted text-tanei-ink border border-tanei-border',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-sm px-5 py-3 gap-2',
};

// TANE:i共通ボタン：色（variant）・サイズ・角丸を統一する
export default function Button({
  variant = 'brand',
  size = 'md',
  icon,
  fullWidth = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-tanei-control font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
}
