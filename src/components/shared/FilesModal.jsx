import { useRef } from 'react'

export default function FilesModal({ open, onClose, entityName, files, loading, uploading, onUpload, onDownload, onDelete, getIcon, formatSize }) {
    if (!open) return null;
    
    const fileInputRef = useRef(null);
    
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            onUpload(file);
            e.target.value = ''; // Reset input
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">📎 Archivos Adjuntos</h3>
                        <p className="text-sm text-gray-600">{entityName}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-xl">✕</button>
                </div>
                
                {/* Botón subir */}
                <div className="mb-4">
                    <input 
                        ref={fileInputRef}
                        type="file" 
                        onChange={handleFileSelect}
                        className="hidden"
                        disabled={uploading}
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-naranja hover:bg-orange-50 transition-colors disabled:opacity-50"
                    >
                        {uploading ? (
                            <span className="text-gray-600">⏳ Subiendo archivo...</span>
                        ) : (
                            <span className="text-gray-700">📤 Click para subir archivo</span>
                        )}
                    </button>
                    <p className="text-xs text-gray-500 mt-1 text-center">
                        Soporta: PDF, imágenes, Word, Excel (máx. 50MB)
                    </p>
                </div>
                
                {/* Lista de archivos */}
                <div className="flex-1 overflow-auto border rounded-lg">
                    {loading ? (
                        <div className="p-6 text-center text-sm text-gray-600">Cargando archivos...</div>
                    ) : files.length === 0 ? (
                        <div className="p-6 text-center">
                            <div className="text-4xl mb-2">📭</div>
                            <div className="text-sm font-medium text-gray-700 mb-1">Sin archivos</div>
                            <div className="text-xs text-gray-500">Sube archivos usando el botón de arriba</div>
                        </div>
                    ) : (
                        <ul className="divide-y">
                            {files.map((file, idx) => {
                                const displayName = file.name.split('_').slice(1).join('_') || file.name;
                                return (
                                    <li key={idx} className="p-4 hover:bg-gray-50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                                                <span className="text-2xl">{getIcon(file.name)}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-gray-900 truncate">
                                                        {displayName}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {formatSize(file.metadata?.size)}
                                                        {file.created_at && ` • ${new Date(file.created_at).toLocaleDateString('es-CL')}`}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-2 ml-4">
                                                <button 
                                                    onClick={() => onDownload(file.name)}
                                                    className="px-3 py-1 text-sm text-azul hover:bg-blue-50 rounded"
                                                >
                                                    ⬇️ Descargar
                                                </button>
                                                <button 
                                                    onClick={() => onDelete(file.name)}
                                                    className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
