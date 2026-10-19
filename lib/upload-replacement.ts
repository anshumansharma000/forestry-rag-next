import { ApiError } from "./api";

export class UploadReplacementCancelled extends Error {
  constructor() {
    super("Re-upload cancelled. Existing files were kept.");
    this.name = "UploadReplacementCancelled";
  }
}

export type RecoverableUploadConflict = {
  index: number;
  filename: string;
  state: "failed" | "unindexed";
  can_replace_failed: true;
  requires_confirmation: true;
};

export function recoverableUploadConflicts(error: unknown, fileCount: number): RecoverableUploadConflict[] | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.details.can_replace_failed !== true) return null;
  const conflicts = error.details.conflicts;
  if (!Array.isArray(conflicts) || !conflicts.length) return null;
  const indices = new Set<number>();
  for (const conflict of conflicts) {
    if (!conflict || typeof conflict !== "object" || !Number.isInteger(conflict.index)
      || conflict.index < 0 || conflict.index >= fileCount || indices.has(conflict.index)
      || typeof conflict.filename !== "string" || !conflict.filename.trim()
      || !["failed", "unindexed"].includes(conflict.state)
      || conflict.can_replace_failed !== true || conflict.requires_confirmation !== true) return null;
    indices.add(conflict.index);
  }
  return conflicts;
}

export function replacementWarning(conflicts: RecoverableUploadConflict[]) {
  return `These files already exist, but have not been successfully processed:\n\n${conflicts.map(item => `• ${item.filename}`).join("\n")}\n\nReplace their stored files with the selected files and process them again?\n\nCancel keeps the existing files.`;
}

export async function prepareWithReplacementConfirmation<T>(
  fileCount: number,
  request: (replaceFailedIndices: number[]) => Promise<T>,
  confirm: (message: string) => boolean | Promise<boolean>,
): Promise<T> {
  try {
    return await request([]);
  } catch (error) {
    const conflicts = recoverableUploadConflicts(error, fileCount);
    if (!conflicts) throw error;
    if (!await confirm(replacementWarning(conflicts))) throw new UploadReplacementCancelled();
    // Confirmation applies only to the filenames in this conflict response.
    // The backend checks eligibility again before finalizing the replacement.
    return request(conflicts.map(conflict => conflict.index));
  }
}
