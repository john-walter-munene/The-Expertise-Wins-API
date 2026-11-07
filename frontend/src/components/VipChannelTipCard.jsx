import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatTipChannelCard } from "../lib/tipChannelFormatter";
import { getMatchTitle, getTipHref } from "../lib/tipSlug";

const TIER_STYLES = {
  VIP: {
    border: "border-indigo-400/40",
    line: "via-indigo-300",
    badge: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300",
  },
  MAXBET: {
    border: "border-amber-400/40",
    line: "via-amber-300",
    badge: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
};

export default function VipChannelTipCard({ tip, tier = "VIP", cardNumber = 1, showSettlementMarkers = false }) {
  if (!tip) return null;

  const tierName = String(tier).toUpperCase() === "MAXBET" ? "MAXBET" : "VIP";
  const styles = TIER_STYLES[tierName];
  const tipId = tip.id ?? tip._id;
  const hasTipId = tipId !== null && tipId !== undefined && String(tipId).trim() !== "";

  return (
    <article className={`group relative h-full min-w-0 overflow-hidden rounded-2xl border ${styles.border} bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 shadow-xl transition duration-300 hover:-translate-y-1 hover:shadow-2xl`}>
      <div className={`h-px bg-gradient-to-r from-transparent ${styles.line} to-transparent opacity-70`} />
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${styles.badge}`}>
          Card {cardNumber} {tierName}
        </span>
      </header>
      <pre className="whitespace-pre-wrap break-words px-5 py-5 font-mono text-sm leading-7 text-slate-100 [overflow-wrap:anywhere]">
        {formatTipChannelCard(tip, { tier: tierName, showSettlementMarkers })}
      </pre>
      {hasTipId && (
        <footer className="border-t border-slate-800 px-5 py-2">
          <Link
            href={getTipHref(tip)}
            aria-label={`View details for ${getMatchTitle(tip)}`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-emerald-400 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            More details <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </footer>
      )}
    </article>
  );
}
