/** Surface-1 card container per DESIGN.md feature-card spec. */

import type { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
  featured?: boolean;
};

export function Card({ children, className = '', featured = false }: CardProps) {
  return (
    <div
      className={`rounded-[12px] border border-hairline p-6 ${
        featured ? 'bg-surface-2' : 'bg-surface-1'
      } ${className}`}
    >
      {children}
    </div>
  );
}
