import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import configuration from "./config/configuration.js";
import { VectorModule } from "./modules/vector/vector.module.js";
import { McpModule } from "./modules/mcp/mcp.module.js";
import { DocumentsModule } from "./modules/documents/documents.module.js";
import { CustomersModule } from "./modules/customers/customers.module.js";
import { TranscriptionModule } from "./modules/transcription/transcription.module.js";
import { AgentsModule } from "./modules/agents/agents.module.js";
import { WorkflowsModule } from "./modules/workflows/workflows.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>("mongoUrl") }),
    }),
    VectorModule,
    McpModule,
    DocumentsModule,
    CustomersModule,
    AgentsModule,
    TranscriptionModule,
    WorkflowsModule,
  ],
})
export class AppModule {}
