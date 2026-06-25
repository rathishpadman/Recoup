import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { buildConnectorReadiness } from "../../src/adapters/connectorRegistry.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import {
  buildConnectorReadinessModel,
  buildForensicsCockpitModel
} from "../../src/services/cockpitModel.js";
import { assertBusinessProvenance, type MayaFieldProvenance } from "../../src/services/mayaDataProvenance.js";
import { buildSourceHealthFromConnectorReadiness } from "../../src/services/sourceHealth.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";

const files = [
  "src/services/cockpitModel.ts",
  "cockpit/components/maya/query-evidence-dock.tsx",
  "cockpit/components/maya/agent-trace-panel.tsx",
  "tests/e2e/cockpit-premium-e2e.ts"
];
const source = new SyntheticSource({ seed: 42 });
const governedConfig = day1GovernedConfigSeed.values;
const sourceOptions = {
  riskObservationSource: source,
  serviceContext: fixtureForensicsServiceContext,
  settlementSource: source
} as const;

describe("Maya real-backend contract", () => {
  it("does not hardcode Maya business data in production read models", () => {
    const source = files.map((file) => `${file}\n${readFileSync(file, "utf8")}`).join("\n");

    expect(source).not.toContain("Refreshed 08:24 AM");
    expect(source).not.toContain("String(4)");
    expect(source).not.toContain("buildMultimodalSubAgents");
    expect(source).not.toContain("offline demo only");
  });

  it("keeps fixture API isolated from real-backend acceptance", () => {
    const e2e = readFileSync("tests/e2e/cockpit-premium-e2e.ts", "utf8");

    expect(e2e).toContain("--fixture-api");
    expect(e2e).not.toContain("test:e2e:maya-real");
  });

  it("requires Maya real-backend acceptance to exercise realistic operator query scenarios", () => {
    const e2e = readFileSync("tests/e2e/maya-real-backend-e2e.ts", "utf8");

    expect(e2e).toContain("realMayaQueryScenarios");
    expect(e2e).toContain("customer-dispute-response");
    expect(e2e).toContain("manager-approval-brief");
    expect(e2e).toContain("billing-vs-recovery-route");
    expect(e2e).toContain("MAYA_REAL_QUERY_RESULT");
    expect(e2e).not.toContain('fill("Why is this deduction recoverable?")');
  });

  it("requires field-level provenance on Maya-visible backend business fields", () => {
    const model = buildForensicsCockpitModel({ governedConfig, ...sourceOptions });
    const connectorEnvNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const connectors = buildConnectorReadinessModel(
      connectorEnvNames,
      undefined,
      sourceHealthForConnectorModel(connectorEnvNames)
    );

    for (const [index, item] of model.kpiStrip.entries()) {
      expectBusinessProvenance(`kpiStrip.${String(index)}`, item);
    }
    for (const item of model.worklist) {
      expectBusinessProvenance(`worklist.${item.lineId}`, item);
    }
    expectBusinessProvenance("selected.evidencePack", model.selected.evidencePack);
    for (const document of model.selected.evidencePack.documents) {
      expectBusinessProvenance(`selected.evidencePack.documents.${document.documentId}`, document);
    }
    expectBusinessProvenance("selected.draft", model.selected.draft);
    for (const action of model.selected.approvalActions) {
      expectBusinessProvenance(`selected.approvalActions.${action.decision}`, action, { allowOperatorSession: true });
    }
    for (const action of model.actionInbox) {
      expectBusinessProvenance(`actionInbox.${action.actionId}`, action);
    }
    expectBusinessProvenance("multimodalDock", model.multimodalDock);
    for (const row of model.multimodalDock.subAgents) {
      expectBusinessProvenance(`multimodalDock.subAgents.${row.name}`, row);
    }
    for (const row of model.mayaJourney) {
      expectBusinessProvenance(`mayaJourney.${row.label}`, row);
    }
    expectBusinessProvenance("recoveryTracker", model.recoveryTracker);
    for (const row of model.retrievalStatus) {
      expectBusinessProvenance(`retrievalStatus.${row.source}`, row);
    }
    expectBusinessProvenance("containmentPanel", model.containmentPanel);
    for (const row of model.containmentPanel.basisRows) {
      expectBusinessProvenance(`containmentPanel.basisRows.${row.label}`, row);
    }
    expectBusinessProvenance("containmentPanel.handoff", model.containmentPanel.handoff);
    expectBusinessProvenance("connectorReadiness", connectors);
    for (const tile of connectors.sourceTiles) {
      expectBusinessProvenance(`connectorReadiness.sourceTiles.${tile.key}`, tile);
    }
  });

  it("aligns evidence source and retrieval provenance with actual source evidence", () => {
    const model = buildForensicsCockpitModel({ governedConfig, ...sourceOptions });
    const evidenceSourceLabels = uniqueStrings(model.selected.evidencePack.documents.map((document) => document.sourceLabel));
    const evidenceRecordIds = uniqueStrings(
      model.selected.evidencePack.documents.flatMap((document) => document.provenance.recordIds)
    );
    const evidenceSourcesKpi = model.kpiStrip.find((item) => item.label === "Evidence sources");

    expect(evidenceSourcesKpi?.value).toBe(String(evidenceSourceLabels.length));
    expect(evidenceSourcesKpi?.support).toBe(evidenceSourceLabels.join(", "));
    expect(evidenceSourcesKpi?.provenance.recordIds).toEqual(expect.arrayContaining(evidenceRecordIds));
    expect(model.retrievalStatus.map((row) => row.source)).toEqual(evidenceSourceLabels);

    const worklistLineIds = uniqueStrings(model.worklist.flatMap((item) => item.lineIds));
    for (const row of model.retrievalStatus) {
      const sourceEvidenceRecordIds = uniqueStrings(
        model.selected.evidencePack.documents
          .filter((document) => document.sourceLabel === row.source)
          .flatMap((document) => document.provenance.recordIds)
      );
      expect(sourceEvidenceRecordIds.length, `${row.source} must have source evidence records`).toBeGreaterThan(0);
      expect(row.provenance.sourceKind).toBe("derived_backend");
      expect(row.provenance.recordIds.some((recordId) => sourceEvidenceRecordIds.includes(recordId))).toBe(true);
      expect(sameMembers(row.provenance.recordIds, worklistLineIds)).toBe(false);
    }
  });

  it("labels connector readiness provenance as derived backend state until live source health records exist", () => {
    const connectorEnvNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const connectors = buildConnectorReadinessModel(
      connectorEnvNames,
      undefined,
      sourceHealthForConnectorModel(connectorEnvNames)
    );

    expect(connectors.provenance.sourceKind).toBe("derived_backend");
    for (const tile of connectors.sourceTiles.filter((sourceTile) => sourceTile.statusTone !== "ready")) {
      expect(tile.provenance.sourceKind).toBe("derived_backend");
      expect(tile.provenance.deterministicBasis).toMatch(/credential|schema probe|read-only proof|ConnectorReadiness/iu);
    }
  });

  it("rejects blank provenance source names and record IDs", () => {
    const valid = {
      sourceKind: "derived_backend",
      sourceName: "Read model",
      recordIds: ["S3-L1"],
      deterministicBasis: "computed read-model basis"
    } satisfies MayaFieldProvenance;

    expect(() => {
      assertBusinessProvenance("blank-source", { ...valid, sourceName: " " });
    }).toThrow(
      "Maya field blank-source is missing source name."
    );
    expect(() => {
      assertBusinessProvenance("blank-record", { ...valid, recordIds: ["S3-L1", " "] });
    }).toThrow(
      "Maya field blank-record has blank source record IDs."
    );
  });
});

