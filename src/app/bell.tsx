import Link from "next/link";

/** Bell with unread counter; the count is generated server-side on every page load. */
export function Bell({ count, withLabel = false }: { count: number; withLabel?: boolean }) {
  const label = count > 0 ? `Benachrichtigungen, ${count} ungelesen` : "Benachrichtigungen";
  return (
    <Link href="/benachrichtigungen" aria-label={label} title={label} data-testid="bell" className="relative inline-flex min-h-11 min-w-11 items-center gap-3 rounded-xl px-2 text-stone-700 hover:bg-stone-100">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {withLabel ? <span className="text-sm font-medium">Benachrichtigungen</span> : null}
      {count > 0 ? (
        <span aria-hidden="true" data-testid="bell-count" className="absolute left-6 top-1 min-w-5 rounded-full bg-terracotta px-1 text-center text-xs font-semibold leading-5 text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
