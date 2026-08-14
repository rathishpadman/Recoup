export const evidenceStorageBucket = "recoup-evidence";

const storageUriPrefix = "supabase://storage/";

export interface EvidenceStorageLocation {
  bucket: string;
  objectPath: string;
}

export function evidenceStorageObjectPath(documentType: string, evidenceId: string): string {
  return `${documentType}/${evidenceId}.pdf`;
}

export function evidenceStorageUri(documentType: string, evidenceId: string): string {
  return `${storageUriPrefix}${evidenceStorageBucket}/${evidenceStorageObjectPath(documentType, evidenceId)}`;
}

/**
 * Parses a stored-object URI back into its bucket and object path.
 *
 * Returns undefined for the legacy `supabase://recoup_evidence_documents/<id>` form, which
 * points at the database row rather than a stored object and has no artifact to stream.
 */
export function parseEvidenceStorageUri(storageUri: string | null | undefined): EvidenceStorageLocation | undefined {
  const normalized = storageUri?.trim() ?? "";
  if (!normalized.startsWith(storageUriPrefix)) {
    return undefined;
  }

  const [bucket, ...objectSegments] = normalized.slice(storageUriPrefix.length).split("/");
  const objectPath = objectSegments.join("/");
  if (bucket === undefined || bucket.length === 0 || objectPath.length === 0) {
    return undefined;
  }

  return { bucket, objectPath };
}
