import {
    BadgeDollarSign,
    BadgePercent,
    Banknote,
    Bike,
    BookOpen,
    Building2,
    BriefcaseBusiness,
    Bus,
    BusFront,
    Car,
    ChartLine,
    CircleDollarSign,
    Coins,
    Coffee,
    CreditCard,
    Droplets,
    Dumbbell,
    Film,
    Fuel,
    Gamepad2,
    Gift,
    Globe,
    GraduationCap,
    Hammer,
    HandCoins,
    Handshake,
    HeartPulse,
    Hospital,
    House,
    HouseWifi,
    Landmark,
    Laptop,
    Lightbulb,
    Music,
    PawPrint,
    PiggyBank,
    Pill,
    Plane,
    Receipt,
    ReceiptText,
    Scissors,
    Shirt,
    ShieldCheck,
    ShoppingBag,
    ShoppingCart,
    Smartphone,
    Sofa,
    Sprout,
    Stethoscope,
    Syringe,
    Tag,
    Target,
    TrainFront,
    Utensils,
    WalletCards,
    Wifi,
    Wrench,
    Zap,
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
            { value: 'lucide:chart-line', label: 'Investimentos', icon: ChartLine },
            { value: 'lucide:badge-percent', label: 'Juros', icon: BadgePercent },
            { value: 'lucide:handshake', label: 'Contrato', icon: Handshake },
            { value: 'lucide:shield-check', label: 'Seguro', icon: ShieldCheck },
        ],
    },
    {
        label: 'Dia a dia',
        options: [
            { value: 'lucide:utensils', label: 'Alimentacao', icon: Utensils },
            { value: 'lucide:shopping-cart', label: 'Mercado', icon: ShoppingCart },
            { value: 'lucide:shopping-bag', label: 'Compras', icon: ShoppingBag },
            { value: 'lucide:car', label: 'Carro', icon: Car },
            { value: 'lucide:bus', label: 'Transporte', icon: Bus },
            { value: 'lucide:bus-front', label: 'Onibus', icon: BusFront },
            { value: 'lucide:train-front', label: 'Trem', icon: TrainFront },
            { value: 'lucide:bike', label: 'Bicicleta', icon: Bike },
            { value: 'lucide:fuel', label: 'Combustivel', icon: Fuel },
            { value: 'lucide:house', label: 'Casa', icon: House },
            { value: 'lucide:house-wifi', label: 'Internet casa', icon: HouseWifi },
            { value: 'lucide:building-2', label: 'Condominio', icon: Building2 },
            { value: 'lucide:sofa', label: 'Moveis', icon: Sofa },
            { value: 'lucide:lightbulb', label: 'Energia', icon: Lightbulb },
            { value: 'lucide:droplets', label: 'Agua', icon: Droplets },
            { value: 'lucide:wifi', label: 'Internet', icon: Wifi },
            { value: 'lucide:wrench', label: 'Manutencao', icon: Wrench },
            { value: 'lucide:hammer', label: 'Reparos', icon: Hammer },
            { value: 'lucide:gift', label: 'Presente', icon: Gift },
        ],
    },
    {
        label: 'Vida pessoal',
        options: [
            { value: 'lucide:heart-pulse', label: 'Saúde', icon: HeartPulse },
            { value: 'lucide:hospital', label: 'Hospital', icon: Hospital },
            { value: 'lucide:pill', label: 'Medicacao', icon: Pill },
            { value: 'lucide:syringe', label: 'Vacina', icon: Syringe },
            { value: 'lucide:stethoscope', label: 'Consulta', icon: Stethoscope },
            { value: 'lucide:dumbbell', label: 'Exercicio', icon: Dumbbell },
            { value: 'lucide:gamepad-2', label: 'Jogos', icon: Gamepad2 },
            { value: 'lucide:film', label: 'Cinema', icon: Film },
            { value: 'lucide:music', label: 'Musica', icon: Music },
            { value: 'lucide:book-open', label: 'Leitura', icon: BookOpen },
            { value: 'lucide:coffee', label: 'Cafe', icon: Coffee },
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
            { value: 'lucide:scissors', label: 'Servicos', icon: Scissors },
            { value: 'lucide:receipt', label: 'Recibo', icon: Receipt },
            { value: 'lucide:target', label: 'Meta', icon: Target },
            { value: 'lucide:sprout', label: 'Crescimento', icon: Sprout },
            { value: 'lucide:globe', label: 'Internacional', icon: Globe },
            { value: 'lucide:zap', label: 'Rapido', icon: Zap },
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

    return ''
}

export function getStoredIconLabel(value?: string | null): string {
    const option = getStoredIconOption(value)

    if (option) return option.label
    if (value) return 'Icone indisponivel'

    return 'Sem icone'
}
