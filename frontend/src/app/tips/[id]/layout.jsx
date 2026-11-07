// frontend/src/app/tips/[id]/layout.jsx
import { createPageMetadata } from "../../../lib/seo";
import {
  getMatchTitle,
  getTipHref,
  isLegacyTipHref,
  parseTipSlug,
} from "../../../lib/tipSlug";

// Server-side lookup so crawlers and social scrapers receive a real title,
// description and canonical URL instead of a generic placeholder. A failure
// here must never break the page, so it falls back to the generic metadata.
async function fetchPublicTip(id) {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
  try {
    const response = await fetch(`${baseUrl}/tips/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const tip = payload?.tip ?? payload;
    return tip && typeof tip === "object" && !Array.isArray(tip) ? tip : null;
  } catch {
    return null;
  }
}

// Describe a tip in plain language for search result snippets.
function buildDescription(tip) {
  const matchTitle = getMatchTitle(tip);
  const selection =
    (typeof tip.selection === "string" && tip.selection.trim()) ||
    (typeof tip.prediction === "string" && tip.prediction.trim()) ||
    "";
  const market = typeof tip.market === "string" ? tip.market.trim() : "";
  const odds =
    tip.odds !== null &&
      tip.odds !== undefined &&
      String(tip.odds).trim() !== "" &&
      Number(tip.odds) > 0
      ? Number(tip.odds).toFixed(2)
      : "";
  const sport = typeof tip.sport === "string" ? tip.sport.trim() : "";
  const competition =
    (typeof tip.competition === "string" && tip.competition.trim()) ||
    (typeof tip.league === "string" && tip.league.trim()) ||
    "";

  const context = [competition, sport].filter(Boolean).join(" · ");
  const pick = selection
    ? `${selection}${market && !selection.includes(market) ? ` (${market})` : ""}${odds ? ` @ ${odds} odds` : ""
    }`
    : "";

  const parts = [
    `Expert tip for ${matchTitle}${context ? ` — ${context}` : ""}.`,
    pick ? `Our selection: ${pick}.` : "",
    "Review the market, odds, staking units and settled result on The Expertise Wins.",
  ].filter(Boolean);

  return parts.join(" ").slice(0, 300);
}

export async function generateMetadata({ params }) {
  const { lead, id } = parseTipSlug(params?.id);

  if (!id) {
    return {
      ...createPageMetadata({
        title: "Tip Details",
        description:
          "Review the selection, market, odds, and settlement details for this tip.",
        pathname: "/tips",
      }),
      robots: { index: false, follow: true },
    };
  }

  // A URL without the readable lead is upgraded to the canonical slug form so
  // search engines only ever index one address per tip.
  if (isLegacyTipHref(params?.id)) {
    const tip = await fetchPublicTip(id);
    const canonicalHref = tip ? getTipHref(tip) : `/tips/${encodeURIComponent(id)}`;
    return {
      ...createPageMetadata({
        title: "Tip Details",
        description:
          "Review the selection, market, odds, and settlement details for this tip.",
        pathname: canonicalHref,
      }),
      robots: { index: false, follow: true },
    };
  }

  const tip = await fetchPublicTip(id);
  if (!tip) {
    return {
      ...createPageMetadata({
        title: "Tip Details",
        description:
          "Review the selection, market, odds, and settlement details for this tip.",
        pathname: `/tips/${lead}`,
      }),
      robots: { index: false, follow: true },
    };
  }

  const matchTitle = getMatchTitle(tip);
  return createPageMetadata({
    title: `${matchTitle} Prediction & Tips`,
    description: buildDescription(tip),
    pathname: getTipHref(tip) || `/tips/${lead}`,
    keywords: [
      `${matchTitle} prediction`,
      `${matchTitle} tips`,
      `${matchTitle} betting tips`,
      ...(tip.sport ? [`${tip.sport} predictions`] : []),
      "betting tips",
      "sports predictions",
    ],
    type: "article",
  });
}

export default function TipDetailsLayout({ children }) {
  return children;
}
