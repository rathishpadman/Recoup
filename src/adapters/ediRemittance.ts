import type { DeductionLine } from "../types/entities.js";
import {
  buildEnterpriseReadRequestPlan,
  createEnterpriseSourceContractSchema,
  describeEnterpriseConnectorReadiness,
  type EnterpriseConnectorReadiness,
  type EnterpriseReadRequestPlan,
  type EnterpriseSourceContract
} from "./enterpriseReadOnly.js";

export const EdiRemittanceSourceContractSchema = createEnterpriseSourceContractSchema("edi-remittance");
export type EdiRemittanceSourceContract = EnterpriseSourceContract & { connectorName: "edi-remittance" };

export class EdiRemittanceReadOnlyAdapter {
  constructor(
    private readonly contract?: EdiRemittanceSourceContract,
    private readonly availableCredentialEnvNames: readonly string[] = []
  ) {}

  describeReadiness(): EnterpriseConnectorReadiness {
    return describeEnterpriseConnectorReadiness(this.contract, "EDI remittance", this.availableCredentialEnvNames);
  }

  buildReadRequestPlan(line: DeductionLine): EnterpriseReadRequestPlan {
    return buildEnterpriseReadRequestPlan(line, this.contract, "EDI remittance", this.availableCredentialEnvNames);
  }
}
