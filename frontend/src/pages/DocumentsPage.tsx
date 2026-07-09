import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

const DOCUMENT_TYPES = [
  "customer-document",
  "migration-guide",
  "architecture-guide",
  "security-guide",
  "finops-guide",
  "meeting-notes",
];

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [customerId, setCustomerId] = useState("");

  const documentsQuery = useQuery({ queryKey: ["documents"], queryFn: api.listDocuments });
  const customersQuery = useQuery({ queryKey: ["customers"], queryFn: api.listCustomers });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadDocument(file, documentType, customerId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      if (fileInput.current) fileInput.current.value = "";
    },
  });

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto p-6">
      <h1 className="text-base font-semibold text-white">Document Library</h1>
      <p className="mb-6 text-xs text-slate-400">
        Upload technical documents, proposals, or notes. Files are chunked, embedded, and indexed into the RAG
        knowledge base so the AI assistant can retrieve them in future questions.
      </p>

      <div className="mb-6 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Document type</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Associated customer (optional)</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">None</option>
              {customersQuery.data?.map((c) => (
                <option key={c.customerId} value={c.customerId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.md,.pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadMutation.mutate(file);
          }}
          className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-500"
        />
        {uploadMutation.isPending && <div className="mt-2 text-xs text-slate-400">Ingesting document&hellip;</div>}
        {uploadMutation.isSuccess && (
          <div className="mt-2 text-xs text-emerald-400">
            Ingested as {uploadMutation.data.chunksCreated} chunk(s) and indexed into the vector store.
          </div>
        )}
        {uploadMutation.isError && (
          <div className="mt-2 text-xs text-red-400">{(uploadMutation.error as Error).message}</div>
        )}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-white">Ingested documents</h2>
      <div className="flex flex-col gap-2">
        {documentsQuery.data?.map((doc) => (
          <div
            key={doc.documentId}
            className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3"
          >
            <div>
              <div className="text-sm text-white">{doc.filename}</div>
              <div className="text-xs text-slate-500">
                {doc.documentType}
                {doc.customerId ? ` · ${doc.customerId}` : ""} · {doc.chunkCount} chunks
              </div>
            </div>
            <div className="text-xs text-slate-500">{new Date((doc as any).createdAt).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
