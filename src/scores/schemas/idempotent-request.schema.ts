import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type IdempotentRequestDocument = HydratedDocument<IdempotentRequest>;

@Schema({ timestamps: true })
export class IdempotentRequest {
  @Prop({ required: true, unique: true })
  requestId: string;

  @Prop({ type: Object, required: true })
  responseBody: Record<string, unknown>;

  @Prop({ required: true })
  httpStatus: number;
}

export const IdempotentRequestSchema =
  SchemaFactory.createForClass(IdempotentRequest);
