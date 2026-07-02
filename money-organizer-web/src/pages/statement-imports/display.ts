import type {
  ImportedMovementReconciliationStatus,
  ImportedMovementStatus,
  StatementImportBatchStatus,
  StatementImportFileStatus,
} from "../../types";

export const INVOICE_PAYMENT_FLAG =
  "INVOICE_PAYMENT_REQUIRES_DUPLICATE_REVIEW";

export function batchStatusLabel(status: StatementImportBatchStatus): string {
  const labels: Record<StatementImportBatchStatus, string> = {
    DRAFT: "Rascunho",
    REVIEWING: "Em revisão",
    READY: "Pronto",
    APPLIED: "Aplicado",
    PARTIALLY_APPLIED: "Parcial",
    CANCELED: "Cancelado",
  };

  return labels[status];
}

export function fileStatusLabel(status: StatementImportFileStatus): string {
  const labels: Record<StatementImportFileStatus, string> = {
    PARSED: "Lido",
    DUPLICATE: "Arquivo duplicado",
    FAILED: "Falhou",
  };

  return labels[status];
}

export function movementStatusLabel(status: ImportedMovementStatus): string {
  const labels: Record<ImportedMovementStatus, string> = {
    NEW: "Novo",
    DUPLICATE: "Duplicado",
    IGNORED: "Ignorado",
    READY: "Pronto",
    NEEDS_REVIEW: "Revisar",
    APPLIED: "Aplicado",
  };

  return labels[status];
}

export function reviewSourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    TRANSACTION: "Transação",
    TRANSFER: "Transferência",
    BALANCE_ADJUSTMENT: "Ajuste",
  };

  return labels[sourceType] ?? sourceType;
}

export function reviewFlagLabel(flag: string): string {
  const labels: Record<string, string> = {
    POSSIBLE_LEDGER_MATCH: "Possível match",
    RECONCILIATION_REQUIRED: "Conciliação pendente",
    PIX_REQUIRES_MANUAL_TRANSFER_REVIEW: "Pix: revisar transferência",
    INVOICE_PAYMENT_REQUIRES_DUPLICATE_REVIEW:
      "Pagamento de fatura: risco de duplicidade",
  };

  return labels[flag] ?? flag;
}

export function reviewFlagClass(flag: string): string {
  if (flag === INVOICE_PAYMENT_FLAG) {
    return "app-chip app-chip-danger";
  }

  if (
    flag === "POSSIBLE_LEDGER_MATCH" ||
    flag === "RECONCILIATION_REQUIRED"
  ) {
    return "app-chip app-chip-warning";
  }

  return "app-chip app-chip-info";
}

export function reconciliationStatusLabel(
  status: ImportedMovementReconciliationStatus,
): string {
  const labels: Record<ImportedMovementReconciliationStatus, string> = {
    PENDING: "Conciliação pendente",
    CONFIRMED_UNIQUE: "Novo confirmado",
    CONFIRMED_DUPLICATE: "Duplicidade confirmada",
  };

  return labels[status];
}

export function reconciliationStatusClass(
  status: ImportedMovementReconciliationStatus,
): string {
  if (status === "CONFIRMED_UNIQUE") {
    return "app-chip app-chip-success";
  }

  if (status === "CONFIRMED_DUPLICATE") {
    return "app-chip app-chip-danger";
  }

  return "app-chip app-chip-warning";
}

export function statusClass(
  status:
    | StatementImportBatchStatus
    | StatementImportFileStatus
    | ImportedMovementStatus,
): string {
  if (status === "DUPLICATE") {
    return "app-chip app-chip-warning";
  }

  if (status === "FAILED" || status === "CANCELED") {
    return "app-chip app-chip-danger";
  }

  if (status === "APPLIED" || status === "READY" || status === "PARSED") {
    return "app-chip app-chip-success";
  }

  return "app-chip app-chip-info";
}
