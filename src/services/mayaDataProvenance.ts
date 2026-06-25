export type MayaDataSourceKind = "supabase" | "sap_odata" | "agent_trace" | "derived_backend" | "operator_session";

export interface MayaFieldProvenance {
  sourceKind: MayaDataSourceKind;
  sourceName: string;
  recordIds: string[];
  deterministicBasis: string;
  checkedAtIso?: string;
}

export interface ProvenancedValue<T> {
  value: T;
  provenance: MayaFieldProvenance;
}

export function assertBusinessProvenance(fieldName: string, provenance: MayaFieldProvenance): void {
  if (provenance.sourceName.trim().length === 0) {
    throw new Error(`Maya field ${fieldName} is missing source name.`);
  }
  if (provenance.recordIds.length === 0 && provenance.sourceKind !== "operator_session") {
    throw new Error(`Maya field ${fieldName} is missing source record IDs.`);
  }
  if (provenance.sourceKind !== "operator_session" && provenance.recordIds.some((recordId) => recordId.trim().length === 0)) {
    throw new Error(`Maya field ${fieldName} has blank source record IDs.`);
  }
  if (provenance.deterministicBasis.trim().length === 0) {
    throw new Error(`Maya field ${fieldName} is missing deterministic basis.`);
  }
}
