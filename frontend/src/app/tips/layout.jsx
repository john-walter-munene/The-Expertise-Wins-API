// frontend/src/app/tips/layout.jsx
import { createPageMetadata, generateStructuredData } from "../../lib/seo";

export const metadata = createPageMetadata({
  title: "Today's Free, VIP & MaxBet Sports Tips",
  description:
    "Explore today's free, VIP, and MaxBet sports betting selections — markets, odds, and staking units — published daily by The Expertise Wins.",
  pathname: "/tips",
  keywords: [
    "today's betting tips",
    "free football tips",
    "VIP betting tips",
    "MaxBet predictions",
    "daily sports predictions",
  ],
});

// Describe the live tips hub as a date-driven collection.
function TipsStructuredData() {
  const data = generateStructuredData({
    type: "CollectionPage",
    title: "Today's Sports Tips",
    description:
      "Daily free, VIP, and MaxBet sports betting selections from The Expertise Wins.",
    url: "/tips",
    mainEntity: {
      "@type": "ItemList",
      name: "Today's sports tips",
      itemListOrder: "https://schema.org/ItemListOrderAscending",
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

export default function TipsLayout({ children }) {
  return (
    <>
      <TipsStructuredData />
      {children}
    </>
  );
}
