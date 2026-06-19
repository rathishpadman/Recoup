import type { Metadata } from "next";
import "../../tokens.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "Recoup Forensics Cockpit",
  description: "Deduction forensics analyst cockpit"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
