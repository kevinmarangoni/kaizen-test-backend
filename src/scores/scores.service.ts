import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { AnticheatService } from "./anticheat.service";
import type { CreateScoreDto } from "./dto/create-score.dto";
import type { ImprovementLevels } from "./game-simulation";
import { IdempotentRequestRepository } from "./repositories/idempotent-request.repository";
import { PlayerAggregateRepository } from "./repositories/player-aggregate.repository";
import { RankingGateway } from "./ranking.gateway";

function toLevels(dto: CreateScoreDto["improvements"]): ImprovementLevels {
  return {
    "5s": dto["5s"],
    kanban: dto.kanban,
    poka: dto.poka,
    tpm: dto.tpm,
    andon: dto.andon,
    jidoka: dto.jidoka,
    heijunka: dto.heijunka,
    jit: dto.jit,
  };
}

function normalizePlayerKey(name: string): string {
  return name.trim().toLowerCase();
}

export type TopEntry = {
  rank: number;
  playerName: string;
  score: number;
};

export type PostScoreResult = {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
};

@Injectable()
export class ScoresService {
  private readonly log = new Logger(ScoresService.name);

  constructor(
    private readonly idempotentRepo: IdempotentRequestRepository,
    private readonly playerRepo: PlayerAggregateRepository,
    private readonly anticheat: AnticheatService,
    private readonly rankingGateway: RankingGateway,
  ) {}

  async getTop(limitRaw: number): Promise<TopEntry[]> {
    const limit = Math.min(50, Math.max(1, Math.floor(limitRaw || 10)));
    const rows = await this.playerRepo.findTopRows(limit);
    return rows.map((r, i) => ({
      rank: i + 1,
      playerName: r.playerName,
      score: r.bestScore,
    }));
  }

  async getMe(playerName: string): Promise<{
    rank: number | null;
    score: number;
    playerName: string;
    totalPlayers: number;
  }> {
    const key = normalizePlayerKey(playerName);
    const me = await this.playerRepo.findOneLean(key);
    if (!me) {
      const totalPlayers = await this.playerRepo.countPositiveScores();
      return { rank: null, score: 0, playerName: key, totalPlayers };
    }
    const better = await this.playerRepo.countPlayersAhead(key, me.bestScore);
    const totalPlayers = await this.playerRepo.countPositiveScores();
    return {
      rank: better + 1,
      score: me.bestScore,
      playerName: key,
      totalPlayers,
    };
  }

  private async snapshotTop(limit: number): Promise<string> {
    const top = await this.getTop(limit);
    return JSON.stringify(top);
  }

  async createScore(dto: CreateScoreDto): Promise<PostScoreResult> {
    const playerKey = normalizePlayerKey(dto.playerName);
    const cached = await this.idempotentRepo.findByRequestId(dto.requestId);
    if (cached) {
      this.log.log({
        msg: "scores_idempotent_cache_hit",
        requestId: dto.requestId,
        httpStatus: cached.httpStatus,
      });
      const h =
        cached.httpStatus === HttpStatus.TOO_MANY_REQUESTS
          ? this.retryHeaderFromBody(cached.responseBody)
          : undefined;
      return { status: cached.httpStatus, body: cached.responseBody, headers: h };
    }

    const slot = await this.playerRepo.acquireSaveSlot(playerKey, new Date());
    if (!slot.acquired) {
      this.log.log({
        msg: "scores_rate_limited",
        playerName: playerKey,
        retryAfterSeconds: slot.retryAfterSeconds,
      });
      const body = {
        message: "Máximo de 1 save a cada 10s por jogador.",
        retryAfterSeconds: slot.retryAfterSeconds,
      };
      await this.idempotentRepo.persistResponse(
        dto.requestId,
        HttpStatus.TOO_MANY_REQUESTS,
        body,
      );
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        body,
        headers: { "Retry-After": String(slot.retryAfterSeconds) },
      };
    }

    const levels = toLevels(dto.improvements);
    if (!this.anticheat.isScorePlausible(dto.score, levels, dto.elapsedSeconds)) {
      const { ceilingRaw, ceilingWithMargin } = this.anticheat.computeScoreCeiling(
        levels,
        dto.elapsedSeconds,
      );
      this.log.warn({
        msg: "scores_anticheat_reject",
        playerName: playerKey,
        score: dto.score,
        ceilingRaw,
        ceilingWithMargin,
      });
      const body = {
        message: "Score acima do teto teórico permitido para o tempo e melhorias informados.",
        ceilingRaw,
        ceilingWithMargin,
      };
      await this.idempotentRepo.persistResponse(
        dto.requestId,
        HttpStatus.UNPROCESSABLE_ENTITY,
        body,
      );
      return { status: HttpStatus.UNPROCESSABLE_ENTITY, body };
    }

    const currentBest = await this.playerRepo.findBestScoreLean(playerKey);
    const prevBest = currentBest?.bestScore ?? 0;
    const likelyRankingChange = dto.score > prevBest;
    const prevTopJson = likelyRankingChange ? await this.snapshotTop(10) : null;

    const result = await this.playerRepo.applyScoreIfHigher(playerKey, dto);
    if (result.updated) {
      this.log.log({
        msg: "scores_best_score_updated",
        playerName: playerKey,
        bestScore: result.bestScore,
      });
    }

    const body: Record<string, unknown> = {
      accepted: true,
      bestScore: result.bestScore,
      updated: result.updated,
      playerName: playerKey,
    };

    await this.idempotentRepo.persistResponse(dto.requestId, HttpStatus.OK, body);

    if (result.updated && likelyRankingChange && prevTopJson !== null) {
      const nextTopJson = await this.snapshotTop(10);
      if (nextTopJson !== prevTopJson) {
        this.rankingGateway.broadcast(JSON.parse(nextTopJson) as TopEntry[]);
      }
    }

    return { status: HttpStatus.OK, body };
  }

  private retryHeaderFromBody(
    b: Record<string, unknown>,
  ): Record<string, string> | undefined {
    const sec = typeof b.retryAfterSeconds === "number" ? b.retryAfterSeconds : 10;
    return { "Retry-After": String(sec) };
  }
}
