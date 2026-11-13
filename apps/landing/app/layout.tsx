import type { Metadata, Viewport } from "next";
import { Archivo, Bodoni_Moda } from "next/font/google";
import type { ReactNode } from "react";
import { SITE } from "@/lib/site";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  style: ["italic"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: `${SITE.name}: free video editor, no watermark`,
  description: SITE.description,
};

export const viewport: Viewport = {
  themeColor: "#f8f0f4",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${bodoni.variable}`}
    >
      <head>
        {/* Marks JS as available before first paint so reveal animations never flash. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static one-liner, no user input
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body className="min-h-dvh overflow-x-clip">{children}</body>
    </html>
  );
}
