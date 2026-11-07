import Link from "next/link";

type CotizaBrandProps = {
  compact?: boolean;
  href?: string;
  subtitle?: string | null;
};

function Mark({ compact = false }: { compact?: boolean }) {
  const size = compact ? "h-9 w-9" : "h-9 w-9 sm:h-12 sm:w-12";

  return (
    <span className={`relative inline-flex shrink-0 ${size} overflow-hidden rounded-2xl bg-slate-950 shadow-sm`}>
      <span className="absolute inset-[18%] rounded-[0.9rem] bg-slate-50" />
      <svg aria-hidden="true" className="absolute left-[18%] top-[18%] h-[64%] w-[64%]" viewBox="0 0 100 100">
        <path
          d="M 78.67,70.08 A 35,35 0 1 1 78.67,29.92"
          fill="none"
          stroke="#f97316"
          strokeLinecap="round"
          strokeWidth="16"
        />
      </svg>
    </span>
  );
}

export function CotizaBrand({ compact = false, href = "/", subtitle = null }: CotizaBrandProps) {
  const content = (
    <span className="inline-flex min-w-0 items-center gap-2 sm:gap-3">
      <Mark compact={compact} />
      <span className="flex min-w-0 flex-col">
        <span className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">Cotiza</span>
        {subtitle ? <span className="break-words text-xs text-zinc-500 sm:text-sm">{subtitle}</span> : null}
      </span>
    </span>
  );

  if (!href) {
    return content;
  }

  return (
    <Link className="inline-flex min-w-0 items-center" href={href}>
      {content}
    </Link>
  );
}
