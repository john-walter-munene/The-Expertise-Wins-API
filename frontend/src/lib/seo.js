export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://theexpertisewins.com").replace(/\/$/, "");

const DEFAULT_IMAGE = "/app-icon.png";

export function createPageMetadata({ title, description, pathname, keywords, noindex = false, type = "website" }) {
  const url = `${SITE_URL}${pathname}`;
  const image = `${SITE_URL}${DEFAULT_IMAGE}`;
  return {
    title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: pathname },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { title, description, type, url, siteName: "The Expertise Wins", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export function generateStructuredData({ type = "WebSite", title, description, url = "/", image, datePublished, dateModified, author, mainEntity, extra = {} }) {
  const canonicalUrl = `${SITE_URL}${url}`;
  if (mainEntity) {
    // Rich result for a single item page (for example a match tip).
    return {
      "@context": "https://schema.org",
      "@type": type,
      headline: title,
      description,
      url: canonicalUrl,
      image: image || `${SITE_URL}${DEFAULT_IMAGE}`,
      ...(datePublished ? { datePublished } : {}),
      ...(dateModified ? { dateModified } : {}),
      mainEntity,
      isPartOf: { "@type": "WebSite", name: "The Expertise Wins", url: SITE_URL },
      ...extra,
    };
  }
  if (type === "Article") {
    return {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: title,
      description,
      url: canonicalUrl,
      image: image || `${SITE_URL}${DEFAULT_IMAGE}`,
      ...(datePublished ? { datePublished } : {}),
      ...(dateModified ? { dateModified } : {}),
      author: { "@type": "Person", name: author || "The Expertise Wins" },
      publisher: {
        "@type": "Organization",
        name: "The Expertise Wins",
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}${DEFAULT_IMAGE}` },
      },
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": type,
    name: title || "The Expertise Wins",
    url: canonicalUrl,
    description: description || "Daily sports tips, transparent archives, and performance tracking from The Expertise Wins.",
    ...(mainEntity ? { mainEntity } : {}),
    ...extra,
  };
}
