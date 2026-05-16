/** Status badge per DESIGN.md status-badge spec. */

type BadgeProps = {
  children: string;
  tone?: 'default' | 'success' | 'critical' | 'high' | 'medium' | 'low';
};

const tones = {
  default: 'bg-surface-2 text-ink-muted',
  success: 'bg-surface-2 text-semantic-success',
  critical: 'bg-surface-2 text-[#ef4444]',
  high: 'bg-surface-2 text-[#f97316]',
  medium: 'bg-surface-2 text-[#eab308]',
  low: 'bg-surface-2 text-[#22c55e]',
};

export function Badge({ children, tone = 'default' }: BadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[12px] leading-[1.4] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
