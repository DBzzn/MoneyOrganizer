export function formatPartialFileHash(fileHash: string): string {
  const normalizedHash = fileHash.trim();

  if (!normalizedHash) {
    return "indisponivel";
  }

  if (normalizedHash.length <= 12) {
    return `${normalizedHash.slice(0, 6)}...`;
  }

  return `${normalizedHash.slice(0, 8)}...${normalizedHash.slice(-6)}`;
}

export function formatMaskedStatementAccount(
  accountNumber?: string | null,
): string {
  const digits = accountNumber?.replace(/\D/g, "") ?? "";

  if (!digits) {
    return "Nao identificada";
  }

  return `**** ${digits.slice(-4)}`;
}

function formatMaskedDigitSequence(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "****";
  }

  return `**** ${digits.slice(-4)}`;
}

function maskLongDigitSequence(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length < 7) {
    return value;
  }

  return `${"*".repeat(Math.max(digits.length - 4, 4))}${digits.slice(-4)}`;
}

export function maskSensitiveFileName(fileName: string): string {
  return fileName.replace(/\d[\d.-]{5,}\d/g, (sequence) =>
    /^\d{4}-\d{2}-\d{2}$/.test(sequence)
      ? sequence
      : maskLongDigitSequence(sequence),
  );
}

export function maskSensitiveMovementDescription(description: string): string {
  const value = description.trim();

  if (!value || value === "-") {
    return value || "-";
  }

  return value
    .replace(
      /[\d*.•]{3}\.[\d*.•]{3}\.[\d*.•]{3}-[\d*.•]{2}/g,
      "***.***.***-**",
    )
    .replace(
      /[\d*.•]{2}\.[\d*.•]{3}\.[\d*.•]{3}\/[\d*.•]{4}-[\d*.•]{2}/g,
      "**.***.***/****-**",
    )
    .replace(
      /\b(CPF|CNPJ)\s*:?\s*[\d*.•./-]{6,}/gi,
      (_match, label: string) => `${label}: ****`,
    )
    .replace(
      /\b(Ag[eê]ncia|Agencia)\s*:?\s*[\dA-Za-z.-]{1,16}/gi,
      (_match, label: string) => `${label}: ****`,
    )
    .replace(
      /\b(Conta)\s*:?\s*([\d.-]{4,})/gi,
      (_match, label: string, account: string) =>
        `${label}: ${formatMaskedDigitSequence(account)}`,
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[email mascarado]",
    );
}
