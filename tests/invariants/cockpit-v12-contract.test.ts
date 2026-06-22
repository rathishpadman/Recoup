import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("cockpit v1.2 contract", () => {
  it("keeps the v1.2 persona journey as the cockpit source of truth", () => {
    expect(existsSync("docs/Agentic_O2C_Persona_Journey_v1_2.md")).toBe(true);
    expect(existsSync("docs/Agentic_O2C_Persona_Journey_v1.1_codex_ready.docx")).toBe(false);

    const personaJourney = read("docs/Agentic_O2C_Persona_Journey_v1_2.md");
    expect(personaJourney).toContain("SDD \u00a711 is superseded for cockpit");
    expect(personaJourney).not.toContain("SDD \u00a711 (primary)");
    expect(personaJourney).not.toMatch(/SDD \u00a711[^\n]*(primary|authoritative)/iu);

    const handoff = read("codex-handoff.md");
    expect(handoff).toContain("docs/Agentic_O2C_Persona_Journey_v1_2.md");
    expect(handoff).toContain("\u00a74-\u00a78");
    expect(handoff).toContain("SDD \u00a711 is superseded for cockpit");
    expect(handoff).not.toMatch(/Read these files first,[^\n]*`Recoup_v2_SDD\.md`\s*\u00a711/u);
  });

  it("records release-blocking cockpit v1.2 invariants", () => {
    const invariants = read("INVARIANTS.md");

    expect(invariants).toContain("**I-29**");
    expect(invariants).toContain("voice/text citation parity");
    expect(invariants).toContain("MultimodalDock");
    expect(invariants).toContain("spoken and text answers");
    expect(invariants).toContain("same record IDs");
    expect(invariants).toContain("invariants/cockpit-v12-contract.test.ts");

    expect(invariants).toContain("**I-30**");
    expect(invariants).toContain("provenance honesty");
    expect(invariants).toContain("synthetic");
    expect(invariants).toContain("never render as live");
    expect(invariants).toContain("precomputed/scripted agentic surfaces");
    expect(invariants).toContain("src/services/cockpitModel.ts");
  });

  it("removes stale v1.1 cockpit references from the SDD binding", () => {
    const sdd = read("Recoup_v2_SDD.md");

    expect(sdd).toContain("Persona Journey v1.2 (`docs/Agentic_O2C_Persona_Journey_v1_2.md`)");
    expect(sdd).not.toContain("`Agentic_O2C_Persona_Journey_v1_2.md`");
    expect(sdd).not.toContain("Persona Journey v1.1");
  });

  it("renders provenance and source-mode fields on governance surfaces", () => {
    const tracePage = read("cockpit/app/governance/trace/page.tsx");
    const connectorsPage = read("cockpit/app/governance/connectors/page.tsx");
    const memoryPage = read("cockpit/app/governance/memory/page.tsx");

    expect(tracePage).toContain("event.provenance");
    expect(tracePage).toContain("Provenance");
    expect(connectorsPage).toContain("connector.sourceMode");
    expect(connectorsPage).toContain("connector.sourceContractMode");
    expect(connectorsPage).toContain("Source mode");
    expect(connectorsPage).toContain("Contract mode");
    expect(memoryPage).toContain("model.backend");
    expect(memoryPage).toContain("model.sourceMode");
    expect(memoryPage).toContain("model.provenance");
  });

  it("renders full audit-chain fields on governance trace rows", () => {
    const tracePage = read("cockpit/app/governance/trace/page.tsx");

    expect(tracePage).toContain("event.entryType");
    expect(tracePage).toContain("event.entryHash");
    expect(tracePage).toContain("event.previousHash");
    expect(tracePage).toContain("event.sequence");
    expect(tracePage).toContain("event.sourceMode");
    expect(tracePage).toContain("event.provenance");
    expect(tracePage).toContain("event.recordIds");
    expect(tracePage).toContain("event.deterministicBasis");
    expect(tracePage).toContain("trace-hash-line");
    expect(tracePage).not.toContain("event.entryHash.slice");

    const styles = read("cockpit/app/styles.css");
    expect(styles).toContain(".trace-row div:first-child .trace-hash-line");
    expect(styles).toContain("overflow-wrap: anywhere");
    expect(styles).toContain(".governance-command-strip");
    expect(styles).toContain(".governance-split");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(styles).toContain("grid-template-columns: 1fr");
  });
});
