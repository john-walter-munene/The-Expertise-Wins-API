// frontend/src/app/archive/layout.jsx
import { createPageMetadata, generateStructuredData } from "../../lib/seo";

export const metadata = createPageMetadata({
  title: "Tips Archive & Results",
  description:
    "Browse the full archive of previous daily sports tips with settled results across Free, VIP, and MaxBet selections. Filter by day, sport, tier, and outcome.",
  pathname: "/archive",
  keywords: [
    "betting tips archive",
    "past betting tips results",
    "football tips history",
    "sports predictions results",
    "winning betting tips record",
  ],
});

// Archived tips are the public performance record, so list the section as a
// collection search engines can understand and navigate.
function ArchiveStructuredData() {
  const data = generateStructuredData({
    type: "CollectionPage",
    title: "Tips Archive & Results",
    description:
      "Historical daily sports tips with settled results across Free, VIP, and MaxBet selections.",
    url: "/archive",
    mainEntity: {
      "@type": "ItemList",
      name: "Archived sports tips",
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      numberOfItems: 0,
    },
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function ArchiveLayout({ children }) {
  return (
    <>
      <ArchiveStructuredData />
      {children}
    </>
  );
}
