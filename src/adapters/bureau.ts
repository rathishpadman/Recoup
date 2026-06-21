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

export const BureauSourceContractSchema = createEnterpriseSourceContractSchema("bureau");
export type BureauSourceContract = EnterpriseSourceContract & { connectorName: "bureau" };

export class BureauReadOnlyAdapter {
  constructor(
    private readonly contract?: BureauSourceContract,
    private readonly availableCredentialEnvNames: readonly string[] = []
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
}
