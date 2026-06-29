import {
  useEffect,
  useCallback,
  memo,
  useMemo,
  useState,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSearch,
  FileUp,
  Files,
  Fingerprint,
  Landmark,
  ListFilter,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  type LucideIcon,
  Undo2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import ConfirmModal from "../components/ConfirmModal";
import { Layout } from "../components/Layout";
import { createCategory, getCategories } from "../api/categories";
import { getFinancialAccounts } from "../api/financialAccounts";
import {
  applyReadyImportedMovements,
  bulkReviewImportedMovementCategory,
  createStatementImportBatch,
  deleteStatementImportBatch,
  getStatementImportBatch,
  getStatementImportBatches,
  undoAppliedImportedMovements,
  updateImportedMovement,
  updateImportedMovementStatus,
  updateStatementImportBatch,
} from "../api/statementImports";
import { formatStoredIconPrefix } from "../components/storedIconRegistry";
import { StoredIconPicker } from "../components/StoredIcon";
import type {
  Category,
  FinancialAccount,
  ImportedMovement,
  ImportedMovementReconciliationStatus,
  ImportedMovementReviewTarget,
  ImportedMovementStatus,
  StatementImportBatch,
  StatementImportBatchStatus,
  StatementImportBatchSummary,
  StatementImportFile,
  StatementImportFileStatus,
  StatementMovementDirection,
  UpdateImportedMovementPayload,
} from "../types";
import { formatCurrency, formatDate } from "../utils";

type MovementStatusFilter = "ALL" | ImportedMovementStatus;
type ReviewableMovementStatus = Extract<
  ImportedMovementStatus,
  "NEW" | "NEEDS_REVIEW" | "IGNORED" | "READY"
>;
type ReviewableReconciliationStatus = Exclude<
  ImportedMovementReconciliationStatus,
  "PENDING"
>;
type MovementEditForm = {
  date: string;
  amount: string;
  direction: StatementMovementDirection;
  rawType: string;
  reviewTarget: ImportedMovementReviewTarget;
  reviewCategoryId: string;
  reviewTransferAccountId: string;
  rawDescription: string;
};

type QuickCategoryContext = {
  direction: StatementMovementDirection;
  movementId?: string;
  source: "movement" | "bulk";
};

type SafeReadyCandidate = {
  movement: ImportedMovement;
  reviewCategoryId: string;
};

type CategorySuggestionCandidate = {
  movement: ImportedMovement;
  category: Category;
};

type ApplyReadySummary = {
  totalCount: number;
  transactionCount: number;
  transferCount: number;
  inCents: number;
  outCents: number;
  netCents: number;
};

type ReviewBlockSummaryItem = {
  reason: string;
  count: number;
};

type ReadyMovementPreview = {
  id: string;
  date: string;
  description: string;
  label: string;
  direction: StatementMovementDirection;
  amountCents: number;
};

type ApplyReadyMovementDetail = {
  id: string;
  date: string;
  sourceFileName: string;
  sourceAccountName: string;
  description: string;
  reviewTarget: ImportedMovementReviewTarget;
  typeLabel: string;
  destinationLabel: string;
  direction: StatementMovementDirection;
  amountCents: number;
  hasInvoicePaymentWarning: boolean;
};

type UndoAppliedMovementDetail = {
  id: string;
  batchId: string;
  batchLabel: string;
  fileId: string;
  fileName: string;
  sourceAccountName: string;
  date: string;
  description: string;
  reviewTarget: ImportedMovementReviewTarget;
  entityLabel: string;
  destinationLabel: string;
  direction: StatementMovementDirection;
  amountCents: number;
  appliedAt?: string | null;
};

type ReviewTypeOption = {
  value: string;
  label: string;
};

const BATCHES_PER_PAGE = 10;
const MOVEMENTS_PER_PAGE = 50;
const INVOICE_PAYMENT_FLAG = "INVOICE_PAYMENT_REQUIRES_DUPLICATE_REVIEW";

const APPLY_CONFIRMATION_COLUMNS = [
  { key: "date", label: "Data", minWidth: 96, defaultWidth: 112 },
  { key: "target", label: "Alvo", minWidth: 112, defaultWidth: 128 },
  { key: "description", label: "Descrição", minWidth: 180, defaultWidth: 280 },
  { key: "type", label: "Tipo", minWidth: 120, defaultWidth: 144 },
  { key: "destination", label: "Destino", minWidth: 150, defaultWidth: 176 },
  { key: "account", label: "Conta", minWidth: 150, defaultWidth: 176 },
  { key: "file", label: "Arquivo", minWidth: 140, defaultWidth: 160 },
  { key: "amount", label: "Valor", minWidth: 112, defaultWidth: 128 },
] as const;

const MOVEMENT_STATUS_FILTERS: Array<{
  value: MovementStatusFilter;
  label: string;
}> = [
  { value: "ALL", label: "Todos" },
  { value: "NEW", label: "Novos" },
  { value: "READY", label: "Prontos" },
  { value: "IGNORED", label: "Ignorados" },
  { value: "DUPLICATE", label: "Duplicados" },
  { value: "NEEDS_REVIEW", label: "Revisar" },
  { value: "APPLIED", label: "Aplicados" },
];

const MOVEMENT_REVIEW_ACTIONS: Array<{
  status: ReviewableMovementStatus;
  label: string;
  title: string;
  icon: LucideIcon;
}> = [
  {
    status: "READY",
    label: "Pronto",
    title: "Marcar como pronto",
    icon: CheckCircle2,
  },
  {
    status: "IGNORED",
    label: "Ignorar",
    title: "Ignorar movimento",
    icon: XCircle,
  },
  {
    status: "NEEDS_REVIEW",
    label: "Aviso",
    title: "Marcar para revisar depois",
    icon: AlertTriangle,
  },
  {
    status: "NEW",
    label: "Novo",
    title: "Voltar para novo",
    icon: RefreshCw,
  },
];

type MovementMenuItem = {
  key: string;
  label: string;
  description: string;
  title: string;
  icon: LucideIcon;
  disabledReason: string | null;
  isCurrent?: boolean;
  onSelect: () => void;
  tone: "default" | "success" | "warning" | "danger";
};

type MovementStatusMenuPosition = {
  mode: "popover" | "sheet";
  left: number;
  top: number;
  placement: "top" | "bottom";
  maxHeight: number;
};

type SelectedReviewActionsMenuPosition = {
  x: number;
  y: number;
};

const TRANSFER_REVIEW_TYPE = "TRANSFERENCIA";

const TRANSACTION_REVIEW_TYPE_OPTIONS: Record<
  StatementMovementDirection,
  ReviewTypeOption[]
> = {
  IN: [
    { value: "PIX", label: "Pix" },
    { value: "DINHEIRO", label: "Dinheiro" },
    { value: "RENDIMENTO", label: "Rendimento" },
    { value: "ESTORNO", label: "Estorno" },
    { value: "OUTRA_ENTRADA", label: "Outra entrada" },
  ],
  OUT: [
    { value: "PIX", label: "Pix" },
    { value: "DEBITO", label: "Débito" },
    { value: "CREDITO", label: "Crédito" },
    { value: "BOLETO", label: "Boleto" },
    { value: "DINHEIRO", label: "Dinheiro" },
    { value: "COMPRA", label: "Compra" },
    { value: "OUTRA_SAIDA", label: "Outra saída" },
  ],
};

function centsToCurrency(cents?: number | null): string {
  return formatCurrency((cents ?? 0) / 100);
}

function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const responseData = (
    error as {
      response?: {
        data?: {
          message?: unknown;
        };
      };
    }
  ).response?.data;
  const message = responseData?.message;

  if (Array.isArray(message)) {
    return message.filter(Boolean).join(" ");
  }

  return typeof message === "string" && message.trim() ? message : fallback;
}

async function preserveScrollPosition(action: () => Promise<void>) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  await action();

  requestAnimationFrame(() => {
    window.scrollTo(scrollX, scrollY);
  });
}

function inputValueToCents(value: string): number | undefined {
  const raw = value.trim();

  if (!raw) {
    return undefined;
  }

  const cleaned = raw
    .replace(/\s+/g, "")
    .replace(/[R$]/g, "")
    .replace(/[^\d,.\-+]/g, "");

  if (!cleaned || cleaned === "-" || cleaned === "+") {
    return undefined;
  }

  const unsigned = cleaned.replace(/^[-+]/, "");
  const separatorCount = (unsigned.match(/[,.]/g) ?? []).length;
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  const decimalSeparator =
    lastComma > lastDot ? "," : lastDot > -1 ? "." : "";

  if (!decimalSeparator) {
    const integerAmount = Number(unsigned);

    if (!Number.isFinite(integerAmount)) {
      return undefined;
    }

    return integerAmount > 0 ? Math.round(integerAmount * 100) : undefined;
  }

  const decimalIndex = Math.max(lastComma, lastDot);
  const integerPart = unsigned.slice(0, decimalIndex).replace(/[,.]/g, "");
  const decimalPart = unsigned.slice(decimalIndex + 1).replace(/[,.]/g, "");

  if (decimalPart.length > 2) {
    if (separatorCount === 1 && decimalPart.length === 3) {
      const groupedInteger = Number(`${integerPart}${decimalPart}`);

      return Number.isFinite(groupedInteger) && groupedInteger > 0
        ? groupedInteger * 100
        : undefined;
    }

    return undefined;
  }

  const major = Number(integerPart || "0");
  const minor = Number(decimalPart.padEnd(2, "0"));
  const amount = major * 100 + minor;

  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  return amount;
}

function dateInputValue(date: string): string {
  return date.slice(0, 10);
}

function directionLabel(direction: StatementMovementDirection): string {
  return direction === "IN" ? "Entrada" : "Saída";
}

function normalizeReviewTypeValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getMovementDescriptionKey(movement: ImportedMovement): string {
  return normalizeReviewTypeValue(
    movement.normalizedDescription || movement.rawDescription,
  );
}

function getReviewTypeOptions(
  direction: StatementMovementDirection,
  reviewTarget: ImportedMovementReviewTarget,
): ReviewTypeOption[] {
  if (reviewTarget === "TRANSFER") {
    return [{ value: TRANSFER_REVIEW_TYPE, label: "Transferência" }];
  }

  return TRANSACTION_REVIEW_TYPE_OPTIONS[direction];
}

function inferReviewTarget(
  movement: ImportedMovement,
): ImportedMovementReviewTarget {
  if (movement.reviewTarget) {
    return movement.reviewTarget;
  }

  return normalizeReviewTypeValue(movement.rawType) === TRANSFER_REVIEW_TYPE
    ? "TRANSFER"
    : "TRANSACTION";
}

function inferReviewType(
  movement: ImportedMovement,
  direction: StatementMovementDirection,
  reviewTarget: ImportedMovementReviewTarget,
): string {
  if (reviewTarget === "TRANSFER") {
    return TRANSFER_REVIEW_TYPE;
  }

  const normalizedRawType = normalizeReviewTypeValue(movement.rawType);
  const options = getReviewTypeOptions(direction, reviewTarget);
  if (options.some((option) => option.value === normalizedRawType)) {
    return normalizedRawType;
  }

  const searchableText = normalizeReviewTypeValue(
    `${movement.rawType} ${movement.rawDescription}`,
  );

  if (direction === "IN") {
    if (searchableText.includes("PIX")) return "PIX";
    if (searchableText.includes("DINHEIRO") || searchableText.includes("CASH")) {
      return "DINHEIRO";
    }
    if (searchableText.includes("REND")) return "RENDIMENTO";
    if (searchableText.includes("ESTORNO")) return "ESTORNO";
    return "OUTRA_ENTRADA";
  }

  if (searchableText.includes("PIX")) return "PIX";
  if (searchableText.includes("BOLETO")) return "BOLETO";
  if (searchableText.includes("CREDITO") || searchableText.includes("CREDIT")) {
    return "CREDITO";
  }
  if (searchableText.includes("DEBITO") || searchableText.includes("DEBIT")) {
    return "DEBITO";
  }
  if (searchableText.includes("DINHEIRO") || searchableText.includes("CASH")) {
    return "DINHEIRO";
  }

  return "OUTRA_SAIDA";
}

function getDefaultTransferAccountId(
  accounts: FinancialAccount[],
  statementAccountId?: string | null,
  currentAccountId?: string | null,
): string {
  if (
    currentAccountId &&
    currentAccountId !== statementAccountId &&
    accounts.some(
      (account) => account.id === currentAccountId && !account.isArchived,
    )
  ) {
    return currentAccountId;
  }

  return (
    accounts.find(
      (account) => !account.isArchived && account.id !== statementAccountId,
    )?.id ?? ""
  );
}

function formatCategoryLabel(category: Pick<Category, "name" | "icon">): string {
  return `${formatStoredIconPrefix(category.icon)}${category.name}`;
}

function categoryMatchesMovementDirection(
  category: Category,
  direction: StatementMovementDirection,
): boolean {
  if (direction === "IN") {
    return category.kind === "INCOME" || category.kind === "BOTH";
  }

  return category.kind === "EXPENSE" || category.kind === "BOTH";
}

function categoryKindFromDirection(
  direction: StatementMovementDirection,
): Category["kind"] {
  return direction === "IN" ? "INCOME" : "EXPENSE";
}

function categoryKindLabel(kind: Category["kind"]): string {
  const labels: Record<Category["kind"], string> = {
    EXPENSE: "Despesa",
    INCOME: "Receita",
    BOTH: "Mista",
  };

  return labels[kind];
}

function isBulkCategoryMovementEligible(movement: ImportedMovement): boolean {
  return (
    movement.reviewTarget === "TRANSACTION" &&
    movement.status !== "APPLIED" &&
    movement.status !== "DUPLICATE"
  );
}

function getDefaultReviewCategoryId(
  categories: Category[],
  movement: ImportedMovement,
): string {
  const activeCategories = categories.filter(
    (category) =>
      !category.isArchived &&
      categoryMatchesMovementDirection(category, movement.direction),
  );

  if (
    movement.reviewCategoryId &&
    activeCategories.some((category) => category.id === movement.reviewCategoryId)
  ) {
    return movement.reviewCategoryId;
  }

  const suggestedCategoryId = movement.reviewHints?.categorySuggestion?.categoryId;
  if (
    suggestedCategoryId &&
    activeCategories.some((category) => category.id === suggestedCategoryId)
  ) {
    return suggestedCategoryId;
  }

  return "";
}

function getSafePrepareReviewCategoryId(
  categories: Category[],
  movement: ImportedMovement,
): string | null {
  return getDefaultReviewCategoryId(categories, movement) || null;
}

function getSafePrepareBlockReason(
  categories: Category[],
  movement: ImportedMovement,
  file: StatementImportFile,
): string | null {
  if (movement.status !== "NEW" && movement.status !== "NEEDS_REVIEW") {
    return "Movimento já saiu da revisão rápida";
  }

  if (movement.amountCents <= 0) {
    return "Valor inválido";
  }

  if (!movement.rawDescription.trim()) {
    return "Descrição pendente";
  }

  if (!file.financialAccountId) {
    return "Conta do extrato pendente";
  }

  const reconciliationIssue = getMovementReconciliationIssue(movement);
  if (reconciliationIssue) {
    return reconciliationIssue;
  }

  if (
    movement.reviewHints?.flags.includes("PIX_REQUIRES_MANUAL_TRANSFER_REVIEW")
  ) {
    return "Pix exige revisão manual de transferência";
  }

  if (hasInvoicePaymentWarning(movement)) {
    return "Pagamento de fatura exige revisão manual";
  }

  if (movement.reviewTarget === "TRANSFER") {
    return "Transferência exige revisão manual";
  }

  const rawType = normalizeReviewTypeValue(movement.rawType);
  const validType = getReviewTypeOptions(
    movement.direction,
    "TRANSACTION",
  ).some((option) => option.value === rawType);

  if (!validType) {
    return "Tipo revisado pendente";
  }

  if (!getSafePrepareReviewCategoryId(categories, movement)) {
    return "Categoria pendente";
  }

  return null;
}

function getMovementReadinessIssue(
  movement: ImportedMovement,
  file: StatementImportFile,
): string | null {
  if (movement.amountCents <= 0) {
    return "Informe um valor positivo";
  }

  if (!movement.rawDescription.trim()) {
    return "Informe uma descrição revisada";
  }

  if (!file.financialAccountId) {
    return "Selecione a conta do extrato";
  }

  const reconciliationIssue = getMovementReconciliationIssue(movement);
  if (reconciliationIssue) {
    return reconciliationIssue;
  }

  if (movement.reviewTarget === "TRANSFER") {
    if (!movement.reviewTransferAccountId) {
      return "Informe a outra conta da transferência";
    }

    if (movement.reviewTransferAccountId === file.financialAccountId) {
      return "Use contas diferentes na transferência";
    }

    return null;
  }

  const rawType = normalizeReviewTypeValue(movement.rawType);
  const validType = getReviewTypeOptions(
    movement.direction,
    "TRANSACTION",
  ).some((option) => option.value === rawType);

  if (!validType) {
    return "Revise o tipo da transação";
  }

  if (!movement.reviewCategoryId) {
    return "Informe a categoria revisada";
  }

  return null;
}

function hasLedgerReconciliationMatch(movement: ImportedMovement): boolean {
  return (movement.reviewHints?.reconciliationMatches.length ?? 0) > 0;
}

function getMovementReconciliationIssue(
  movement: ImportedMovement,
): string | null {
  if (movement.reconciliationStatus === "CONFIRMED_DUPLICATE") {
    return "Movimento confirmado como duplicidade";
  }

  if (
    hasLedgerReconciliationMatch(movement) &&
    movement.reconciliationStatus !== "CONFIRMED_UNIQUE"
  ) {
    return "Confirme a conciliação do match antes de marcar como pronto";
  }

  return null;
}

function hasInvoicePaymentWarning(movement: ImportedMovement): boolean {
  return movement.reviewHints?.flags.includes(INVOICE_PAYMENT_FLAG) ?? false;
}

function directionClass(direction: StatementMovementDirection): string {
  return direction === "IN"
    ? "app-chip app-chip-success"
    : "app-chip app-chip-danger";
}

function DirectionIcon({
  direction,
}: {
  direction: StatementMovementDirection;
}) {
  const Icon = direction === "IN" ? ArrowUpRight : ArrowDownRight;
  const color =
    direction === "IN" ? "var(--color-income)" : "var(--color-expense)";

  return <Icon size={16} style={{ color }} />;
}

function batchStatusLabel(status: StatementImportBatchStatus): string {
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

function fileStatusLabel(status: StatementImportFileStatus): string {
  const labels: Record<StatementImportFileStatus, string> = {
    PARSED: "Lido",
    DUPLICATE: "Arquivo duplicado",
    FAILED: "Falhou",
  };

  return labels[status];
}

function movementStatusLabel(status: ImportedMovementStatus): string {
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

function reviewSourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    TRANSACTION: "Transação",
    TRANSFER: "Transferência",
    BALANCE_ADJUSTMENT: "Ajuste",
  };

  return labels[sourceType] ?? sourceType;
}

function reviewFlagLabel(flag: string): string {
  const labels: Record<string, string> = {
    POSSIBLE_LEDGER_MATCH: "Possível match",
    RECONCILIATION_REQUIRED: "Conciliação pendente",
    PIX_REQUIRES_MANUAL_TRANSFER_REVIEW: "Pix: revisar transferência",
    INVOICE_PAYMENT_REQUIRES_DUPLICATE_REVIEW:
      "Pagamento de fatura: risco de duplicidade",
  };

  return labels[flag] ?? flag;
}

