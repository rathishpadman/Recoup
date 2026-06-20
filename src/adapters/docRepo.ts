import type { DeductionLine } from "../types/entities.js";
import {
  buildEnterpriseReadRequestPlan,
  createEnterpriseSourceContractSchema,
  describeEnterpriseConnectorReadiness,
  type EnterpriseConnectorReadiness,
  type EnterpriseReadRequestPlan,
  type EnterpriseSourceContract
} from "./enterpriseReadOnly.js";

export const DocRepoSourceContractSchema = createEnterpriseSourceContractSchema("docs-repo");
export type DocRepoSourceContract = EnterpriseSourceContract & { connectorName: "docs-repo" };

export class DocRepoReadOnlyAdapter {
  constructor(
    private readonly contract?: DocRepoSourceContract,
    private readonly availableCredentialEnvNames: readonly string[] = []
  ) {}

  describeReadiness(): EnterpriseConnectorReadiness {
    return describeEnterpriseConnectorReadiness(this.contract, "Document repository", this.availableCredentialEnvNames);
  }

  buildReadRequestPlan(line: DeductionLine): EnterpriseReadRequestPlan {
    return buildEnterpriseReadRequestPlan(line, this.contract, "Document repository", this.availableCredentialEnvNames);
  }
}
