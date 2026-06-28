import api from "./axios";
import type {
  ImportedMovement,
  ImportedMovementStatus,
  StatementImportApplyResult,
  StatementImportBatch,
  StatementImportBatchStatus,
  StatementImportBatchSummary,
  StatementImportPreview,
  StatementImportUndoResult,
  UpdateImportedMovementPayload,
} from "../types";

export function previewStatementImport(
  file: File,
  financialAccountId?: string,
) {
  const formData = new FormData();
  formData.append("file", file);

  if (financialAccountId) {
    formData.append("financialAccountId", financialAccountId);
  }

  return api.post<StatementImportPreview>(
    "/statement-imports/preview",
    formData,
  );
}

export function createStatementImportBatch(
  files: File[],
  financialAccountId?: string,
) {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  if (financialAccountId) {
    formData.append("financialAccountId", financialAccountId);
  }

  return api.post<StatementImportBatch>("/statement-imports/batches", formData);
}

export const getStatementImportBatches = () =>
  api.get<StatementImportBatchSummary[]>("/statement-imports/batches");

export const getStatementImportBatch = (id: string) =>
  api.get<StatementImportBatch>(`/statement-imports/batches/${id}`);

export const updateStatementImportBatch = (
  id: string,
  data: { name?: string | null },
) => api.patch<StatementImportBatch>(`/statement-imports/batches/${id}`, data);

export const deleteStatementImportBatch = (id: string) =>
  api.delete<{ message: string }>(`/statement-imports/batches/${id}`);

export const applyReadyImportedMovements = (batchId: string) =>
  api.post<StatementImportApplyResult>(
    `/statement-imports/batches/${batchId}/apply-ready`,
  );

export const undoAppliedImportedMovements = (
  batchId: string,
  movementIds?: string[],
) =>
  api.post<StatementImportUndoResult>(
    `/statement-imports/batches/${batchId}/undo-applied`,
    movementIds ? { movementIds } : undefined,
  );

export const bulkReviewImportedMovementCategory = (
  batchId: string,
  movementIds: string[],
  reviewCategoryId: string,
) =>
  api.patch<{ updatedCount: number; batchStatus: StatementImportBatchStatus }>(
    `/statement-imports/batches/${batchId}/movements/review-category`,
    { movementIds, reviewCategoryId },
  );

export const updateImportedMovementStatus = (
  movementId: string,
  status: ImportedMovementStatus,
) =>
  api.patch<ImportedMovement>(
    `/statement-imports/movements/${movementId}/status`,
    { status },
  );

export const updateImportedMovement = (
  movementId: string,
  payload: UpdateImportedMovementPayload,
) =>
  api.patch<ImportedMovement>(
    `/statement-imports/movements/${movementId}`,
    payload,
  );
