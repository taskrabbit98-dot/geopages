import type { FAQItem } from "~/lib/ai/provider";

interface SchemaParams {
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  serviceName: string;
  locationName: string;
  locationCity: string;
  locationState: string;
  shopUrl: string;
  slug: string;
  faq: FAQItem[];
}

export function buildSchemaJson(params: SchemaParams): object {
  const pageUrl = `${params.shopUrl}/pages/${params.slug}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "@id": `${params.shopUrl}/#business`,
        name: params.businessName,
        telephone: params.businessPhone,
        address: {
          "@type": "PostalAddress",
          streetAddress: params.businessAddress,
          addressLocality: params.locationCity,
          addressRegion: params.locationState,
        },
        url: params.shopUrl,
      },
      {
        "@type": "Service",
        name: params.serviceName,
        areaServed: {
          "@type": "City",
          name: params.locationName,
        },
        provider: { "@id": `${params.shopUrl}/#business` },
        url: pageUrl,
      },
      {
        "@type": "FAQPage",
        mainEntity: params.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}
