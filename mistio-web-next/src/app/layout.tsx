import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Mistio - The Only Battery-Powered Vape Detector for Schools",
    template: "%s | Mistio",
  },
  description:
    "Mistio is the only vape detector that runs on battery for a full year. No wires, no electrician, no false alarms from cologne or cleaning spray. Built for K-12 schools.",
  keywords: [
    "vape detector",
    "vape detection",
    "school vape detector",
    "battery powered vape detector",
    "vape sensor",
    "vaping detection system",
    "school bathroom vape detector",
    "no false alarm vape detector",
    "wireless vape detector",
    "K-12 vape detection",
  ],
  authors: [{ name: "Mistio" }],
  creator: "Mistio",
  metadataBase: new URL("https://www.mistio.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.mistio.app",
    siteName: "Mistio",
    title: "Mistio - The Only Battery-Powered Vape Detector for Schools",
    description:
      "One year of battery life. No wires, no electrician, no false alarms. The vape detector built for K-12 schools.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Mistio Vape Detector",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mistio - The Only Battery-Powered Vape Detector",
    description:
      "One year of battery life. No wires, no electrician, no false alarms.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Mistio",
      url: "https://www.mistio.app",
      logo: "https://www.mistio.app/logo.png",
      contactPoint: {
        "@type": "ContactPoint",
        email: "contact@mistio.app",
        contactType: "sales",
      },
      sameAs: [
        "https://www.facebook.com/mistio",
        "https://www.linkedin.com/company/mistio",
        "https://twitter.com/mistio",
        "https://www.instagram.com/mistio",
      ],
    },
    {
      "@type": "Product",
      name: "Mistio Vape Detector",
      description:
        "Battery-powered vape detection sensor for K-12 schools. Lasts one full year on a single battery. Zero false alarms from cologne, deodorant, or cleaning products.",
      brand: { "@type": "Brand", name: "Mistio" },
      category: "Safety Equipment",
      offers: {
        "@type": "Offer",
        availability: "https://schema.org/InStock",
        priceCurrency: "USD",
      },
      additionalProperty: [
        { "@type": "PropertyValue", name: "Battery Life", value: "1 year" },
        { "@type": "PropertyValue", name: "Installation Time", value: "Under 1 minute" },
        { "@type": "PropertyValue", name: "Connectivity", value: "WiFi" },
        { "@type": "PropertyValue", name: "Cameras or Microphones", value: "None" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How long does the Mistio vape detector battery last?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Mistio runs on battery for a full year. No wiring or electrician needed. When the battery runs out, simply replace it.",
          },
        },
        {
          "@type": "Question",
          name: "Does the Mistio vape detector go off for cologne or cleaning spray?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Mistio's AI is trained on cologne, deodorant, cleaning products, and hair spray. It only alerts on actual vape aerosol, not everyday bathroom products.",
          },
        },
        {
          "@type": "Question",
          name: "How long does it take to install a Mistio vape detector?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Under one minute. Mount it to the wall with two screws. No cables, no ceiling work, no IT involvement. A custodian can install it during lunch.",
          },
        },
        {
          "@type": "Question",
          name: "Does the Mistio vape detector have cameras or microphones?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Mistio monitors air quality only. There are no cameras, microphones, or any recording devices. It is fully privacy-compliant for K-12 environments.",
          },
        },
        {
          "@type": "Question",
          name: "How is Mistio different from HALO or Verkada vape detectors?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Mistio is the only battery-powered vape detector on the market. Competitors like HALO and Verkada require PoE (Power over Ethernet) cables, electricians, and IT involvement. Mistio also has significantly fewer false alarms because its AI is specifically trained on common false-positive triggers like cologne and cleaning spray.",
          },
        },
        {
          "@type": "Question",
          name: "How much does a vape detector for schools cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "School vape detectors range from $500 to $3,000 per unit for hardware. Wired systems (HALO, Verkada) add $200-$2,000 per sensor in installation costs plus annual subscription fees. Mistio costs approximately $500 per sensor with zero installation cost and no subscription fees, making the total first-year cost per bathroom significantly lower than wired alternatives.",
          },
        },
        {
          "@type": "Question",
          name: "Where should vape detectors be installed in schools?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The most effective locations for vape detectors in schools are bathrooms (the primary vaping location), locker rooms, stairwells, hallway alcoves, and outdoor shelters. Install one sensor per bathroom, mounted on the ceiling or high on the wall, away from ventilation outlets that could disperse aerosol.",
          },
        },
        {
          "@type": "Question",
          name: "Can students defeat vape detectors?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "All vape detectors can be partially circumvented by exhaling into clothing or out a window. However, a ceiling-mounted sensor in a standard school bathroom is very difficult to defeat because vape aerosol disperses throughout the entire space within seconds, regardless of where someone exhales.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-dvh bg-white text-mistio-dark font-sans">
        {children}
      </body>
    </html>
  );
}
