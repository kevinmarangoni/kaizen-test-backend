import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type PlayerAggregateDocument = HydratedDocument<PlayerAggregate>;

@Schema({ timestamps: true })
export class PlayerAggregate {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  playerName: string;

  @Prop({ required: true, default: 0 })
  bestScore: number;

  @Prop({ type: Object, default: {} })
  bestImprovements: Record<string, number>;

  /** Última tentativa de POST /scores (novo requestId), para rate limit REGRA 5. */
  @Prop({ type: Date })
  lastSaveAttemptAt: Date | null;
}

export const PlayerAggregateSchema =
  SchemaFactory.createForClass(PlayerAggregate);

/** Suporta `getTop` / `getMe` sem collscan em volume. */
PlayerAggregateSchema.index({ bestScore: -1, playerName: 1 });
