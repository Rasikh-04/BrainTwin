import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { themeInitScript } from "@/lib/theme";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BrainTwin — atlas explorer",
  description:
    "Explore a normal brain by region, then switch into a disorder or de-identified case and trace every highlighted region back to its source data. Pending expert review.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // data-theme is deliberately NOT a React prop here: the inline head script
    // owns it (from localStorage) before paint, and if React also controlled
    // the attribute, hydration would reset it to the server default and undo the
    // user's saved theme. suppressHydrationWarning keeps React from complaining
    // about the attribute the script adds.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* Set the theme before first paint so a dark-preferring reviewer never
            sees a flash of the light default. Must run before hydration. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
