// frontend/src/components/TipCard.jsx
import Link from "next/link";
import { ArrowRight, Award, Clock, Target } from "lucide-react";
import {
  formatDateTime,
  formatOdds,
  outcomeColor,
  statusColor,
} from "../lib/utils";
import { getSettlementMarker } from "../lib/settlementMarker";
import { getTipHref, getMatchTitle } from "../lib/tipSlug";

// Normalize enum values for consistent badge styling.
function normalizeEnum(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

// Convert enum values into readable labels.
function formatBadgeLabel(value) {
  return value.replace(/_/g, " ");
}

export default function TipCard({ tip, tier, showSettlementMarkers = false }) {
  if (!tip) return null;

  const tierValue = String(tier || tip._tier || tip.tier || tip.publications?.[0]?.product?.slug || "free").toUpperCase();
  const tierStyles = tierValue === "MAXBET"
    ? { border: "border-amber-400/40", glow: "shadow-amber-950/30", accent: "text-amber-300", badge: "border-amber-400/30 bg-amber-400/10 text-amber-300", label: "MAXBET" }
    : tierValue === "VIP"
      ? { border: "border-indigo-400/40", glow: "shadow-indigo-950/30", accent: "text-indigo-300", badge: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300", label: "VIP" }
      : { border: "border-emerald-400/40", glow: "shadow-emerald-950/30", accent: "text-emerald-300", badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", label: "FREE" };

  const matchTitle = getMatchTitle(tip);

  const sport = tip.sport || "Sport unavailable";
  const competition =
    tip.competition || tip.league || "Competition unavailable";
  const market = tip.market || "—";
  const selection = tip.selection || tip.prediction || "—";
  const selections = Array.isArray(tip.tips) ? tip.tips.filter((item) => item && (item.selection || item.market)) : [];

  const outcome = normalizeEnum(tip.result?.outcome || tip.outcome);
  const status = normalizeEnum(tip.status) || "PUBLISHED";
  const kickoff = tip.kickoff || tip.matchDate;
  const dateValue = kickoff || tip.createdAt;

  const tipId = tip.id ?? tip._id;
  const hasTipId =
    tipId !== null && tipId !== undefined && String(tipId).trim() !== "";

  const displayResult = outcome || status;
  const settlementMarker = showSettlementMarkers
    ? getSettlementMarker(outcome, tierValue)
    : "";
  const resultClasses = outcome
    ? outcomeColor(outcome)
    : statusColor(status);

  const hasValidOdds =
    tip.odds !== null &&
    tip.odds !== undefined &&
    String(tip.odds).trim() !== "" &&
    Number.isFinite(Number(tip.odds)) &&
    Number(tip.odds) > 0;

  const displayOdds = hasValidOdds ? `@${formatOdds(tip.odds)}` : "—";
  const displayDate = formatDateTime(dateValue);

  const parsedDate = dateValue ? new Date(dateValue) : null;
  const dateTime =
    parsedDate && Number.isFinite(parsedDate.getTime())
      ? parsedDate.toISOString()
      : undefined;

  return (
    <article className={`group relative flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-2xl border ${tierStyles.border} bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 shadow-xl ${tierStyles.glow} transition duration-300 hover:-translate-y-1 hover:shadow-2xl`}>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-60 ${tierStyles.accent}`} />
      <div>
        {/* Tip header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="max-w-full break-words rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-300">
              {sport}
            </span>

            <span className="min-w-0 break-words text-xs font-medium leading-5 text-slate-400">
              {competition}
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${resultClasses}`}
          >
            {formatBadgeLabel(displayResult)}
            {settlementMarker && <span aria-label="Settlement marker" title="Settlement result">{settlementMarker}</span>}
          </span>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${tierStyles.badge}`}>{tierStyles.label} PICK</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Daily selection</span>
        </div>

        {/* Match title */}
        <h3 className="mb-3 break-words text-base font-bold leading-6 text-slate-100">
          {matchTitle}
        </h3>

        {/* Show every scraped leg, as printed by the Free channel in the CLI. */}
        <dl className="my-3 space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          {selections.length > 0 ? selections.map((item, index) => {
            const itemOdds = item.odds !== null && item.odds !== undefined && Number.isFinite(Number(item.odds)) && Number(item.odds) > 0
              ? `@${formatOdds(item.odds)}`
              : "—";
            const units = Number(item.units ?? item.stakeUnits);
            return (
              <div key={`${item.selection || item.market}-${index}`} className="flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <dt className={`break-words font-extrabold leading-5 ${tierStyles.accent}`}>
                    {item.selection || item.market}
                    {showSettlementMarkers && getSettlementMarker(item.outcome || outcome, tierValue) && (
                      <span className="ml-1.5 whitespace-nowrap" aria-label="Selection settlement marker">
                        {getSettlementMarker(item.outcome || outcome, tierValue)}
                      </span>
                    )}
                  </dt>
                  {item.market && item.market !== item.selection && (
                    <dd className="mt-0.5 break-words text-[11px] leading-4 text-slate-500">{item.market}</dd>
                  )}
                </div>
                <dd className="shrink-0 text-right">
                  <span className="rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-1 font-bold text-amber-400 tabular-nums">{itemOdds}</span>
                  {Number.isFinite(units) && units > 0 && (
                    <span className="mt-1 block text-[11px] font-medium text-slate-400">{units} Unit{units === 1 ? "" : "s"}</span>
                  )}
                </dd>
              </div>
            );
          }) : (
            <>
              <div className="flex items-start justify-between gap-4 text-xs">
                <dt className="flex shrink-0 items-center gap-1.5 font-medium leading-5 text-slate-400">
                  <Target className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  Market
                </dt>
                <dd className="min-w-0 break-words text-right font-semibold leading-5 text-slate-200">{market}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 text-xs">
                <dt className="flex shrink-0 items-center gap-1.5 font-medium leading-5 text-slate-400">
                  <Award className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                  Selection
                </dt>
                <dd className={`min-w-0 break-words text-right font-extrabold leading-5 ${tierStyles.accent}`}>{selection}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 text-xs">
                <dt className="font-medium text-slate-400">Odds</dt>
                <dd className="rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-1 font-bold text-amber-400 tabular-nums">{displayOdds}</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      {/* Tip footer */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-slate-800 pt-3 text-xs text-slate-400">
        <div className="flex min-w-0 items-start gap-1.5">
          <Clock
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <time
            dateTime={dateTime}
            title={kickoff ? "Match kickoff" : "Tip created"}
            className="break-words leading-5"
          >
            <span className="sr-only">
              {kickoff ? "Match kickoff: " : "Tip created: "}
            </span>
            {displayDate}
          </time>
        </div>

        {hasTipId && (
          <Link
            href={getTipHref(tip)}
            aria-label={`View details for ${matchTitle}`}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-2 font-semibold text-emerald-400 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            Details
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </article>
  );
}
