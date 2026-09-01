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
      "@id": "https://www.mistio.app/#organization",
      name: "Mistio",
      url: "https://www.mistio.app",
      logo: {
        "@type": "ImageObject",
        url: "https://www.mistio.app/logo.png",
      },
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
      "@type": "WebSite",
      "@id": "https://www.mistio.app/#website",
      url: "https://www.mistio.app",
      name: "Mistio",
      publisher: { "@id": "https://www.mistio.app/#organization" },
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
