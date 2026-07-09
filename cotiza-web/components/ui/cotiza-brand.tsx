import Link from "next/link";

type CotizaBrandProps = {
  compact?: boolean;
  href?: string;
  subtitle?: string | null;
};

function Mark({ compact = false }: { compact?: boolean }) {
  const size = compact ? "h-9 w-9" : "h-12 w-12";

  return (
    <span className={`relative inline-flex ${size} overflow-hidden rounded-2xl bg-slate-950 shadow-sm`}>
      <span className="absolute inset-[18%] rounded-[0.9rem] bg-slate-50" />
      <span className="absolute left-[24%] top-[24%] h-[42%] w-[42%] bg-orange-500 [clip-path:polygon(0_0,100%_0,100%_42%,58%_42%,58%_100%,0_100%)]" />
      <span className="absolute left-[50%] top-[24%] h-[28%] w-[28%] bg-teal-500" />
    </span>
  );
}

export function CotizaBrand({ compact = false, href = "/", subtitle = null }: CotizaBrandProps) {
  const content = (
    <span className="inline-flex items-center gap-3">
      <Mark compact={compact} />
      <span className="flex flex-col">
        <span className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">Cotiza</span>
        {subtitle ? <span className="text-sm text-zinc-500">{subtitle}</span> : null}
      </span>
    </span>
  );

  if (!href) {
    return content;
  }

  return (
    <Link className="inline-flex items-center" href={href}>
      {content}
    </Link>
  );
}
