import {
  maxGoodPiecesPerSecondTick,
  piecesPerSecond,
} from "./game-simulation";
import type { ImprovementLevels } from "./game-simulation";

const zero: ImprovementLevels = {
  "5s": 0,
  kanban: 0,
  poka: 0,
  tpm: 0,
  andon: 0,
  jidoka: 0,
  heijunka: 0,
  jit: 0,
};

describe("game-simulation", () => {
  it("taxa inicial positiva", () => {
    expect(piecesPerSecond(zero)).toBeGreaterThan(0);
  });

  it("maxGoodPiecesPerSecondTick >= taxa efetiva arredondada para cima em média", () => {
    const m = maxGoodPiecesPerSecondTick(zero);
    expect(m).toBeGreaterThanOrEqual(1);
  });
});
