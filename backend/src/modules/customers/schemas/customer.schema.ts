import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document as MongooseDocument } from "mongoose";

export type CustomerRecord = CustomerEntity & MongooseDocument;

/**
 * Read model mirroring the documents the crm-mcp-server seeds into the
 * shared `customers` collection. This module is deliberately read-only
 * and exists only to power the frontend's customer browsing UI - the AI
 * agent never queries this directly, it goes through the CRM MCP server
 * (see mcp/mcp-client.service.ts) so the same business logic and access
 * boundary applies whether a human or the agent is asking.
 */
@Schema({ collection: "customers" })
export class CustomerEntity {
  @Prop({ required: true, unique: true })
  customerId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop()
  industry?: string;

  @Prop()
  region?: string;

  @Prop()
  currentCloud?: string;

  @Prop()
  monthlySpendUsd?: number;

  @Prop()
  migrationInterest?: string;

  @Prop()
  accountOwner?: string;

  @Prop()
  healthScore?: number;

  @Prop([String])
  challenges?: string[];

  @Prop([String])
  opportunities?: string[];

  @Prop([String])
  tags?: string[];
}

export const CustomerSchema = SchemaFactory.createForClass(CustomerEntity);