function expectBusinessProvenance(
  label: string,
  target: unknown,
  options: { allowOperatorSession?: boolean } = {}
): void {
  expect(isRecord(target), `${label} must be an object`).toBe(true);
  if (!isRecord(target)) {
    return;
  }

  const provenance = target.provenance;
  expect(isRecord(provenance), `${label} must expose provenance`).toBe(true);
  if (!isRecord(provenance)) {
    return;
  }

  expect(provenance.sourceKind, `${label} sourceKind`).toMatch(
    /^(supabase|sap_odata|agent_trace|derived_backend|operator_session)$/u
  );
  expect(provenance.sourceName, `${label} sourceName`).toEqual(expect.any(String));
  expect((provenance.sourceName as string).trim().length, `${label} sourceName non-empty`).toBeGreaterThan(0);
  expect(provenance.recordIds, `${label} recordIds`).toEqual(expect.any(Array));
  if (options.allowOperatorSession === true && provenance.sourceKind === "operator_session") {
    expect(provenance.recordIds).toEqual([]);
  } else {
    expect((provenance.recordIds as unknown[]).length, `${label} recordIds non-empty`).toBeGreaterThan(0);
    expect(
      (provenance.recordIds as unknown[]).every((recordId) => typeof recordId === "string" && recordId.trim().length > 0),
      `${label} recordIds entries non-empty`
    ).toBe(true);
  }
  expect(provenance.deterministicBasis, `${label} deterministicBasis`).toEqual(expect.any(String));
  expect(
    (provenance.deterministicBasis as string).trim().length,
    `${label} deterministicBasis non-empty`
  ).toBeGreaterThan(0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function sourceHealthForConnectorModel(availableCredentialEnvNames: readonly string[]) {
  return buildSourceHealthFromConnectorReadiness(
    buildConnectorReadiness([], availableCredentialEnvNames),
    "2026-06-24T10:30:00.000Z"
  );
}

function sameMembers(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}
