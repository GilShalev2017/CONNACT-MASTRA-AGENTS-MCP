/**
 * Shared shapes for the RAG pipeline. Kept provider-agnostic (no Qdrant or
 * Xenova types leak out of the vector module) so the rest of the app only
 * depends on this contract.
 */
export interface DocumentChunkMetadata {
  source: string;
  customerId?: string;
  documentType: string;
  documentId: string;
  chunkIndex: number;
  createdAt: string;
}

export interface DocumentChunk {
  id: string;
  text: string;
  metadata: DocumentChunkMetadata;
}

export interface RagSearchResult {
  id: string;
  text: string;
  score: number;
  metadata: DocumentChunkMetadata;
}
