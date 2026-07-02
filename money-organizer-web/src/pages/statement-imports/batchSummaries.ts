import type {
  ImportedMovement,
  ImportedMovementStatus,
  StatementImportBatch,
  StatementImportBatchSummary,
} from "../../types";

export type MovementStatusFilter = "ALL" | ImportedMovementStatus;

export function getBatchTotals(batch: StatementImportBatch | null) {
  const movements = batch?.files.flatMap((file) => file.movements) ?? [];

  return movements.reduce(
    (totals, movement) => {
      if (movement.direction === "IN") {
        totals.inCents += movement.amountCents;
      } else {
        totals.outCents += movement.amountCents;
      }

      if (movement.status === "DUPLICATE") {
        totals.duplicateCount += 1;
      }

      return totals;
    },
    { inCents: 0, outCents: 0, duplicateCount: 0 },
  );
}

export function getBatchMovementCount(
  batch: StatementImportBatch | null,
): number {
  return (
    batch?.files.reduce((total, file) => total + file.movements.length, 0) ?? 0
  );
}

export function getBatchDisplayName(
  batch: Pick<StatementImportBatch | StatementImportBatchSummary, "id" | "name">,
): string {
  return batch.name?.trim() || `Lote #${batch.id.slice(0, 8)}`;
}

export function getBatchShortCode(batchId: string): string {
  return `#${batchId.slice(0, 8)}`;
}

function createMovementStatusCounts(): Record<MovementStatusFilter, number> {
  return {
    ALL: 0,
    NEW: 0,
    DUPLICATE: 0,
    IGNORED: 0,
    READY: 0,
    NEEDS_REVIEW: 0,
    APPLIED: 0,
  };
}

export function getMovementStatusCounts(
  movements: Array<Pick<ImportedMovement, "status">>,
): Record<MovementStatusFilter, number> {
  const counts = createMovementStatusCounts();

  counts.ALL = movements.length;

  movements.forEach((movement) => {
    counts[movement.status] += 1;
  });

  return counts;
}

export function getBatchMovementStatusCounts(
  batch: StatementImportBatch | null,
): Record<MovementStatusFilter, number> {
  return getMovementStatusCounts(
    batch?.files.flatMap((file) => file.movements) ?? [],
  );
}

function getAutoCategorizedMovementCount(batch: StatementImportBatch): number {
  return batch.files
    .flatMap((file) => file.movements)
    .filter((movement) => {
      const suggestion = movement.reviewHints?.categorySuggestion;

      return Boolean(
        suggestion &&
          movement.reviewCategoryId === suggestion.categoryId &&
          movement.status === "NEEDS_REVIEW",
      );
    }).length;
}

function getDetectedAccountFileCount(
  batch: StatementImportBatch,
  explicitAccountId: string,
): number {
  if (explicitAccountId) {
    return 0;
  }

  return batch.files.filter((file) => Boolean(file.financialAccountId)).length;
}

export function formatCreatedBatchToast(
  batch: StatementImportBatch,
  explicitAccountId: string,
): string {
  const autoCategoryCount = getAutoCategorizedMovementCount(batch);
  const detectedAccountCount = getDetectedAccountFileCount(
    batch,
    explicitAccountId,
  );
  const details: string[] = [];

  if (autoCategoryCount > 0) {
    details.push(`${autoCategoryCount} categoria(s) por histórico`);
  }

  if (detectedAccountCount > 0) {
    details.push(`${detectedAccountCount} conta(s) detectada(s)`);
  }

  if (details.length === 0) {
    return "Lote salvo para revisão!";
  }

  return `Lote salvo para revisão: ${details.join(" e ")}.`;
}

export function getCompletedMovementCount(
  counts: Record<MovementStatusFilter, number>,
): number {
  return counts.READY + counts.IGNORED + counts.APPLIED + counts.DUPLICATE;
}

export function getPendingReviewCount(
  counts: Record<MovementStatusFilter, number>,
): number {
  return counts.NEW + counts.NEEDS_REVIEW;
}

export function getMovementCompletionPercentage(
  counts: Record<MovementStatusFilter, number>,
): number {
  if (counts.ALL === 0) {
    return 0;
  }

  return Math.round((getCompletedMovementCount(counts) / counts.ALL) * 100);
}
