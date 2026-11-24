import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers.tsx";

export const metadata: Metadata = {
  title: "Emporos: restock your shop, paid in naira on Celo",
  description: "Tell Emporos what your shop needs. It finds the best supplier and pays in cNGN, within the limits you set.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
