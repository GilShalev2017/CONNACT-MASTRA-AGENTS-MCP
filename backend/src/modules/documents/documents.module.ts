import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { MulterModule } from "@nestjs/platform-express";
import { DocumentService } from "./document.service.js";
import { DocumentController } from "./document.controller.js";
import { DocumentEntity, DocumentSchema } from "./schemas/document.schema.js";
import { VectorModule } from "../vector/vector.module.js";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DocumentEntity.name, schema: DocumentSchema }]),
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }),
    VectorModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentsModule {}
