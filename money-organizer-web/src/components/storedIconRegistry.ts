import {
    BadgeDollarSign,
    Banknote,
    BookOpen,
    BriefcaseBusiness,
    Bus,
    Car,
    CircleDollarSign,
    Coins,
    CreditCard,
    Dumbbell,
    Fuel,
    Gamepad2,
    Gift,
    GraduationCap,
    HandCoins,
    HeartPulse,
    House,
    Landmark,
    Laptop,
    Music,
    PawPrint,
    PiggyBank,
    Pill,
    Plane,
    ReceiptText,
    Shirt,
    ShoppingCart,
    Smartphone,
    Stethoscope,
    Tag,
    Utensils,
    WalletCards,
    Wrench,
    type LucideIcon,
} from 'lucide-react'

const LUCIDE_PREFIX = 'lucide:'

export interface StoredIconOption {
    value: `${typeof LUCIDE_PREFIX}${string}`
    label: string
    icon: LucideIcon
}

export interface StoredIconGroup {
    label: string
    options: StoredIconOption[]
}

export const STORED_ICON_GROUPS: StoredIconGroup[] = [
    {
        label: 'Financas',
        options: [
            { value: 'lucide:landmark', label: 'Banco', icon: Landmark },
            { value: 'lucide:wallet-cards', label: 'Carteira', icon: WalletCards },
            { value: 'lucide:credit-card', label: 'Cartao', icon: CreditCard },
            { value: 'lucide:banknote', label: 'Dinheiro', icon: Banknote },
            { value: 'lucide:coins', label: 'Moedas', icon: Coins },
            { value: 'lucide:piggy-bank', label: 'Reserva', icon: PiggyBank },
            { value: 'lucide:hand-coins', label: 'Pagamento', icon: HandCoins },
            { value: 'lucide:receipt-text', label: 'Conta', icon: ReceiptText },
            { value: 'lucide:badge-dollar-sign', label: 'Salario', icon: BadgeDollarSign },
        ],
    },
    {
        label: 'Dia a dia',
        options: [
            { value: 'lucide:utensils', label: 'Alimentacao', icon: Utensils },
            { value: 'lucide:shopping-cart', label: 'Mercado', icon: ShoppingCart },
            { value: 'lucide:car', label: 'Carro', icon: Car },
            { value: 'lucide:bus', label: 'Transporte', icon: Bus },
            { value: 'lucide:fuel', label: 'Combustivel', icon: Fuel },
            { value: 'lucide:house', label: 'Casa', icon: House },
            { value: 'lucide:wrench', label: 'Manutencao', icon: Wrench },
            { value: 'lucide:gift', label: 'Presente', icon: Gift },
        ],
    },
    {
        label: 'Vida pessoal',
        options: [
            { value: 'lucide:heart-pulse', label: 'Saude', icon: HeartPulse },
            { value: 'lucide:pill', label: 'Medicacao', icon: Pill },
            { value: 'lucide:stethoscope', label: 'Consulta', icon: Stethoscope },
            { value: 'lucide:dumbbell', label: 'Exercicio', icon: Dumbbell },
            { value: 'lucide:gamepad-2', label: 'Jogos', icon: Gamepad2 },
            { value: 'lucide:music', label: 'Musica', icon: Music },
            { value: 'lucide:book-open', label: 'Leitura', icon: BookOpen },
            { value: 'lucide:plane', label: 'Viagem', icon: Plane },
        ],
    },
    {
        label: 'Trabalho e outros',
        options: [
            { value: 'lucide:briefcase-business', label: 'Trabalho', icon: BriefcaseBusiness },
            { value: 'lucide:laptop', label: 'Tecnologia', icon: Laptop },
            { value: 'lucide:smartphone', label: 'Celular', icon: Smartphone },
            { value: 'lucide:graduation-cap', label: 'Educacao', icon: GraduationCap },
            { value: 'lucide:shirt', label: 'Roupas', icon: Shirt },
            { value: 'lucide:paw-print', label: 'Pets', icon: PawPrint },
            { value: 'lucide:tag', label: 'Categoria', icon: Tag },
            { value: 'lucide:circle-dollar-sign', label: 'Geral', icon: CircleDollarSign },
        ],
    },
]

const STORED_ICON_OPTIONS = STORED_ICON_GROUPS.flatMap((group) => group.options)
const ICON_BY_VALUE = new Map(STORED_ICON_OPTIONS.map((option) => [option.value, option]))

export function getStoredIconOption(value?: string | null) {
    if (!value || !value.startsWith(LUCIDE_PREFIX)) return undefined

    return ICON_BY_VALUE.get(value as StoredIconOption['value'])
}

export function formatStoredIconPrefix(value?: string | null): string {
    if (!value || getStoredIconOption(value)) return ''

    return `${value} `
}

export function getStoredIconLabel(value?: string | null): string {
    const option = getStoredIconOption(value)

    if (option) return option.label
    if (value) return 'Emoji personalizado'

    return 'Sem icone'
}
