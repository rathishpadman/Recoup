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

export const BureauSourceContractSchema = createEnterpriseSourceContractSchema("bureau");
export type BureauSourceContract = EnterpriseSourceContract & { connectorName: "bureau" };

export class BureauReadOnlyAdapter {
  constructor(
    private readonly contract?: BureauSourceContract,
    private readonly availableCredentialEnvNames: readonly string[] = [],
    private readonly syntheticSourceReader?: SupabaseSyntheticSourceReader
  ) {}

  describeReadiness(): EnterpriseConnectorReadiness {
    return describeEnterpriseConnectorReadiness(this.contract, "Bureau", this.availableCredentialEnvNames, {
      connectorName: "bureau",
      sourceTableName: SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR.bureau
    });
  }

  buildReadRequestPlan(line: DeductionLine): EnterpriseReadRequestPlan {
    return buildEnterpriseReadRequestPlan(line, this.contract, "Bureau", this.availableCredentialEnvNames);
  }

  async retrieveSyntheticEvidence(line: DeductionLine): Promise<SyntheticSourceEvidence[]> {
    if (this.syntheticSourceReader === undefined) {
      throw new Error("Bureau synthetic Supabase reader is not configured.");
    }

    return this.syntheticSourceReader.readEvidence("bureau", line);
  }
}
