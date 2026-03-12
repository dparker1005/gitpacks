import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitPacks",
  description: "Collect the contributors behind the code.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
