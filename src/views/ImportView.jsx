import React from "react";
import { ActionIcon, Alert, Badge, Button, Group, Text, Title } from "@mantine/core";
import { IconX } from "@tabler/icons-react";

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
      <Title order={2} className="panel-title">
        Importar archivos
      </Title>
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
            <Badge variant="light" color="sage">
              {fileTypeTag(f.name)}
            </Badge>
            <ActionIcon variant="subtle" color="gray" title="Quitar" onClick={() => removeFile(idx)}>
              <IconX size={16} />
            </ActionIcon>
          </div>
        ))}
      </div>
      <Group gap="sm" mt="md" wrap="wrap">
        <Button disabled={uploadedFiles.length === 0} onClick={startAnalysis}>
          Analizar resúmenes
        </Button>
        <Button variant="default" disabled={uploadedFiles.length === 0 && !analysisMessage} onClick={clearImportQueue}>
          Limpiar cola
        </Button>
        <Button color="red" variant="light" disabled={!hasStoredExpenses} onClick={clearStoredExpenses}>
          Borrar historial
        </Button>
      </Group>
      {analysisMessage && (
        <Alert mt="md" color="sage">
          {analysisMessage}
        </Alert>
      )}

      {importedSources.length > 0 && (
        <div className="imported-sources">
          <Title order={3} className="imported-sources-title">
            Ya guardados
          </Title>
          <Text size="sm" c="dimmed" mb="sm">
            Si un resumen quedó mal (por ejemplo Mercado Pago), borralo acá y volvé a subirlo. No hace falta vaciar todo.
          </Text>
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
                <Button color="red" variant="light" size="xs" onClick={() => onDeleteSource?.(src.sourceFile)}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
