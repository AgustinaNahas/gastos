import React from "react";

export default function ImportView({
  fileInputRef,
  uploadDragging,
  setUploadDragging,
  uploadedFiles,
  addFiles,
  removeFile,
  fileTypeTag,
  startAnalysis,
  clearImportQueue,
  clearStoredExpenses,
  importedSources = [],
  onDeleteSource,
  analysisMessage,
  hasStoredExpenses
}) {
  return (
    <section className="panel">
      <h2 className="panel-title">Importar archivos</h2>
      <div
        className={`upload-zone${uploadDragging ? " drag-over" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setUploadDragging(true);
        }}
        onDragLeave={() => setUploadDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setUploadDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
      >
        <div className="upload-icon" aria-hidden="true">
          📄
        </div>
        <div className="upload-title">Arrastrá archivos o hacé clic para elegirlos</div>
        <div className="upload-hint">PDF · CSV · XLSX · Múltiples bancos en un solo análisis</div>
        <input
          ref={fileInputRef}
          style={{ display: "none" }}
          type="file"
          multiple
          accept=".pdf,.txt,.csv,.xls,.xlsx"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <div className="files-list">
        {uploadedFiles.map((f, idx) => (
          <div key={`${f.name}-${idx}`} className="file-item">
            <span className="fname" title={f.name}>
              {f.name}
            </span>
            <span className="chip">{fileTypeTag(f.name)}</span>
            <button type="button" className="btn-icon" title="Quitar" onClick={() => removeFile(idx)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="actions-row">
        <button type="button" className="btn-primary" disabled={uploadedFiles.length === 0} onClick={startAnalysis}>
          Analizar resúmenes
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={uploadedFiles.length === 0 && !analysisMessage}
          onClick={clearImportQueue}
        >
          Limpiar cola
        </button>
        <button type="button" className="btn-ghost btn-danger" disabled={!hasStoredExpenses} onClick={clearStoredExpenses}>
          Borrar historial
        </button>
      </div>
      {analysisMessage && <div className="alert-inline">{analysisMessage}</div>}

      {importedSources.length > 0 && (
        <div className="imported-sources">
          <h3 className="imported-sources-title">Ya guardados</h3>
          <p className="imported-sources-lead">
            Si un resumen quedó mal (por ejemplo Mercado Pago), borralo acá y volvé a subirlo. No hace falta vaciar todo.
          </p>
          <ul className="imported-sources-list">
            {importedSources.map((src) => (
              <li key={src.sourceFile} className="imported-source-item">
                <div className="imported-source-meta">
                  <span className="imported-source-name" title={src.sourceFile}>
                    {src.sourceFile}
                  </span>
                  <span className="imported-source-stats">
                    {src.bank} · {src.monthsLabel} · {src.count} mov.
                    {src.gastos ? ` · ${src.gastos} gastos` : ""}
                    {src.ingresos ? ` · ${src.ingresos} ingresos` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-danger btn-inline"
                  onClick={() => onDeleteSource?.(src.sourceFile)}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
