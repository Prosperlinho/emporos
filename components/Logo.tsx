// Emporos "Shelves" mark: three stocked shelves form an E; the slate block is the item being restocked.
// Shelves use currentColor, so the mark follows the text colour on light and dark backgrounds.
export const SLATE = "#5b6b7e";

export function LogoMark({ size = 28, title, className }: { size?: number; title?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect x="8" y="8" width="32" height="7" rx="3.5" fill="currentColor" />
      <rect x="8" y="20.5" width="22" height="7" rx="3.5" fill="currentColor" />
      <rect x="8" y="33" width="32" height="7" rx="3.5" fill="currentColor" />
      <rect x="34" y="20.5" width="6" height="7" rx="3" fill={`var(--logo-accent, ${SLATE})`} />
    </svg>
  );
}
