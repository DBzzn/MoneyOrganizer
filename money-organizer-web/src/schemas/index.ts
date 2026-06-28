import { z } from 'zod'

export const loginSchema = z.object({
    email: z
        .string()
        .min(1, 'o Email é obrigatório')
        .email('Email inválido'),
    password: z
        .string()
        .min(1, 'a Senha é obrigatória'),
});

export const registerSchema = z.object({
    name: z
        .string()
        .min(1, 'o Nome é obrigatório'),
    email: z
        .string()
        .min(1, 'o Email é obrigatório')
        .email('Email inválido'),
    password: z
        .string()
        .min(6, 'a Senha deve ter no mínimo 6 caracteres'),
})

export const transactionSchema = z.object({
    type: z.enum([
        'CREDIT_CASH',
        'CREDIT_INSTALLMENT',
        'DEBIT',
        'PIX',
        'CASH',
        'INCOME',
    ]),
    amount: z.number().min(0.01, 'O valor deve ser maior que zero!'),
    date: z.string().min(1, 'a Data é obrigatória!'),
    categoryId: z.string().min(1, 'a Categoria é obrigatória!'),
    financialAccountId: z.string().min(1, 'A conta é obrigatória!'),
    isPending: z.boolean(),
    description: z.string().optional()
})

export const updateTransactionSchema = z.object({
  type: z.enum([
    'CREDIT_CASH',
    'CREDIT_INSTALLMENT',
    'DEBIT',
    'PIX',
    'CASH',
    'INCOME',
  ]).optional(),
  amount: z.number().min(0.01, 'Valor deve ser maior que zero'),
  date: z.string().min(1, 'Data é obrigatória').optional(),
  categoryId: z.string().min(1, 'Categoria é obrigatória').optional(),
  financialAccountId: z.string().min(1, 'Conta é obrigatória').optional(),
  isPending: z.boolean().optional(),
  description: z.string().optional(),
})

export const installmentSchema = z.object({
    totalAmount: z.number().min(0.01, 'O valor deve ser maior que zero!'),
    totalInstallments: z.number().min(2, 'Mínimo de 2 parcelas!'), //credito a vista tem que ser tratado parecido com debito
    firstInstallmentDate: z.string().min(1, 'a Data da primeira parcela é obrigatória!'),
    categoryId: z.string().min(1, 'A Categoria é obrigatória!'),
    financialAccountId: z.string().min(1, 'A conta é obrigatória!'),
    description: z.string().optional(),
    isPending: z.boolean().optional(),
})

export const financialAccountSchema = z.object({
    name: z.string().min(1, 'O nome é obrigatório!'),
    type: z.enum(['BANK_ACCOUNT', 'CASH_WALLET', 'OTHER']),
    institutionName: z.string().optional(),
    icon: z.string().max(64, 'Ícone muito longo').optional(),
    color: z.string().optional(),
    initialBalance: z.number().min(0, 'O saldo inicial não pode ser negativo'),
    includeInDashboard: z.boolean(),
    isArchived: z.boolean().optional(),
})

export const categoryKindSchema = z.enum(['EXPENSE', 'INCOME', 'BOTH'])

export const transferSchema = z.object({
    amount: z.number().min(0.01, 'O valor deve ser maior que zero!'),
    date: z.string().min(1, 'A data é obrigatória!'),
    fromAccountId: z.string().min(1, 'A conta de origem é obrigatória!'),
    toAccountId: z.string().min(1, 'A conta de destino é obrigatória!'),
    isPending: z.boolean(),
    description: z.string().optional(),
}).refine((data) => data.fromAccountId !== data.toAccountId, {
    message: 'A conta de origem deve ser diferente da conta de destino.',
    path: ['toAccountId'],
})

export const balanceAdjustmentSchema = z.object({
    amount: z.number().refine((value) => value !== 0, 'O ajuste não pode ser zero'),
    date: z.string().min(1, 'A data é obrigatória!'),
    financialAccountId: z.string().min(1, 'A conta é obrigatória!'),
    reason: z.string().trim().min(1, 'O motivo é obrigatório!').max(240, 'Use até 240 caracteres'),
})

export const reminderSchema = z.object({
    title: z.string().trim().min(1, 'O título é obrigatório!').max(120, 'Use até 120 caracteres'),
    dueDate: z.string().min(1, 'A data de vencimento é obrigatória!'),
    amount: z.number().min(0.01, 'O valor deve ser maior que zero').nullable().optional(),
    status: z.enum(['PENDING', 'DONE', 'CANCELED']),
    note: z.string().max(500, 'Use até 500 caracteres').nullable().optional(),
    financialAccountId: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
})

export type LoginFormData = z.infer<typeof loginSchema>
export type RegisterFormData = z.infer<typeof registerSchema>
export type TransactionFormData = z.infer<typeof transactionSchema>
export type UpdateTransactionFormData = z.infer<typeof updateTransactionSchema>
export type InstallmentFormData = z.infer<typeof installmentSchema>
export type FinancialAccountFormData = z.infer<typeof financialAccountSchema>
export type TransferFormData = z.infer<typeof transferSchema>
export type BalanceAdjustmentFormData = z.infer<typeof balanceAdjustmentSchema>
export type ReminderFormData = z.infer<typeof reminderSchema>
