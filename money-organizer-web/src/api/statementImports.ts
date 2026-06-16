import api from "./axios";
import type {
  ImportedMovement,
  ImportedMovementStatus,
  StatementImportApplyResult,
  StatementImportBatch,
  StatementImportBatchSummary,
  StatementImportPreview,
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

export const applyReadyImportedMovements = (batchId: string) =>
  api.post<StatementImportApplyResult>(
    `/statement-imports/batches/${batchId}/apply-ready`,
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
