import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { CreateScoreDto } from "../dto/create-score.dto";
import { PlayerAggregate } from "../schemas/player-aggregate.schema";

const RATE_MS = 10_000;

export type PlayerLean = {
  playerName: string;
  bestScore: number;
  bestImprovements: Record<string, number>;
  lastSaveAttemptAt: Date | null;
};

@Injectable()
export class PlayerAggregateRepository {
  constructor(
    @InjectModel(PlayerAggregate.name)
    private readonly model: Model<PlayerAggregate>,
  ) {}

  async findTopRows(limit: number): Promise<Pick<PlayerLean, "playerName" | "bestScore">[]> {
    return this.model
      .find({ bestScore: { $gt: 0 } })
      .sort({ bestScore: -1, playerName: 1 })
      .limit(limit)
      .select({ playerName: 1, bestScore: 1 })
      .lean<Pick<PlayerLean, "playerName" | "bestScore">[]>()
      .exec();
  }

  findOneLean(playerKey: string) {
    return this.model.findOne({ playerName: playerKey }).lean<PlayerLean | null>().exec();
  }

  countPositiveScores(): Promise<number> {
    return this.model.countDocuments({ bestScore: { $gt: 0 } }).exec();
  }

  countPlayersAhead(playerKey: string, bestScore: number): Promise<number> {
    return this.model
      .countDocuments({
        $or: [
          { bestScore: { $gt: bestScore } },
          {
            bestScore,
            playerName: { $lt: playerKey },
          },
        ],
      })
      .exec();
  }

  /**
   * Atualiza `lastSaveAttemptAt` apenas se passou ≥ RATE_MS desde a última tentativa
   * (ou se o jogador é novo). Comando atômico (REGRA 5).
   */
  async acquireSaveSlot(
    playerKey: string,
    now: Date,
  ): Promise<{ acquired: true } | { acquired: false; retryAfterSeconds: number }> {
    const cutoff = new Date(now.getTime() - RATE_MS);
    const updated = await this.model
      .findOneAndUpdate(
        {
          playerName: playerKey,
          $or: [
            { lastSaveAttemptAt: { $exists: false } },
            { lastSaveAttemptAt: null },
            { lastSaveAttemptAt: { $lte: cutoff } },
          ],
        },
        {
          $set: { lastSaveAttemptAt: now },
          $setOnInsert: { bestScore: 0, bestImprovements: {} },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean<{ lastSaveAttemptAt: Date | null }>()
      .exec()
      .catch(async (err: unknown) => {
        if ((err as { code?: number }).code === 11000) return null;
        throw err;
      });

    if (updated) return { acquired: true };

    const fresh = await this.model
      .findOne({ playerName: playerKey })
      .lean<{ lastSaveAttemptAt: Date | null }>()
      .exec();
    const last = fresh?.lastSaveAttemptAt ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((RATE_MS - (now.getTime() - last.getTime())) / 1000),
    );
    return { acquired: false, retryAfterSeconds };
  }

  findBestScoreLean(playerKey: string) {
    return this.model
      .findOne({ playerName: playerKey })
      .select({ bestScore: 1 })
      .lean<{ bestScore: number } | null>()
      .exec();
  }

  async applyScoreIfHigher(
    playerKey: string,
    dto: CreateScoreDto,
  ): Promise<{ bestScore: number; updated: boolean }> {
    const improvements = {
      ...(dto.improvements as unknown as Record<string, number>),
    };
    const updatedDoc = await this.model
      .findOneAndUpdate(
        { playerName: playerKey, bestScore: { $lt: dto.score } },
        {
          $set: {
            bestScore: dto.score,
            bestImprovements: { ...improvements },
          },
        },
        { new: true, lean: true },
      )
      .exec();

    if (updatedDoc) {
      return { bestScore: updatedDoc.bestScore, updated: true };
    }

    const cur = await this.findBestScoreLean(playerKey);
    if (!cur) {
      throw new Error("player aggregate missing after upsert");
    }
    return { bestScore: cur.bestScore, updated: false };
  }
}
