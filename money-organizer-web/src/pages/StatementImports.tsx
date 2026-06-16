import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileSearch,
  FileUp,
  Files,
  Fingerprint,
  Landmark,
  ListFilter,
  Pencil,
  RefreshCw,
  type LucideIcon,
  Upload,
  XCircle,
} from "lucide-react";
import ConfirmModal from "../components/ConfirmModal";
import { Layout } from "../components/Layout";
import { getCategories } from "../api/categories";
import { getFinancialAccounts } from "../api/financialAccounts";
import {
  applyReadyImportedMovements,
  createStatementImportBatch,
  getStatementImportBatch,
  getStatementImportBatches,
  updateImportedMovement,
  updateImportedMovementStatus,
} from "../api/statementImports";
import { formatStoredIconPrefix } from "../components/storedIconRegistry";
import type {
  Category,
  FinancialAccount,
  ImportedMovement,
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
  "NEW" | "IGNORED" | "READY"
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

type ReviewTypeOption = {
  value: string;
  label: string;
};

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
    status: "NEW",
    label: "Novo",
    title: "Voltar para novo",
    icon: RefreshCw,
  },
];

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
    { value: "DEBITO", label: "Debito" },
    { value: "CREDITO", label: "Credito" },
    { value: "BOLETO", label: "Boleto" },
    { value: "DINHEIRO", label: "Dinheiro" },
    { value: "COMPRA", label: "Compra" },
    { value: "OUTRA_SAIDA", label: "Outra saida" },
  ],
};

function centsToCurrency(cents?: number | null): string {
  return formatCurrency((cents ?? 0) / 100);
}

function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2);
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

function inputValueToCents(value: string): number | undefined {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  return Math.round(amount * 100);
}

function dateInputValue(date: string): string {
  return date.slice(0, 10);
}

function directionLabel(direction: StatementMovementDirection): string {
  return direction === "IN" ? "Entrada" : "Saida";
}

function normalizeReviewTypeValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getReviewTypeOptions(
  direction: StatementMovementDirection,
  reviewTarget: ImportedMovementReviewTarget,
): ReviewTypeOption[] {
  if (reviewTarget === "TRANSFER") {
    return [{ value: TRANSFER_REVIEW_TYPE, label: "Transferencia" }];
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

function getDefaultReviewCategoryId(
  categories: Category[],
  movement: ImportedMovement,
): string {
  const activeCategories = categories.filter((category) => !category.isArchived);

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

function getMovementReadinessIssue(
  movement: ImportedMovement,
  file: StatementImportFile,
): string | null {
  if (movement.amountCents <= 0) {
    return "Informe um valor positivo";
  }

  if (!movement.rawDescription.trim()) {
    return "Informe uma descricao revisada";
  }

  if (!file.financialAccountId) {
    return "Selecione a conta do extrato";
  }

  if (movement.reviewTarget === "TRANSFER") {
    if (!movement.reviewTransferAccountId) {
      return "Informe a outra conta da transferencia";
    }

    if (movement.reviewTransferAccountId === file.financialAccountId) {
      return "Use contas diferentes na transferencia";
    }

    return null;
  }

  const rawType = normalizeReviewTypeValue(movement.rawType);
  const validType = getReviewTypeOptions(
    movement.direction,
    "TRANSACTION",
  ).some((option) => option.value === rawType);

  if (!validType) {
    return "Revise o tipo da transacao";
  }

  if (!movement.reviewCategoryId) {
    return "Informe a categoria revisada";
  }

  return null;
}

function directionClass(direction: StatementMovementDirection): string {
  return direction === "IN"
    ? "bg-green-100 text-green-700"
    : "bg-red-100 text-red-700";
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
    REVIEWING: "Em revisao",
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
    TRANSACTION: "Transacao",
    TRANSFER: "Transferencia",
    BALANCE_ADJUSTMENT: "Ajuste",
  };

  return labels[sourceType] ?? sourceType;
}

function reviewFlagLabel(flag: string): string {
  const labels: Record<string, string> = {
    POSSIBLE_LEDGER_MATCH: "Possivel match",
    PIX_REQUIRES_MANUAL_TRANSFER_REVIEW: "Pix: revisar transferencia",
  };

  return labels[flag] ?? flag;
}

function statusClass(
  status:
    | StatementImportBatchStatus
    | StatementImportFileStatus
    | ImportedMovementStatus,
): string {
  if (status === "DUPLICATE") {
    return "bg-yellow-100 text-yellow-700";
  }

  if (status === "FAILED" || status === "CANCELED") {
    return "bg-red-100 text-red-700";
  }

  if (status === "APPLIED" || status === "READY" || status === "PARSED") {
    return "bg-green-100 text-green-700";
  }

  return "bg-blue-100 text-blue-700";
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

function getBatchMovementStatusCounts(
  batch: StatementImportBatch | null,
): Record<MovementStatusFilter, number> {
  const movements = batch?.files.flatMap((file) => file.movements) ?? [];
  const counts: Record<MovementStatusFilter, number> = {
    ALL: movements.length,
    NEW: 0,
    DUPLICATE: 0,
    IGNORED: 0,
    READY: 0,
    NEEDS_REVIEW: 0,
    APPLIED: 0,
  };

  movements.forEach((movement) => {
    counts[movement.status] += 1;
  });

  return counts;
}

function getSummaryMovementCount(summary: StatementImportBatchSummary): number {
  return summary.files.reduce(
    (total, file) => total + file._count.movements,
    0,
  );
}

function formatFilePeriod(
  file: Pick<StatementImportFile, "periodStart" | "periodEnd">,
): string {
  if (!file.periodStart || !file.periodEnd) {
    return "Periodo nao identificado";
  }

  return `${formatDate(file.periodStart)} a ${formatDate(file.periodEnd)}`;
}

function formatBatchPeriod(batch: StatementImportBatch | null): string {
  if (!batch) {
    return "Periodo nao identificado";
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
    return "Periodo nao identificado";
  }

  return `${formatDate(starts[0])} a ${formatDate(ends[ends.length - 1])}`;
}

function getWarnings(file: StatementImportFile): string[] {
  return (file.warnings ?? []).filter(
    (warning): warning is string => typeof warning === "string",
  );
}

function formatBatchSummaryLabel(summary: StatementImportBatchSummary): string {
  return `${formatDate(summary.createdAt)} - ${summary.files.length} arquivo(s), ${getSummaryMovementCount(summary)} movimento(s)`;
}

function getAppliedMovementLink(movement: ImportedMovement) {
  if (movement.appliedTransactionId) {
    return {
      href: `/transactions?edit=${encodeURIComponent(movement.appliedTransactionId)}`,
      label: "Transacao",
    };
  }

  if (movement.appliedTransferId) {
    return {
      href: `/transfers?edit=${encodeURIComponent(movement.appliedTransferId)}`,
      label: "Transferencia",
    };
  }

  return null;
}

export function StatementImports() {
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
  const [isSavingMovement, setIsSavingMovement] = useState(false);
  const [isApplyingReady, setIsApplyingReady] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isLoadingBatches, setIsLoadingBatches] = useState(true);
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

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

        const latestBatchId = summaries[0]?.id;
        if (latestBatchId) {
          setSelectedBatchId(latestBatchId);
          setIsLoadingBatch(true);

          try {
            const batchResponse = await getStatementImportBatch(latestBatchId);
            if (isActive) {
              setCurrentBatch(batchResponse.data);
            }
          } catch {
            if (isActive) {
              toast.error("Erro ao carregar o lote mais recente.");
            }
          } finally {
            if (isActive) {
              setIsLoadingBatch(false);
            }
          }
        }
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

  const loadBatch = async (batchId: string) => {
    if (!batchId) {
      setSelectedBatchId("");
      setCurrentBatch(null);
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
  };

  const refreshBatches = async (preferredBatchId?: string) => {
    try {
      setIsLoadingBatches(true);
      const response = await getStatementImportBatches();
      setBatchSummaries(response.data);

      const nextBatchId =
        preferredBatchId ||
        (response.data.some((summary) => summary.id === selectedBatchId)
          ? selectedBatchId
          : response.data[0]?.id);

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
      setSelectedFiles([]);
      form.reset();
      await refreshBatches(response.data.id);
      toast.success("Lote salvo para revisao!");
    } catch {
      toast.error("Erro ao criar lote de importacao.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleMovementStatusChange = async (
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
  };

  const openMovementEditor = (
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
  };

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

        return {
          ...current,
          direction,
          rawType,
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
      toast.error("Tipo e descricao sao obrigatorios.");
      return;
    }

    if (movementEditForm.reviewTarget === "TRANSFER") {
      if (!editingMovementFile.financialAccountId) {
        toast.error("Selecione a conta do extrato antes de revisar transferencia.");
        return;
      }

      if (!movementEditForm.reviewTransferAccountId) {
        toast.error("Informe a outra conta da transferencia.");
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
      toast.success("Movimento atualizado para revisao.");
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

    try {
      setIsApplyingReady(true);
      setIsApplyConfirmOpen(false);
      const response = await applyReadyImportedMovements(currentBatch.id);
      setCurrentBatch(response.data.batch);
      await refreshBatches(response.data.batch.id);
      toast.success(
        `${response.data.appliedCount} movimento(s) aplicado(s): ${response.data.transactionCount} transacao(oes), ${response.data.transferCount} transferencia(s).`,
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Erro ao aplicar movimentos prontos."));
    } finally {
      setIsApplyingReady(false);
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
            Importacao de extratos
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
              Criar e revisar lotes nao altera saldo. A aplicacao financeira
              acontece apenas ao usar "Aplicar prontos", depois da revisao.
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
              <button
                type="submit"
                disabled={isUploading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 lg:w-auto"
              >
                {isUploading ? <FileSearch size={16} /> : <Upload size={16} />}
                {isUploading ? "Salvando..." : "Criar lote"}
              </button>
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <label
                className="mb-1 block text-sm font-medium"
                style={{ color: "var(--color-text)" }}
              >
                Lotes salvos
              </label>
              <select
                value={selectedBatchId}
                onChange={(event) => void loadBatch(event.target.value)}
                className="app-control"
                disabled={isLoadingBatches || batchSummaries.length === 0}
              >
                <option value="">Nenhum lote salvo</option>
                {batchSummaries.map((summary) => (
                  <option key={summary.id} value={summary.id}>
                    {formatBatchSummaryLabel(summary)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              title="Atualizar lotes"
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
          </div>
        </div>

        {isLoadingBatch && (
          <div
            className="glass flex min-h-[12rem] flex-col items-center justify-center rounded-2xl p-6 text-center"
            style={{
              backgroundColor: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
            }}
          >
            <Clock3 size={34} style={{ color: "var(--color-text-muted)" }} />
            <p
              className="mt-3 text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              Carregando lote...
            </p>
          </div>
        )}

        {!isLoadingBatch && !currentBatch && (
          <div
            className="glass flex min-h-[12rem] flex-col items-center justify-center rounded-2xl p-6 text-center"
            style={{
              backgroundColor: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
            }}
          >
            <FileUp size={34} style={{ color: "var(--color-text-muted)" }} />
            <p
              className="mt-3 text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              Nenhum lote persistido encontrado.
            </p>
          </div>
        )}

        {!isLoadingBatch && currentBatch && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Lote",
                  value: `#${currentBatch.id.slice(0, 8)}`,
                  detail: batchStatusLabel(currentBatch.status),
                  icon: Files,
                },
                {
                  label: "Arquivos",
                  value: String(currentBatch.files.length),
                  detail: `${movementCount} movimento(s)`,
                  icon: FileSearch,
                },
                {
                  label: "Periodo",
                  value: formatBatchPeriod(currentBatch),
                  detail: formatDate(currentBatch.createdAt),
                  icon: Landmark,
                },
                {
                  label: "Duplicidades",
                  value: String(totals.duplicateCount),
                  detail: `${centsToCurrency(totals.inCents)} / ${centsToCurrency(totals.outCents)}`,
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
                  Aplicacao financeira
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {movementStatusCounts.READY} movimento(s) pronto(s) para
                  criar transacoes ou transferencias revisadas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsApplyConfirmOpen(true)}
                disabled={isApplyingReady || movementStatusCounts.READY === 0}
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400 sm:w-auto"
              >
                {isApplyingReady ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {isApplyingReady ? "Aplicando..." : "Aplicar prontos"}
              </button>
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

            <div className="space-y-5">
              {currentBatch.files.map((file) => (
                <StatementImportFilePanel
                  key={file.id}
                  file={file}
                  movementStatusFilter={movementStatusFilter}
                  onMovementStatusChange={handleMovementStatusChange}
                  onEditMovement={openMovementEditor}
                  updatingMovementId={updatingMovementId}
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
            onClose={closeMovementEditor}
            onSubmit={handleMovementEditSubmit}
          />
        )}
        <ConfirmModal
          isOpen={isApplyConfirmOpen}
          message={`Aplicar ${movementStatusCounts.READY} movimento(s) pronto(s)? Essa acao cria transacoes ou transferencias reais e passa a impactar os saldos calculados. Movimentos aplicados nao ficam editaveis na revisao.`}
          confirmLabel="Aplicar prontos"
          onConfirm={() => void handleApplyReadyMovements()}
          onCancel={() => {
            if (!isApplyingReady) {
              setIsApplyConfirmOpen(false);
            }
          }}
        />
      </div>
    </Layout>
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
              Ao salvar, o movimento volta para revisao antes de ser aprovado.
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
              Direcao
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
              <option value="TRANSACTION">Transacao</option>
              <option value="TRANSFER">Transferencia</option>
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
            <select
              value={form.reviewCategoryId}
              onChange={(event) =>
                onChange("reviewCategoryId", event.target.value)
              }
              className="app-control"
            >
              <option value="">Selecione uma categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {formatCategoryLabel(category)}
                </option>
              ))}
            </select>
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
            Descricao revisada
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
            Salvar revisao
          </button>
        </div>
      </form>
    </div>
  );
}

function MovementReviewHints({ movement }: { movement: ImportedMovement }) {
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

  return (
    <div className="flex max-w-xs flex-wrap gap-1.5">
      {hints.reconciliationMatches.slice(0, 1).map((match) => (
        <span
          key={`${match.sourceType}-${match.sourceId}`}
          className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700"
          title={`${reviewSourceLabel(match.sourceType)}: ${match.label}`}
        >
          {reviewSourceLabel(match.sourceType)}
        </span>
      ))}

      {hints.categorySuggestion && (
        <span
          className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700"
          title={`${hints.categorySuggestion.basedOnCount} ocorrencia(s) por descricao`}
        >
          {formatStoredIconPrefix(hints.categorySuggestion.categoryIcon)}
          {hints.categorySuggestion.categoryName}
        </span>
      )}

      {hints.flags
        .filter((flag) => flag !== "POSSIBLE_LEDGER_MATCH")
        .slice(0, 1)
        .map((flag) => (
          <span
            key={flag}
            className="rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700"
          >
            {reviewFlagLabel(flag)}
          </span>
        ))}
    </div>
  );
}

function StatementImportFilePanel({
  file,
  movementStatusFilter,
  onMovementStatusChange,
  onEditMovement,
  updatingMovementId,
}: {
  file: StatementImportFile;
  movementStatusFilter: MovementStatusFilter;
  onMovementStatusChange: (
    movementId: string,
    status: ReviewableMovementStatus,
  ) => void;
  onEditMovement: (movement: ImportedMovement, file: StatementImportFile) => void;
  updatingMovementId: string | null;
}) {
  const warnings = getWarnings(file);
  const duplicateMovements = file.movements.filter(
    (movement) => movement.status === "DUPLICATE",
  ).length;
  const visibleMovements =
    movementStatusFilter === "ALL"
      ? file.movements
      : file.movements.filter(
          (movement) => movement.status === movementStatusFilter,
        );

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
              className="break-words text-lg font-semibold"
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

        <div
          className="flex min-w-0 items-center gap-2 text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          <Fingerprint size={14} className="shrink-0" />
          <span className="truncate">{file.fileHash}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <InfoPill
          label="Conta"
          value={file.financialAccount?.name ?? "Sem conta"}
        />
        <InfoPill label="Movimentos" value={`${file.movements.length} total`} />
        <InfoPill
          label="No filtro"
          value={`${visibleMovements.length} visivel(is)`}
        />
        <InfoPill
          label="Duplicados"
          value={`${duplicateMovements} movimento(s)`}
        />
      </div>

      {warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-700"
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
            {visibleMovements.map((movement) => (
              <MovementCard
                key={movement.id}
                movement={movement}
                readinessIssue={getMovementReadinessIssue(movement, file)}
                onStatusChange={onMovementStatusChange}
                onEditMovement={(selectedMovement) =>
                  onEditMovement(selectedMovement, file)
                }
                isUpdating={updatingMovementId === movement.id}
              />
            ))}
          </div>

          <div className="mt-5 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1120px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
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
                    Revisao
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
                    Descricao
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Sugestoes
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Direcao
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
                {visibleMovements.map((movement) => (
                  <tr
                    key={movement.id}
                    style={{ borderBottom: "1px solid var(--color-border)" }}
                  >
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
                      <MovementReviewHints movement={movement} />
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

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

function movementActionClass(
  status: ReviewableMovementStatus,
  isActive: boolean,
  isBlocked = false,
): string {
  if (isActive) {
    return "border-blue-600 bg-blue-600 text-white";
  }

  if (isBlocked) {
    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }

  if (status === "READY") {
    return "border-green-200 bg-green-50 text-green-700 hover:bg-green-100";
  }

  if (status === "IGNORED") {
    return "border-red-200 bg-red-50 text-red-700 hover:bg-red-100";
  }

  return "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100";
}

function MovementStatusActions({
  movement,
  readinessIssue,
  onStatusChange,
  onEditMovement,
  isUpdating,
}: {
  movement: ImportedMovement;
  readinessIssue: string | null;
  onStatusChange: (
    movementId: string,
    status: ReviewableMovementStatus,
  ) => void;
  onEditMovement: (movement: ImportedMovement) => void;
  isUpdating: boolean;
}) {
  if (movement.status === "APPLIED") {
    const appliedLink = getAppliedMovementLink(movement);

    if (appliedLink) {
      return (
        <Link
          to={appliedLink.href}
          title={`Abrir ${appliedLink.label.toLowerCase()} aplicada`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 text-xs font-medium text-green-700 transition hover:bg-green-100"
        >
          <FileSearch size={14} />
          {appliedLink.label}
        </Link>
      );
    }

    return (
      <span className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-gray-500">
        {movementStatusLabel(movement.status)}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        title="Editar movimento"
        aria-label="Editar movimento"
        onClick={() => onEditMovement(movement)}
        disabled={isUpdating}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Pencil size={14} />
      </button>

      {MOVEMENT_REVIEW_ACTIONS.map((action) => {
        const Icon = action.icon;
        const isActive = movement.status === action.status;
        const isReadyBlocked =
          action.status === "READY" && Boolean(readinessIssue);

        return (
          <button
            key={action.status}
            type="button"
            title={isReadyBlocked ? readinessIssue ?? action.title : action.title}
            aria-label={action.title}
            onClick={() => onStatusChange(movement.id, action.status)}
            disabled={isUpdating || isActive || isReadyBlocked}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-60 ${movementActionClass(action.status, isActive, isReadyBlocked)}`}
          >
            {isUpdating ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Icon size={14} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function MovementCard({
  movement,
  readinessIssue,
  onStatusChange,
  onEditMovement,
  isUpdating,
}: {
  movement: ImportedMovement;
  readinessIssue: string | null;
  onStatusChange: (
    movementId: string,
    status: ReviewableMovementStatus,
  ) => void;
  onEditMovement: (movement: ImportedMovement) => void;
  isUpdating: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
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
        {movement.rawDescription || "Sem descricao"}
      </p>
      <div className="mt-3">
        <MovementReviewHints movement={movement} />
      </div>
      {readinessIssue && (
        <p className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-xs font-medium text-yellow-700">
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
          onEditMovement={onEditMovement}
          isUpdating={isUpdating}
        />
      </div>
    </div>
  );
}
