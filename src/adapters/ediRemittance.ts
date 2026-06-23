import type { DeductionLine } from "../types/entities.js";
import {
  buildEnterpriseReadRequestPlan,
  createEnterpriseSourceContractSchema,
  describeEnterpriseConnectorReadiness,
  SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR,
  type EnterpriseConnectorReadiness,
  type EnterpriseReadRequestPlan,
  type EnterpriseSourceContract
} from "./enterpriseReadOnly.js";
import type { SupabaseSyntheticSourceReader, SyntheticSourceEvidence } from "./supabaseSyntheticSource.js";

export const EdiRemittanceSourceContractSchema = createEnterpriseSourceContractSchema("edi-remittance");
export type EdiRemittanceSourceContract = EnterpriseSourceContract & { connectorName: "edi-remittance" };

export class EdiRemittanceReadOnlyAdapter {
  constructor(
    private readonly contract?: EdiRemittanceSourceContract,
    private readonly availableCredentialEnvNames: readonly string[] = [],
    private readonly syntheticSourceReader?: SupabaseSyntheticSourceReader
  ) {}

  describeReadiness(): EnterpriseConnectorReadiness {
    return describeEnterpriseConnectorReadiness(this.contract, "EDI remittance", this.availableCredentialEnvNames, {
      connectorName: "edi-remittance",
      sourceTableName: SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR["edi-remittance"]
    });
  }

  buildReadRequestPlan(line: DeductionLine): EnterpriseReadRequestPlan {
    return buildEnterpriseReadRequestPlan(line, this.contract, "EDI remittance", this.availableCredentialEnvNames);
  }

  async retrieveSyntheticEvidence(line: DeductionLine): Promise<SyntheticSourceEvidence[]> {
    if (this.syntheticSourceReader === undefined) {
      throw new Error("EDI remittance synthetic Supabase reader is not configured.");
    }

    return this.syntheticSourceReader.readEvidence("edi-remittance", line);
  }
}
