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

export const TpmSourceContractSchema = createEnterpriseSourceContractSchema("tpm");
export type TpmSourceContract = EnterpriseSourceContract & { connectorName: "tpm" };

export class TpmReadOnlyAdapter {
  constructor(
    private readonly contract?: TpmSourceContract,
    private readonly availableCredentialEnvNames: readonly string[] = []
  ) {}

  describeReadiness(): EnterpriseConnectorReadiness {
    return describeEnterpriseConnectorReadiness(this.contract, "TPM", this.availableCredentialEnvNames, {
      connectorName: "tpm",
      sourceTableName: SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR.tpm
    });
  }

  buildReadRequestPlan(line: DeductionLine): EnterpriseReadRequestPlan {
    return buildEnterpriseReadRequestPlan(line, this.contract, "TPM", this.availableCredentialEnvNames);
  }
}
