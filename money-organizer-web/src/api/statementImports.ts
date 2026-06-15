import api from './axios'
import type { StatementImportPreview } from '../types'

export function previewStatementImport(file: File, financialAccountId?: string) {
    const formData = new FormData()
    formData.append('file', file)

    if (financialAccountId) {
        formData.append('financialAccountId', financialAccountId)
    }

    return api.post<StatementImportPreview>('/statement-imports/preview', formData)
}
