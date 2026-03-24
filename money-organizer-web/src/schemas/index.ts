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
  isPending: z.boolean().optional(),
  description: z.string().optional(),
})

export const installmentSchema = z.object({
    totalAmount: z.number().min(0.01, 'O valor deve ser maior que zero!'),
    totalInstallments: z.number().min(2, 'Mínimo de 2 parcelas!'), //credito a vista tem que ser tratado parecido com debito
    firstInstallmentDate: z.string().min(1, 'a Data da primeira parcela é obrigatória!'),
    categoryId: z.string().min(1, 'A Categoria é obrigatória!'),
    description: z.string().optional(),
    isPending: z.boolean().optional(),
})

export type LoginFormData = z.infer<typeof loginSchema>
export type RegisterFormData = z.infer<typeof registerSchema>
export type TransactionFormData = z.infer<typeof transactionSchema>
export type UpdateTransactionFormData = z.infer<typeof updateTransactionSchema>
export type InstallmentFormData = z.infer<typeof installmentSchema>