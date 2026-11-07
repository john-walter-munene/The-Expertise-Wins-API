// frontend/src/app/sitemap.js
import { getAllPosts } from "../lib/blog";
import { SITE_URL } from "../lib/seo";

// How many days of the archive sitemap to advertise. Recent history is the part
// people and crawlers look for most, so list the last two weeks of daily views.
const ARCHIVE_DAYS = 14;

// Build the YYYY-MM-DD keys the archive understands, newest first.
function getRecentArchiveDays(count) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const part = (type) => Number(parts.find((item) => item.type === type)?.value);
  const todayUtc = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));

  return Array.from({ length: count }, (_, index) => {
    const day = new Date(todayUtc);
    // The archive never serves today, so start at yesterday.
    day.setUTCDate(day.getUTCDate() - (index + 1));
    return day.toISOString().slice(0, 10);
  });
}

export default function sitemap() {
  const posts = getAllPosts();

  const blogUrls = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date).toISOString(),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const routes = [
    "",
    "/tips",
    "/archive",
    "/stats",
    "/products",
    "/blog",
    "/about",
    "/bookies",
    "/coffee",
    "/responsible-betting",
    "/privacy",
    "/terms",
  ].map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date().toISOString(),
    changeFrequency:
      route === "/tips" ? "daily" : route === "/archive" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/tips" ? 0.9 : 0.8,
  }));

  // Daily archive pages are crawlable public results and deserve their own
  // entries so search engines can surface a specific date's record.
  const archiveUrls = getRecentArchiveDays(ARCHIVE_DAYS).map((day) => ({
    url: `${SITE_URL}/archive?day=${day}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...routes, ...archiveUrls, ...blogUrls];
}
