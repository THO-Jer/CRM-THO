import { useRef } from 'react'
import { Paperclip, Upload, FolderOpen, Download, Trash2, Image, FileText, FileSpreadsheet, FileArchive, File } from 'lucide-react'

// Ícono según extensión (reemplaza los emojis del getIcon del hook)
function fileTypeIcon(fileName: string) {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <Image size={22} className="text-azul" />
    if (ext === 'pdf') return <FileText size={22} className="text-red-400" />
    if (['doc', 'docx'].includes(ext)) return <FileText size={22} className="text-azul" />
    if (['xls', 'xlsx'].includes(ext)) return <FileSpreadsheet size={22} className="text-verde" />
    if (['zip', 'rar'].includes(ext)) return <FileArchive size={22} className="text-gray-400" />
    return <File size={22} className="text-gray-400" />
}
import useEscapeKey from '../../hooks/useEscapeKey'

interface StorageFile {
    id?: string
    name: string
    created_at?: string
    metadata?: {
        size?: number
        [key: string]: unknown
    }
}

interface FilesModalProps {
    open: boolean
    onClose: () => void
    entityName: string
    files: StorageFile[]
    loading: boolean
    uploading: boolean
    onUpload: (file: File) => void
    onDownload: (name: string) => void
    onDelete: (name: string) => void
    getIcon: (name: string) => string
    formatSize: (size: number | undefined) => string
}

export default function FilesModal({ open, onClose, entityName, files, loading, uploading, onUpload, onDownload, onDelete, getIcon, formatSize }: FilesModalProps) {
    void getIcon // se mantiene en la API por compatibilidad; el ícono ahora es fileTypeIcon (lucide)
    useEscapeKey(onClose, open)
    if (!open) return null
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const fileInputRef = useRef<HTMLInputElement>(null)
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) { onUpload(file); e.target.value = '' }
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between p-6 border-b dark:border-gray-700">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Paperclip size={18} className="text-gray-400" /> Archivos adjuntos</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{entityName}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl transition">✕</button>
                </div>

                <div className="p-6 pt-4">
                    <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" disabled={uploading} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                        className="w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-naranja hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors disabled:opacity-50">
                        {uploading
                            ? <span className="text-gray-500 dark:text-gray-400">Subiendo archivo...</span>
                            : <span className="text-gray-600 dark:text-gray-400 inline-flex items-center gap-2"><Upload size={15} /> Click para subir archivo</span>}
                    </button>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">PDF, imágenes, Word, Excel (máx. 50MB)</p>
                </div>

                <div className="flex-1 overflow-auto mx-6 mb-6 border dark:border-gray-700 rounded-lg">
                    {loading ? (
                        <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">Cargando archivos...</div>
                    ) : files.length === 0 ? (
                        <div className="p-6 text-center">
                            <FolderOpen size={32} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                            <div className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Sin archivos</div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">Sube archivos usando el botón de arriba</div>
                        </div>
                    ) : (
                        <ul className="divide-y dark:divide-gray-700">
                            {files.map((file, idx) => {
                                const displayName = file.name.split('_').slice(1).join('_') || file.name
                                return (
                                    <li key={file.id || file.name || idx} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                                                <span className="flex-shrink-0">{fileTypeIcon(file.name)}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{displayName}</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        {formatSize(file.metadata?.size)}
                                                        {file.created_at && ` • ${new Date(file.created_at).toLocaleDateString('es-CL')}`}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-2 ml-4">
                                                <button onClick={() => onDownload(file.name)} className="px-3 py-1 text-sm text-azul hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition" title="Descargar" aria-label="Descargar"><Download size={14} /></button>
                                                <button onClick={() => onDelete(file.name)} className="px-3 py-1 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition" title="Eliminar" aria-label="Eliminar"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    )
}
