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

export const EdiRemittanceSourceContractSchema = createEnterpriseSourceContractSchema("edi-remittance");
export type EdiRemittanceSourceContract = EnterpriseSourceContract & { connectorName: "edi-remittance" };

export class EdiRemittanceReadOnlyAdapter {
  constructor(
    private readonly contract?: EdiRemittanceSourceContract,
    private readonly availableCredentialEnvNames: readonly string[] = []
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
}
