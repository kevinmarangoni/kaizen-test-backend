import { Test } from "@nestjs/testing";
import { AnticheatService } from "./anticheat.service";
import type { ImprovementLevels } from "./game-simulation";

const zeroLevels: ImprovementLevels = {
  "5s": 0,
  kanban: 0,
  poka: 0,
  tpm: 0,
  andon: 0,
  jidoka: 0,
  heijunka: 0,
  jit: 0,
};

describe("AnticheatService", () => {
  let svc: AnticheatService;

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [AnticheatService],
    }).compile();
    svc = m.get(AnticheatService);
  });

  it("aceita score zero", () => {
    expect(svc.isScorePlausible(0, zeroLevels, 3600)).toBe(true);
  });

  it("rejeita score impossível para tempo curto", () => {
    expect(svc.isScorePlausible(1_000_000, zeroLevels, 10)).toBe(false);
  });

  it("trunca tempo acima de 8h no teto", () => {
    const a = svc.computeScoreCeiling(zeroLevels, 8 * 3600);
    const b = svc.computeScoreCeiling(zeroLevels, 8 * 3600 + 99_999);
    expect(b.ceilingRaw).toBe(a.ceilingRaw);
  });

  it("permite score dentro da margem sobre o teto bruto", () => {
    const { ceilingRaw, ceilingWithMargin } = svc.computeScoreCeiling(
      zeroLevels,
      100,
    );
    expect(ceilingWithMargin).toBeGreaterThan(ceilingRaw);
    expect(svc.isScorePlausible(ceilingWithMargin, zeroLevels, 100)).toBe(true);
  });
});
