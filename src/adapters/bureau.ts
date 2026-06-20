import type { DeductionLine } from "../types/entities.js";
import {
  buildEnterpriseReadRequestPlan,
  createEnterpriseSourceContractSchema,
  describeEnterpriseConnectorReadiness,
  type EnterpriseConnectorReadiness,
  type EnterpriseReadRequestPlan,
  type EnterpriseSourceContract
} from "./enterpriseReadOnly.js";

export const BureauSourceContractSchema = createEnterpriseSourceContractSchema("bureau");
export type BureauSourceContract = EnterpriseSourceContract & { connectorName: "bureau" };

export class BureauReadOnlyAdapter {
  constructor(
    private readonly contract?: BureauSourceContract,
    private readonly availableCredentialEnvNames: readonly string[] = []
  ) {}

  describeReadiness(): EnterpriseConnectorReadiness {
    return describeEnterpriseConnectorReadiness(this.contract, "Bureau", this.availableCredentialEnvNames);
  }

  buildReadRequestPlan(line: DeductionLine): EnterpriseReadRequestPlan {
    return buildEnterpriseReadRequestPlan(line, this.contract, "Bureau", this.availableCredentialEnvNames);
  }
}
