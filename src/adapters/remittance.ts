import type { DeductionLine } from "../types/entities.js";
import {
  buildEnterpriseReadRequestPlan,
  createEnterpriseSourceContractSchema,
  describeEnterpriseConnectorReadiness,
  type EnterpriseConnectorReadiness,
  type EnterpriseReadRequestPlan,
  type EnterpriseSourceContract
} from "./enterpriseReadOnly.js";

export const RemittanceSourceContractSchema = createEnterpriseSourceContractSchema("remittance");
export type RemittanceSourceContract = EnterpriseSourceContract & { connectorName: "remittance" };

export class RemittanceReadOnlyAdapter {
  constructor(
    private readonly contract?: RemittanceSourceContract,
    private readonly availableCredentialEnvNames: readonly string[] = []
  ) {}

  describeReadiness(): EnterpriseConnectorReadiness {
    return describeEnterpriseConnectorReadiness(this.contract, "Remittance", this.availableCredentialEnvNames);
  }

  buildReadRequestPlan(line: DeductionLine): EnterpriseReadRequestPlan {
    return buildEnterpriseReadRequestPlan(line, this.contract, "Remittance", this.availableCredentialEnvNames);
  }
}
