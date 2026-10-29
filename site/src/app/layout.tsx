import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SITE_URL } from "@/lib/lab-data";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Argus Agent Test Lab — adversarial testing for agentic payments",
  description:
    "Black-box adversarial batteries against the SDKs and platforms that move agentic money. Every verdict is an Ed25519-sealed record in a public hash chain — verifiable in one command.",
  keywords: [
    "adversarial testing",
    "x402",
    "agentic payments",
    "security research",
    "attestation registry",
    "black-box testing",
    "idempotency",
    "Ed25519",
    "hash chain",
  ],
  authors: [{ name: "Argus Agent Test Lab", url: SITE_URL }],
  alternates: {
    canonical: "/",
  },
  /* favicon — brand set, no placeholder CDNs (ТЗ п.1) */
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: "/apple-touch-icon.png",
  },
  /* OG tags — verbatim per ТЗ п.3; cover regenerated from the registry by CI (scripts/gen-og-cover.mjs) */
  openGraph: {
    title: "Argus Lab — adversarial verification for agentic payments",
    description: "Sealed, hash-chained evidence. x402 payment rails. Verify in one command.",
    url: "/",
    siteName: "Argus Lab",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og-cover.png",
        width: 1200,
        height: 630,
        alt: "Argus Lab — we sign our findings, not our opinions",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Argus Lab — adversarial verification for agentic payments",
    description: "Sealed, hash-chained evidence. x402 payment rails. Verify in one command.",
    images: ["/og-cover.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  /* Search-engine ownership proofs. Google = TXT record in Vercel DNS (2026-10-28);
   * Bing = meta tag, because Bing's CNAME method needs a subdomain and Vercel DNS
   * does not offer apex CNAME. Bing feeds ChatGPT-search, so this is also a GEO move. */
  verification: {
    other: {
      "msvalidate.01": "502EB7AC6042C5C6DC48D18BBAE6565C",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
