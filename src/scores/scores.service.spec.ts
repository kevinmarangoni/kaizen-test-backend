import { HttpStatus } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AnticheatService } from "./anticheat.service";
import { IdempotentRequestRepository } from "./repositories/idempotent-request.repository";
import { PlayerAggregateRepository } from "./repositories/player-aggregate.repository";
import { RankingGateway } from "./ranking.gateway";
import { ScoresService } from "./scores.service";

const ZERO_IMPROVEMENTS = {
  "5s": 0,
  kanban: 0,
  poka: 0,
  tpm: 0,
  andon: 0,
  jidoka: 0,
  heijunka: 0,
  jit: 0,
};

type RepoMocks = {
  idempotentRepo: {
    findByRequestId: jest.Mock;
    persistResponse: jest.Mock;
  };
  playerRepo: {
    findTopRows: jest.Mock;
    findOneLean: jest.Mock;
    countPositiveScores: jest.Mock;
    countPlayersAhead: jest.Mock;
    acquireSaveSlot: jest.Mock;
    findBestScoreLean: jest.Mock;
    applyScoreIfHigher: jest.Mock;
  };
  ranking: { broadcast: jest.Mock };
};

async function buildService(mocks: RepoMocks): Promise<ScoresService> {
  const m = await Test.createTestingModule({
    providers: [
      ScoresService,
      AnticheatService,
      { provide: IdempotentRequestRepository, useValue: mocks.idempotentRepo },
      { provide: PlayerAggregateRepository, useValue: mocks.playerRepo },
      { provide: RankingGateway, useValue: mocks.ranking },
    ],
  }).compile();
  return m.get(ScoresService);
}

function baseDto(score = 5) {
  return {
    playerName: "Test",
    score,
    improvements: ZERO_IMPROVEMENTS,
    elapsedSeconds: 100,
    requestId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  };
}

