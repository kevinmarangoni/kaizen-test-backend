import { GAME } from "../config/game-constants";

export const IMPROVEMENT_IDS = [
  "5s",
  "kanban",
  "poka",
  "tpm",
  "andon",
  "jidoka",
  "heijunka",
  "jit",
] as const;

export type ImprovementId = (typeof IMPROVEMENT_IDS)[number];

export type ImprovementLevels = Record<ImprovementId, number>;

export type MetricsSnapshot = {
  defectRatePct: number;
  oeePct: number;
  velocityMult: number;
  andonThroughputMult: number;
};

const S = GAME.simulation;
const P = GAME.improvementPerLevelEffects;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function computeMetrics(levels: ImprovementLevels): MetricsSnapshot {
  let defect = S.initialDefectRatePct;
  defect += levels["5s"] * (P["5s"].defectPctDelta ?? 0);
  defect += levels.poka * (P.poka.defectPctDelta ?? 0);
  defect += levels.tpm * (P.tpm.defectPctDelta ?? 0);
  defect += levels.jidoka * (P.jidoka.defectPctDelta ?? 0);
  defect = clamp(defect, S.pctClampMin, S.pctClampMax);

  let oee = S.initialOeePct;
  oee += levels.tpm * (P.tpm.oeePctDelta ?? 0);
  oee += levels.heijunka * (P.heijunka.oeePctDelta ?? 0);
  oee = clamp(oee, S.pctClampMin, S.pctClampMax);

  let velocity = S.basePiecesPerSecond;
  velocity += levels["5s"] * (P["5s"].velocityMultDelta ?? 0);
  velocity += levels.kanban * (P.kanban.velocityMultDelta ?? 0);
  velocity += levels.jidoka * (P.jidoka.velocityMultDelta ?? 0);
  if (defect < S.jitDefectThresholdPct) {
    velocity +=
      levels.jit * (P.jit.velocityMultDeltaWhenDefectBelowThreshold ?? 0);
  }

  const andonThroughputMult =
    1 + levels.andon * (P.andon.throughputMultDelta ?? 0);

  return {
    defectRatePct: defect,
    oeePct: oee,
    velocityMult: Math.max(S.velocityFloor, velocity),
    andonThroughputMult,
  };
}

export function piecesPerSecond(levels: ImprovementLevels): number {
  const m = computeMetrics(levels);
  const oeeFactor = m.oeePct / S.referenceOeeForThroughput;
  return (
    S.basePiecesPerSecond *
    m.velocityMult *
    oeeFactor *
    m.andonThroughputMult
  );
}

/** Máximo de peças **boas** em um tick de 1s se o RNG favorecer 100% bons (mesma lógica do cliente). */
export function maxGoodPiecesPerSecondTick(levels: ImprovementLevels): number {
  const rate = piecesPerSecond(levels);
  const WHOLE = S.wholePieceThreshold;
  let maxGood = 0;
  const steps = 500;
  for (let i = 0; i <= steps; i++) {
    const carryIn = (i / steps) * (1 - 1e-9);
    let carry = carryIn + rate;
    let good = 0;
    while (carry >= WHOLE) {
      carry -= WHOLE;
      good++;
    }
    maxGood = Math.max(maxGood, good);
  }
  return maxGood;
}

export function clampElapsedSecondsForCeiling(elapsedSeconds: number): number {
  const cap = GAME.persistence.maxOfflineHours * 3600;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return 0;
  return Math.min(elapsedSeconds, cap);
}
