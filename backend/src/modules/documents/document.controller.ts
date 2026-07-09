import { Controller, Get, Post, UploadedFile, UseInterceptors, Body, BadRequestException } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DocumentService } from "./document.service.js";

/**
 * REST surface for the "Document Upload" feature in the frontend. Upload
 * triggers synchronous ingestion (extract -> chunk -> embed -> index) and
 * returns as soon as the document is searchable.
 */
@Controller("api/documents")
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  async list() {
    return this.documentService.listDocuments();
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body("documentType") documentType?: string,
    @Body("customerId") customerId?: string,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded. Attach a file under the 'file' field.");
    }
    return this.documentService.ingestDocument({
      filename: file.originalname,
      buffer: file.buffer,
      documentType: documentType || "customer-document",
      customerId: customerId || undefined,
    });
  }
}
