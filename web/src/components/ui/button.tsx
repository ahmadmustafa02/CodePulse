/** Primary and secondary buttons following DESIGN.md tokens. */

import Link from 'next/link';
import type { ReactNode } from 'react';

type ButtonProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Use `submit` inside `<form>` so the form action runs (default is `button`). */
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary';
  className?: string;
};

const base =
  'inline-flex items-center justify-center rounded-[8px] px-[14px] py-[8px] text-[14px] font-medium leading-[1.2] transition-colors';

const variants = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary-focus/50',
  secondary:
    'border border-hairline bg-surface-1 text-ink hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary-focus/50',
};

export function Button({
  children,
  href,
  onClick,
  type = 'button',
  variant = 'primary',
  className = '',
}: ButtonProps) {
  const classes = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
