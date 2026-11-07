// frontend/src/lib/tipSlug.js
//
// SEO-friendly tip URLs.
//
// A tip is addressed publicly as:
//
//   /tips/viktorijagolubic-vs-katie-boulter~seed_43041d59013a0199b4b846e8f59be91c
//   /archive/viktorijagolubic-vs-katie-boulter~seed_43041d59013a0199b4b846e8f59be91c
//
// The readable lead makes the link meaningful for search engines and humans,
// while the stable ID segment after the separator keeps the link resolvable.
// Links that only contain the raw ID continue to work (they redirect to the
// canonical slug URL), so existing shares and indexed URLs never break.

export const TIP_SLUG_SEPARATOR = "~";
export const TIP_PATH_PREFIX = "tips";

// Remove accents so "Viktorija Golubić" keeps its readable ASCII form.
function stripDiacritics(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Turn arbitrary text into a URL-safe, human-readable slug segment.
export function slugifySegment(value, fallback = "") {
  const slug = stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

// Readable match title used in headings, metadata and slugs.
// "homeTeam vs awayTeam" wins over a free-form `teams` string so the slug stays
// stable, and only falls back to `teams` when neither team is available.
export function getMatchTitle(tip) {
  if (!tip || typeof tip !== "object") return "Match details unavailable";
  const home = typeof tip.homeTeam === "string" ? tip.homeTeam.trim() : "";
  const away = typeof tip.awayTeam === "string" ? tip.awayTeam.trim() : "";
  if (home || away) return `${home || "Home"} vs ${away || "Away"}`;
  const teams = typeof tip.teams === "string" ? tip.teams.trim() : "";
  return teams || "Match details unavailable";
}

// Readable lead for the slug: "<home>-vs-<away>".
export function getMatchSlugLead(tip) {
  if (!tip || typeof tip !== "object") return "";
  const home = slugifySegment(tip.homeTeam ?? "");
  const away = slugifySegment(tip.awayTeam ?? "");
  if (home || away) return `${home || "home"}-vs-${away || "away"}`;
  // Fall back to whatever the feed labelled the match with.
  return slugifySegment(
    tip.teams ?? [tip.competition, tip.selection].filter(Boolean).join("-")
  );
}

// Keep the ID URL-safe without changing its meaning when resolved.
function encodeTipId(id) {
  return encodeURIComponent(String(id).trim());
}

export function decodeTipId(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function getTipId(tip) {
  const id = tip?.id ?? tip?._id;
  return id === null || id === undefined || String(id).trim() === ""
    ? null
    : String(id);
}

// Canonical public URL for a tip (relative). Tips always live under /tips so a
// tip keeps one canonical address no matter which list linked to it.
export function getTipHref(tip, basePath = TIP_PATH_PREFIX) {
  const id = getTipId(tip);
  if (!id) return null;
  const lead = getMatchSlugLead(tip);
  const prefix = `/${String(basePath).replace(/^\/+|\/+$/g, "")}`;
  return lead
    ? `${prefix}/${lead}${TIP_SLUG_SEPARATOR}${encodeTipId(id)}`
    : `${prefix}/${encodeTipId(id)}`;
}

// Split a route segment into its readable lead and stable ID.
export function parseTipSlug(rawSegment) {
  const segment = Array.isArray(rawSegment) ? rawSegment.join("/") : rawSegment;
  if (typeof segment !== "string" || segment.trim() === "") {
    return { lead: "", id: null };
  }
  const separatorIndex = segment.lastIndexOf(TIP_SLUG_SEPARATOR);
  if (separatorIndex === -1) {
    const id = decodeTipId(segment).trim();
    return { lead: "", id: id || null };
  }
  const lead = segment.slice(0, separatorIndex);
  const id = decodeTipId(segment.slice(separatorIndex + 1)).trim();
  return { lead, id: id || null };
}

// True when the URL only carries an ID and must be upgraded to the slug form.
export function isLegacyTipHref(segment) {
  return parseTipSlug(segment).lead === "";
}
