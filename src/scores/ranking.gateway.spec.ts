import { Test } from "@nestjs/testing";
import { RankingGateway } from "./ranking.gateway";

describe("RankingGateway", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("debounce: duas chamadas rápidas emitem uma vez após 150ms", async () => {
    const emit = jest.fn();
    const m = await Test.createTestingModule({
      providers: [RankingGateway],
    }).compile();
    const gw = m.get(RankingGateway);
    gw.server = { emit } as never;

    const row = { rank: 1, playerName: "a", score: 1 };
    gw.broadcast([row]);
    gw.broadcast([row]);
    jest.advanceTimersByTime(149);
    expect(emit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("ranking", [row]);
  });

  it("dedupe: payload idêntico ao último emitido não agenda novo timer", async () => {
    const emit = jest.fn();
    const m = await Test.createTestingModule({
      providers: [RankingGateway],
    }).compile();
    const gw = m.get(RankingGateway);
    gw.server = { emit } as never;

    const row = { rank: 1, playerName: "a", score: 1 };
    gw.broadcast([row]);
    jest.advanceTimersByTime(200);
    expect(emit).toHaveBeenCalledTimes(1);
    gw.broadcast([row]);
    jest.advanceTimersByTime(200);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
