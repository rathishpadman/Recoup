import type { DeductionLine } from "../../types/entities.js";
import type { EvidenceDocument } from "./docs.js";
import { createSapODataReadOnlyAdapter } from "../../adapters/sapOData.js";
import type { RuntimeEnv } from "../../../config/env.js";

export function retrieveSap(line: DeductionLine, env: RuntimeEnv = process.env): EvidenceDocument[] {
  return createSapODataReadOnlyAdapter(env).retrieveDeductionCase(line);
}
