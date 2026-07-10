import type { Metadata } from "next";
import { LandingShell } from "@/components/landing/landing-shell";

export const metadata: Metadata = {
  title: "Recoup | Agentic Order-to-Cash Cockpit",
  description: "Agentic Order-to-Cash recovery, credit risk, and governance cockpit"
};

export default function LandingPage() {
  return <LandingShell />;
}