describe("ScoresService.createScore", () => {
  let mocks: RepoMocks;

  beforeEach(() => {
    mocks = {
      idempotentRepo: {
        findByRequestId: jest.fn().mockResolvedValue(null),
        persistResponse: jest.fn().mockResolvedValue(undefined),
      },
      playerRepo: {
        findTopRows: jest.fn().mockResolvedValue([]),
        findOneLean: jest.fn(),
        countPositiveScores: jest.fn().mockResolvedValue(0),
        countPlayersAhead: jest.fn(),
        acquireSaveSlot: jest.fn().mockResolvedValue({ acquired: true }),
        findBestScoreLean: jest.fn(),
        applyScoreIfHigher: jest.fn(),
      },
      ranking: { broadcast: jest.fn() },
    };
  });

  it("retorna cache idempotente sem reescrever", async () => {
    mocks.idempotentRepo.findByRequestId.mockResolvedValue({
      httpStatus: HttpStatus.OK,
      responseBody: { accepted: true, bestScore: 10 },
    });

    const svc = await buildService(mocks);
    const out = await svc.createScore(baseDto() as never);

    expect(out.status).toBe(HttpStatus.OK);
    expect(out.body).toEqual({ accepted: true, bestScore: 10 });
    expect(mocks.idempotentRepo.persistResponse).not.toHaveBeenCalled();
  });

  it("retorna 429 quando o rate limit bloqueia o save (REGRA 5)", async () => {
    mocks.playerRepo.acquireSaveSlot.mockResolvedValue({
      acquired: false,
      retryAfterSeconds: 6,
    });

    const svc = await buildService(mocks);
    const out = await svc.createScore(baseDto() as never);

    expect(out.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(out.headers?.["Retry-After"]).toMatch(/^\d+$/);
    expect(out.body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(mocks.idempotentRepo.persistResponse).toHaveBeenCalledWith(
      baseDto().requestId,
      HttpStatus.TOO_MANY_REQUESTS,
      expect.objectContaining({ retryAfterSeconds: 6 }),
    );
  });

  it("retorna 422 quando o score excede o teto do anti-cheat (REGRA 3)", async () => {
    const svc = await buildService(mocks);
    const out = await svc.createScore({ ...baseDto(), score: 999_999 } as never);

    expect(out.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(out.body.message).toMatch(/teto/i);
    expect(mocks.idempotentRepo.persistResponse).toHaveBeenCalledWith(
      baseDto().requestId,
      HttpStatus.UNPROCESSABLE_ENTITY,
      expect.objectContaining({ message: expect.stringMatching(/teto/i) }),
    );
    expect(mocks.ranking.broadcast).not.toHaveBeenCalled();
  });

  it("atualiza bestScore quando o score é maior (save-if-higher, REGRA 4)", async () => {
    mocks.playerRepo.findBestScoreLean.mockResolvedValue({ bestScore: 1 });
    mocks.playerRepo.applyScoreIfHigher.mockResolvedValue({
      bestScore: 50,
      updated: true,
    });

    const svc = await buildService(mocks);
    const out = await svc.createScore(baseDto(50) as never);

    expect(out.status).toBe(HttpStatus.OK);
    expect(out.body.updated).toBe(true);
    expect(out.body.bestScore).toBe(50);
    expect(mocks.playerRepo.applyScoreIfHigher).toHaveBeenCalledWith(
      "test",
      expect.objectContaining({ score: 50 }),
    );
  });

  it("não atualiza quando o score é igual ou menor (save-if-higher, REGRA 4)", async () => {
    mocks.playerRepo.findBestScoreLean.mockResolvedValue({ bestScore: 200 });
    mocks.playerRepo.applyScoreIfHigher.mockResolvedValue({
      bestScore: 200,
      updated: false,
    });

    const svc = await buildService(mocks);
    const out = await svc.createScore(baseDto(50) as never);

    expect(out.status).toBe(HttpStatus.OK);
    expect(out.body.updated).toBe(false);
    expect(out.body.bestScore).toBe(200);
  });

  it("faz broadcast somente quando o top 10 muda", async () => {
    mocks.playerRepo.findBestScoreLean.mockResolvedValue({ bestScore: 0 });
    mocks.playerRepo.applyScoreIfHigher.mockResolvedValue({
      bestScore: 50,
      updated: true,
    });
    mocks.playerRepo.findTopRows
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ playerName: "test", bestScore: 50 }]);

    const svc = await buildService(mocks);
    await svc.createScore(baseDto(50) as never);

    expect(mocks.ranking.broadcast).toHaveBeenCalledTimes(1);
    expect(mocks.ranking.broadcast).toHaveBeenCalledWith([
      { rank: 1, playerName: "test", score: 50 },
    ]);
  });

  it("não chama broadcast quando o score não melhora o placar", async () => {
    mocks.playerRepo.findBestScoreLean.mockResolvedValue({ bestScore: 200 });
    mocks.playerRepo.applyScoreIfHigher.mockResolvedValue({
      bestScore: 200,
      updated: false,
    });

    const svc = await buildService(mocks);
    await svc.createScore(baseDto(50) as never);

    expect(mocks.ranking.broadcast).not.toHaveBeenCalled();
    expect(mocks.playerRepo.findTopRows).not.toHaveBeenCalled();
  });

  it("grava resposta idempotente em OK via persistResponse", async () => {
    mocks.playerRepo.findBestScoreLean.mockResolvedValue({ bestScore: 0 });
    mocks.playerRepo.applyScoreIfHigher.mockResolvedValue({
      bestScore: 10,
      updated: true,
    });
    mocks.playerRepo.findTopRows.mockResolvedValue([]);

    const svc = await buildService(mocks);
    await svc.createScore(baseDto(10) as never);

    expect(mocks.idempotentRepo.persistResponse).toHaveBeenCalledWith(
      baseDto().requestId,
      HttpStatus.OK,
      expect.objectContaining({ accepted: true }),
    );
  });
});
