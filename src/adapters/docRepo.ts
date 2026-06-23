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
import type { OpenAiVectorStoreEvidenceReader, OpenAiVectorStoreEvidence } from "./openAiVectorStore.js";
import type { SupabaseSyntheticSourceReader, SyntheticSourceEvidence } from "./supabaseSyntheticSource.js";

export const DocRepoSourceContractSchema = createEnterpriseSourceContractSchema("docs-repo");
export type DocRepoSourceContract = EnterpriseSourceContract & { connectorName: "docs-repo" };

export class DocRepoReadOnlyAdapter {
  constructor(
    private readonly contract?: DocRepoSourceContract,
    private readonly availableCredentialEnvNames: readonly string[] = [],
    private readonly syntheticSourceReader?: SupabaseSyntheticSourceReader,
    private readonly vectorStoreEvidenceReader?: OpenAiVectorStoreEvidenceReader
  ) {}

  describeReadiness(): EnterpriseConnectorReadiness {
    return describeEnterpriseConnectorReadiness(this.contract, "Document repository", this.availableCredentialEnvNames, {
      connectorName: "docs-repo",
      sourceTableName: SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR["docs-repo"]
    });
  }

  buildReadRequestPlan(line: DeductionLine): EnterpriseReadRequestPlan {
    return buildEnterpriseReadRequestPlan(line, this.contract, "Document repository", this.availableCredentialEnvNames);
  }

  async retrieveSyntheticEvidence(line: DeductionLine): Promise<SyntheticSourceEvidence[]> {
    if (this.syntheticSourceReader === undefined) {
      throw new Error("Document repository synthetic Supabase reader is not configured.");
    }

    return this.syntheticSourceReader.readEvidence("docs-repo", line);
  }

  async retrieveVectorStoreEvidence(line: DeductionLine): Promise<OpenAiVectorStoreEvidence[]> {
    if (this.vectorStoreEvidenceReader === undefined) {
      throw new Error("OpenAI vector-store evidence reader is not configured.");
    }

    return this.vectorStoreEvidenceReader.searchEvidence(line);
  }
}
