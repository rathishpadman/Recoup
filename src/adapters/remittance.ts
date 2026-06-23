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

export const RemittanceSourceContractSchema = createEnterpriseSourceContractSchema("remittance");
export type RemittanceSourceContract = EnterpriseSourceContract & { connectorName: "remittance" };

export class RemittanceReadOnlyAdapter {
  constructor(
    private readonly contract?: RemittanceSourceContract,
    private readonly availableCredentialEnvNames: readonly string[] = [],
    private readonly syntheticSourceReader?: SupabaseSyntheticSourceReader
  ) {}

  describeReadiness(): EnterpriseConnectorReadiness {
    return describeEnterpriseConnectorReadiness(this.contract, "Remittance", this.availableCredentialEnvNames, {
      connectorName: "remittance",
      sourceTableName: SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR.remittance
    });
  }

  buildReadRequestPlan(line: DeductionLine): EnterpriseReadRequestPlan {
    return buildEnterpriseReadRequestPlan(line, this.contract, "Remittance", this.availableCredentialEnvNames);
  }

  async retrieveSyntheticEvidence(line: DeductionLine): Promise<SyntheticSourceEvidence[]> {
    if (this.syntheticSourceReader === undefined) {
      throw new Error("Remittance synthetic Supabase reader is not configured.");
    }

    return this.syntheticSourceReader.readEvidence("remittance", line);
  }
}