function reviewFlagClass(flag: string): string {
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

function reconciliationStatusLabel(
  status: ImportedMovementReconciliationStatus,
): string {
  const labels: Record<ImportedMovementReconciliationStatus, string> = {
    PENDING: "Conciliação pendente",
    CONFIRMED_UNIQUE: "Novo confirmado",
    CONFIRMED_DUPLICATE: "Duplicidade confirmada",
  };

  return labels[status];
}

function reconciliationStatusClass(
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

function statusClass(
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

function StatusIcon({
  status,
}: {
  status: StatementImportFileStatus | ImportedMovementStatus;
}) {
  if (status === "DUPLICATE" || status === "NEEDS_REVIEW") {
    return <AlertTriangle size={14} />;
  }

  if (status === "FAILED" || status === "IGNORED") {
    return <XCircle size={14} />;
  }

  if (status === "NEW") {
    return <Clock3 size={14} />;
  }

  return <CheckCircle2 size={14} />;
}

function DisabledReasonTooltip({
  reason,
  className = "inline-flex",
  children,
}: {
  reason: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={className} title={reason ?? undefined}>
      {children}
    </span>
  );
}

function getBatchTotals(batch: StatementImportBatch | null) {
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

function getBatchMovementCount(batch: StatementImportBatch | null): number {
  return (
    batch?.files.reduce((total, file) => total + file.movements.length, 0) ?? 0
  );
}

function getBatchDisplayName(
  batch: Pick<StatementImportBatch | StatementImportBatchSummary, "id" | "name">,
): string {
  return batch.name?.trim() || `Lote #${batch.id.slice(0, 8)}`;
}

function getBatchShortCode(batchId: string): string {
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

function getMovementStatusCounts(
  movements: Array<Pick<ImportedMovement, "status">>,
): Record<MovementStatusFilter, number> {
  const counts = createMovementStatusCounts();

  counts.ALL = movements.length;

  movements.forEach((movement) => {
    counts[movement.status] += 1;
  });

  return counts;
}

function getBatchMovementStatusCounts(
  batch: StatementImportBatch | null,
): Record<MovementStatusFilter, number> {
  return getMovementStatusCounts(
    batch?.files.flatMap((file) => file.movements) ?? [],
  );
}

function getCompletedMovementCount(
  counts: Record<MovementStatusFilter, number>,
): number {
  return counts.READY + counts.IGNORED + counts.APPLIED + counts.DUPLICATE;
}

function getPendingReviewCount(
  counts: Record<MovementStatusFilter, number>,
): number {
  return counts.NEW + counts.NEEDS_REVIEW;
}

function getMovementCompletionPercentage(
  counts: Record<MovementStatusFilter, number>,
): number {
  if (counts.ALL === 0) {
    return 0;
  }

  return Math.round((getCompletedMovementCount(counts) / counts.ALL) * 100);
}

function isInteractiveMovementTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button,a,input,select,textarea,[role='button']"))
  );
}

function hasAppliedMovements(batch: StatementImportBatch | null): boolean {
  return (
    batch?.files.some((file) =>
      file.movements.some((movement) => movement.status === "APPLIED"),
    ) ?? false
  );
}

function getApplyReadySummary(batch: StatementImportBatch | null): ApplyReadySummary {
  const readyMovements =
    batch?.files.flatMap((file) =>
      file.movements.filter((movement) => movement.status === "READY"),
    ) ?? [];

  const summary = readyMovements.reduce(
    (totals, movement) => {
      if (movement.reviewTarget === "TRANSFER") {
        totals.transferCount += 1;
      } else {
        totals.transactionCount += 1;
      }

      if (movement.direction === "IN") {
        totals.inCents += movement.amountCents;
      } else {
        totals.outCents += movement.amountCents;
      }

      return totals;
    },
    {
      totalCount: readyMovements.length,
      transactionCount: 0,
      transferCount: 0,
      inCents: 0,
      outCents: 0,
      netCents: 0,
    },
  );

  summary.netCents = summary.inCents - summary.outCents;
  return summary;
}

function getAppliedMovementSummary(
  batch: StatementImportBatch | null,
): ApplyReadySummary {
  const appliedMovements =
    batch?.files.flatMap((file) =>
      file.movements.filter((movement) => movement.status === "APPLIED"),
    ) ?? [];

  const summary = appliedMovements.reduce(
    (totals, movement) => {
      if (movement.appliedTransferId || movement.reviewTarget === "TRANSFER") {
        totals.transferCount += 1;
      } else {
        totals.transactionCount += 1;
      }

      if (movement.direction === "IN") {
        totals.inCents += movement.amountCents;
      } else {
        totals.outCents += movement.amountCents;
      }

      return totals;
    },
    {
      totalCount: appliedMovements.length,
      transactionCount: 0,
      transferCount: 0,
      inCents: 0,
      outCents: 0,
      netCents: 0,
    },
  );

  summary.netCents = summary.inCents - summary.outCents;
  return summary;
}

function getReviewBlockSummary(
  categories: Category[],
  batch: StatementImportBatch | null,
): ReviewBlockSummaryItem[] {
  if (!batch) {
    return [];
  }

  const counts = new Map<string, number>();

  batch.files.forEach((file) => {
    file.movements.forEach((movement) => {
      const reason = getSafePrepareBlockReason(categories, movement, file);

      if (!reason || movement.status === "APPLIED") {
        return;
      }

      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function getReadyMovementPreview(
  batch: StatementImportBatch | null,
): ReadyMovementPreview[] {
  if (!batch) {
    return [];
  }

  return batch.files
    .flatMap((file) =>
      file.movements
        .filter((movement) => movement.status === "READY")
        .map((movement) => ({
          id: movement.id,
          date: movement.date,
          description: movement.rawDescription || "-",
          label:
            movement.reviewTarget === "TRANSFER"
              ? `Transferência - ${file.financialAccount?.name ?? "Conta do extrato"}`
              : (movement.reviewCategory?.name ?? "Transação"),
          direction: movement.direction,
          amountCents: movement.amountCents,
        })),
    )
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 5);
}

function getApplyReadyMovementDetails(
  batch: StatementImportBatch | null,
): ApplyReadyMovementDetail[] {
  if (!batch) {
    return [];
  }

  return batch.files
    .flatMap((file) =>
      file.movements
        .filter((movement) => movement.status === "READY")
        .map((movement) => ({
          id: movement.id,
          date: movement.date,
          sourceFileName: file.originalName,
          sourceAccountName: file.financialAccount?.name ?? "Conta do extrato",
          description: movement.rawDescription || "-",
          reviewTarget: movement.reviewTarget,
          typeLabel: movement.rawType || "-",
          destinationLabel:
            movement.reviewTarget === "TRANSFER"
              ? (movement.reviewTransferAccount?.name ?? "Outra conta pendente")
              : (movement.reviewCategory
                  ? formatCategoryLabel(movement.reviewCategory)
                  : "Categoria pendente"),
          direction: movement.direction,
          amountCents: movement.amountCents,
          hasInvoicePaymentWarning: hasInvoicePaymentWarning(movement),
        })),
    )
    .sort((left, right) => left.date.localeCompare(right.date));
}

function getUndoAppliedMovementDetails(
  batch: StatementImportBatch | null,
): UndoAppliedMovementDetail[] {
  if (!batch) {
    return [];
  }

  return batch.files
    .flatMap((file) =>
      file.movements
        .filter((movement) => movement.status === "APPLIED")
        .map((movement) => ({
          id: movement.id,
          batchId: batch.id,
          batchLabel: getBatchDisplayName(batch),
          fileId: file.id,
          fileName: file.originalName,
          sourceAccountName: file.financialAccount?.name ?? "Conta do extrato",
          date: movement.date,
          description: movement.rawDescription || "-",
          reviewTarget: movement.reviewTarget,
          entityLabel: movement.appliedTransferId
            ? "Transferência"
            : "Transação",
          destinationLabel:
            movement.reviewTarget === "TRANSFER"
              ? (movement.reviewTransferAccount?.name ?? "Outra conta")
              : (movement.reviewCategory
                  ? formatCategoryLabel(movement.reviewCategory)
                  : "Categoria"),
          direction: movement.direction,
          amountCents: movement.amountCents,
          appliedAt: movement.appliedAt,
        })),
    )
    .sort((left, right) => left.date.localeCompare(right.date));
}

function getUndoAppliedSummary(
  movements: UndoAppliedMovementDetail[],
): ApplyReadySummary {
  const summary = movements.reduce(
    (totals, movement) => {
      if (movement.entityLabel === "Transferência") {
        totals.transferCount += 1;
      } else {
        totals.transactionCount += 1;
      }

      if (movement.direction === "IN") {
        totals.inCents += movement.amountCents;
      } else {
        totals.outCents += movement.amountCents;
      }

      return totals;
    },
    {
      totalCount: movements.length,
      transactionCount: 0,
      transferCount: 0,
      inCents: 0,
      outCents: 0,
      netCents: 0,
    },
  );

  summary.netCents = summary.inCents - summary.outCents;
  return summary;
}

function getSummaryMovementCount(summary: StatementImportBatchSummary): number {
  return summary.files.reduce(
    (total, file) => total + file._count.movements,
    0,
  );
}

function formatBatchSummaryPeriod(summary: StatementImportBatchSummary): string {
  const starts = summary.files
    .map((file) => file.periodStart)
    .filter((value): value is string => Boolean(value))
    .sort();
  const ends = summary.files
    .map((file) => file.periodEnd)
    .filter((value): value is string => Boolean(value))
    .sort();

  if (starts.length === 0 || ends.length === 0) {
    return "Período não identificado";
  }

  return `${formatDate(starts[0])} a ${formatDate(ends[ends.length - 1])}`;
}

function formatFilePeriod(
  file: Pick<StatementImportFile, "periodStart" | "periodEnd">,
): string {
  if (!file.periodStart || !file.periodEnd) {
    return "Período não identificado";
  }

  return `${formatDate(file.periodStart)} a ${formatDate(file.periodEnd)}`;
}

function formatBatchPeriod(batch: StatementImportBatch | null): string {
  if (!batch) {
    return "Período não identificado";
  }

  const starts = batch.files
    .map((file) => file.periodStart)
    .filter((value): value is string => Boolean(value))
    .sort();
  const ends = batch.files
    .map((file) => file.periodEnd)
    .filter((value): value is string => Boolean(value))
    .sort();

  if (starts.length === 0 || ends.length === 0) {
    return "Período não identificado";
  }

  return `${formatDate(starts[0])} a ${formatDate(ends[ends.length - 1])}`;
}

function getWarnings(file: StatementImportFile): string[] {
  return (file.warnings ?? []).filter(
    (warning): warning is string => typeof warning === "string",
  );
}

function getAppliedMovementLink(movement: ImportedMovement) {
  if (movement.appliedTransactionId) {
    return {
      href: `/transactions?edit=${encodeURIComponent(movement.appliedTransactionId)}`,
      label: "Transação",
    };
  }

  if (movement.appliedTransferId) {
    return {
      href: `/transfers?edit=${encodeURIComponent(movement.appliedTransferId)}`,
      label: "Transferência",
    };
  }

  return null;
}

export function StatementImports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [batchSummaries, setBatchSummaries] = useState<
    StatementImportBatchSummary[]
  >([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [currentBatch, setCurrentBatch] = useState<StatementImportBatch | null>(
    null,
  );
  const [batchPage, setBatchPage] = useState(1);
  const [movementStatusFilter, setMovementStatusFilter] =
    useState<MovementStatusFilter>("ALL");
  const [editingMovement, setEditingMovement] =
    useState<ImportedMovement | null>(null);
  const [editingMovementFile, setEditingMovementFile] =
    useState<StatementImportFile | null>(null);
  const [movementEditForm, setMovementEditForm] =
    useState<MovementEditForm | null>(null);
  const [updatingMovementId, setUpdatingMovementId] = useState<string | null>(
    null,
  );
  const [isApplyConfirmOpen, setIsApplyConfirmOpen] = useState(false);
  const [isUndoConfirmOpen, setIsUndoConfirmOpen] = useState(false);
  const [batchToDeleteId, setBatchToDeleteId] = useState<string | null>(null);
  const [batchRenameId, setBatchRenameId] = useState<string | null>(null);
  const [batchRenameDraft, setBatchRenameDraft] = useState("");
  const [isSavingMovement, setIsSavingMovement] = useState(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [isRenamingBatch, setIsRenamingBatch] = useState(false);
  const [isPreparingSafe, setIsPreparingSafe] = useState(false);
  const [isIgnoringDuplicates, setIsIgnoringDuplicates] = useState(false);
  const [isApplyingReady, setIsApplyingReady] = useState(false);
  const [isUndoingApplied, setIsUndoingApplied] = useState(false);
  const [selectedUndoMovementIds, setSelectedUndoMovementIds] = useState<
    string[]
  >([]);
  const [selectedReviewMovementIds, setSelectedReviewMovementIds] = useState<
    string[]
  >([]);
  const [activeReviewMovementId, setActiveReviewMovementId] = useState<
    string | null
  >(null);
  const [selectedReviewActionsMenuPosition, setSelectedReviewActionsMenuPosition] =
    useState<SelectedReviewActionsMenuPosition | null>(null);
  const [expandedImportFileIds, setExpandedImportFileIds] = useState<string[]>(
    [],
  );
  const [selectedBulkCategoryId, setSelectedBulkCategoryId] = useState("");
  const [quickCategoryContext, setQuickCategoryContext] =
    useState<QuickCategoryContext | null>(null);
  const [quickCategoryName, setQuickCategoryName] = useState("");
  const [quickCategoryIcon, setQuickCategoryIcon] = useState("");
  const [isCreatingQuickCategory, setIsCreatingQuickCategory] = useState(false);
  const [isApplyingBulkCategory, setIsApplyingBulkCategory] = useState(false);
  const [isApplyingCategorySuggestions, setIsApplyingCategorySuggestions] =
    useState(false);
  const [isUpdatingSelectedReviewStatus, setIsUpdatingSelectedReviewStatus] =
    useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isLoadingBatches, setIsLoadingBatches] = useState(true);
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const requestedBatchId = searchParams.get("batch") ?? "";

  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.isArchived),
    [accounts],
  );
  const activeCategories = useMemo(
    () => categories.filter((category) => !category.isArchived),
    [categories],
  );
  const totals = useMemo(() => getBatchTotals(currentBatch), [currentBatch]);
  const movementCount = useMemo(
    () => getBatchMovementCount(currentBatch),
    [currentBatch],
  );
  const movementStatusCounts = useMemo(
    () => getBatchMovementStatusCounts(currentBatch),
    [currentBatch],
  );
  const movementCompletionPercentage = useMemo(
    () => getMovementCompletionPercentage(movementStatusCounts),
    [movementStatusCounts],
  );
  const applyReadySummary = useMemo(
    () => getApplyReadySummary(currentBatch),
    [currentBatch],
  );
  const undoAppliedSummary = useMemo(
    () => getAppliedMovementSummary(currentBatch),
    [currentBatch],
  );
  const currentBatchHasAppliedMovements = useMemo(
    () => hasAppliedMovements(currentBatch),
    [currentBatch],
  );
  const reviewBlockSummary = useMemo(
    () => getReviewBlockSummary(categories, currentBatch),
    [categories, currentBatch],
  );
  const readyMovementPreview = useMemo(
    () => getReadyMovementPreview(currentBatch),
    [currentBatch],
  );
  const applyReadyMovementDetails = useMemo(
    () => getApplyReadyMovementDetails(currentBatch),
    [currentBatch],
  );
  const undoAppliedMovementDetails = useMemo(
    () => getUndoAppliedMovementDetails(currentBatch),
    [currentBatch],
  );
  const selectedUndoMovements = useMemo(() => {
    const selectedIds = new Set(selectedUndoMovementIds);

    return undoAppliedMovementDetails.filter((movement) =>
      selectedIds.has(movement.id),
    );
  }, [selectedUndoMovementIds, undoAppliedMovementDetails]);
  const selectedUndoSummary = useMemo(
    () => getUndoAppliedSummary(selectedUndoMovements),
    [selectedUndoMovements],
  );
  const bulkCategoryMovementItems = useMemo(
    () =>
      currentBatch?.files.flatMap((file) =>
        file.movements
          .filter(isBulkCategoryMovementEligible)
          .map((movement) => ({ file, movement })),
      ) ?? [],
    [currentBatch],
  );
  const selectedReviewMovementItems = useMemo(() => {
    const selectedIds = new Set(selectedReviewMovementIds);

    return bulkCategoryMovementItems.filter(({ movement }) =>
      selectedIds.has(movement.id),
    );
  }, [bulkCategoryMovementItems, selectedReviewMovementIds]);
  const selectedReviewDirections = useMemo(
    () =>
      Array.from(
        new Set(
          selectedReviewMovementItems.map(({ movement }) => movement.direction),
        ),
      ),
    [selectedReviewMovementItems],
  );
  const bulkCategoryOptions = useMemo(
    () =>
      activeCategories.filter((category) =>
        selectedReviewMovementItems.every(({ movement }) =>
          categoryMatchesMovementDirection(category, movement.direction),
        ),
      ),
    [activeCategories, selectedReviewMovementItems],
  );
  const selectedBulkCategory = useMemo(
    () =>
      bulkCategoryOptions.find(
        (category) => category.id === selectedBulkCategoryId,
      ) ?? null,
    [bulkCategoryOptions, selectedBulkCategoryId],
  );
  const categorySuggestionCandidates = useMemo<CategorySuggestionCandidate[]>(
    () =>
      currentBatch?.files.flatMap((file) =>
        file.movements.flatMap((movement) => {
          const suggestion = movement.reviewHints?.categorySuggestion;

          if (
            !suggestion ||
            !isBulkCategoryMovementEligible(movement) ||
            movement.reviewTarget !== "TRANSACTION" ||
            movement.reviewCategoryId === suggestion.categoryId
          ) {
            return [];
          }

          const category = activeCategories.find(
            (item) => item.id === suggestion.categoryId,
          );

          if (
            !category ||
            !categoryMatchesMovementDirection(category, movement.direction)
          ) {
            return [];
          }

          return [{ movement, category }];
        }),
      ) ?? [],
    [activeCategories, currentBatch],
  );
  const selectedCategorySuggestionCandidates = useMemo(() => {
    const selectedIds = new Set(selectedReviewMovementIds);

    return categorySuggestionCandidates.filter((candidate) =>
      selectedIds.has(candidate.movement.id),
    );
  }, [categorySuggestionCandidates, selectedReviewMovementIds]);
  const editingSimilarReviewMovementItems = useMemo(() => {
    if (!editingMovement) {
      return [];
    }

    const descriptionKey = getMovementDescriptionKey(editingMovement);
    if (!descriptionKey) {
      return [];
    }

    return bulkCategoryMovementItems.filter(({ movement }) => {
      return (
        movement.direction === editingMovement.direction &&
        getMovementDescriptionKey(movement) === descriptionKey
      );
    });
  }, [bulkCategoryMovementItems, editingMovement]);
  const totalBatchPages = Math.max(
    1,
    Math.ceil(batchSummaries.length / BATCHES_PER_PAGE),
  );
  const effectiveBatchPage = Math.min(batchPage, totalBatchPages);
  const visibleBatchSummaries = useMemo(() => {
    const start = (effectiveBatchPage - 1) * BATCHES_PER_PAGE;

    return batchSummaries.slice(start, start + BATCHES_PER_PAGE);
  }, [effectiveBatchPage, batchSummaries]);
  const currentBatchStillListed =
    !currentBatch ||
    batchSummaries.some((summary) => summary.id === currentBatch.id);
  const expandedImportFileIdSet = useMemo(
    () => new Set(expandedImportFileIds),
    [expandedImportFileIds],
  );
  const allCurrentBatchFilesExpanded = currentBatch
    ? currentBatch.files.length > 0 &&
      currentBatch.files.every((file) => expandedImportFileIdSet.has(file.id))
    : false;
  const batchRangeStart =
    batchSummaries.length === 0
      ? 0
      : (effectiveBatchPage - 1) * BATCHES_PER_PAGE + 1;
  const batchRangeEnd = Math.min(
    effectiveBatchPage * BATCHES_PER_PAGE,
    batchSummaries.length,
  );
  useEffect(() => {
    if (!currentBatch) {
      setExpandedImportFileIds([]);
      return;
    }

    setExpandedImportFileIds((currentIds) => {
      const batchFileIds = new Set(currentBatch.files.map((file) => file.id));
      const validIds = currentIds.filter((id) => batchFileIds.has(id));

      if (validIds.length > 0) {
        if (
          validIds.length === currentIds.length &&
          validIds.every((id, index) => id === currentIds[index])
        ) {
          return currentIds;
        }

        return validIds;
      }

      const firstFileWithMovements =
        currentBatch.files.find((file) => file.movements.length > 0) ??
        currentBatch.files[0];

      return firstFileWithMovements ? [firstFileWithMovements.id] : [];
    });
  }, [currentBatch]);

  const toggleImportFileExpansion = useCallback((fileId: string) => {
    setExpandedImportFileIds((currentIds) =>
      currentIds.includes(fileId)
        ? currentIds.filter((id) => id !== fileId)
        : [...currentIds, fileId],
    );
  }, []);

  const setAllImportFilesExpanded = useCallback(
    (shouldExpand: boolean) => {
      setExpandedImportFileIds(
        shouldExpand && currentBatch
          ? currentBatch.files.map((file) => file.id)
          : [],
      );
    },
    [currentBatch],
  );

  const readyReconciliationBlockCount = useMemo(() => {
    const movements =
      currentBatch?.files.flatMap((file) => file.movements) ?? [];

    return movements.filter(
      (movement) =>
        movement.status === "READY" &&
        Boolean(getMovementReconciliationIssue(movement)),
    ).length;
  }, [currentBatch]);
  const pendingReconciliationCount = useMemo(() => {
    const movements =
      currentBatch?.files.flatMap((file) => file.movements) ?? [];

    return movements.filter(
      (movement) =>
        hasLedgerReconciliationMatch(movement) &&
        movement.reconciliationStatus === "PENDING",
    ).length;
  }, [currentBatch]);
  const readyInvoicePaymentWarningCount = useMemo(() => {
    const movements =
      currentBatch?.files.flatMap((file) => file.movements) ?? [];

    return movements.filter(
      (movement) =>
        movement.status === "READY" && hasInvoicePaymentWarning(movement),
    ).length;
  }, [currentBatch]);
  const safeReadyCandidates = useMemo<SafeReadyCandidate[]>(() => {
    if (!currentBatch) {
      return [];
    }

    return currentBatch.files.flatMap((file) =>
      file.movements.flatMap((movement) => {
        if (getSafePrepareBlockReason(categories, movement, file)) {
          return [];
        }

        const reviewCategoryId = getSafePrepareReviewCategoryId(
          categories,
          movement,
        );

        return reviewCategoryId
          ? [
              {
                movement,
                reviewCategoryId,
              },
            ]
          : [];
      }),
    );
  }, [categories, currentBatch]);
  const duplicateMovementCandidates = useMemo(
    () =>
      currentBatch?.files.flatMap((file) =>
        file.movements.filter((movement) => movement.status === "DUPLICATE"),
      ) ?? [],
    [currentBatch],
  );
  const canApplyReadyMovements =
    movementStatusCounts.READY > 0 &&
    readyReconciliationBlockCount === 0 &&
    !isPreparingSafe;
  const uploadDisabledReason = isUploading
    ? "Aguarde o lote atual terminar de salvar."
    : null;
  const refreshDisabledReason = isLoadingBatches
    ? "Aguarde a atualização dos lotes terminar."
    : null;
  const ignoreDuplicatesDisabledReason = isIgnoringDuplicates
    ? "Ignorando duplicados deste lote."
    : isPreparingSafe
      ? "Aguarde o preparo dos movimentos seguros terminar."
      : isApplyingReady
        ? "Aguarde a aplicação dos movimentos prontos terminar."
        : isUndoingApplied
          ? "Aguarde o desfazer dos movimentos aplicados terminar."
          : duplicateMovementCandidates.length === 0
            ? "Nenhum duplicado pendente neste lote."
            : null;
  const prepareSafeDisabledReason = isPreparingSafe
    ? "Preparando movimentos seguros deste lote."
    : isApplyingReady
      ? "Aguarde a aplicação dos movimentos prontos terminar."
      : isUndoingApplied
        ? "Aguarde o desfazer dos movimentos aplicados terminar."
        : safeReadyCandidates.length === 0
          ? "Nenhum movimento seguro disponível para preparo automático."
          : null;
  const applyReadyDisabledReason = isApplyingReady
    ? "Aplicando movimentos prontos deste lote."
    : isPreparingSafe
      ? "Aguarde o preparo dos movimentos seguros terminar."
      : isUndoingApplied
        ? "Aguarde o desfazer dos movimentos aplicados terminar."
        : movementStatusCounts.READY === 0
          ? "Nenhum movimento pronto para aplicar."
          : readyReconciliationBlockCount > 0
            ? "Resolva a conciliação dos movimentos prontos antes de aplicar."
            : null;
  const undoAppliedDisabledReason = isUndoingApplied
    ? "Desfazendo movimentos aplicados deste lote."
    : isApplyingReady
      ? "Aguarde a aplicação dos movimentos prontos terminar."
      : isPreparingSafe
        ? "Aguarde o preparo dos movimentos seguros terminar."
        : undoAppliedSummary.totalCount === 0
          ? "Nenhum movimento aplicado neste lote para desfazer."
          : null;
  useEffect(() => {
    let isActive = true;

    async function loadInitialData() {
      setIsLoadingAccounts(true);
      setIsLoadingBatches(true);

      const [accountsResult, categoriesResult, batchesResult] =
        await Promise.allSettled([
        getFinancialAccounts(),
        getCategories(),
        getStatementImportBatches(),
      ]);

      if (!isActive) return;

      if (accountsResult.status === "fulfilled") {
        setAccounts(accountsResult.value.data);
        const firstActiveAccount = accountsResult.value.data.find(
          (account) => !account.isArchived,
        );
        setSelectedAccountId(
          (current) => current || firstActiveAccount?.id || "",
        );
      } else {
        toast.error("Erro ao carregar contas.");
      }

      if (categoriesResult.status === "fulfilled") {
        setCategories(categoriesResult.value.data);
      } else {
        toast.error("Erro ao carregar categorias.");
      }

      if (batchesResult.status === "fulfilled") {
        const summaries = batchesResult.value.data;
        setBatchSummaries(summaries);
      } else {
        toast.error("Erro ao carregar lotes.");
      }

      if (isActive) {
        setIsLoadingAccounts(false);
        setIsLoadingBatches(false);
      }
    }

    void loadInitialData();

    return () => {
      isActive = false;
    };
  }, []);

  const loadBatch = useCallback(async (batchId: string) => {
    if (!batchId) {
      setSelectedBatchId("");
      setCurrentBatch(null);
      setActiveReviewMovementId(null);
      setSelectedReviewActionsMenuPosition(null);
      return;
    }

    try {
      setSelectedBatchId(batchId);
      setIsLoadingBatch(true);
      const response = await getStatementImportBatch(batchId);
      setCurrentBatch(response.data);
    } catch {
      toast.error("Erro ao carregar lote.");
    } finally {
      setIsLoadingBatch(false);
    }
  }, []);

  useEffect(() => {
    if (!requestedBatchId || isLoadingBatches) {
      return;
    }

    if (selectedBatchId === requestedBatchId) {
      return;
    }

    if (!batchSummaries.some((summary) => summary.id === requestedBatchId)) {
      return;
    }

    void loadBatch(requestedBatchId);
  }, [
    batchSummaries,
    isLoadingBatches,
    loadBatch,
    requestedBatchId,
    selectedBatchId,
  ]);

  useEffect(() => {
    if (isLoadingBatches || currentBatchStillListed) {
      return;
    }

    setSelectedBatchId("");
    setCurrentBatch(null);
    setActiveReviewMovementId(null);
    setSelectedReviewActionsMenuPosition(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("batch");
    setSearchParams(nextParams, { replace: true });
  }, [
    currentBatchStillListed,
    isLoadingBatches,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!isUndoConfirmOpen) {
      return;
    }

    const availableIds = new Set(
      undoAppliedMovementDetails.map((movement) => movement.id),
    );

    setSelectedUndoMovementIds((current) =>
      current.filter((movementId) => availableIds.has(movementId)),
    );
  }, [isUndoConfirmOpen, undoAppliedMovementDetails]);

  useEffect(() => {
    const availableIds = new Set(
      bulkCategoryMovementItems.map(({ movement }) => movement.id),
    );

    setSelectedReviewMovementIds((current) =>
      current.filter((movementId) => availableIds.has(movementId)),
    );
  }, [bulkCategoryMovementItems]);

  useEffect(() => {
    if (!activeReviewMovementId) {
      return;
    }

    const movementStillInBatch =
      currentBatch?.files.some((file) =>
        file.movements.some((movement) => movement.id === activeReviewMovementId),
      ) ?? false;

    if (!movementStillInBatch) {
      setActiveReviewMovementId(null);
    }
  }, [activeReviewMovementId, currentBatch]);

  useEffect(() => {
    if (selectedReviewMovementIds.length === 0) {
      setSelectedReviewActionsMenuPosition(null);
    }
  }, [selectedReviewMovementIds.length]);

  useEffect(() => {
    if (!selectedBulkCategoryId) {
      return;
    }

    if (
      !bulkCategoryOptions.some(
        (category) => category.id === selectedBulkCategoryId,
      )
    ) {
      setSelectedBulkCategoryId("");
    }
  }, [bulkCategoryOptions, selectedBulkCategoryId]);

  const refreshBatches = async (preferredBatchId?: string | null) => {
    try {
      setIsLoadingBatches(true);
      const response = await getStatementImportBatches();
      setBatchSummaries(response.data);

      const nextBatchId =
        preferredBatchId === null
          ? ""
          : preferredBatchId ||
        (response.data.some((summary) => summary.id === selectedBatchId)
          ? selectedBatchId
          : "");

      if (nextBatchId) {
        await loadBatch(nextBatchId);
      } else {
        setSelectedBatchId("");
        setCurrentBatch(null);
      }
    } catch {
      toast.error("Erro ao atualizar lotes.");
    } finally {
      setIsLoadingBatches(false);
    }
  };

  const openBatchRename = (
    batch: Pick<StatementImportBatch | StatementImportBatchSummary, "id" | "name">,
  ) => {
    setBatchRenameId(batch.id);
    setBatchRenameDraft(batch.name?.trim() ?? "");
  };

  const closeBatchRename = () => {
    if (isRenamingBatch) {
      return;
    }

    setBatchRenameId(null);
    setBatchRenameDraft("");
  };

  const handleRenameBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!batchRenameId) {
      return;
    }

    const nextName = batchRenameDraft.trim();

    try {
      setIsRenamingBatch(true);
      const response = await updateStatementImportBatch(batchRenameId, {
        name: nextName || null,
      });
      setCurrentBatch((batch) =>
        batch?.id === response.data.id ? response.data : batch,
      );
      setBatchRenameId(null);
      setBatchRenameDraft("");
      await refreshBatches(response.data.id);
      toast.success(nextName ? "Lote renomeado." : "Nome do lote removido.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Erro ao renomear lote."));
    } finally {
      setIsRenamingBatch(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!batchToDeleteId) {
      return;
    }

    const deletedBatchId = batchToDeleteId;
    const shouldClearExpandedBatch =
      selectedBatchId === deletedBatchId || currentBatch?.id === deletedBatchId;

    try {
      setIsDeletingBatch(true);
      await deleteStatementImportBatch(deletedBatchId);
      setBatchToDeleteId(null);
      toast.success("Lote excluído com sucesso.");
      if (shouldClearExpandedBatch) {
        setSelectedBatchId("");
        setCurrentBatch(null);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("batch");
        setSearchParams(nextParams, { replace: true });
      }
      await refreshBatches(shouldClearExpandedBatch ? null : selectedBatchId);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Erro ao excluir lote."));
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const handleBatchToggle = async (batchId: string) => {
    if (selectedBatchId === batchId) {
      setSelectedBatchId("");
      setCurrentBatch(null);
      setActiveReviewMovementId(null);
      setSelectedReviewActionsMenuPosition(null);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("batch");
      setSearchParams(nextParams, { replace: true });
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("batch", batchId);
    setSearchParams(nextParams, { replace: true });
    await loadBatch(batchId);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(Array.from(event.target.files ?? []));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;

    if (selectedFiles.length === 0) {
      toast.error("Selecione ao menos um extrato OFX, CSV/TSV ou PDF.");
      return;
    }

    try {
      setIsUploading(true);
      const response = await createStatementImportBatch(
        selectedFiles,
        selectedAccountId || undefined,
      );
      setCurrentBatch(response.data);
      setSelectedBatchId(response.data.id);
      setBatchPage(1);
      setSelectedFiles([]);
      form.reset();
      await refreshBatches(response.data.id);
      toast.success("Lote salvo para revisão!");
    } catch {
      toast.error("Erro ao criar lote de importação.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleMovementStatusChange = useCallback(async (
    movementId: string,
    status: ReviewableMovementStatus,
  ) => {
    try {
      setUpdatingMovementId(movementId);
      const response = await updateImportedMovementStatus(movementId, status);

      setCurrentBatch((batch) => {
        if (!batch) {
          return batch;
        }

        return {
          ...batch,
          files: batch.files.map((file) => ({
            ...file,
            movements: file.movements.map((movement) =>
              movement.id === movementId
                ? { ...response.data, reviewHints: movement.reviewHints }
                : movement,
            ),
          })),
        };
      });

      toast.success(
        `Movimento marcado como ${movementStatusLabel(status).toLowerCase()}.`,
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Erro ao atualizar movimento."));
    } finally {
      setUpdatingMovementId(null);
    }
  }, []);

  const handleMovementReconciliationChange = useCallback(async (
    movementId: string,
    reconciliationStatus: ReviewableReconciliationStatus,
  ) => {
    try {
      setUpdatingMovementId(movementId);
      const response = await updateImportedMovement(movementId, {
        reconciliationStatus,
        reconciliationNote: null,
      });

      setCurrentBatch((batch) => {
        if (!batch) {
          return batch;
        }

        return {
          ...batch,
          files: batch.files.map((file) => ({
            ...file,
            movements: file.movements.map((movement) =>
              movement.id === movementId
                ? { ...response.data, reviewHints: movement.reviewHints }
                : movement,
            ),
          })),
        };
      });

      toast.success(reconciliationStatusLabel(reconciliationStatus));
    } catch (error) {
      toast.error(apiErrorMessage(error, "Erro ao conciliar movimento."));
    } finally {
      setUpdatingMovementId(null);
    }
  }, []);

  const handleApplyCategorySuggestion = useCallback(async (
    movement: ImportedMovement,
  ) => {
    const suggestion = movement.reviewHints?.categorySuggestion;

    if (!suggestion) {
      return;
    }

    if (!isBulkCategoryMovementEligible(movement)) {
      toast.error("Somente transações editáveis aceitam sugestão de categoria.");
      return;
    }

    const category = activeCategories.find(
      (item) => item.id === suggestion.categoryId,
    );

    if (!category || !categoryMatchesMovementDirection(category, movement.direction)) {
      toast.error("Sugestão indisponível ou incompatível com o movimento.");
      return;
    }

    if (movement.reviewCategoryId === suggestion.categoryId) {
      toast.success("Essa sugestão já está aplicada.");
      return;
    }

    try {
      setUpdatingMovementId(movement.id);
      const response = await updateImportedMovement(movement.id, {
        reviewTarget: "TRANSACTION",
        reviewCategoryId: suggestion.categoryId,
        reviewTransferAccountId: null,
      });

      setCurrentBatch((batch) => {
        if (!batch) {
          return batch;
        }

        return {
          ...batch,
          files: batch.files.map((file) => ({
            ...file,
            movements: file.movements.map((currentMovement) =>
              currentMovement.id === movement.id
                ? { ...response.data, reviewHints: currentMovement.reviewHints }
                : currentMovement,
            ),
          })),
        };
      });

      toast.success(`Categoria sugerida aplicada: ${category.name}.`);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Erro ao aplicar sugestão."));
    } finally {
      setUpdatingMovementId(null);
    }
  }, [activeCategories]);

  const handleApplyCategorySuggestions = async () => {
    if (!currentBatch || categorySuggestionCandidates.length === 0) {
      toast.error("Nenhuma sugestão segura para aplicar.");
      return;
    }

    try {
      setIsApplyingCategorySuggestions(true);

      for (const candidate of categorySuggestionCandidates) {
        const suggestion = candidate.movement.reviewHints?.categorySuggestion;

        if (!suggestion) {
          continue;
        }

        await updateImportedMovement(candidate.movement.id, {
          reviewTarget: "TRANSACTION",
          reviewCategoryId: suggestion.categoryId,
          reviewTransferAccountId: null,
        });
      }

      await preserveScrollPosition(() => loadBatch(currentBatch.id));
      toast.success(
        `${categorySuggestionCandidates.length} sugestão(ões) aplicada(s).`,
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Erro ao aplicar sugestões."));
    } finally {
      setIsApplyingCategorySuggestions(false);
    }
  };

  const handleApplySelectedCategorySuggestions = async () => {
    if (!currentBatch || selectedCategorySuggestionCandidates.length === 0) {
      toast.error("Nenhuma sugestão segura nos selecionados.");
      return;
    }

    try {
      setIsApplyingCategorySuggestions(true);

      for (const candidate of selectedCategorySuggestionCandidates) {
        await updateImportedMovement(candidate.movement.id, {
          reviewTarget: "TRANSACTION",
          reviewCategoryId: candidate.category.id,
          reviewTransferAccountId: null,
        });
      }

      await preserveScrollPosition(() => loadBatch(currentBatch.id));
      setSelectedReviewMovementIds([]);
      setSelectedBulkCategoryId("");
      setSelectedReviewActionsMenuPosition(null);
      toast.success(
        `${selectedCategorySuggestionCandidates.length} sugestão(ões) aplicada(s) aos selecionados.`,
      );
    } catch (error) {
      await preserveScrollPosition(() => loadBatch(currentBatch.id));
      toast.error(
        apiErrorMessage(error, "Erro ao aplicar sugestões nos selecionados."),
      );
    } finally {
      setIsApplyingCategorySuggestions(false);
    }
  };

  const handleReviewSelectionChange = useCallback((
    movementId: string,
    shouldSelect: boolean,
  ) => {
    setSelectedReviewMovementIds((current) => {
      if (shouldSelect) {
        return current.includes(movementId)
          ? current
          : [...current, movementId];
      }

      return current.filter((currentId) => currentId !== movementId);
    });
  }, []);

  const handleReviewSelectMany = useCallback((
    movementIds: string[],
    shouldSelect: boolean,
  ) => {
    setSelectedReviewMovementIds((current) => {
      const next = new Set(current);

      movementIds.forEach((movementId) => {
        if (shouldSelect) {
          next.add(movementId);
        } else {
          next.delete(movementId);
        }
      });

      return [...next];
    });
  }, []);

  const closeSelectedReviewActionsMenu = useCallback(() => {
    setSelectedReviewActionsMenuPosition(null);
  }, []);

  const handleReviewMovementLineClick = useCallback((movementId: string) => {
    setActiveReviewMovementId(movementId);
    setSelectedReviewMovementIds([]);
    setSelectedReviewActionsMenuPosition(null);
  }, []);

  const openSelectedReviewActionsMenu = useCallback((
    event: ReactMouseEvent<HTMLElement>,
    movement: ImportedMovement,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveReviewMovementId(movement.id);

    if (!isBulkCategoryMovementEligible(movement)) {
      setSelectedReviewActionsMenuPosition(null);
      toast.error(
        "Somente transações editáveis entram nas ações em massa.",
      );
      return;
    }

    setSelectedReviewMovementIds((current) =>
      current.includes(movement.id) ? current : [movement.id],
    );

    const menuWidth = 288;
    const menuHeight = 388;
    const margin = 12;
    const maxX = Math.max(margin, window.innerWidth - menuWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - menuHeight - margin);

    setSelectedReviewActionsMenuPosition({
      x: Math.min(Math.max(event.clientX, margin), maxX),
      y: Math.min(Math.max(event.clientY, margin), maxY),
    });
  }, []);

  const handleSelectSimilarReviewMovements = () => {
    if (!editingMovement || editingSimilarReviewMovementItems.length === 0) {
      toast.error("Não há movimentos semelhantes editáveis para selecionar.");
      return;
    }

    const movementIds = editingSimilarReviewMovementItems.map(
      ({ movement }) => movement.id,
    );

    handleReviewSelectMany(movementIds, true);
    toast.success(
      `${movementIds.length} movimento(s) com a mesma descrição selecionado(s).`,
    );
  };

  const handleSelectedReviewStatusChange = async (
    status: ReviewableMovementStatus,
  ) => {
    if (!currentBatch || selectedReviewMovementItems.length === 0) {
      toast.error("Selecione movimentos editáveis para atualizar.");
      return;
    }

    const updateItems =
      status === "READY"
        ? selectedReviewMovementItems.filter(
            ({ file, movement }) => !getMovementReadinessIssue(movement, file),
          )
        : selectedReviewMovementItems;
    const blockedCount = selectedReviewMovementItems.length - updateItems.length;

    if (updateItems.length === 0) {
      toast.error(
        status === "READY"
          ? "Nenhum selecionado está pronto para marcar como pronto."
          : "Nenhum selecionado pode ser atualizado.",
      );
      return;
    }

    let updatedCount = 0;

    try {
      setIsUpdatingSelectedReviewStatus(true);

      for (const { movement } of updateItems) {
        await updateImportedMovementStatus(movement.id, status);
        updatedCount += 1;
      }

      await preserveScrollPosition(() => loadBatch(currentBatch.id));
      setSelectedReviewMovementIds([]);
      setSelectedBulkCategoryId("");
      setSelectedReviewActionsMenuPosition(null);
      toast.success(
        blockedCount > 0
          ? `${updatedCount} movimento(s) marcado(s) como ${movementStatusLabel(status).toLowerCase()}. ${blockedCount} bloqueado(s) por pendências.`
          : `${updatedCount} movimento(s) marcado(s) como ${movementStatusLabel(status).toLowerCase()}.`,
      );
    } catch (error) {
      await preserveScrollPosition(() => loadBatch(currentBatch.id));
      toast.error(
        `${updatedCount} movimento(s) atualizado(s). ${apiErrorMessage(
          error,
          "Erro ao atualizar selecionados.",
        )}`,
      );
    } finally {
      setIsUpdatingSelectedReviewStatus(false);
    }
  };

  const openQuickCategoryDialog = (context: QuickCategoryContext) => {
    setQuickCategoryContext(context);
    setQuickCategoryName("");
    setQuickCategoryIcon(
      context.direction === "IN"
        ? "lucide:badge-dollar-sign"
        : "lucide:tag",
    );
  };

  const closeQuickCategoryDialog = () => {
    if (isCreatingQuickCategory) return;

    setQuickCategoryContext(null);
    setQuickCategoryName("");
    setQuickCategoryIcon("");
  };

  const applyCategoryToSelectedReviewMovements = async (category: Category) => {
    if (!currentBatch || selectedReviewMovementItems.length === 0) {
      toast.error("Selecione movimentos de transação para aplicar categoria.");
      return;
    }

    const compatibleItems = selectedReviewMovementItems.filter(({ movement }) =>
      categoryMatchesMovementDirection(category, movement.direction),
    );

    if (compatibleItems.length === 0) {
      toast.error("Categoria incompatível com os movimentos selecionados.");
      return;
    }

    try {
      setIsApplyingBulkCategory(true);
      const response = await bulkReviewImportedMovementCategory(
        currentBatch.id,
        compatibleItems.map(({ movement }) => movement.id),
        category.id,
      );

      await preserveScrollPosition(() => loadBatch(currentBatch.id));
      setSelectedReviewMovementIds([]);
      setSelectedBulkCategoryId("");
      toast.success(
        `${response.data.updatedCount} movimento(s) atualizado(s) com ${category.name}.`,
      );
    } catch (error) {
      await preserveScrollPosition(() => loadBatch(currentBatch.id));
      toast.error(
        apiErrorMessage(error, "Erro ao aplicar categoria aos selecionados."),
      );
    } finally {
      setIsApplyingBulkCategory(false);
    }
  };

  const handleApplyBulkCategory = async () => {
    const category = bulkCategoryOptions.find(
      (item) => item.id === selectedBulkCategoryId,
    );

    if (!category) {
      toast.error("Selecione uma categoria compatível.");
      return;
    }

    await applyCategoryToSelectedReviewMovements(category);
  };

  const handleQuickCategorySubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!quickCategoryContext) {
      return;
    }

    const name = quickCategoryName.trim();
    if (!name) {
      toast.error("Informe o nome da categoria.");
      return;
    }

    const kind = categoryKindFromDirection(quickCategoryContext.direction);

    try {
      setIsCreatingQuickCategory(true);
      const response = await createCategory({
        name,
        icon: quickCategoryIcon,
        kind,
      });
      const category = response.data;

      setCategories((current) =>
        [...current, category].sort((a, b) => a.name.localeCompare(b.name)),
      );

      if (
        quickCategoryContext.source === "movement" &&
        quickCategoryContext.movementId === editingMovement?.id
      ) {
        setMovementEditForm((current) =>
          current ? { ...current, reviewCategoryId: category.id } : current,
        );
        toast.success("Categoria criada e selecionada.");
      } else {
        await applyCategoryToSelectedReviewMovements(category);
      }

      setQuickCategoryContext(null);
      setQuickCategoryName("");
      setQuickCategoryIcon("");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Erro ao criar categoria."));
    } finally {
      setIsCreatingQuickCategory(false);
    }
  };

  const openMovementEditor = useCallback((
    movement: ImportedMovement,
    file: StatementImportFile,
  ) => {
    const reviewTarget = inferReviewTarget(movement);
    const rawType = inferReviewType(
      movement,
      movement.direction,
      reviewTarget,
    );

    setEditingMovement(movement);
    setEditingMovementFile(file);
    setActiveReviewMovementId(movement.id);
    if (isBulkCategoryMovementEligible(movement)) {
      setSelectedReviewMovementIds((current) =>
        current.includes(movement.id) ? current : [...current, movement.id],
      );
    }
    setMovementEditForm({
      date: dateInputValue(movement.date),
      amount: centsToInputValue(movement.amountCents),
      direction: movement.direction,
      rawType,
      reviewTarget,
      reviewCategoryId:
        reviewTarget === "TRANSACTION"
          ? getDefaultReviewCategoryId(categories, movement)
          : "",
      reviewTransferAccountId:
        reviewTarget === "TRANSFER"
          ? getDefaultTransferAccountId(
              activeAccounts,
              file.financialAccountId,
              movement.reviewTransferAccountId,
            )
          : "",
      rawDescription: movement.rawDescription,
    });
  }, [activeAccounts, categories]);

  const closeMovementEditor = () => {
    if (isSavingMovement) return;

    setEditingMovement(null);
    setEditingMovementFile(null);
    setMovementEditForm(null);
  };

  const handleMovementEditChange = <K extends keyof MovementEditForm>(
    field: K,
    value: MovementEditForm[K],
  ) => {
    setMovementEditForm((current) => {
      if (!current) {
        return current;
      }

      if (field === "direction") {
        const direction = value as StatementMovementDirection;
        const options = getReviewTypeOptions(direction, current.reviewTarget);
        const rawType = options.some((option) => option.value === current.rawType)
          ? current.rawType
          : options[0].value;
        const currentCategory = categories.find(
          (category) => category.id === current.reviewCategoryId,
        );

        return {
          ...current,
          direction,
          rawType,
          reviewCategoryId:
            currentCategory &&
            !categoryMatchesMovementDirection(currentCategory, direction)
              ? ""
              : current.reviewCategoryId,
        };
      }

      if (field === "reviewTarget") {
        const reviewTarget = value as ImportedMovementReviewTarget;
        const options = getReviewTypeOptions(current.direction, reviewTarget);

        return {
          ...current,
          reviewTarget,
          rawType: options[0].value,
          reviewCategoryId:
            reviewTarget === "TRANSACTION" && editingMovement
              ? getDefaultReviewCategoryId(categories, editingMovement)
              : "",
          reviewTransferAccountId:
            reviewTarget === "TRANSFER"
              ? getDefaultTransferAccountId(
                  activeAccounts,
                  editingMovementFile?.financialAccountId,
                  current.reviewTransferAccountId,
                )
              : "",
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });
  };

  const handleMovementEditSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!editingMovement || !editingMovementFile || !movementEditForm) {
      return;
    }

    const amountCents = inputValueToCents(movementEditForm.amount);
    if (!amountCents) {
      toast.error("Informe um valor positivo para o movimento.");
      return;
    }

    const rawType = movementEditForm.rawType.trim();
    const rawDescription = movementEditForm.rawDescription.trim();

    if (!rawType || !rawDescription) {
      toast.error("Tipo e descrição são obrigatórios.");
      return;
    }

    if (movementEditForm.reviewTarget === "TRANSFER") {
      if (!editingMovementFile.financialAccountId) {
        toast.error("Selecione a conta do extrato antes de revisar transferência.");
        return;
      }

      if (!movementEditForm.reviewTransferAccountId) {
        toast.error("Informe a outra conta da transferência.");
        return;
      }

      if (
        movementEditForm.reviewTransferAccountId ===
        editingMovementFile.financialAccountId
      ) {
        toast.error("A outra conta precisa ser diferente da conta do extrato.");
        return;
      }
    }

    const payload: UpdateImportedMovementPayload = {
      date: movementEditForm.date,
      amountCents,
      direction: movementEditForm.direction,
      rawType:
        movementEditForm.reviewTarget === "TRANSFER"
          ? TRANSFER_REVIEW_TYPE
          : rawType,
      reviewTarget: movementEditForm.reviewTarget,
      reviewCategoryId:
        movementEditForm.reviewTarget === "TRANSACTION"
          ? movementEditForm.reviewCategoryId || null
          : null,
      reviewTransferAccountId:
        movementEditForm.reviewTarget === "TRANSFER"
          ? movementEditForm.reviewTransferAccountId
          : null,
      rawDescription,
    };

    try {
      setIsSavingMovement(true);
      const response = await updateImportedMovement(
        editingMovement.id,
        payload,
      );

      setCurrentBatch((batch) => {
        if (!batch) {
          return batch;
        }

        return {
          ...batch,
          files: batch.files.map((file) => ({
            ...file,
            movements: file.movements.map((movement) =>
              movement.id === editingMovement.id
                ? { ...response.data, reviewHints: movement.reviewHints }
                : movement,
            ),
          })),
        };
      });

      setEditingMovement(null);
      setEditingMovementFile(null);
      setMovementEditForm(null);
      if (currentBatch) {
        await preserveScrollPosition(() => loadBatch(currentBatch.id));
      }
      toast.success("Movimento atualizado para revisão.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Erro ao editar movimento."));
    } finally {
      setIsSavingMovement(false);
    }
  };

  const handleApplyReadyMovements = async () => {
    if (!currentBatch || movementStatusCounts.READY === 0) {
      return;
    }

    if (readyReconciliationBlockCount > 0) {
      toast.error("Resolva a conciliação dos movimentos prontos antes de aplicar.");
      return;
    }

    try {
      setIsApplyingReady(true);
      setIsApplyConfirmOpen(false);
      const response = await applyReadyImportedMovements(currentBatch.id);
      setCurrentBatch(response.data.batch);
      await preserveScrollPosition(() => refreshBatches(response.data.batch.id));
      toast.success(
        `${response.data.appliedCount} movimento(s) aplicado(s): ${response.data.transactionCount} transação(ões), ${response.data.transferCount} transferência(s).`,
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Erro ao aplicar movimentos prontos."));
    } finally {
      setIsApplyingReady(false);
    }
  };

  const openUndoAppliedDialog = () => {
    setSelectedUndoMovementIds(
      undoAppliedMovementDetails.map((movement) => movement.id),
    );
    setIsUndoConfirmOpen(true);
  };

  const handleUndoSelectionChange = (
    movementId: string,
    shouldSelect: boolean,
  ) => {
    setSelectedUndoMovementIds((current) => {
      if (shouldSelect) {
        return current.includes(movementId)
          ? current
          : [...current, movementId];
      }

      return current.filter((currentId) => currentId !== movementId);
    });
  };

  const handleUndoSelectMany = (movementIds: string[], shouldSelect: boolean) => {
    setSelectedUndoMovementIds((current) => {
      const next = new Set(current);

      movementIds.forEach((movementId) => {
        if (shouldSelect) {
          next.add(movementId);
        } else {
          next.delete(movementId);
        }
      });

      return [...next];
    });
  };

  const handleUndoAppliedMovements = async () => {
    if (!currentBatch || selectedUndoMovementIds.length === 0) {
      toast.error("Selecione alguma coisa para desfazer.");
      return;
    }

    try {
      setIsUndoingApplied(true);
      setIsUndoConfirmOpen(false);
      const response = await undoAppliedImportedMovements(
        currentBatch.id,
        selectedUndoMovementIds,
      );
      setCurrentBatch(response.data.batch);
      setSelectedUndoMovementIds([]);
      await preserveScrollPosition(() => refreshBatches(response.data.batch.id));
      toast.success(
        `${response.data.undoneCount} movimento(s) desfeito(s): ${response.data.transactionCount} transação(ões), ${response.data.transferCount} transferência(s).`,
      );
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Erro ao desfazer movimentos aplicados."),
      );
    } finally {
      setIsUndoingApplied(false);
    }
  };

  const handlePrepareSafeMovements = async () => {
    if (!currentBatch || safeReadyCandidates.length === 0) {
      return;
    }

    let preparedCount = 0;

    try {
      setIsPreparingSafe(true);

      for (const candidate of safeReadyCandidates) {
        const shouldPersistCategory =
          candidate.movement.reviewCategoryId !== candidate.reviewCategoryId;

        if (shouldPersistCategory) {
          await updateImportedMovement(candidate.movement.id, {
            reviewCategoryId: candidate.reviewCategoryId,
            reconciliationStatus:
              candidate.movement.reconciliationStatus === "CONFIRMED_UNIQUE"
                ? "CONFIRMED_UNIQUE"
                : undefined,
          });
        }

        await updateImportedMovementStatus(candidate.movement.id, "READY");
        preparedCount += 1;
      }

      await preserveScrollPosition(() => loadBatch(currentBatch.id));
      toast.success(
        `${preparedCount} movimento(s) seguro(s) marcado(s) como pronto(s).`,
      );
    } catch (error) {
      await preserveScrollPosition(() => loadBatch(currentBatch.id));
      toast.error(
        `${preparedCount} movimento(s) preparado(s). ${apiErrorMessage(
          error,
          "Erro ao preparar movimentos seguros.",
        )}`,
      );
    } finally {
      setIsPreparingSafe(false);
    }
  };

  const handleIgnoreDuplicateMovements = async () => {
    if (!currentBatch || duplicateMovementCandidates.length === 0) {
      return;
    }

    let ignoredCount = 0;

    try {
      setIsIgnoringDuplicates(true);

      for (const movement of duplicateMovementCandidates) {
        await updateImportedMovementStatus(movement.id, "IGNORED");
        ignoredCount += 1;
      }

      await preserveScrollPosition(() => loadBatch(currentBatch.id));
      toast.success(`${ignoredCount} duplicado(s) ignorado(s).`);
    } catch (error) {
      await preserveScrollPosition(() => loadBatch(currentBatch.id));
      toast.error(
        `${ignoredCount} duplicado(s) ignorado(s). ${apiErrorMessage(
          error,
          "Erro ao ignorar duplicados.",
        )}`,
      );
    } finally {
      setIsIgnoringDuplicates(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--color-text)" }}
          >
            Importação de extratos
          </h1>
          <p className="mt-1" style={{ color: "var(--color-text-muted)" }}>
            Lotes persistidos para revisar movimentos antes de qualquer impacto
            financeiro.
          </p>
        </div>

        <div
          className="rounded-xl border p-4"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg-muted-card)",
          }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 shrink-0"
              size={18}
              style={{ color: "var(--color-brand)" }}
            />
            <p
              className="text-sm leading-6"
              style={{ color: "var(--color-text-muted)" }}
            >
              Criar e revisar lotes não altera saldo. A aplicação financeira
              acontece apenas ao usar "Aplicar prontos", depois da revisão.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass rounded-2xl p-5"
          style={{
            backgroundColor: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr_auto]">
            <div>
              <label
                className="mb-1 block text-sm font-medium"
                style={{ color: "var(--color-text)" }}
              >
                Conta destino
              </label>
              <select
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                className="app-control"
                disabled={isLoadingAccounts}
              >
                <option value="">Sem conta selecionada</option>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium"
                style={{ color: "var(--color-text)" }}
              >
                Arquivos de extrato
              </label>
              <input
                type="file"
                accept=".ofx,.qfx,.csv,.tsv,.txt,application/pdf,.pdf,text/csv,text/tab-separated-values"
                multiple
                onChange={handleFileChange}
                className="app-control"
              />
              {selectedFiles.length > 0 && (
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {selectedFiles.length} arquivo(s) selecionado(s)
                </p>
              )}
            </div>

            <div className="flex items-end">
              <DisabledReasonTooltip
                reason={uploadDisabledReason}
                className="inline-flex w-full lg:w-auto"
              >
                <button
                  type="submit"
                  disabled={isUploading}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 lg:w-auto"
                >
                  {isUploading ? (
                    <FileSearch size={16} />
                  ) : (
                    <Upload size={16} />
                  )}
                  {isUploading ? "Salvando..." : "Criar lote"}
                </button>
              </DisabledReasonTooltip>
            </div>
          </div>
        </form>

        <div
          className="glass rounded-2xl p-5"
          style={{
            backgroundColor: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2
                className="text-base font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                Lotes importados
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                {batchSummaries.length} lote(s) salvo(s), {batchRangeStart}-
                {batchRangeEnd} visível(is)
              </p>
            </div>
            <DisabledReasonTooltip
              reason={refreshDisabledReason}
              className="inline-flex w-full lg:w-auto"
            >
              <button
                type="button"
                title={refreshDisabledReason ?? "Atualizar lotes"}
                onClick={() => void refreshBatches()}
                disabled={isLoadingBatches}
                className="flex h-11 w-full items-center justify-center rounded-lg border px-4 transition disabled:cursor-not-allowed disabled:opacity-60 lg:w-11"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <RefreshCw
                  size={17}
                  className={isLoadingBatches ? "animate-spin" : ""}
                />
              </button>
            </DisabledReasonTooltip>
          </div>

          {batchSummaries.length === 0 && !isLoadingBatches && (
            <div
              className="mt-4 flex min-h-[8rem] flex-col items-center justify-center rounded-xl border p-5 text-center"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-muted)",
              }}
            >
              <FileUp size={30} />
              <p className="mt-2 text-sm">Nenhum lote persistido encontrado.</p>
            </div>
          )}

          {visibleBatchSummaries.length > 0 && (
            <div className="mt-4 space-y-3">
              {visibleBatchSummaries.map((summary) => {
                const isExpanded = selectedBatchId === summary.id;
                const deleteBlockedByAppliedMovements =
                  isExpanded && currentBatchHasAppliedMovements;
                const isDeletingThisBatch =
                  isDeletingBatch && batchToDeleteId === summary.id;
                const deleteDisabledReason = deleteBlockedByAppliedMovements
                  ? "Desfaça os movimentos aplicados antes de excluir o lote."
                  : isDeletingBatch
                    ? "Aguarde a exclusão do lote terminar."
                    : isUploading
                      ? "Aguarde o envio do lote terminar."
                      : isApplyingReady
                        ? "Aguarde a aplicação dos movimentos prontos terminar."
                        : isUndoingApplied
                          ? "Aguarde o desfazer dos movimentos aplicados terminar."
                          : null;

                return (
                  <div
                    key={summary.id}
                    className="rounded-xl border"
                    style={{
                      borderColor: isExpanded
                        ? "var(--color-brand)"
                        : "var(--color-border)",
                      backgroundColor: "var(--color-bg)",
                    }}
                  >
                    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => void handleBatchToggle(summary.id)}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        <span
                          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                          style={{ borderColor: "var(--color-border)" }}
                        >
                          <ChevronDown
                            size={16}
                            className={`transition ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className="font-semibold"
                              style={{ color: "var(--color-text)" }}
                            >
                              {getBatchDisplayName(summary)}
                            </span>
                            {summary.name?.trim() && (
                              <span
                                className="rounded-full border px-2 py-0.5 text-xs font-medium"
                                style={{
                                  borderColor: "var(--color-border)",
                                  color: "var(--color-text-muted)",
                                }}
                              >
                                {getBatchShortCode(summary.id)}
                              </span>
                            )}
                            <span
                              className="app-chip app-chip-info"
                            >
                              {batchStatusLabel(summary.status)}
                            </span>
                          </span>
                          <span
                            className="mt-1 block text-sm"
                            style={{ color: "var(--color-text)" }}
                          >
                            {formatBatchSummaryPeriod(summary)}
                          </span>
                          <span
                            className="mt-1 block text-xs"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {summary.files.length} arquivo(s) -{" "}
                            {getSummaryMovementCount(summary)} movimento(s) -{" "}
                            {formatDate(summary.createdAt)}
                          </span>
                        </span>
                      </button>

                      <div className="flex w-full gap-2 sm:w-auto">
                        <DisabledReasonTooltip
                          reason={isRenamingBatch ? "Aguarde o renomeio terminar." : null}
                          className="inline-flex flex-1 sm:flex-none"
                        >
                          <button
                            type="button"
                            title="Renomear lote"
                            onClick={() => openBatchRename(summary)}
                            disabled={isRenamingBatch}
                            className="app-icon-control flex h-10 w-full items-center justify-center rounded-lg px-3 disabled:cursor-not-allowed disabled:opacity-60 sm:w-10"
                          >
                            <Pencil size={16} />
                          </button>
                        </DisabledReasonTooltip>
                        <DisabledReasonTooltip
                          reason={deleteDisabledReason}
                          className="inline-flex flex-1 sm:flex-none"
                        >
                          <button
                            type="button"
                            title={deleteDisabledReason ?? "Excluir lote"}
                            onClick={() => setBatchToDeleteId(summary.id)}
                            disabled={
                              deleteBlockedByAppliedMovements ||
                              isDeletingBatch ||
                              isUploading ||
                              isApplyingReady ||
                              isUndoingApplied
                            }
                            className="flex h-10 w-full items-center justify-center rounded-lg border px-3 transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-10"
                            style={{
                              borderColor: "var(--color-border)",
                              color: deleteBlockedByAppliedMovements
                                ? "var(--color-text-muted)"
                                : "#dc2626",
                            }}
                          >
                            {isDeletingThisBatch ? (
                              <RefreshCw size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </DisabledReasonTooltip>
                      </div>
                    </div>

                    {isExpanded && isLoadingBatch && (
                      <div
                        className="flex items-center gap-2 border-t px-4 py-3 text-sm"
                        style={{
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        <RefreshCw size={15} className="animate-spin" />
                        Carregando lote...
                      </div>
                    )}

                    {isExpanded && !isLoadingBatch && currentBatch?.id === summary.id && (
                      <div
                        className="border-t px-4 py-3"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: "var(--color-bg-muted-card)",
                        }}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <span
                              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                              style={{
                                borderColor: "var(--color-border)",
                                color: "var(--color-brand)",
                              }}
                            >
                              <Landmark size={17} />
                            </span>
                            <div className="min-w-0">
                              <p
                                className="text-sm font-semibold"
                                style={{ color: "var(--color-text)" }}
                              >
                                {getBatchDisplayName(currentBatch)}
                              </p>
                              <p
                                className="mt-1 text-xs"
                                style={{ color: "var(--color-text-muted)" }}
                              >
                                {getBatchShortCode(currentBatch.id)} - {formatBatchPeriod(currentBatch)}. Arquivos e movimentos vinculados aparecem no painel abaixo.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span
                              className="rounded-full border px-2.5 py-1 font-medium"
                              style={{
                                borderColor: "var(--color-border)",
                                color: "var(--color-text)",
                                backgroundColor: "var(--color-bg-card)",
                              }}
                            >
                              {movementCompletionPercentage}% concluído
                            </span>
                            <span
                              className="rounded-full border px-2.5 py-1 font-medium"
                              style={{
                                borderColor: "var(--color-border)",
                                color: "var(--color-text)",
                                backgroundColor: "var(--color-bg-card)",
                              }}
                            >
                              {getPendingReviewCount(movementStatusCounts)} pendente(s)
                            </span>
                            <span
                              className="rounded-full border px-2.5 py-1 font-medium"
                              style={{
                                borderColor: "var(--color-border)",
                                color: "var(--color-text)",
                                backgroundColor: "var(--color-bg-card)",
                              }}
                            >
                              {movementStatusCounts.IGNORED} ignorado(s)
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {batchSummaries.length > BATCHES_PER_PAGE && (
            <PaginationControls
              className="mt-4"
              label={`${batchRangeStart}-${batchRangeEnd} de ${batchSummaries.length} lotes`}
              page={effectiveBatchPage}
              totalPages={totalBatchPages}
              onPageChange={setBatchPage}
            />
          )}
        </div>

        {!isLoadingBatch && currentBatch && (
          <div
            className="space-y-5 border-l-2 pl-4"
            style={{ borderColor: "var(--color-brand)" }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {[
                {
                  label: "Lote",
                  value: getBatchDisplayName(currentBatch),
                  detail: `${batchStatusLabel(currentBatch.status)} - ${movementCompletionPercentage}% concluído`,
                  icon: Files,
                },
                {
                  label: "Arquivos",
                  value: String(currentBatch.files.length),
                  detail: `${movementCount} movimento(s)`,
                  icon: FileSearch,
                },
                {
                  label: "Pendentes",
                  value: String(getPendingReviewCount(movementStatusCounts)),
                  detail: `${movementStatusCounts.NEW} novo(s) / ${movementStatusCounts.NEEDS_REVIEW} revisar`,
                  icon: Clock3,
                },
                {
                  label: "Prontos",
                  value: String(movementStatusCounts.READY),
                  detail: `${movementStatusCounts.APPLIED} aplicado(s)`,
                  icon: CheckCircle2,
                },
                {
                  label: "Ignorados",
                  value: String(movementStatusCounts.IGNORED),
                  detail: `${totals.duplicateCount} duplicado(s)`,
                  icon: AlertTriangle,
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="glass flex min-h-[7rem] items-start gap-4 rounded-2xl p-5"
                  style={{
                    backgroundColor: "var(--color-bg-card)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    className="shrink-0 rounded-xl p-3"
                    style={{ backgroundColor: "var(--color-bg)" }}
                  >
                    <card.icon
                      size={21}
                      style={{ color: "var(--color-brand)" }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-sm"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {card.label}
                    </p>
                    <p
                      className="break-words text-base font-bold leading-tight"
                      style={{ color: "var(--color-text)" }}
                    >
                      {card.value}
                    </p>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {card.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div
              className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
              style={{
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div className="min-w-0">
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--color-text)" }}
                >
                  Aplicação financeira
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {applyReadySummary.totalCount} movimento(s) pronto(s) para
                  criar transações ou transferências revisadas.
                  {pendingReconciliationCount > 0
                    ? ` ${pendingReconciliationCount} movimento(s) ainda pedem conciliação.`
                    : ""}
                  {readyReconciliationBlockCount > 0
                    ? " Há prontos bloqueados por conciliação pendente."
                    : ""}
                  {safeReadyCandidates.length > 0
                    ? ` ${safeReadyCandidates.length} movimento(s) seguro(s) podem ser preparados automaticamente.`
                    : ""}
                  {duplicateMovementCandidates.length > 0
                    ? ` ${duplicateMovementCandidates.length} duplicado(s) podem ser ignorados.`
                    : ""}
                  {undoAppliedSummary.totalCount > 0
                    ? ` ${undoAppliedSummary.totalCount} aplicado(s) podem ser desfeitos.`
                    : ""}
                </p>
                {applyReadySummary.totalCount > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-5">
                    <ApplySummaryMetric
                      label="Transações"
                      value={String(applyReadySummary.transactionCount)}
                    />
                    <ApplySummaryMetric
                      label="Transferências"
                      value={String(applyReadySummary.transferCount)}
                    />
                    <ApplySummaryMetric
                      label="Entradas"
                      value={centsToCurrency(applyReadySummary.inCents)}
                    />
                    <ApplySummaryMetric
                      label="Saidas"
                      value={centsToCurrency(applyReadySummary.outCents)}
                    />
                    <ApplySummaryMetric
                      label="Liquido"
                      value={centsToCurrency(applyReadySummary.netCents)}
                    />
                  </div>
                )}
                {readyInvoicePaymentWarningCount > 0 && (
                  <div className="app-inline-alert app-inline-alert-danger mt-4 overflow-hidden shadow-sm">
                    <div className="grid grid-cols-[4px_1fr]">
                      <div className="bg-red-500" aria-hidden="true" />
                      <div className="p-3">
                        <div className="flex items-start gap-3">
                          <div className="app-soft-button-danger flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                            <AlertTriangle size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                                Risco de duplicidade: pagamento de fatura
                              </p>
                              <span className="app-chip app-chip-danger px-2 py-0.5 text-[11px] font-semibold">
                                {readyInvoicePaymentWarningCount} pronta(s)
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>
                              Ha movimento(s) de pagamento de fatura marcados
                              como prontos. Se as compras já foram importadas
                              como transações individuais, aplicar também o
                              total da fatura pode duplicar a despesa.
                            </p>
                            <p className="mt-2 text-xs font-medium" style={{ color: "var(--color-text)" }}>
                              Revise manualmente e ignore quando for apenas a
                              quitação de uma fatura já detalhada.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {(reviewBlockSummary.length > 0 ||
                  readyMovementPreview.length > 0) && (
                  <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {readyMovementPreview.length > 0 && (
                      <div className="min-w-0">
                        <p
                          className="text-xs font-semibold"
                          style={{ color: "var(--color-text)" }}
                        >
                          Prontos para aplicar
                        </p>
                        <div className="mt-2 space-y-1.5">
                          {readyMovementPreview.map((movement) => (
                            <div
                              key={movement.id}
                              className="flex min-w-0 items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0">
                                <p
                                  className="truncate font-medium"
                                  style={{ color: "var(--color-text)" }}
                                >
                                  {movement.description}
                                </p>
                                <p
                                  className="truncate"
                                  style={{ color: "var(--color-text-muted)" }}
                                >
                                  {formatDate(movement.date)} - {movement.label}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2 py-1 font-medium ${directionClass(movement.direction)}`}
                              >
                                {centsToCurrency(movement.amountCents)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {reviewBlockSummary.length > 0 && (
                      <div className="min-w-0">
                        <p
                          className="text-xs font-semibold"
                          style={{ color: "var(--color-text)" }}
                        >
                          Pendências de revisão
                        </p>
                        <div className="mt-2 grid grid-cols-1 gap-1.5 min-[920px]:grid-cols-2 min-[1440px]:grid-cols-3">
                          {reviewBlockSummary.map((item) => (
                            <span
                              key={item.reason}
                              className="app-inline-alert app-inline-alert-warning min-w-0 px-2.5 py-1.5 text-xs font-medium"
                              title={item.reason}
                            >
                              <span className="font-semibold">
                                {item.count}
                              </span>{" "}
                              <span>{item.reason}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <DisabledReasonTooltip
                  reason={ignoreDuplicatesDisabledReason}
                  className="inline-flex w-full sm:w-auto"
                >
                  <button
                    type="button"
                    title={ignoreDuplicatesDisabledReason ?? "Ignorar duplicados"}
                    onClick={() => void handleIgnoreDuplicateMovements()}
                    disabled={Boolean(ignoreDuplicatesDisabledReason)}
                    className="app-soft-button-warning flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {isIgnoringDuplicates ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <XCircle size={16} />
                    )}
                    {isIgnoringDuplicates
                      ? "Ignorando..."
                      : "Ignorar duplicados"}
                  </button>
                </DisabledReasonTooltip>
                <DisabledReasonTooltip
                  reason={prepareSafeDisabledReason}
                  className="inline-flex w-full sm:w-auto"
                >
                  <button
                    type="button"
                    title={prepareSafeDisabledReason ?? "Preparar seguros"}
                    onClick={() => void handlePrepareSafeMovements()}
                    disabled={Boolean(prepareSafeDisabledReason)}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 sm:w-auto"
                  >
                    {isPreparingSafe ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    {isPreparingSafe ? "Preparando..." : "Preparar seguros"}
                  </button>
                </DisabledReasonTooltip>
                <DisabledReasonTooltip
                  reason={applyReadyDisabledReason}
                  className="inline-flex w-full sm:w-auto"
                >
                  <button
                    type="button"
                    title={applyReadyDisabledReason ?? "Aplicar prontos"}
                    onClick={() => setIsApplyConfirmOpen(true)}
                    disabled={
                      isApplyingReady ||
                      !canApplyReadyMovements ||
                      Boolean(applyReadyDisabledReason)
                    }
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400 sm:w-auto"
                  >
                    {isApplyingReady ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    {isApplyingReady ? "Aplicando..." : "Aplicar prontos"}
                  </button>
                </DisabledReasonTooltip>
                <DisabledReasonTooltip
                  reason={undoAppliedDisabledReason}
                  className="inline-flex w-full sm:w-auto"
                >
                  <button
                    type="button"
                    title={undoAppliedDisabledReason ?? "Desfazer aplicados"}
                    onClick={openUndoAppliedDialog}
                    disabled={Boolean(undoAppliedDisabledReason)}
                    className="app-soft-button-danger flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {isUndoingApplied ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Undo2 size={16} />
                    )}
                    {isUndoingApplied ? "Desfazendo..." : "Desfazer aplicados"}
                  </button>
                </DisabledReasonTooltip>
              </div>
            </div>

            <div
              className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
              style={{
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: "var(--color-text)" }}
              >
                <ListFilter size={16} style={{ color: "var(--color-brand)" }} />
                Status
              </div>
              <div className="flex flex-wrap gap-2">
                {MOVEMENT_STATUS_FILTERS.map((filter) => {
                  const isActive = movementStatusFilter === filter.value;

                  return (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setMovementStatusFilter(filter.value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        isActive ? "bg-blue-600 text-white" : "hover:bg-gray-50"
                      }`}
                      style={{
                        borderColor: isActive
                          ? "transparent"
                          : "var(--color-border)",
                        color: isActive ? "#fff" : "var(--color-text)",
                      }}
                    >
                      {filter.label} ({movementStatusCounts[filter.value]})
                    </button>
                  );
                })}
              </div>
            </div>

            <BulkReviewCategoryPanel
              totalEligibleCount={bulkCategoryMovementItems.length}
              selectedCount={selectedReviewMovementItems.length}
              selectedDirections={selectedReviewDirections}
              categoryOptions={bulkCategoryOptions}
              selectedCategoryId={selectedBulkCategoryId}
              isApplying={isApplyingBulkCategory}
              suggestedCategoryCount={categorySuggestionCandidates.length}
              isApplyingSuggestions={isApplyingCategorySuggestions}
              isUpdatingStatus={isUpdatingSelectedReviewStatus}
              onCategoryChange={setSelectedBulkCategoryId}
              onApply={() => void handleApplyBulkCategory()}
              onApplySuggestions={() => void handleApplyCategorySuggestions()}
              onReadySelected={() =>
                void handleSelectedReviewStatusChange("READY")
              }
              onIgnoreSelected={() =>
                void handleSelectedReviewStatusChange("IGNORED")
              }
              onReviewSelected={() =>
                void handleSelectedReviewStatusChange("NEEDS_REVIEW")
              }
              onResetSelected={() =>
                void handleSelectedReviewStatusChange("NEW")
              }
              onCreateCategory={() => {
                if (selectedReviewDirections.length === 1) {
                  openQuickCategoryDialog({
                    direction: selectedReviewDirections[0],
                    source: "bulk",
                  });
                }
              }}
              onSelectAll={() =>
                handleReviewSelectMany(
                  bulkCategoryMovementItems.map(({ movement }) => movement.id),
                  true,
                )
              }
              onClear={() => setSelectedReviewMovementIds([])}
            />

            {selectedReviewActionsMenuPosition && (
              <SelectedReviewActionsMenu
                position={selectedReviewActionsMenuPosition}
                selectedCount={selectedReviewMovementItems.length}
                selectedCategoryLabel={
                  selectedBulkCategory
                    ? formatCategoryLabel(selectedBulkCategory)
                    : null
                }
                selectedSuggestionCount={
                  selectedCategorySuggestionCandidates.length
                }
                isApplying={isApplyingBulkCategory}
                isApplyingSuggestions={isApplyingCategorySuggestions}
                isUpdatingStatus={isUpdatingSelectedReviewStatus}
                onClose={closeSelectedReviewActionsMenu}
                onReadySelected={() => {
                  closeSelectedReviewActionsMenu();
                  void handleSelectedReviewStatusChange("READY");
                }}
                onIgnoreSelected={() => {
                  closeSelectedReviewActionsMenu();
                  void handleSelectedReviewStatusChange("IGNORED");
                }}
                onReviewSelected={() => {
                  closeSelectedReviewActionsMenu();
                  void handleSelectedReviewStatusChange("NEEDS_REVIEW");
                }}
                onResetSelected={() => {
                  closeSelectedReviewActionsMenu();
                  void handleSelectedReviewStatusChange("NEW");
                }}
                onApplyCategory={() => {
                  closeSelectedReviewActionsMenu();
                  void handleApplyBulkCategory();
                }}
                onApplySuggestions={() => {
                  closeSelectedReviewActionsMenu();
                  void handleApplySelectedCategorySuggestions();
                }}
                onClearSelection={() => {
                  closeSelectedReviewActionsMenu();
                  setSelectedReviewMovementIds([]);
                }}
              />
            )}

            <div className="space-y-3">
              <div
                className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
                style={{
                  backgroundColor: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="min-w-0">
                  <div
                    className="flex items-center gap-2 text-sm font-semibold"
                    style={{ color: "var(--color-text)" }}
                  >
                    <Files size={16} style={{ color: "var(--color-brand)" }} />
                    Arquivos do lote
                  </div>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {expandedImportFileIds.length} de {currentBatch.files.length} arquivo(s) aberto(s)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAllImportFilesExpanded(!allCurrentBatchFilesExpanded)
                  }
                  className="app-icon-control inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium sm:w-auto"
                >
                  <ChevronDown
                    size={16}
                    className={`transition ${
                      allCurrentBatchFilesExpanded ? "rotate-180" : ""
                    }`}
                  />
                  {allCurrentBatchFilesExpanded ? "Recolher todos" : "Expandir todos"}
                </button>
              </div>

              {currentBatch.files.map((file) => (
                <StatementImportFilePanel
                  key={file.id}
                  file={file}
                  isExpanded={expandedImportFileIdSet.has(file.id)}
                  onToggle={() => toggleImportFileExpansion(file.id)}
                  movementStatusFilter={movementStatusFilter}
                  onMovementStatusChange={handleMovementStatusChange}
                  onMovementReconciliationChange={
                    handleMovementReconciliationChange
                  }
                  onApplyCategorySuggestion={handleApplyCategorySuggestion}
                  onEditMovement={openMovementEditor}
                  updatingMovementId={updatingMovementId}
                  selectedMovementIds={selectedReviewMovementIds}
                  activeMovementId={
                    editingMovement?.id ?? activeReviewMovementId
                  }
                  onActivateMovement={setActiveReviewMovementId}
                  onMovementLineClick={handleReviewMovementLineClick}
                  onOpenSelectedActionsMenu={openSelectedReviewActionsMenu}
                  onMovementSelectionChange={handleReviewSelectionChange}
                  onSelectManyMovements={handleReviewSelectMany}
                />
              ))}
            </div>
          </div>
        )}

        {editingMovement && editingMovementFile && movementEditForm && (
          <MovementEditDialog
            movement={editingMovement}
            file={editingMovementFile}
            form={movementEditForm}
            accounts={activeAccounts}
            categories={activeCategories}
            isSaving={isSavingMovement}
            onChange={handleMovementEditChange}
            similarMovementCount={editingSimilarReviewMovementItems.length}
            onSelectSimilarMovements={handleSelectSimilarReviewMovements}
            onCreateCategory={(direction) =>
              openQuickCategoryDialog({
                direction,
                movementId: editingMovement.id,
                source: "movement",
              })
            }
            onClose={closeMovementEditor}
            onSubmit={handleMovementEditSubmit}
          />
        )}
        {quickCategoryContext && (
          <QuickCategoryDialog
            context={quickCategoryContext}
            name={quickCategoryName}
            icon={quickCategoryIcon}
            isSaving={isCreatingQuickCategory}
            onNameChange={setQuickCategoryName}
            onIconChange={setQuickCategoryIcon}
            onClose={closeQuickCategoryDialog}
            onSubmit={handleQuickCategorySubmit}
          />
        )}
        {batchRenameId &&
          createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-end bg-black/45 p-3 backdrop-blur-sm sm:items-center sm:justify-center"
              onMouseDown={closeBatchRename}
            >
              <form
                onSubmit={handleRenameBatch}
                onMouseDown={(event) => event.stopPropagation()}
                className="glass-heavy w-full rounded-2xl p-5 shadow-2xl sm:max-w-md"
                style={{
                  backgroundColor: "var(--color-bg-modal)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2
                      className="text-lg font-semibold"
                      style={{ color: "var(--color-text)" }}
                    >
                      Renomear lote
                    </h2>
                    <p
                      className="mt-1 text-sm"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {getBatchShortCode(batchRenameId)} continua disponível como referência.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Fechar"
                    title="Fechar"
                    onClick={closeBatchRename}
                    disabled={isRenamingBatch}
                    className="app-icon-control flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  >
                    <X size={17} />
                  </button>
                </div>

                <label
                  htmlFor="statement-import-batch-name"
                  className="mb-1 block text-sm font-medium"
                >
                  Nome do lote
                </label>
                <input
                  id="statement-import-batch-name"
                  value={batchRenameDraft}
                  onChange={(event) => setBatchRenameDraft(event.target.value)}
                  className="app-control w-full"
                  maxLength={120}
                  placeholder="Ex.: Nubank maio 2026"
                  autoFocus
                />
                <p className="mt-2 text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>
                  Deixe em branco para voltar ao rótulo automático pelo ID curto.
                </p>

                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeBatchRename}
                    disabled={isRenamingBatch}
                    className="app-icon-control inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isRenamingBatch}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                  >
                    {isRenamingBatch && <RefreshCw size={16} className="animate-spin" />}
                    Salvar nome
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )}
        <ConfirmModal
          isOpen={Boolean(batchToDeleteId)}
          message="Excluir este lote de importação? Arquivos e movimentos importados deste lote serão removidos. Lotes com movimentos aplicados ficam bloqueados para preservar a rastreabilidade financeira."
          confirmLabel="Excluir lote"
          onConfirm={() => void handleDeleteBatch()}
          onCancel={() => {
            if (!isDeletingBatch) {
              setBatchToDeleteId(null);
            }
          }}
        />
        <ConfirmModal
          isOpen={isApplyConfirmOpen}
          message="Revise o impacto antes de criar entidades financeiras reais."
          title="Aplicar movimentos prontos"
          confirmLabel="Aplicar prontos"
          maxWidthClassName="max-w-5xl"
          confirmButtonClassName="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400"
          onConfirm={() => void handleApplyReadyMovements()}
          onCancel={() => {
            if (!isApplyingReady) {
              setIsApplyConfirmOpen(false);
            }
          }}
        >
          <ApplyReadyConfirmationContent
            summary={applyReadySummary}
            movements={applyReadyMovementDetails}
          />
        </ConfirmModal>
        <ConfirmModal
          isOpen={isUndoConfirmOpen}
          message="Escolha exatamente quais aplicações deste lote devem ser desfeitas."
          title="Desfazer aplicados"
          confirmLabel="Desfazer aplicados"
          maxWidthClassName="max-w-5xl"
          confirmButtonClassName="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400"
          confirmDisabled={selectedUndoMovementIds.length === 0}
          confirmDisabledReason="selecione alguma coisa"
          onConfirm={() => void handleUndoAppliedMovements()}
          onCancel={() => {
            if (!isUndoingApplied) {
              setIsUndoConfirmOpen(false);
              setSelectedUndoMovementIds([]);
            }
          }}
        >
          <UndoAppliedConfirmationContent
            allSummary={undoAppliedSummary}
            selectedSummary={selectedUndoSummary}
            movements={undoAppliedMovementDetails}
            selectedMovementIds={selectedUndoMovementIds}
            onSelectionChange={handleUndoSelectionChange}
            onSelectMany={handleUndoSelectMany}
          />
        </ConfirmModal>
      </div>
    </Layout>
  );
}

function SelectedReviewActionsMenu({
  position,
  selectedCount,
  selectedCategoryLabel,
  selectedSuggestionCount,
  isApplying,
  isApplyingSuggestions,
  isUpdatingStatus,
  onClose,
  onReadySelected,
  onIgnoreSelected,
  onReviewSelected,
  onResetSelected,
  onApplyCategory,
  onApplySuggestions,
  onClearSelection,
}: {
  position: SelectedReviewActionsMenuPosition;
  selectedCount: number;
  selectedCategoryLabel: string | null;
  selectedSuggestionCount: number;
  isApplying: boolean;
  isApplyingSuggestions: boolean;
  isUpdatingStatus: boolean;
  onClose: () => void;
  onReadySelected: () => void;
  onIgnoreSelected: () => void;
  onReviewSelected: () => void;
  onResetSelected: () => void;
  onApplyCategory: () => void;
  onApplySuggestions: () => void;
  onClearSelection: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isBusy = isApplying || isApplyingSuggestions || isUpdatingStatus;
  const hasSelection = selectedCount > 0;
  const statusDisabledReason = isBusy
    ? "Aguarde a atualização atual terminar."
    : !hasSelection
      ? "Selecione movimentos para atualizar status."
      : null;
  const categoryDisabledReason = isApplying
    ? "Aguarde a aplicação da categoria terminar."
    : isUpdatingStatus || isApplyingSuggestions
      ? "Aguarde a atualização atual terminar."
      : !hasSelection
        ? "Selecione movimentos para aplicar categoria."
        : !selectedCategoryLabel
          ? "Escolha uma categoria no painel de selecionados."
          : null;
  const suggestionDisabledReason = isApplyingSuggestions
    ? "Aguarde a aplicação das sugestões terminar."
    : isApplying || isUpdatingStatus
      ? "Aguarde a atualização atual terminar."
      : selectedSuggestionCount === 0
        ? "Nenhuma sugestão segura nos selecionados."
        : null;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (menuRef.current?.contains(target)) {
        return;
      }

      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", onClose, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const renderAction = ({
    label,
    detail,
    icon: Icon,
    disabledReason,
    onClick,
    color = "var(--color-brand)",
  }: {
    label: string;
    detail: string;
    icon: LucideIcon;
    disabledReason: string | null;
    onClick: () => void;
    color?: string;
  }) => (
    <button
      type="button"
      title={disabledReason ?? label}
      disabled={Boolean(disabledReason)}
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg-input)",
        color: "var(--color-text)",
      }}
    >
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
        style={{
          borderColor: "var(--color-border)",
          color,
          backgroundColor: "var(--color-bg-muted-card)",
        }}
      >
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span
          className="mt-0.5 block text-xs leading-5"
          style={{ color: "var(--color-text-muted)" }}
        >
          {disabledReason ?? detail}
        </span>
      </span>
    </button>
  );

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Ações dos movimentos selecionados"
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-[10000] w-72 overflow-hidden rounded-xl border p-2 shadow-2xl"
      style={{
        left: position.x,
        top: position.y,
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg-solid)",
        boxShadow: "0 24px 60px rgba(15, 23, 42, 0.32)",
      }}
    >
      <div className="flex items-start justify-between gap-3 px-2 pb-2 pt-1">
        <div className="min-w-0">
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Ações dos selecionados
          </p>
          <p
            className="mt-0.5 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            {selectedCount} movimento(s)
          </p>
        </div>
        <button
          type="button"
          aria-label="Fechar menu"
          title="Fechar"
          onClick={onClose}
          className="app-icon-control flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        >
          <X size={15} />
        </button>
      </div>

      <div className="space-y-2">
        {renderAction({
          label: "Aplicar categoria",
          detail: selectedCategoryLabel
            ? selectedCategoryLabel
            : "Escolha uma categoria no painel.",
          icon: CheckCircle2,
          disabledReason: categoryDisabledReason,
          onClick: onApplyCategory,
          color: "var(--color-income)",
        })}
        {renderAction({
          label: "Aplicar sugestões",
          detail: `${selectedSuggestionCount} sugestão(ões) segura(s)`,
          icon: ListChecks,
          disabledReason: suggestionDisabledReason,
          onClick: onApplySuggestions,
          color: "var(--color-brand)",
        })}
        <div
          className="border-t"
          style={{ borderColor: "var(--color-border)" }}
        />
        {renderAction({
          label: "Marcar como pronto",
          detail: "Liberar selecionados válidos para aplicação.",
          icon: CheckCircle2,
          disabledReason: statusDisabledReason,
          onClick: onReadySelected,
          color: "var(--color-income)",
        })}
        {renderAction({
          label: "Ignorar selecionados",
          detail: "Não importar estes movimentos.",
          icon: XCircle,
          disabledReason: statusDisabledReason,
          onClick: onIgnoreSelected,
          color: "#dc2626",
        })}
        {renderAction({
          label: "Marcar revisão",
          detail: "Sinalizar para voltar depois.",
          icon: AlertTriangle,
          disabledReason: statusDisabledReason,
          onClick: onReviewSelected,
          color: "#d97706",
        })}
        {renderAction({
          label: "Voltar para novo",
          detail: "Reabrir a revisão destes movimentos.",
          icon: RefreshCw,
          disabledReason: statusDisabledReason,
          onClick: onResetSelected,
          color: "var(--color-brand)",
        })}
        {renderAction({
          label: "Limpar seleção",
          detail: "Remover todos do grupo atual.",
          icon: X,
          disabledReason: hasSelection ? null : "Nenhum movimento selecionado.",
          onClick: onClearSelection,
          color: "var(--color-text-muted)",
        })}
      </div>
    </div>,
    document.body,
  );
}

function BulkReviewCategoryPanel({
  totalEligibleCount,
  selectedCount,
  selectedDirections,
  categoryOptions,
  selectedCategoryId,
  isApplying,
  suggestedCategoryCount,
  isApplyingSuggestions,
  isUpdatingStatus,
  onCategoryChange,
  onApply,
  onApplySuggestions,
  onReadySelected,
  onIgnoreSelected,
  onReviewSelected,
  onResetSelected,
  onCreateCategory,
  onSelectAll,
  onClear,
}: {
  totalEligibleCount: number;
  selectedCount: number;
  selectedDirections: StatementMovementDirection[];
  categoryOptions: Category[];
  selectedCategoryId: string;
  isApplying: boolean;
  suggestedCategoryCount: number;
  isApplyingSuggestions: boolean;
  isUpdatingStatus: boolean;
  onCategoryChange: (categoryId: string) => void;
  onApply: () => void;
  onApplySuggestions: () => void;
  onReadySelected: () => void;
  onIgnoreSelected: () => void;
  onReviewSelected: () => void;
  onResetSelected: () => void;
  onCreateCategory: () => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const hasSelection = selectedCount > 0;
  const hasMixedDirections = selectedDirections.length > 1;
  const createDisabledReason = !hasSelection
    ? "Selecione movimentos para criar uma categoria contextual."
    : hasMixedDirections
      ? "Para criar categoria rápida, selecione apenas entradas ou apenas saídas."
      : null;
  const applyDisabledReason = isApplying
    ? "Aguarde a aplicação da categoria terminar."
    : isUpdatingStatus
      ? "Aguarde a atualização dos selecionados terminar."
      : isApplyingSuggestions
        ? "Aguarde a aplicação das sugestões terminar."
    : !hasSelection
      ? "Selecione movimentos para aplicar categoria."
      : !selectedCategoryId
        ? "Selecione uma categoria compatível."
        : null;
  const statusDisabledReason = isUpdatingStatus
    ? "Aguarde a atualização dos selecionados terminar."
    : isApplying
      ? "Aguarde a aplicação da categoria terminar."
      : isApplyingSuggestions
        ? "Aguarde a aplicação das sugestões terminar."
      : !hasSelection
        ? "Selecione movimentos para atualizar status."
        : null;
  const suggestionsDisabledReason = isApplyingSuggestions
    ? "Aguarde a aplicação das sugestões terminar."
    : isApplying || isUpdatingStatus
      ? "Aguarde a atualização atual terminar."
      : suggestedCategoryCount === 0
        ? "Nenhuma sugestão segura pendente neste lote."
        : null;

  return (
    <div
      className="glass rounded-2xl p-4"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Só com selecionados
            </p>
            <span
              className="rounded-full border px-2 py-0.5 text-xs font-medium"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-muted)",
              }}
            >
              {selectedCount} selecionado(s) de {totalEligibleCount} editáveis
            </span>
          </div>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            Use as checkboxes dos movimentos para aplicar categoria ou mudar
            status em massa sem sair da revisão.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[auto_auto_auto_minmax(14rem,1fr)_auto_auto_auto_auto_auto_auto]">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={
              totalEligibleCount === 0 ||
              isApplying ||
              isApplyingSuggestions ||
              isUpdatingStatus
            }
            className="h-10 rounded-lg border px-3 text-xs font-semibold transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            Selecionar editáveis
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={
              !hasSelection ||
              isApplying ||
              isApplyingSuggestions ||
              isUpdatingStatus
            }
            className="h-10 rounded-lg border px-3 text-xs font-semibold transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            Limpar seleção
          </button>
          <DisabledReasonTooltip reason={suggestionsDisabledReason}>
            <button
              type="button"
              title={suggestionsDisabledReason ?? "Aplicar sugestões de categoria"}
              onClick={onApplySuggestions}
              disabled={Boolean(suggestionsDisabledReason)}
              className="app-soft-button-info flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isApplyingSuggestions ? (
                <RefreshCw size={15} className="animate-spin" />
              ) : (
                <ListChecks size={15} />
              )}
              Aplicar sugestões ({suggestedCategoryCount})
            </button>
          </DisabledReasonTooltip>
          <select
            value={selectedCategoryId}
            onChange={(event) => onCategoryChange(event.target.value)}
            disabled={
              !hasSelection ||
              isApplying ||
              isApplyingSuggestions ||
              isUpdatingStatus
            }
            className="app-control h-10"
          >
            <option value="">
              {hasMixedDirections
                ? "Categorias mistas compatíveis"
                : "Categoria para selecionados"}
            </option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {formatCategoryLabel(category)} - {categoryKindLabel(category.kind)}
              </option>
            ))}
          </select>
          <DisabledReasonTooltip reason={createDisabledReason}>
            <button
              type="button"
              title={createDisabledReason ?? "Criar categoria"}
              aria-label="Criar categoria"
              onClick={onCreateCategory}
              disabled={
                Boolean(createDisabledReason) ||
                isApplying ||
                isApplyingSuggestions ||
                isUpdatingStatus
              }
              className="app-soft-button-info flex h-10 w-full items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-10"
            >
              <Plus size={17} />
            </button>
          </DisabledReasonTooltip>
          <DisabledReasonTooltip reason={statusDisabledReason}>
            <button
              type="button"
              title={statusDisabledReason ?? "Marcar selecionados como pronto"}
              onClick={onReadySelected}
              disabled={Boolean(statusDisabledReason)}
              className="app-soft-button-success flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdatingStatus ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              Marcar pronto
            </button>
          </DisabledReasonTooltip>
          <DisabledReasonTooltip reason={statusDisabledReason}>
            <button
              type="button"
              title={statusDisabledReason ?? "Ignorar selecionados"}
              onClick={onIgnoreSelected}
              disabled={Boolean(statusDisabledReason)}
              className="app-soft-button-warning flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdatingStatus ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <XCircle size={16} />
              )}
              Ignorar selecionados
            </button>
          </DisabledReasonTooltip>
          <DisabledReasonTooltip reason={statusDisabledReason}>
            <button
              type="button"
              title={statusDisabledReason ?? "Marcar selecionados com aviso"}
              onClick={onReviewSelected}
              disabled={Boolean(statusDisabledReason)}
              className="app-soft-button-warning flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdatingStatus ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <AlertTriangle size={16} />
              )}
              Marcar revisão
            </button>
          </DisabledReasonTooltip>
          <DisabledReasonTooltip reason={statusDisabledReason}>
            <button
              type="button"
              title={statusDisabledReason ?? "Voltar selecionados para novo"}
              onClick={onResetSelected}
              disabled={Boolean(statusDisabledReason)}
              className="flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              {isUpdatingStatus ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Voltar para novo
            </button>
          </DisabledReasonTooltip>
          <DisabledReasonTooltip reason={applyDisabledReason}>
            <button
              type="button"
              title={applyDisabledReason ?? "Aplicar categoria"}
              onClick={onApply}
              disabled={Boolean(applyDisabledReason)}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {isApplying ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {isApplying ? "Aplicando..." : "Aplicar categoria"}
            </button>
          </DisabledReasonTooltip>
        </div>
      </div>
    </div>
  );
}

function QuickCategoryDialog({
  context,
  name,
  icon,
  isSaving,
  onNameChange,
  onIconChange,
  onClose,
  onSubmit,
}: {
  context: QuickCategoryContext;
  name: string;
  icon: string;
  isSaving: boolean;
  onNameChange: (name: string) => void;
  onIconChange: (icon: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const kind = categoryKindFromDirection(context.direction);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border p-5 shadow-2xl"
        style={{
          backgroundColor: "var(--color-bg-solid)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Nova categoria
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              Natureza: {categoryKindLabel(kind)}
            </p>
          </div>
          <button
            type="button"
            title="Fechar"
            aria-label="Fechar"
            onClick={onClose}
            disabled={isSaving}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            <XCircle size={16} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className="app-control"
              maxLength={80}
              autoFocus
              required
            />
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              Ícone
            </label>
            <StoredIconPicker value={icon} onChange={onIconChange} />
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            {isSaving ? "Criando..." : "Criar categoria"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MovementEditDialog({
  movement,
  file,
  form,
  accounts,
  categories,
  isSaving,
  onChange,
  similarMovementCount,
  onSelectSimilarMovements,
  onCreateCategory,
  onClose,
  onSubmit,
}: {
  movement: ImportedMovement;
  file: StatementImportFile;
  form: MovementEditForm;
  accounts: FinancialAccount[];
  categories: Category[];
  isSaving: boolean;
  onChange: <K extends keyof MovementEditForm>(
    field: K,
    value: MovementEditForm[K],
  ) => void;
  similarMovementCount: number;
  onSelectSimilarMovements: () => void;
  onCreateCategory: (direction: StatementMovementDirection) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const reviewTypeOptions = getReviewTypeOptions(
    form.direction,
    form.reviewTarget,
  );
  const transferAccounts = accounts.filter(
    (account) => !account.isArchived && account.id !== file.financialAccountId,
  );
  const reviewCategories = categories.filter((category) =>
    categoryMatchesMovementDirection(category, form.direction),
  );
  const transferAccountLabel =
    form.direction === "IN" ? "Conta de origem" : "Conta de destino";
  const transferFlowLabel =
    form.direction === "IN"
      ? `${transferAccounts.find((account) => account.id === form.reviewTransferAccountId)?.name ?? "Outra conta"} -> ${
          file.financialAccount?.name ?? "conta do extrato"
        }`
      : `${file.financialAccount?.name ?? "Conta do extrato"} -> ${
          transferAccounts.find((account) => account.id === form.reviewTransferAccountId)?.name ?? "outra conta"
        }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <form
        onSubmit={onSubmit}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-2xl"
        style={{
          backgroundColor: "var(--color-bg-solid)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Editar movimento importado
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              Ao salvar, o movimento volta para revisão antes de ser aprovado.
            </p>
          </div>
          <button
            type="button"
            title="Fechar"
            aria-label="Fechar"
            onClick={onClose}
            disabled={isSaving}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            <XCircle size={16} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              Data
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(event) => onChange("date", event.target.value)}
              className="app-control"
              required
            />
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              Valor
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => onChange("amount", event.target.value)}
              className="app-control"
              placeholder="0,00"
              required
            />
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              Direção
            </label>
            <select
              value={form.direction}
              onChange={(event) =>
                onChange(
                  "direction",
                  event.target.value as StatementMovementDirection,
                )
              }
              className="app-control"
            >
              <option value="IN">Entrada</option>
              <option value="OUT">Saida</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              Movimento revisado
            </label>
            <select
              value={form.reviewTarget}
              onChange={(event) =>
                onChange(
                  "reviewTarget",
                  event.target.value as ImportedMovementReviewTarget,
                )
              }
              className="app-control"
            >
              <option value="TRANSACTION">Transação</option>
              <option value="TRANSFER">Transferência</option>
            </select>
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              Tipo revisado
            </label>
            <select
              value={form.rawType}
              onChange={(event) => onChange("rawType", event.target.value)}
              className="app-control"
              disabled={form.reviewTarget === "TRANSFER"}
              required
            >
              {reviewTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {form.reviewTarget === "TRANSACTION" && (
          <div className="mt-4">
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              Categoria revisada
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <select
                value={form.reviewCategoryId}
                onChange={(event) =>
                  onChange("reviewCategoryId", event.target.value)
                }
                className="app-control"
              >
                <option value="">Selecione uma categoria</option>
                {reviewCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {formatCategoryLabel(category)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Criar categoria"
                aria-label="Criar categoria"
                onClick={() => onCreateCategory(form.direction)}
                disabled={isSaving}
                className="app-soft-button-info flex h-11 w-11 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus size={17} />
              </button>
            </div>
            <div
              className="mt-3 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
              }}
            >
              <div className="min-w-0">
                <p
                  className="text-xs font-semibold"
                  style={{ color: "var(--color-text)" }}
                >
                  Mesma descrição
                </p>
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {similarMovementCount} movimento(s) editáveis com a mesma
                  descrição e direção.
                </p>
              </div>
              <button
                type="button"
                onClick={onSelectSimilarMovements}
                disabled={isSaving || similarMovementCount === 0}
                className="app-soft-button-info inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ListChecks size={15} />
                Selecionar similares
              </button>
            </div>
          </div>
        )}

        {form.reviewTarget === "TRANSFER" && (
          <div
            className="mt-4 rounded-xl border p-3"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg)",
            }}
          >
            <label
              className="mb-1 block text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              {transferAccountLabel}
            </label>
            <select
              value={form.reviewTransferAccountId}
              onChange={(event) =>
                onChange("reviewTransferAccountId", event.target.value)
              }
              className="app-control"
              required
            >
              <option value="">Selecione uma conta</option>
              {transferAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.institutionName ? ` - ${account.institutionName}` : ""}
                </option>
              ))}
            </select>
            <p
              className="mt-2 text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              Fluxo revisado: {transferFlowLabel}
            </p>
          </div>
        )}

        <div className="mt-4">
          <label
            className="mb-1 block text-sm font-medium"
            style={{ color: "var(--color-text)" }}
          >
            Descrição revisada
          </label>
          <textarea
            value={form.rawDescription}
            onChange={(event) => onChange("rawDescription", event.target.value)}
            className="app-control min-h-28 resize-y"
            maxLength={500}
            required
          />
        </div>

        <div
          className="mt-4 rounded-xl border p-3 text-xs"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
          Original: {formatDate(movement.date)} -{" "}
          {centsToCurrency(movement.amountCents)} -{" "}
          {directionLabel(movement.direction)} - {movement.rawType}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : null}
            Salvar revisão
          </button>
        </div>
      </form>
    </div>
  );
}

function MovementReviewHints({
  movement,
  isApplyingCategorySuggestion = false,
  onApplyCategorySuggestion,
}: {
  movement: ImportedMovement;
  isApplyingCategorySuggestion?: boolean;
  onApplyCategorySuggestion?: (movement: ImportedMovement) => void;
}) {
  const hints = movement.reviewHints;

  if (
    !hints ||
    (hints.reconciliationMatches.length === 0 &&
      !hints.categorySuggestion &&
      hints.flags.length === 0)
  ) {
    return (
      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        -
      </span>
    );
  }

  const categorySuggestion = hints.categorySuggestion;
  const canApplyCategorySuggestion =
    Boolean(categorySuggestion && onApplyCategorySuggestion) &&
    isBulkCategoryMovementEligible(movement) &&
    movement.reviewTarget === "TRANSACTION" &&
    movement.reviewCategoryId !== categorySuggestion?.categoryId;

  return (
    <div className="flex max-w-xs flex-wrap gap-1.5">
      {hints.reconciliationMatches.slice(0, 1).map((match) => (
        <span
          key={`${match.sourceType}-${match.sourceId}`}
          className="app-chip app-chip-warning px-2 py-1 text-xs font-medium"
          title={`${reviewSourceLabel(match.sourceType)}: ${match.label}`}
        >
          {reviewSourceLabel(match.sourceType)}
        </span>
      ))}

      {hints.reconciliationMatches.length > 0 && (
        <span
          className={`rounded-full border px-2 py-1 text-xs font-medium ${reconciliationStatusClass(movement.reconciliationStatus)}`}
          title={movement.reconciliationNote || undefined}
        >
          {reconciliationStatusLabel(movement.reconciliationStatus)}
        </span>
      )}

      {categorySuggestion && (
        canApplyCategorySuggestion ? (
          <button
            type="button"
            onClick={() => onApplyCategorySuggestion?.(movement)}
            disabled={isApplyingCategorySuggestion}
            className="app-chip app-chip-info px-2 py-1 text-xs font-medium transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
            title={`${categorySuggestion.basedOnCount} ocorrência(s) por descrição. Aplicar categoria sugerida.`}
          >
            {isApplyingCategorySuggestion ? (
              <RefreshCw size={12} className="mr-1 inline animate-spin" />
            ) : null}
            {formatStoredIconPrefix(categorySuggestion.categoryIcon)}
            {categorySuggestion.categoryName}
          </button>
        ) : (
          <span
            className="app-chip app-chip-info px-2 py-1 text-xs font-medium"
            title={`${categorySuggestion.basedOnCount} ocorrência(s) por descrição`}
          >
            {formatStoredIconPrefix(categorySuggestion.categoryIcon)}
            {categorySuggestion.categoryName}
          </span>
        )
      )}

      {hints.flags
        .filter(
          (flag) =>
            flag !== "POSSIBLE_LEDGER_MATCH" &&
            flag !== "RECONCILIATION_REQUIRED",
        )
        .slice(0, 1)
        .map((flag) => (
          <span
            key={flag}
            className={`rounded-full border px-2 py-1 text-xs font-medium ${reviewFlagClass(flag)}`}
          >
            {reviewFlagLabel(flag)}
          </span>
        ))}
    </div>
  );
}

const StatementImportFilePanel = memo(function StatementImportFilePanel({
  file,
  isExpanded,
  onToggle,
  movementStatusFilter,
  onMovementStatusChange,
  onMovementReconciliationChange,
  onApplyCategorySuggestion,
  onEditMovement,
  updatingMovementId,
  selectedMovementIds,
  activeMovementId,
  onActivateMovement,
  onMovementLineClick,
  onOpenSelectedActionsMenu,
  onMovementSelectionChange,
  onSelectManyMovements,
}: {
  file: StatementImportFile;
  isExpanded: boolean;
  onToggle: () => void;
  movementStatusFilter: MovementStatusFilter;
  onMovementStatusChange: (
    movementId: string,
    status: ReviewableMovementStatus,
  ) => void;
  onMovementReconciliationChange: (
    movementId: string,
    status: ReviewableReconciliationStatus,
  ) => void;
  onApplyCategorySuggestion: (movement: ImportedMovement) => void;
  onEditMovement: (movement: ImportedMovement, file: StatementImportFile) => void;
  updatingMovementId: string | null;
  selectedMovementIds: string[];
  activeMovementId: string | null;
  onActivateMovement: (movementId: string) => void;
  onMovementLineClick: (movementId: string) => void;
  onOpenSelectedActionsMenu: (
    event: ReactMouseEvent<HTMLElement>,
    movement: ImportedMovement,
  ) => void;
  onMovementSelectionChange: (
    movementId: string,
    shouldSelect: boolean,
  ) => void;
  onSelectManyMovements: (movementIds: string[], shouldSelect: boolean) => void;
}) {
  const selectedIds = new Set(selectedMovementIds);
  const warnings = getWarnings(file);
  const fileStatusCounts = getMovementStatusCounts(file.movements);
  const duplicateMovements = fileStatusCounts.DUPLICATE;
  const filePendingReviewCount = getPendingReviewCount(fileStatusCounts);
  const fileCompletionPercentage =
    getMovementCompletionPercentage(fileStatusCounts);
  const visibleMovements =
    movementStatusFilter === "ALL"
      ? file.movements
      : file.movements.filter(
          (movement) => movement.status === movementStatusFilter,
        );
  const [movementPageState, setMovementPageState] = useState({
    fileId: file.id,
    filter: movementStatusFilter,
    page: 1,
  });
  const totalMovementPages = Math.max(
    1,
    Math.ceil(visibleMovements.length / MOVEMENTS_PER_PAGE),
  );
  const requestedMovementPage =
    movementPageState.fileId === file.id &&
    movementPageState.filter === movementStatusFilter
      ? movementPageState.page
      : 1;
  const movementPage = Math.min(requestedMovementPage, totalMovementPages);
  const movementRangeStart =
    visibleMovements.length === 0
      ? 0
      : (movementPage - 1) * MOVEMENTS_PER_PAGE + 1;
  const movementRangeEnd = Math.min(
    movementPage * MOVEMENTS_PER_PAGE,
    visibleMovements.length,
  );
  const paginatedMovements = visibleMovements.slice(
    (movementPage - 1) * MOVEMENTS_PER_PAGE,
    movementPage * MOVEMENTS_PER_PAGE,
  );
  const visibleEligibleMovementIds = visibleMovements
    .filter(isBulkCategoryMovementEligible)
    .map((movement) => movement.id);
  const selectedVisibleEligibleCount = visibleEligibleMovementIds.filter(
    (movementId) => selectedIds.has(movementId),
  ).length;
  const visibleEligibleChecked =
    visibleEligibleMovementIds.length > 0 &&
    selectedVisibleEligibleCount === visibleEligibleMovementIds.length;

  return (
    <div
      className="glass rounded-2xl p-5"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className="break-all text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              {file.originalName}
            </h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(file.status)}`}
            >
              <StatusIcon status={file.status} />
              {fileStatusLabel(file.status)}
            </span>
          </div>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            {file.provider} {file.sourceType} - {formatFilePeriod(file)}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:items-end">
          <div
            className="flex min-w-0 items-center gap-2 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Fingerprint size={14} className="shrink-0" />
            <span className="truncate">{file.fileHash}</span>
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            className="app-icon-control inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium sm:w-auto"
          >
            <ChevronDown
              size={16}
              className={`transition ${isExpanded ? "rotate-180" : ""}`}
            />
            {isExpanded ? "Recolher movimentos" : "Revisar movimentos"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <InfoPill
          label="Conta"
          value={file.financialAccount?.name ?? "Sem conta"}
        />
        <InfoPill label="Movimentos" value={`${file.movements.length} total`} />
        <InfoPill
          label="No filtro"
          value={`${visibleMovements.length} visível(is)`}
        />
        <InfoPill
          label="Progresso"
          value={`${fileCompletionPercentage}% concluído`}
        />
        <InfoPill
          label="Pendentes"
          value={`${filePendingReviewCount} movimento(s)`}
        />
        <InfoPill
          label="Ignorados"
          value={`${fileStatusCounts.IGNORED} movimento(s)`}
        />
        <InfoPill
          label="Duplicados"
          value={`${duplicateMovements} movimento(s)`}
        />
      </div>

      {isExpanded ? (
        <>
      {visibleEligibleMovementIds.length > 0 && (
        <div
          className="mt-4 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg-muted-card)",
          }}
        >
          <label className="flex min-w-0 items-center gap-3">
            <input
              type="checkbox"
              checked={visibleEligibleChecked}
              onChange={(event) =>
                onSelectManyMovements(
                  visibleEligibleMovementIds,
                  event.target.checked,
                )
              }
              className="app-checkbox"
            />
            <span className="min-w-0">
              <span
                className="block text-sm font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                Selecionar transações editáveis deste filtro
              </span>
              <span
                className="block text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                {selectedVisibleEligibleCount} de{" "}
                {visibleEligibleMovementIds.length} selecionada(s)
              </span>
            </span>
          </label>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {warnings.map((warning) => (
            <p
              key={warning}
              className="app-inline-alert app-inline-alert-warning px-3 py-2 text-sm"
            >
              {warning}
            </p>
          ))}
        </div>
      )}

      {file.movements.length === 0 && (
        <div
          className="mt-5 rounded-xl border p-4 text-sm"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
          Nenhum movimento salvo para este arquivo.
        </div>
      )}

      {file.movements.length > 0 && visibleMovements.length === 0 && (
        <div
          className="mt-5 rounded-xl border p-4 text-sm"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
          Nenhum movimento neste filtro.
        </div>
      )}

      {visibleMovements.length > 0 && (
        <>
          <div className="mt-5 space-y-3 md:hidden">
            {paginatedMovements.map((movement) => (
              <MovementCard
                key={movement.id}
                movement={movement}
                readinessIssue={getMovementReadinessIssue(movement, file)}
                onStatusChange={onMovementStatusChange}
                onReconciliationChange={onMovementReconciliationChange}
                onApplyCategorySuggestion={onApplyCategorySuggestion}
                onEditMovement={(selectedMovement) =>
                  onEditMovement(selectedMovement, file)
                }
                isUpdating={updatingMovementId === movement.id}
                isChecked={selectedIds.has(movement.id)}
                isActive={
                  selectedIds.has(movement.id) ||
                  activeMovementId === movement.id
                }
                canSelect={isBulkCategoryMovementEligible(movement)}
                onActivateMovement={onActivateMovement}
                onMovementLineClick={onMovementLineClick}
                onOpenSelectedActionsMenu={onOpenSelectedActionsMenu}
                onSelectionChange={onMovementSelectionChange}
              />
            ))}
          </div>

          <div className="mt-5 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1180px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th
                    className="w-12 px-4 py-3 text-left text-sm font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Sel.
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Data
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Status
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Revisão
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Tipo revisado
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Descrição
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Sugestões
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Direção
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedMovements.map((movement) => {
                  const canSelectMovement =
                    isBulkCategoryMovementEligible(movement);
                  const isMovementChecked = selectedIds.has(movement.id);
                  const isMovementActive =
                    isMovementChecked || activeMovementId === movement.id;

                  return (
                    <tr
                      key={movement.id}
                      onClick={(event) => {
                        if (isInteractiveMovementTarget(event.target)) {
                          return;
                        }

                        onMovementLineClick(movement.id);
                      }}
                      onContextMenu={(event) => {
                        if (isInteractiveMovementTarget(event.target)) {
                          return;
                        }

                        onOpenSelectedActionsMenu(event, movement);
                      }}
                      className="cursor-pointer transition"
                      style={{
                        borderBottom: "1px solid var(--color-border)",
                        backgroundColor: isMovementActive
                          ? "var(--color-bg-muted-card-hover)"
                          : "transparent",
                        boxShadow: isMovementActive
                          ? "inset 4px 0 0 var(--color-brand)"
                          : undefined,
                      }}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isMovementChecked}
                          onChange={(event) => {
                            onActivateMovement(movement.id);
                            onMovementSelectionChange(
                              movement.id,
                              event.target.checked,
                            );
                          }}
                          disabled={!canSelectMovement}
                          title={
                            canSelectMovement
                              ? "Selecionar para categorizar"
                              : "Somente transações editáveis podem ser categorizadas em massa"
                          }
                          className="app-checkbox"
                        />
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-sm"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {formatDate(movement.date)}
                      </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(movement.status)}`}
                      >
                        <StatusIcon status={movement.status} />
                        {movementStatusLabel(movement.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <MovementStatusActions
                        movement={movement}
                        readinessIssue={getMovementReadinessIssue(
                          movement,
                          file,
                        )}
                        onStatusChange={onMovementStatusChange}
                        onReconciliationChange={
                          onMovementReconciliationChange
                        }
                        onEditMovement={(selectedMovement) =>
                          onEditMovement(selectedMovement, file)
                        }
                        isUpdating={updatingMovementId === movement.id}
                      />
                    </td>
                    <td
                      className="px-4 py-3 text-sm font-medium"
                      style={{ color: "var(--color-text)" }}
                    >
                      <div>{movement.rawType}</div>
                      {movement.reviewTarget === "TRANSFER" && (
                        <div
                          className="mt-1 text-xs font-normal"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          Outra conta:{" "}
                          {movement.reviewTransferAccount?.name ?? "pendente"}
                        </div>
                      )}
                      {movement.reviewTarget !== "TRANSFER" &&
                        movement.reviewCategory && (
                          <div
                            className="mt-1 text-xs font-normal"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {formatCategoryLabel(movement.reviewCategory)}
                          </div>
                        )}
                    </td>
                    <td
                      className="max-w-md px-4 py-3 text-sm"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <span className="line-clamp-2">
                        {movement.rawDescription || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <MovementReviewHints
                        movement={movement}
                        isApplyingCategorySuggestion={
                          updatingMovementId === movement.id
                        }
                        onApplyCategorySuggestion={onApplyCategorySuggestion}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${directionClass(movement.direction)}`}
                      >
                        <DirectionIcon direction={movement.direction} />
                        {directionLabel(movement.direction)}
                      </span>
                    </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold"
                        style={{ color: "var(--color-text)" }}
                      >
                        {centsToCurrency(movement.amountCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {visibleMovements.length > MOVEMENTS_PER_PAGE && (
            <PaginationControls
              className="mt-4"
              label={`${movementRangeStart}-${movementRangeEnd} de ${visibleMovements.length} movimentos`}
              page={movementPage}
              totalPages={totalMovementPages}
              onPageChange={(page) =>
                setMovementPageState({
                  fileId: file.id,
                  filter: movementStatusFilter,
                  page,
                })
              }
            />
          )}
        </>
      )}
        </>
      ) : (
        <div
          className="mt-5 rounded-xl border p-4 text-sm"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg)",
            color: "var(--color-text-muted)",
          }}
        >
          Movimentos recolhidos. Abra este arquivo para revisar os{" "}
          {visibleMovements.length} movimento(s) do filtro atual.
        </div>
      )}
    </div>
  );
});

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <p
        className="mt-0.5 truncate text-sm font-medium"
        style={{ color: "var(--color-text)" }}
      >
        {value}
      </p>
    </div>
  );
}

function ApplySummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <p
        className="truncate text-sm font-semibold"
        style={{ color: "var(--color-text)" }}
      >
        {value}
      </p>
    </div>
  );
}

function PaginationControls({
  page,
  totalPages,
  label,
  onPageChange,
  className = "",
}: {
  page: number;
  totalPages: number;
  label: string;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Pagina anterior"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text)",
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <span
          className="min-w-16 text-center text-sm font-medium"
          style={{ color: "var(--color-text)" }}
        >
          {page}/{totalPages}
        </span>
        <button
          type="button"
          title="Próxima página"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="flex h-9 w-9 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text)",
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function UndoAppliedConfirmationContent({
  allSummary,
  selectedSummary,
  movements,
  selectedMovementIds,
  onSelectionChange,
  onSelectMany,
}: {
  allSummary: ApplyReadySummary;
  selectedSummary: ApplyReadySummary;
  movements: UndoAppliedMovementDetail[];
  selectedMovementIds: string[];
  onSelectionChange: (movementId: string, shouldSelect: boolean) => void;
  onSelectMany: (movementIds: string[], shouldSelect: boolean) => void;
}) {
  const selectedIds = new Set(selectedMovementIds);
  const allMovementIds = movements.map((movement) => movement.id);
  const allSelected =
    movements.length > 0 &&
    movements.every((movement) => selectedIds.has(movement.id));
  const batchGroups = movements.reduce<
    Array<{
      batchId: string;
      batchLabel: string;
      movements: UndoAppliedMovementDetail[];
    }>
  >((groups, movement) => {
    const group = groups.find((item) => item.batchId === movement.batchId);

    if (group) {
      group.movements.push(movement);
    } else {
      groups.push({
        batchId: movement.batchId,
        batchLabel: movement.batchLabel,
        movements: [movement],
      });
    }

    return groups;
  }, []);

  return (
    <div className="space-y-5">
      <div
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg)",
        }}
      >
        <ApplySummaryMetric
          label="Selecionados"
          value={`${selectedSummary.totalCount} de ${allSummary.totalCount}`}
        />
        <ApplySummaryMetric
          label="Transações"
          value={`${selectedSummary.transactionCount}`}
        />
        <ApplySummaryMetric
          label="Transferências"
          value={`${selectedSummary.transferCount}`}
        />
        <ApplySummaryMetric
          label="Entradas / saídas"
          value={`${centsToCurrency(selectedSummary.inCents)} / ${centsToCurrency(selectedSummary.outCents)}`}
        />
        <div className="min-w-0">
          <p
            className="text-[11px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Saldo líquido
          </p>
          <p className="truncate text-sm font-semibold text-rose-700">
            {centsToCurrency(selectedSummary.netCents)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div
          className="overflow-hidden rounded-xl border"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg)",
          }}
        >
          <div
            className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: "var(--color-border)" }}
          >
            <label className="flex min-w-0 items-center gap-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) =>
                  onSelectMany(allMovementIds, event.target.checked)
                }
                className="app-checkbox"
              />
              <span className="min-w-0">
                <span
                  className="block text-sm font-semibold"
                  style={{ color: "var(--color-text)" }}
                >
                  Todas as aplicações do lote aberto
                </span>
                <span
                  className="block text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Use os grupos abaixo para desfazer apenas parte do lote.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelectMany(allMovementIds, true)}
                className="app-soft-button-danger rounded-lg px-3 py-2 text-xs font-semibold transition"
              >
                Selecionar tudo
              </button>
              <button
                type="button"
                onClick={() => onSelectMany(allMovementIds, false)}
                className="app-soft-button-muted rounded-lg px-3 py-2 text-xs font-semibold transition"
              >
                Limpar seleção
              </button>
            </div>
          </div>

          <div className="max-h-[28rem] overflow-y-auto p-3">
            {batchGroups.map((batchGroup) => {
              const batchMovementIds = batchGroup.movements.map(
                (movement) => movement.id,
              );
              const batchSelectedCount = batchMovementIds.filter((movementId) =>
                selectedIds.has(movementId),
              ).length;
              const batchChecked =
                batchMovementIds.length > 0 &&
                batchSelectedCount === batchMovementIds.length;

              return (
                <div key={batchGroup.batchId} className="space-y-3">
                  <div className="app-inline-alert app-inline-alert-danger p-3">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={batchChecked}
                        onChange={(event) =>
                          onSelectMany(batchMovementIds, event.target.checked)
                        }
                        className="app-checkbox mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-rose-900">
                          {batchGroup.batchLabel}
                        </span>
                        <span className="block text-xs text-rose-800">
                          {batchSelectedCount} de {batchMovementIds.length}{" "}
                          selecionada(s)
                        </span>
                      </span>
                    </label>
                  </div>

                  {Object.values(
                    batchGroup.movements.reduce<
                      Record<
                        string,
                        {
                          fileId: string;
                          fileName: string;
                          movements: UndoAppliedMovementDetail[];
                        }
                      >
                    >((files, movement) => {
                      files[movement.fileId] ??= {
                        fileId: movement.fileId,
                        fileName: movement.fileName,
                        movements: [],
                      };
                      files[movement.fileId].movements.push(movement);
                      return files;
                    }, {}),
                  ).map((fileGroup) => {
                    const fileMovementIds = fileGroup.movements.map(
                      (movement) => movement.id,
                    );
                    const fileSelectedCount = fileMovementIds.filter(
                      (movementId) => selectedIds.has(movementId),
                    ).length;
                    const fileChecked =
                      fileMovementIds.length > 0 &&
                      fileSelectedCount === fileMovementIds.length;

                    return (
                      <div
                        key={fileGroup.fileId}
                        className="rounded-xl border p-3"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: "var(--color-bg-card)",
                        }}
                      >
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={fileChecked}
                            onChange={(event) =>
                              onSelectMany(
                                fileMovementIds,
                                event.target.checked,
                              )
                            }
                            className="app-checkbox mt-0.5"
                          />
                          <span className="min-w-0">
                            <span
                              className="block truncate text-sm font-semibold"
                              style={{ color: "var(--color-text)" }}
                            >
                              {fileGroup.fileName}
                            </span>
                            <span
                              className="block text-xs"
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              {fileSelectedCount} de {fileMovementIds.length}{" "}
                              alterações
                            </span>
                          </span>
                        </label>

                        <div className="mt-3 divide-y divide-gray-100">
                          {fileGroup.movements.map((movement) => {
                            const isSelected = selectedIds.has(movement.id);

                            return (
                              <label
                                key={movement.id}
                                className={`grid cursor-pointer grid-cols-[auto_1fr] gap-3 px-1 py-3 transition first:pt-0 last:pb-0 ${
                                  isSelected ? "bg-rose-50/50" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(event) =>
                                    onSelectionChange(
                                      movement.id,
                                      event.target.checked,
                                    )
                                  }
                                  className="app-checkbox mt-1"
                                />
                                <span className="min-w-0">
                                  <span className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <span className="min-w-0">
                                      <span
                                        className="block truncate text-sm font-semibold"
                                        style={{ color: "var(--color-text)" }}
                                      >
                                        {movement.description}
                                      </span>
                                      <span
                                        className="mt-1 block text-xs"
                                        style={{
                                          color: "var(--color-text-muted)",
                                        }}
                                      >
                                        {formatDate(movement.date)} -{" "}
                                        {movement.entityLabel} -{" "}
                                        {movement.destinationLabel}
                                      </span>
                                      <span
                                        className="mt-1 block text-xs"
                                        style={{
                                          color: "var(--color-text-muted)",
                                        }}
                                      >
                                        {movement.sourceAccountName}
                                        {movement.appliedAt
                                          ? ` - aplicado em ${formatDate(movement.appliedAt)}`
                                          : ""}
                                      </span>
                                    </span>
                                    <span
                                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${directionClass(movement.direction)}`}
                                    >
                                      {centsToCurrency(movement.amountCents)}
                                    </span>
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-rose-200 bg-rose-50 shadow-sm">
            <div className="grid grid-cols-[4px_1fr]">
              <div className="bg-rose-500" aria-hidden="true" />
              <div className="p-4">
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                    <Undo2 size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-rose-900">
                      O desfazer remove lancamentos financeiros reais.
                    </p>
                    <p className="mt-1 text-sm leading-5 text-rose-800">
                      Apenas as aplicações selecionadas serão excluídas. Os
                      movimentos voltam para Pronto e continuam revisáveis no
                      lote.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {selectedSummary.totalCount === 0 && (
            <div className="app-inline-alert app-inline-alert-warning px-4 py-3 text-sm font-medium">
              Selecione alguma coisa para liberar o botão de desfazer.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ApplyReadyConfirmationContent({
  summary,
  movements,
}: {
  summary: ApplyReadySummary;
  movements: ApplyReadyMovementDetail[];
}) {
  const netTone =
    summary.netCents > 0
      ? "text-green-700"
      : summary.netCents < 0
        ? "text-red-700"
        : "text-blue-700";
  const invoiceWarningCount = movements.filter(
    (movement) => movement.hasInvoicePaymentWarning,
  ).length;

  return (
    <div className="mb-5 space-y-4">
      <div
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg)",
        }}
      >
        <ApplySummaryMetric
          label="Movimentos"
          value={`${summary.totalCount}`}
        />
        <ApplySummaryMetric
          label="Transações"
          value={`${summary.transactionCount}`}
        />
        <ApplySummaryMetric
          label="Transferências"
          value={`${summary.transferCount}`}
        />
        <ApplySummaryMetric
          label="Entradas / saídas"
          value={`${centsToCurrency(summary.inCents)} / ${centsToCurrency(summary.outCents)}`}
        />
        <div className="min-w-0">
          <p
            className="text-[11px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Saldo líquido
          </p>
          <p className={`truncate text-sm font-semibold ${netTone}`}>
            {centsToCurrency(summary.netCents)}
          </p>
        </div>
      </div>

      <div className="app-inline-alert app-inline-alert-warning px-4 py-3">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Esta ação cria registros financeiros reais.
            </p>
            <p className="mt-1 text-sm leading-5" style={{ color: "var(--color-text-muted)" }}>
              O lote permanece como origem auditável. A exclusão direta de
              entidades criadas por importação fica bloqueada; use Desfazer
              aplicados no próprio lote quando precisar reverter.
            </p>
          </div>
        </div>
      </div>

      {invoiceWarningCount > 0 && (
        <div className="app-inline-alert app-inline-alert-danger overflow-hidden shadow-sm">
          <div className="grid grid-cols-[4px_1fr]">
            <div className="bg-red-500" aria-hidden="true" />
            <div className="p-4">
              <div className="flex gap-3">
                <div className="app-soft-button-danger flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  <AlertTriangle size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                      Confirme pagamentos de fatura antes de aplicar
                    </p>
                    <span className="app-chip app-chip-danger px-2 py-0.5 text-[11px] font-semibold">
                      {invoiceWarningCount} no lote
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-5" style={{ color: "var(--color-text-muted)" }}>
                    Esses itens podem duplicar despesas se as compras da fatura
                    já estiverem registradas individualmente.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ApplyReadyConfirmationGrid movements={movements} />
    </div>
  );
}

function ApplyReadyConfirmationGrid({
  movements,
}: {
  movements: ApplyReadyMovementDetail[];
}) {
  const [columnWidths, setColumnWidths] = useState<number[]>(() =>
    APPLY_CONFIRMATION_COLUMNS.map((column) => column.defaultWidth),
  );

  if (movements.length === 0) {
    return null;
  }

  const gridTemplateColumns = columnWidths
    .map((width) => `${width}px`)
    .join(" ");

  const handleColumnResizeStart = (columnIndex: number, startClientX: number) => {
    const startWidth = columnWidths[columnIndex];
    const minWidth = APPLY_CONFIRMATION_COLUMNS[columnIndex].minWidth;

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = Math.max(
        minWidth,
        startWidth + event.clientX - startClientX,
      );

      setColumnWidths((current) =>
        current.map((width, index) =>
          index === columnIndex ? nextWidth : width,
        ),
      );
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div
        className="flex flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div>
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Movimentos que serão aplicados
          </p>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Confira conta, destino, arquivo de origem e valor.
          </p>
        </div>
        <span className="app-chip app-chip-success inline-flex w-fit items-center gap-1 px-2.5 py-1 text-xs font-medium">
          <CheckCircle2 size={13} />
          {movements.length} pronto(s)
        </span>
      </div>

      <div className="max-h-[24rem] overflow-y-auto">
        <div className="space-y-3 p-3 md:hidden">
          {movements.map((movement) => (
            <div
              key={movement.id}
              className="rounded-lg border p-3"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-semibold"
                    style={{ color: "var(--color-text)" }}
                  >
                    {movement.description}
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {formatDate(movement.date)} -{" "}
                    {movement.reviewTarget === "TRANSFER"
                      ? "Transferência"
                      : "Transação"}
                  </p>
                  {movement.hasInvoicePaymentWarning && (
                    <span className="app-chip app-chip-danger mt-2 inline-flex px-2 py-0.5 text-[11px] font-semibold">
                      Risco de duplicidade
                    </span>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${directionClass(movement.direction)}`}
                >
                  {centsToCurrency(movement.amountCents)}
                </span>
              </div>
              <div
                className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2"
                style={{ color: "var(--color-text-muted)" }}
              >
                <span className="truncate">
                  <strong>Conta:</strong> {movement.sourceAccountName}
                </span>
                <span className="truncate">
                  <strong>Destino:</strong> {movement.destinationLabel}
                </span>
                <span className="truncate sm:col-span-2">
                  <strong>Arquivo:</strong> {movement.sourceFileName}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden min-w-full md:block">
          <div
            className="sticky top-0 grid w-max min-w-full select-none border-b text-xs font-semibold"
            style={{
              gridTemplateColumns,
              backgroundColor: "var(--color-bg-modal)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-muted)",
            }}
          >
            {APPLY_CONFIRMATION_COLUMNS.map((column, index) => (
              <div
                key={column.key}
                className={`relative flex min-w-0 items-center px-4 py-2 ${
                  column.key === "amount" ? "justify-end" : ""
                }`}
              >
                <span className="truncate">{column.label}</span>
                {index < APPLY_CONFIRMATION_COLUMNS.length - 1 && (
                  <button
                    type="button"
                    aria-label={`Redimensionar coluna ${column.label}`}
                    title="Arraste para redimensionar"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      handleColumnResizeStart(index, event.clientX);
                    }}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none border-r border-transparent transition hover:border-blue-400 hover:bg-blue-100/60"
                  />
                )}
              </div>
            ))}
          </div>
          {movements.map((movement) => (
            <div
              key={movement.id}
              className={`grid w-max min-w-full border-b text-sm last:border-b-0 ${
                movement.hasInvoicePaymentWarning ? "bg-red-50/60" : ""
              }`}
              style={{
                gridTemplateColumns,
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              <span className="whitespace-nowrap px-4 py-3">
                {formatDate(movement.date)}
              </span>
              <span className="px-4 py-3">
                {movement.reviewTarget === "TRANSFER"
                  ? "Transferência"
                  : "Transação"}
              </span>
              <span className="truncate px-4 py-3" title={movement.description}>
                {movement.description}
                {movement.hasInvoicePaymentWarning && (
                  <span className="app-chip app-chip-danger ml-2 px-1.5 py-0.5 text-[10px] font-semibold">
                    Duplicidade
                  </span>
                )}
              </span>
              <span className="truncate px-4 py-3" title={movement.typeLabel}>
                {movement.typeLabel}
              </span>
              <span
                className="truncate px-4 py-3"
                title={movement.destinationLabel}
              >
                {movement.destinationLabel}
              </span>
              <span
                className="truncate px-4 py-3"
                title={movement.sourceAccountName}
              >
                {movement.sourceAccountName}
              </span>
              <span
                className="truncate px-4 py-3"
                title={movement.sourceFileName}
              >
                {movement.sourceFileName}
              </span>
              <span className="px-4 py-3 text-right font-semibold">
                {centsToCurrency(movement.amountCents)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MovementStatusActions = memo(function MovementStatusActions({
  movement,
  readinessIssue,
  onStatusChange,
  onReconciliationChange,
  onEditMovement,
  isUpdating,
}: {
  movement: ImportedMovement;
  readinessIssue: string | null;
  onStatusChange: (
    movementId: string,
    status: ReviewableMovementStatus,
  ) => void;
  onReconciliationChange: (
    movementId: string,
    status: ReviewableReconciliationStatus,
  ) => void;
  onEditMovement: (movement: ImportedMovement) => void;
  isUpdating: boolean;
}) {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [statusMenuPosition, setStatusMenuPosition] =
    useState<MovementStatusMenuPosition | null>(null);
  const statusButtonRef = useRef<HTMLButtonElement | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  const closeStatusMenu = useCallback(() => {
    setIsStatusMenuOpen(false);
    setStatusMenuPosition(null);
  }, []);

  const updateStatusMenuPosition = useCallback(() => {
    const button = statusButtonRef.current;
    if (!button) {
      return;
    }

    if (window.innerWidth < 768) {
      setStatusMenuPosition({
        mode: "sheet",
        left: window.innerWidth / 2,
        top: window.innerHeight,
        placement: "bottom",
        maxHeight: Math.max(360, window.innerHeight - 64),
      });
      return;
    }

    const rect = button.getBoundingClientRect();
    const menuWidth = 288;
    const viewportMargin = 16;
    const preferredLeft = rect.left + rect.width / 2;
    const minLeft = viewportMargin + menuWidth / 2;
    const maxLeft = window.innerWidth - viewportMargin - menuWidth / 2;
    const left =
      minLeft > maxLeft
        ? window.innerWidth / 2
        : Math.min(Math.max(preferredLeft, minLeft), maxLeft);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placement =
      spaceBelow < 320 && spaceAbove > spaceBelow ? "top" : "bottom";
    const top = placement === "bottom" ? rect.bottom + 8 : rect.top - 8;
    const maxHeight =
      placement === "bottom"
        ? Math.max(220, spaceBelow - 24)
        : Math.max(220, spaceAbove - 24);

    setStatusMenuPosition({ mode: "popover", left, top, placement, maxHeight });
  }, []);

  useEffect(() => {
    if (!isStatusMenuOpen) {
      return;
    }

    const handleViewportChange = () => updateStatusMenuPosition();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeStatusMenu();
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        statusButtonRef.current?.contains(target) ||
        statusMenuRef.current?.contains(target)
      ) {
        return;
      }

      closeStatusMenu();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeStatusMenu, isStatusMenuOpen, updateStatusMenuPosition]);

  useEffect(() => {
    if (!isStatusMenuOpen || statusMenuPosition?.mode !== "sheet") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isStatusMenuOpen, statusMenuPosition?.mode]);

  if (movement.status === "APPLIED") {
    const appliedLink = getAppliedMovementLink(movement);
    const appliedTitle = movement.appliedAt
      ? `Abrir ${appliedLink?.label.toLowerCase() ?? "entidade"} aplicada em ${formatDate(movement.appliedAt)}`
      : `Abrir ${appliedLink?.label.toLowerCase() ?? "entidade"} aplicada`;

    if (appliedLink) {
      return (
        <Link
          to={appliedLink.href}
          title={appliedTitle}
          className="app-soft-button-success inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition"
        >
          <FileSearch size={15} />
          {appliedLink.label}
        </Link>
      );
    }

    return (
      <span className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-gray-500">
        {movementStatusLabel(movement.status)}
      </span>
    );
  }

  const editDisabledReason = isUpdating
    ? "Aguarde a atualização do movimento terminar."
    : null;

  const movementStatusButtonClass =
    movement.status === "READY"
      ? "app-soft-button-success"
      : movement.status === "IGNORED"
        ? "app-soft-button-danger"
        : movement.status === "NEEDS_REVIEW"
          ? "app-soft-button-warning"
          : movement.status === "DUPLICATE"
            ? "app-soft-button-warning"
            : "app-soft-button-muted";

  const statusItems: MovementMenuItem[] = MOVEMENT_REVIEW_ACTIONS.map(
    (action) => {
      const isActive = movement.status === action.status;
      const isReadyBlocked =
        action.status === "READY" && Boolean(readinessIssue);
      const disabledReason = isUpdating
        ? "Aguarde a atualização do movimento terminar."
        : isActive
          ? `Movimento já está como ${movementStatusLabel(action.status).toLowerCase()}.`
          : isReadyBlocked
            ? readinessIssue
            : null;

      return {
        key: action.status,
        label: action.label,
        description:
          action.status === "READY"
            ? "Liberar para aplicação"
            : action.status === "IGNORED"
              ? "Não importar este movimento"
              : action.status === "NEEDS_REVIEW"
                ? "Sinalizar para voltar depois"
                : "Reabrir como movimento novo",
        title: action.title,
        icon: action.icon,
        disabledReason,
        isCurrent: isActive,
        onSelect: () => onStatusChange(movement.id, action.status),
        tone:
          action.status === "READY"
            ? "success"
            : action.status === "IGNORED"
              ? "danger"
              : action.status === "NEEDS_REVIEW"
                ? "warning"
                : "default",
      };
    },
  );

  const reconciliationItems: MovementMenuItem[] = hasLedgerReconciliationMatch(
    movement,
  )
    ? [
        {
          key: "reconciliation-unique",
          label: "Confirmar novo",
          description: "Não duplicar com o ledger",
          title: "Confirmar que não duplica o ledger",
          icon: CheckCircle2,
          disabledReason: isUpdating
            ? "Aguarde a atualização do movimento terminar."
            : movement.reconciliationStatus === "CONFIRMED_UNIQUE"
              ? "Movimento já foi confirmado como novo."
              : null,
          isCurrent: movement.reconciliationStatus === "CONFIRMED_UNIQUE",
          onSelect: () =>
            onReconciliationChange(movement.id, "CONFIRMED_UNIQUE"),
          tone: "success",
        },
        {
          key: "reconciliation-duplicate",
          label: "Ignorar duplicado",
          description: "Confirmar duplicidade",
          title: "Confirmar duplicidade e ignorar",
          icon: XCircle,
          disabledReason: isUpdating
            ? "Aguarde a atualização do movimento terminar."
            : movement.reconciliationStatus === "CONFIRMED_DUPLICATE"
              ? "Movimento já foi confirmado como duplicidade."
              : null,
          isCurrent: movement.reconciliationStatus === "CONFIRMED_DUPLICATE",
          onSelect: () =>
            onReconciliationChange(movement.id, "CONFIRMED_DUPLICATE"),
          tone: "danger",
        },
      ]
    : [];

  const renderMenuItem = (item: MovementMenuItem) => {
    const Icon = item.icon;
    const toneClass =
      item.tone === "success"
        ? "text-[var(--color-income)] hover:opacity-85"
        : item.tone === "danger"
          ? "text-[var(--color-expense)] hover:opacity-85"
          : item.tone === "warning"
            ? "text-amber-600 hover:opacity-85"
            : "hover:opacity-85";
    const iconClass =
      item.tone === "success"
        ? "app-soft-button-success"
        : item.tone === "danger"
          ? "app-soft-button-danger"
          : item.tone === "warning"
            ? "app-soft-button-warning"
            : "app-soft-button-muted";
    const disabledClass = item.disabledReason
      ? "opacity-60"
      : "hover:shadow-sm";

    return (
      <button
        key={item.key}
        type="button"
        title={item.disabledReason ?? item.title}
        disabled={Boolean(item.disabledReason)}
        onClick={() => {
          if (item.disabledReason) {
            return;
          }

          closeStatusMenu();
          item.onSelect();
        }}
        className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition disabled:cursor-not-allowed ${toneClass} ${disabledClass}`}
      >
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold">{item.label}</span>
            {item.isCurrent && (
              <span className="app-chip app-chip-info px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Atual
              </span>
            )}
          </span>
          <span
            className="mt-0.5 block text-xs leading-5"
            style={{ color: "var(--color-text-muted)" }}
          >
            {item.isCurrent ? item.description : item.disabledReason ?? item.description}
          </span>
        </span>
      </button>
    );
  };

  const renderMenuContent = (showCloseButton: boolean) => (
    <div className="max-h-full overflow-y-auto rounded-xl">
      <div
        className="flex items-start justify-between gap-3 border-b px-4 py-3"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg-solid)",
        }}
      >
        <div className="min-w-0">
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Movimento
          </p>
          <p
            className="mt-0.5 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            Status atual: {movementStatusLabel(movement.status)}
          </p>
        </div>
        {showCloseButton && (
          <button
            type="button"
            onClick={closeStatusMenu}
            aria-label="Fechar menu de status"
            title="Fechar"
            className="app-icon-control flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="p-2">
        <p
          className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-text-muted)" }}
        >
          Status
        </p>
        {statusItems.map(renderMenuItem)}
      </div>

      {reconciliationItems.length > 0 && (
        <div className="px-2 pb-2">
          <div
            className="mb-1 border-t"
            style={{ borderColor: "var(--color-border)" }}
          />
          <p
            className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Conciliação
          </p>
          {reconciliationItems.map(renderMenuItem)}
        </div>
      )}
    </div>
  );

  const statusMenu =
    isStatusMenuOpen && statusMenuPosition
      ? createPortal(
          statusMenuPosition.mode === "sheet" ? (
            <div className="fixed inset-0 z-[9999] flex items-end bg-black/40 px-3 pb-3 pt-16 md:hidden">
              <div
                ref={statusMenuRef}
                role="dialog"
                aria-modal="true"
                aria-label="Alterar status do movimento"
                className="w-full overflow-hidden rounded-t-2xl border shadow-2xl"
                style={{
                  maxHeight: statusMenuPosition.maxHeight,
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg-solid)",
                  boxShadow: "0 -24px 60px rgba(15, 23, 42, 0.35)",
                }}
              >
                <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-slate-300" />
                {renderMenuContent(true)}
              </div>
            </div>
          ) : (
            <div
              ref={statusMenuRef}
              className="fixed z-[9999] w-72 max-w-[calc(100vw-2rem)] overflow-visible rounded-xl border shadow-2xl"
              style={{
                left: statusMenuPosition.left,
                top: statusMenuPosition.top,
                maxHeight: statusMenuPosition.maxHeight,
                transform:
                  statusMenuPosition.placement === "bottom"
                    ? "translateX(-50%)"
                    : "translate(-50%, -100%)",
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-solid)",
                boxShadow: "0 24px 60px rgba(15, 23, 42, 0.30)",
              }}
            >
              <span
                className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 ${
                  statusMenuPosition.placement === "bottom"
                    ? "top-0 -translate-y-1/2 border-l border-t"
                    : "bottom-0 translate-y-1/2 border-b border-r"
                }`}
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg-solid)",
                }}
              />
              {renderMenuContent(false)}
            </div>
          ),
          document.body,
        )
      : null;

  return (
    <div className="flex flex-nowrap items-center gap-1.5">
      <DisabledReasonTooltip reason={editDisabledReason}>
        <button
          type="button"
          title={editDisabledReason ?? "Editar movimento"}
          aria-label="Editar movimento"
          onClick={() => onEditMovement(movement)}
          disabled={isUpdating}
          className="app-icon-control flex h-9 w-9 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Pencil size={16} />
        </button>
      </DisabledReasonTooltip>

      <div className="relative">
        <button
          ref={statusButtonRef}
          type="button"
          title="Alterar status do movimento"
          aria-label="Alterar status do movimento"
          aria-expanded={isStatusMenuOpen}
          onClick={() => {
            if (isStatusMenuOpen) {
              closeStatusMenu();
              return;
            }

            updateStatusMenuPosition();
            setIsStatusMenuOpen(true);
          }}
          disabled={isUpdating}
          className={`inline-flex h-9 w-[7.25rem] min-w-0 items-center justify-between gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${movementStatusButtonClass}`}
        >
          {isUpdating ? (
            <RefreshCw size={15} className="animate-spin" />
          ) : (
            <StatusIcon status={movement.status} />
          )}
          <span className="min-w-0 flex-1 truncate text-left">
            {movementStatusLabel(movement.status)}
          </span>
          <ChevronDown
            size={14}
            className={`transition ${isStatusMenuOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {statusMenu}
    </div>
  );
});

const MovementCard = memo(function MovementCard({
  movement,
  readinessIssue,
  onStatusChange,
  onReconciliationChange,
  onApplyCategorySuggestion,
  onEditMovement,
  isUpdating,
  isChecked,
  isActive,
  canSelect,
  onActivateMovement,
  onMovementLineClick,
  onOpenSelectedActionsMenu,
  onSelectionChange,
}: {
  movement: ImportedMovement;
  readinessIssue: string | null;
  onStatusChange: (
    movementId: string,
    status: ReviewableMovementStatus,
  ) => void;
  onReconciliationChange: (
    movementId: string,
    status: ReviewableReconciliationStatus,
  ) => void;
  onApplyCategorySuggestion: (movement: ImportedMovement) => void;
  onEditMovement: (movement: ImportedMovement) => void;
  isUpdating: boolean;
  isChecked: boolean;
  isActive: boolean;
  canSelect: boolean;
  onActivateMovement: (movementId: string) => void;
  onMovementLineClick: (movementId: string) => void;
  onOpenSelectedActionsMenu: (
    event: ReactMouseEvent<HTMLElement>,
    movement: ImportedMovement,
  ) => void;
  onSelectionChange: (movementId: string, shouldSelect: boolean) => void;
}) {
  const handleCardClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isInteractiveMovementTarget(event.target)) {
      return;
    }

    onMovementLineClick(movement.id);
  };

  const handleCardContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isInteractiveMovementTarget(event.target)) {
      return;
    }

    onOpenSelectedActionsMenu(event, movement);
  };

  return (
    <div
      onClick={handleCardClick}
      onContextMenu={handleCardContextMenu}
      className="cursor-pointer rounded-xl border p-4 transition"
      style={{
        borderColor: isActive ? "var(--color-brand)" : "var(--color-border)",
        backgroundColor: isActive
          ? "var(--color-bg-muted-card-hover)"
          : "var(--color-bg)",
        boxShadow: isActive ? "inset 4px 0 0 var(--color-brand)" : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(event) => {
              onActivateMovement(movement.id);
              onSelectionChange(movement.id, event.target.checked);
            }}
            disabled={!canSelect}
            title={
              canSelect
                ? "Selecionar para categorizar"
                : "Somente transações editáveis podem ser categorizadas em massa"
            }
            className="app-checkbox mt-1"
          />
          <div className="min-w-0">
          <p
            className="break-words text-sm font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            {movement.rawType}
          </p>
          {movement.reviewTarget === "TRANSFER" && (
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              Outra conta: {movement.reviewTransferAccount?.name ?? "pendente"}
            </p>
          )}
          {movement.reviewTarget !== "TRANSFER" && movement.reviewCategory && (
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              {formatCategoryLabel(movement.reviewCategory)}
            </p>
          )}
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            {formatDate(movement.date)}
          </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(movement.status)}`}
        >
          {movementStatusLabel(movement.status)}
        </span>
      </div>
      <p
        className="mt-3 break-words text-xs leading-5"
        style={{ color: "var(--color-text-muted)" }}
      >
        {movement.rawDescription || "Sem descrição"}
      </p>
      <div className="mt-3">
        <MovementReviewHints
          movement={movement}
          isApplyingCategorySuggestion={isUpdating}
          onApplyCategorySuggestion={onApplyCategorySuggestion}
        />
      </div>
      {readinessIssue && (
        <p className="app-inline-alert app-inline-alert-warning mt-3 px-3 py-2 text-xs font-medium">
          {readinessIssue}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${directionClass(movement.direction)}`}
        >
          <DirectionIcon direction={movement.direction} />
          {directionLabel(movement.direction)}
        </span>
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          {centsToCurrency(movement.amountCents)}
        </p>
      </div>
      <div className="mt-3">
        <MovementStatusActions
          movement={movement}
          readinessIssue={readinessIssue}
          onStatusChange={onStatusChange}
          onReconciliationChange={onReconciliationChange}
          onEditMovement={onEditMovement}
          isUpdating={isUpdating}
        />
      </div>
    </div>
  );
});
