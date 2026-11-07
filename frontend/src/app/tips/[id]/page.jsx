// frontend/src/app/tips/[id]/page.jsx
// frontend/src/app/tips/[id]/page.jsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldCheck,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";

import { tipsApi } from "../../../api/tips.api";
import {
  formatOdds,
  formatDateTime,
  outcomeColor,
  statusColor,
} from "../../../lib/utils";
import { formatSelection } from "../../../lib/tipChannelFormatter";
import {
  getMatchTitle,
  getTipHref,
  isLegacyTipHref,
  parseTipSlug,
} from "../../../lib/tipSlug";
import { generateStructuredData } from "../../../lib/seo";

const focusStyles =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-card";

const backLinkStyles = `inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-400 transition-colors hover:text-emerald-400 ${focusStyles}`;

// Normalize enum values for consistent badge styling.
function normalizeEnum(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

// Convert enum values into readable labels.
function formatBadgeLabel(value) {
  return value.replace(/_/g, " ");
}

// Validate odds before passing them to the shared formatter.
function hasValidOdds(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0
  );
}

// Return an ISO datetime only when the supplied date is valid.
function getDateTimeAttribute(value) {
  if (!value) return undefined;

  const parsed = new Date(value);

  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : undefined;
}

export default function TipDetailPage() {
  const params = useParams();
  const router = useRouter();
  const routeSegment =
    typeof params?.id === "string" ? params.id : null;
  const { lead: slugLead, id } = parseTipSlug(routeSegment);

  const [tip, setTip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchTip() {
      setLoading(true);
      setError(null);
      setTip(null);

      if (!id) {
        setError("The requested tip could not be found.");
        setLoading(false);
        return;
      }

      try {
        const response = await tipsApi.getTipById(id);

        if (cancelled) return;

        const tipData = response?.tip ?? response;

        if (
          !tipData ||
          typeof tipData !== "object" ||
          Array.isArray(tipData)
        ) {
          setError("The requested tip could not be found.");
          return;
        }

        setTip(tipData);

        // Upgrade ID-only URLs (legacy shares, previously indexed links) to the
        // canonical team-vs-team address so every tip has exactly one URL.
        if (isLegacyTipHref(routeSegment)) {
          const canonicalHref = getTipHref(tipData);

          if (canonicalHref) {
            router.replace(canonicalHref, { scroll: false });
          }
        }
      } catch (requestError) {
        if (cancelled) return;

        const message = requestError?.response?.data?.message;

        setError(
          typeof message === "string" && message.trim()
            ? message
            : "Failed loading tip details. Please try again shortly."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTip();

    return () => {
      cancelled = true;
    };
  }, [id, retryCount, routeSegment, router]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setRetryCount((count) => count + 1);
  };

  if (loading) {
    return (
      <div
        aria-busy="true"
        className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8"
      >
        <p role="status" className="sr-only">
          Loading tip details…
        </p>

        <div
          aria-hidden="true"
          className="space-y-6 motion-safe:animate-pulse"
        >
          <div className="h-4 w-32 rounded bg-dark-card" />

          <div className="space-y-6 rounded-2xl border border-dark-border bg-dark-card p-5 sm:p-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-6 w-24 rounded-full bg-dark-bg" />
                <div className="h-8 w-full max-w-xs rounded bg-dark-bg" />
              </div>

              <div className="h-7 w-24 shrink-0 rounded-full bg-dark-bg" />
            </div>

            <div className="h-24 rounded-xl bg-dark-bg" />
            <div className="h-36 rounded-xl bg-dark-bg" />
            <div className="h-20 rounded-xl bg-dark-bg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !tip) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20 lg:px-8">
        <section
          aria-labelledby="tip-error-heading"
          className="space-y-5 rounded-2xl border border-dark-border bg-dark-card p-6 text-center sm:p-10"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-400">
            <XCircle className="h-7 w-7" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h1
              id="tip-error-heading"
              className="text-xl font-bold text-slate-100"
            >
              Unable to Load Tip
            </h1>

            <p
              role="alert"
              className="break-words text-sm leading-6 text-slate-400"
            >
              {error || "The requested tip could not be found."}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/tips"
              className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-700 ${focusStyles}`}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Tips
            </Link>

            {id && (
              <button
                type="button"
                onClick={handleRetry}
                className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 ${focusStyles}`}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try Again
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  const matchTitle = getMatchTitle(tip);

  const outcome = normalizeEnum(tip.result?.outcome || tip.outcome);
  const status = normalizeEnum(tip.status) || "PUBLISHED";

  const sport = tip.sport || "Sport unavailable";
  const competition =
    tip.competition || tip.league || "Competition unavailable";
  const market = tip.market || "—";
  const selection = tip.selection || tip.prediction || "—";

  const stakeUnits = Number(
    tip.stakeUnits ??
      tip.units ??
      tip.unitsToStake ??
      (Array.isArray(tip.tips) && tip.tips.length > 0
        ? tip.tips[0]?.units ?? tip.tips[0]?.stakeUnits
        : null)
  );
  const hasStakeUnits = Number.isFinite(stakeUnits) && stakeUnits > 0;

  const hasResult = Boolean(outcome);
  const kickoff = tip.kickoff || tip.matchDate;
  const displayedDate = kickoff || tip.createdAt;
  const preview = tip.verdict || tip.preview;

  const rawExtraTips =
    Array.isArray(tip.extraTips) && tip.extraTips.length > 0
      ? tip.extraTips
      : Array.isArray(tip.tips) && tip.tips.length > 1
        ? tip.tips.filter(
            (t) =>
              t &&
              (t.selection !== tip.selection || t.market !== tip.market)
          )
        : [];

  const extraTips = rawExtraTips.filter(
    (extraTip) =>
      typeof extraTip === "string" ||
      (extraTip && typeof extraTip === "object")
  );

  // Search engines read this to understand the page: the match, the
  // competition, and the selection being recommended.
  const structuredData = generateStructuredData({
    type: "SportsEvent",
    title: `${matchTitle} Prediction & Tips`,
    description: `${matchTitle}${competition !== "Competition unavailable" ? ` in the ${competition}` : ""} — selection, market and odds preview from The Expertise Wins.`,
    url: getTipHref(tip) || `/tips/${encodeURIComponent(id)}`,
    datePublished: getDateTimeAttribute(tip.createdAt),
    dateModified: getDateTimeAttribute(
      tip.updatedAt || tip.createdAt
    ),
    mainEntity: {
      "@type": "SportsEvent",
      name: matchTitle,
      sport,
      ...(kickoff ? { startDate: getDateTimeAttribute(kickoff) } : {}),
      ...(competition !== "Competition unavailable"
        ? {
            superEvent: {
              "@type": "SportsEvent",
              name: competition,
            },
          }
        : {}),
      ...(tip.homeTeam && tip.awayTeam
        ? {
            competitor: [
              { "@type": "SportsTeam", name: tip.homeTeam },
              { "@type": "SportsTeam", name: tip.awayTeam },
            ],
          }
        : {}),
      ...(kickoff
        ? {
            location: {
              "@type": "Place",
              name: `${matchTitle} venue`,
            },
          }
        : {}),
    },
    author: "The Expertise Wins",
    extra: {
      about: {
        "@type": "Thing",
        name: selection !== "—" ? selection : market,
      },
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />

      {/* Back navigation */}
      <Link href="/tips" className={backLinkStyles}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Tips Hub
      </Link>

      {/* Main tip card */}
      <article className="min-w-0 overflow-hidden rounded-2xl border border-dark-border bg-dark-card shadow-xl">
        <div
          aria-hidden="true"
          className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400"
        />

        <div className="space-y-7 p-5 sm:p-8">
          {/* Match metadata */}
          <header className="flex flex-col justify-between gap-5 border-b border-dark-border pb-6 sm:flex-row sm:items-start">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="max-w-full break-words rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  {sport}
                </span>

                <span className="max-w-full break-words rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  {competition}
                </span>
              </div>

              <h1 className="break-words text-2xl font-black leading-tight tracking-tight text-slate-100 sm:text-3xl">
                {matchTitle}
              </h1>

              <div className="flex items-start gap-2 text-xs leading-5 text-slate-400">
                <Clock
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />

                <span className="min-w-0 break-words">
                  {kickoff ? "Kick-off: " : "Tip created: "}
                  <time dateTime={getDateTimeAttribute(displayedDate)}>
                    {formatDateTime(displayedDate)}
                  </time>
                </span>
              </div>
            </div>

            <div className="sm:shrink-0">
              {hasResult ? (
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${outcomeColor(
                    outcome
                  )}`}
                >
                  <Trophy
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  Result: {formatBadgeLabel(outcome)}
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${statusColor(
                    status
                  )}`}
                >
                  <ShieldCheck
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  {formatBadgeLabel(status)}
                </span>
              )}
            </div>
          </header>

          {/* Prediction summary */}
          <section
            aria-labelledby="prediction-heading"
            className="space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <Target className="h-4 w-4" aria-hidden="true" />
              </div>

              <div>
                <h2
                  id="prediction-heading"
                  className="text-sm font-bold text-slate-100"
                >
                  Prediction Summary
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Selection details
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0 rounded-xl border border-dark-border bg-dark-bg p-4">
                <dt className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Market
                </dt>
                <dd className="break-words text-sm font-bold leading-6 text-slate-100">
                  {market}
                </dd>
              </div>

              <div className="min-w-0 rounded-xl border border-emerald-500/20 bg-dark-bg p-4">
                <dt className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Selection
                </dt>
                <dd className="break-words text-base font-black leading-6 text-emerald-400">
                  {selection}
                </dd>
              </div>

              <div className="min-w-0 rounded-xl border border-amber-500/20 bg-dark-bg p-4">
                <dt className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Odds
                </dt>
                <dd className="inline-flex rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-base font-black text-amber-400 tabular-nums">
                  {hasValidOdds(tip.odds)
                    ? `@${formatOdds(tip.odds)}`
                    : "—"}
                </dd>
              </div>

              <div className="min-w-0 rounded-xl border border-indigo-500/20 bg-dark-bg p-4">
                <dt className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Units to Stake
                </dt>
                <dd className="inline-flex rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-base font-black text-indigo-300 tabular-nums">
                  {hasStakeUnits
                    ? `${stakeUnits} Unit${stakeUnits === 1 ? "" : "s"}`
                    : "—"}
                </dd>
              </div>
            </dl>
          </section>

          {/* Recorded result */}
          {hasResult && (
            <section
              aria-labelledby="result-heading"
              className="rounded-xl border border-dark-border bg-dark-bg p-5"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                  <Award className="h-4 w-4" aria-hidden="true" />
                </div>

                <div>
                  <h2
                    id="result-heading"
                    className="text-sm font-bold text-slate-100"
                  >
                    Recorded Result
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Recorded outcome
                  </p>
                </div>
              </div>

              <dl>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <dt className="text-sm text-slate-400">
                    Final outcome
                  </dt>
                  <dd
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${outcomeColor(
                      outcome
                    )}`}
                  >
                    {formatBadgeLabel(outcome)}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {/* Match preview */}
          {preview && (
            <section
              aria-labelledby="preview-heading"
              className="space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                  <Target className="h-4 w-4" aria-hidden="true" />
                </div>

                <div>
                  <h2
                    id="preview-heading"
                    className="text-sm font-bold text-slate-100"
                  >
                    Match Preview
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Selection analysis
                  </p>
                </div>
              </div>

              <p className="whitespace-pre-line break-words rounded-xl border border-dark-border bg-dark-bg p-5 text-sm leading-7 text-slate-300 [overflow-wrap:anywhere]">
                {preview}
              </p>
            </section>
          )}

          {/* Operator notes */}
          {tip.notes && (
            <section
              aria-labelledby="notes-heading"
              className="space-y-3"
            >
              <div className="flex items-center gap-2">
                <Calendar
                  className="h-4 w-4 shrink-0 text-indigo-400"
                  aria-hidden="true"
                />
                <h2
                  id="notes-heading"
                  className="text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Operator Notes
                </h2>
              </div>

              <p className="whitespace-pre-line break-words rounded-xl border border-dark-border bg-dark-bg p-4 text-sm leading-6 text-slate-300 [overflow-wrap:anywhere]">
                {tip.notes}
              </p>
            </section>
          )}

          {/* Additional selections */}
          {extraTips.length > 0 && (
            <section
              aria-labelledby="additional-selections-heading"
              className="space-y-3"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                <h2
                  id="additional-selections-heading"
                  className="text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Additional Selections
                </h2>
              </div>

              <ul className="space-y-2">
                {extraTips.map((extraTip, index) => {
                  const isObject = extraTip !== null && typeof extraTip === "object";

                  // Mirror the home page / tips list card format:
                  // "[Selection Market] @Odds - N Unit(s)". The market is only
                  // appended when it adds context the selection does not carry.
                  const extraSelection = isObject
                    ? formatSelection(
                        extraTip.selection || extraTip.name || extraTip.market,
                        extraTip.market
                      )
                    : extraTip;

                  const extraOdds = isObject
                    ? extraTip.odds
                    : undefined;

                  const extraUnits = isObject
                    ? Number(extraTip.units ?? extraTip.stakeUnits ?? 1)
                    : null;

                  const hasExtraUnits =
                    extraUnits !== null && Number.isFinite(extraUnits);

                  return (
                    <li
                      key={
                        isObject
                          ? extraTip.id ?? extraTip._id ?? index
                          : index
                      }
                      className="flex items-start justify-between gap-4 rounded-xl border border-dark-border bg-dark-bg px-4 py-3"
                    >
                      <span className="min-w-0 break-words text-sm leading-6 text-slate-300">
                        {extraSelection}
                      </span>

                      <span className="shrink-0 text-right text-sm font-bold leading-6 text-amber-400 tabular-nums">
                        {hasValidOdds(extraOdds) && (
                          <span className="block">
                            <span className="sr-only">Odds: </span>
                            @{formatOdds(extraOdds)}
                          </span>
                        )}

                        {hasExtraUnits && extraUnits > 0 && (
                          <span className="block text-[11px] font-medium text-slate-400">
                            {extraUnits} Unit{extraUnits === 1 ? "" : "s"}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </article>

      {/* Bottom navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/tips" className={backLinkStyles}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All Tips
        </Link>

        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          The Expertise Wins
        </span>
      </div>
    </div>
  );
}