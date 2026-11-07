// frontend/src/app/archive/page.jsx
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  RefreshCw,
  Search,
  Trophy,
} from "lucide-react";

import { tipsApi } from "../../api/tips.api";
import TipCard from "../../components/TipCard";
import VipChannelTipCard from "../../components/VipChannelTipCard";

const PAGE_SIZE = 20;

const TIERS = [
  { id: "free", label: "Free", title: "The Expertise Wins Free Tips" },
  { id: "vip", label: "VIP", title: "VIP Tips" },
  { id: "maxbet", label: "MaxBet", title: "MaxBet Tips" },
];

const OUTCOMES = [
  { value: "PENDING", label: "Pending" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
  { value: "VOID", label: "Void" },
  { value: "PUSH", label: "Push" },
  { value: "HALF_WON", label: "Half won" },
  { value: "HALF_LOST", label: "Half lost" },
];

const focusStyles =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900";

const inputStyles = `min-h-[44px] w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100 ${focusStyles}`;

const buttonStyles = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${focusStyles}`;

/**
 * Get a calendar date in Nairobi.
 *
 * offsetDays:
 *   0  = today
 *  -1  = yesterday
 */
function getNairobiDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const getPart = (type) =>
    parts.find((part) => part.type === type)?.value;

  const year = Number(getPart("year"));
  const month = Number(getPart("month"));
  const day = Number(getPart("day"));

  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + offsetDays);

  return date.toISOString().slice(0, 10);
}

/**
 * The archive is strictly historical.
 *
 * Today is NEVER an allowed archive date.
 */
function getLatestArchiveDate() {
  return getNairobiDate(-1);
}

function isArchiveDateAllowed(value) {
  const latestAllowedDate = getLatestArchiveDate();

  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value <= latestAllowedDate
  );
}

function createInitialFilters(initialDay) {
  return {
    sport: "",
    tier: "free",
    day: isArchiveDateAllowed(initialDay) ? initialDay : getLatestArchiveDate(),
    search: "",
    outcome: "",
  };
}

function createEmptyArchive() {
  return {
    data: [],
    pagination: {
      page: 1,
      pages: 0,
      total: 0,
    },
    sports: [],
    tierSports: {},
    tiers: [],
    day: null,
    latestDay: getLatestArchiveDate(),
  };
}

function normalizeCount(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) && number >= 0
    ? Math.floor(number)
    : fallback;
}

function normalizeDay(value) {
  if (typeof value !== "string") return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function formatDay(value) {
  const day = normalizeDay(value);

  return day
    ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
}

/**
 * Normalize and validate the archive API response.
 *
 * The archive must never render:
 *   - today
 *   - a future date
 *   - a different date from the requested date
 */
function normalizeArchive(response, requestedDay) {
  const source = response?.tips;

  if (!source || !Array.isArray(source.data)) {
    throw new Error("Unexpected archive response");
  }

  const responseDay = normalizeDay(source.day);
  const normalizedRequestedDay = normalizeDay(requestedDay);
  const latestAllowedDate = getLatestArchiveDate();

  /*
   * Hard frontend protection:
   * today and future dates can never be displayed.
   */
  if (
    responseDay &&
    responseDay > latestAllowedDate
  ) {
    throw new Error(
      `Archive returned ${formatDay(
        responseDay
      )}, which is not an allowed historical date.`
    );
  }

  /*
   * If the backend tells us which day it served,
   * it must match the day the frontend requested.
   */
  if (
    normalizedRequestedDay &&
    responseDay &&
    responseDay !== normalizedRequestedDay
  ) {
    throw new Error(
      `Archive returned ${formatDay(
        responseDay
      )} instead of the requested ${formatDay(
        normalizedRequestedDay
      )}.`
    );
  }

  return {
    data: source.data.filter(
      (tip) => tip && typeof tip === "object"
    ),

    pagination: {
      page: Math.max(
        1,
        normalizeCount(source.pagination?.page, 1)
      ),
      pages: normalizeCount(
        source.pagination?.pages
      ),
      total: normalizeCount(
        source.pagination?.total
      ),
    },

    sports: Array.isArray(source.sports)
      ? source.sports
      : [],

    tierSports:
      source.tierSports &&
      typeof source.tierSports === "object"
        ? source.tierSports
        : {},

    // The API reports which tiers the current visitor may actually see.
    tiers: Array.isArray(source.tiers)
      ? source.tiers
          .map((tier) =>
            typeof tier === "string"
              ? { slug: tier }
              : tier
          )
          .filter((tier) => tier?.slug)
      : [],

    day:
      responseDay ||
      normalizedRequestedDay ||
      null,

    // The API reports the newest day it will ever serve, so the client uses
    // the same bound the backend applies instead of guessing.
    latestDay:
      normalizeDay(source.latestDay) ||
      latestAllowedDate,
  };
}

/**
 * Prefer explicit tier membership over a default
 * free assignment.
 */
function belongsToTier(tip, tier) {
  if (
    Array.isArray(tip.tiers) &&
    tip.tiers.length > 0
  ) {
    return tip.tiers.includes(tier);
  }

  return (tip.tier || "free") === tier;
}

export default function ArchivePage() {
  // `useSearchParams` opts the route into client rendering, so it must sit
  // inside a Suspense boundary for the build to prerender the shell.
  return (
    <Suspense fallback={<ArchiveLoadingState />}>
      <ArchiveView />
    </Suspense>
  );
}
// Skeleton shown while the query string is being read on the client.
function ArchiveLoadingState() {
  return (
    <main
      id="archive-results"
      aria-busy="true"
      className="mx-auto w-full max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8"
    >
      <p role="status" className="sr-only">
        Loading the tip archive…
      </p>
      <div aria-hidden="true" className="space-y-4">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-48 rounded-2xl border border-slate-800 bg-slate-900/60 motion-safe:animate-pulse"
          />
        ))}
      </div>
    </main>
  );
}
function ArchiveView() {
  // Deep links such as /archive?day=2026-10-31 (used in the sitemap and
  // shared links) open that specific historical day instead of the default.
  const searchParams = useSearchParams();
  const requestedDay = searchParams?.get("day");
  const initialDayRef = useRef(requestedDay);

  const [archive, setArchive] = useState(
    createEmptyArchive
  );

  const [filters, setFilters] = useState(() =>
    createInitialFilters(initialDayRef.current)
  );

  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const requestId = ++requestIdRef.current;

    const isCurrentRequest = () =>
      !cancelled &&
      requestId === requestIdRef.current;

    async function loadArchive() {
      setLoading(true);
      setError("");

      /*
       * Defensive protection:
       * never allow an invalid archive date to
       * reach the API.
       */
      if (
        filters.day &&
        !isArchiveDateAllowed(filters.day)
      ) {
        if (!isCurrentRequest()) return;

        setArchive(createEmptyArchive());
        setError(
          "Today's and future tips are not available in the archive."
        );
        setLoading(false);
        return;
      }

      try {
        const response = await tipsApi.getArchive({
          ...filters,
          page,
          limit: PAGE_SIZE,
        });

        if (!isCurrentRequest()) return;

        const nextArchive = normalizeArchive(
          response,
          filters.day
        );

        if (!isCurrentRequest()) return;

        setArchive(nextArchive);
      } catch (requestError) {
        if (!isCurrentRequest()) return;

        setArchive(createEmptyArchive());

        const message =
          requestError?.response?.data?.message;

        setError(
          typeof message === "string" &&
            message.trim()
            ? message
            : requestError?.message ||
                "Unable to load the tip archive. Please try again."
        );
      } finally {
        if (isCurrentRequest()) {
          setLoading(false);
        }
      }
    }

    loadArchive();

    return () => {
      cancelled = true;
    };
  }, [filters, page, retryCount]);

  /**
   * Invalidate pending results immediately when
   * the view changes.
   */
  const prepareRequest = () => {
    requestIdRef.current += 1;

    setLoading(true);
    setError("");
    setArchive(createEmptyArchive());
  };

  const changeFilter = (key, value) => {
    /*
     * Hard frontend guard:
     * today and future dates cannot become the
     * selected archive date.
     */
    if (
      key === "day" &&
      !isArchiveDateAllowed(value)
    ) {
      return;
    }

    prepareRequest();

    setPage(1);

    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "tier"
        ? { sport: "" }
        : {}),
    }));
  };

  const clearFilters = () => {
    prepareRequest();

    setSearchInput("");
    setFilters(createInitialFilters());
    setPage(1);
  };

  const changePage = (nextPage) => {
    prepareRequest();
    setPage(nextPage);
  };

  const retryRequest = () => {
    prepareRequest();
    setRetryCount((count) => count + 1);
  };

  /*
   * Only show the tiers the API confirmed this visitor can see. Falling back to
   * all three keeps the UI usable before the first response lands.
   */
  const visibleTierIds =
    archive.tiers.length > 0
      ? archive.tiers.map((tier) => tier.slug)
      : ["free"];

  const selectableTiers = TIERS.filter(
    (tier) => visibleTierIds.includes(tier.id)
  );

  const selectedTier = TIERS.find(
    (tier) => tier.id === filters.tier
  );

  const tierSports =
    archive.tierSports?.[filters.tier];

  const availableSports = Array.from(
    new Set(
      (
        Array.isArray(tierSports)
          ? tierSports
          : archive.sports
      ).filter(
        (sport) =>
          typeof sport === "string" &&
          sport.trim()
      )
    )
  );

  /*
   * Keep the selected value visible if a filtered
   * response omits it.
   */
  if (
    filters.sport &&
    !availableSports.includes(filters.sport)
  ) {
    availableSports.unshift(filters.sport);
  }

  const groupedTips = selectableTiers.filter(
    (tier) =>
      !filters.tier ||
      tier.id === filters.tier
  )
    .map((tier) => ({
      ...tier,
      tips: archive.data.filter((tip) =>
        belongsToTier(tip, tier.id)
      ),
    }))
    .filter(
      (group) => group.tips.length > 0
    );

  const servedDayLabel = formatDay(
    archive.day
  );

  /*
   * Bound every date control by the newest day the API will serve, so today
   * can never be selected or requested.
   */
  const latestArchiveDay =
    archive.latestDay || getLatestArchiveDate();

  return (
    <main
      aria-labelledby="archive-heading"
      className="mx-auto w-full max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8"
    >
      {/* Page header */}
      <header className="space-y-4 border-b border-slate-800 pb-7">
        <Link
          href="/tips"
          className={`${buttonStyles} px-0 text-slate-400 hover:text-emerald-400`}
        >
          <ArrowLeft
            className="h-4 w-4"
            aria-hidden="true"
          />
          Back to Tips
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <CalendarDays
                className="h-4 w-4"
                aria-hidden="true"
              />
              Historical record
            </p>

            <h1
              id="archive-heading"
              className="text-3xl font-black tracking-tight text-slate-100 sm:text-4xl"
            >
              Tip Archive
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Browse recorded Free, VIP, and MaxBet
              selections by day, sport, and outcome.
              Today&apos;s active tips are intentionally
              excluded from this historical view. Results are reviewed and
              settled once a day, so the latest completed day appears after
              settlement.
            </p>
          </div>

          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-sm text-slate-400"
          >
            {loading
              ? "Loading archive…"
              : error
                ? "Archive unavailable"
                : `${archive.pagination.total.toLocaleString(
                    "en-GB"
                  )} record${
                    archive.pagination.total === 1
                      ? ""
                      : "s"
                  }`}
          </p>
        </div>
      </header>

      {/* Tier controls */}
      <section
        aria-labelledby="archive-tiers-heading"
        className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id="archive-tiers-heading"
              className="text-xs font-bold uppercase tracking-wider text-emerald-400"
            >
              Archive tiers
            </h2>

            <p className="mt-2 text-xs leading-5 text-slate-400">
              Choose a tier to explore its recorded
              selections.
            </p>
          </div>

          <Trophy
            className="h-5 w-5 shrink-0 text-amber-400"
            aria-hidden="true"
          />
        </div>

        <div
          role="group"
          aria-label="Archive tier"
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {selectableTiers.map((tier) => (
            <button
              key={tier.id}
              type="button"
              aria-pressed={
                filters.tier === tier.id
              }
              aria-controls="archive-results"
              onClick={() =>
                changeFilter(
                  "tier",
                  tier.id
                )
              }
              className={`rounded-xl border px-4 py-3 text-left text-sm font-bold transition-colors ${focusStyles} ${
                filters.tier === tier.id
                  ? "border-emerald-400 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
              }`}
            >
              {tier.label}

              <span className="mt-1 block text-xs font-normal text-slate-400">
                Historical selections
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Archive filters */}
      <form
        aria-label="Archive filters"
        className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();

          changeFilter(
            "search",
            searchInput.trim()
          );
        }}
      >
        <div className="space-y-2 lg:col-span-2">
          <label
            htmlFor="archive-search"
            className="block text-xs font-semibold text-slate-400"
          >
            Search fixtures or selections
          </label>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />

            <input
              id="archive-search"
              type="search"
              value={searchInput}
              onChange={(event) =>
                setSearchInput(
                  event.target.value
                )
              }
              placeholder="Team, competition, selection"
              className={`${inputStyles} pl-10`}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="archive-sport"
            className="block text-xs font-semibold text-slate-400"
          >
            Sport
          </label>

          <select
            id="archive-sport"
            value={filters.sport}
            onChange={(event) =>
              changeFilter(
                "sport",
                event.target.value
              )
            }
            className={inputStyles}
          >
            <option value="">
              All available sports
            </option>

            {availableSports.map((sport) => (
              <option
                key={sport}
                value={sport}
              >
                {sport}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="archive-outcome"
            className="block text-xs font-semibold text-slate-400"
          >
            Recorded outcome
          </label>

          <select
            id="archive-outcome"
            value={filters.outcome}
            onChange={(event) =>
              changeFilter(
                "outcome",
                event.target.value
              )
            }
            className={inputStyles}
          >
            <option value="">
              Any outcome
            </option>

            {OUTCOMES.map((outcome) => (
              <option
                key={outcome.value}
                value={outcome.value}
              >
                {outcome.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="archive-day"
            className="block text-xs font-semibold text-slate-400"
          >
            Specific day
          </label>

          <input
            id="archive-day"
            type="date"
            value={filters.day}
            max={latestArchiveDay}
            onChange={(event) =>
              changeFilter(
                "day",
                event.target.value
              )
            }
            className={`${inputStyles} [color-scheme:dark]`}
          />

          <p className="text-[11px] leading-5 text-slate-500">
            Today&apos;s tips are not available in
            the archive.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-5">
          <button
            type="submit"
            className={`${buttonStyles} bg-emerald-500 text-slate-950 hover:bg-emerald-400`}
          >
            <Search
              className="h-4 w-4"
              aria-hidden="true"
            />
            Search
          </button>

          <button
            type="button"
            onClick={clearFilters}
            className={`${buttonStyles} border border-slate-700 text-slate-300 hover:bg-slate-800`}
          >
            Clear Filters
          </button>
        </div>
      </form>

      {/* Served date information */}
      {!loading && !error && (
        <div className="space-y-2 text-xs leading-6 text-slate-400">
          <p>
            Viewing:{" "}
            <span className="font-semibold text-slate-200">
              {selectedTier?.label ||
                "All tiers"}
            </span>

            {servedDayLabel && (
              <>
                {" "}
                · Records served for{" "}
                <span className="font-semibold text-slate-200">
                  {servedDayLabel}
                </span>
              </>
            )}
          </p>
        </div>
      )}

      {/* Archive results */}
      <section
        id="archive-results"
        aria-label="Historical tips by tier"
        aria-busy={loading}
      >
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                aria-hidden="true"
                className="h-48 rounded-2xl border border-slate-800 bg-slate-900/60 motion-safe:animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="space-y-4 rounded-2xl border border-rose-500/20 bg-slate-900 p-8 text-center">
            <h2 className="text-lg font-bold text-slate-100">
              Unable to Load Archive
            </h2>

            <p
              role="alert"
              className="text-sm leading-6 text-rose-300"
            >
              {error}
            </p>

            <button
              type="button"
              onClick={retryRequest}
              className={`${buttonStyles} bg-emerald-500 text-slate-950 hover:bg-emerald-400`}
            >
              <RefreshCw
                className="h-4 w-4"
                aria-hidden="true"
              />
              Try Again
            </button>
          </div>
        ) : groupedTips.length > 0 ? (
          <div className="space-y-10">
            {groupedTips.map((group) => (
              <section
                key={group.id}
                aria-labelledby={`${group.id}-archive-heading`}
                className="space-y-4"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <h2
                    id={`${group.id}-archive-heading`}
                    className="text-lg font-black text-slate-100"
                  >
                    {group.title}
                  </h2>

                  <span className="text-xs text-slate-400">
                    {group.tips.length} card
                    {group.tips.length === 1
                      ? ""
                      : "s"}{" "}
                    on this page
                  </span>
                </header>

                <div className="space-y-4">
                  {group.tips.map(
                    (tip, index) => {
                      const tipId =
                        tip.id ?? tip._id;

                      return (
                        <article
                          key={
                            tipId ??
                            `${group.id}-tip-${index}`
                          }
                          className="min-w-0"
                        >
                          {group.id === "free" ? (
                            <TipCard tip={tip} tier="FREE" showSettlementMarkers />
                          ) : (
                            <VipChannelTipCard
                              tip={tip}
                              tier={group.id}
                              showSettlementMarkers
                              cardNumber={(page - 1) * PAGE_SIZE + index + 1}
                            />
                          )}
                        </article>
                      );
                    }
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-12 text-center">
            <Trophy
              className="mx-auto mb-4 h-7 w-7 text-slate-400"
              aria-hidden="true"
            />

            <h2 className="text-lg font-bold text-slate-200">
              No Archived Tips Found
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              No selections match this view.
              Try another day, tier, sport, or
              outcome.
            </p>
          </div>
        )}
      </section>

      {/* Archive pagination */}
      {!loading &&
        !error &&
        archive.pagination.pages > 1 && (
          <nav
            aria-label="Archive pagination"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-5"
          >
            <button
              type="button"
              disabled={page <= 1}
              onClick={() =>
                changePage(page - 1)
              }
              className={`${buttonStyles} border border-slate-700 text-slate-300 hover:bg-slate-800`}
            >
              <ArrowLeft
                className="h-4 w-4"
                aria-hidden="true"
              />
              Previous
            </button>

            <p className="text-xs text-slate-400">
              Page {page} of{" "}
              {archive.pagination.pages}
            </p>

            <button
              type="button"
              disabled={
                page >=
                archive.pagination.pages
              }
              onClick={() =>
                changePage(page + 1)
              }
              className={`${buttonStyles} border border-slate-700 text-slate-300 hover:bg-slate-800`}
            >
              Next

              <ArrowRight
                className="h-4 w-4"
                aria-hidden="true"
              />
            </button>
          </nav>
        )}
    </main>
  );
}
