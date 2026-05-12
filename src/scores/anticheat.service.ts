import { Injectable } from "@nestjs/common";
import type { ImprovementLevels } from "./game-simulation";
import {
  clampElapsedSecondsForCeiling,
  maxGoodPiecesPerSecondTick,
} from "./game-simulation";

/**
 * Margem documentada sobre o teto teórico (REGRA 3 do desafio):
 * - +2% do teto arredondado para cima
 * - +15 pontos fixos (cadeia de carry entre ticks e arredondamentos)
 */
const MARGIN_RATIO = 0.02;
const MARGIN_FLAT = 15;

@Injectable()
export class AnticheatService {
  /** Teto máximo de Kaizen (1 por peça boa) no intervalo, com margem. */
  computeScoreCeiling(
    improvements: ImprovementLevels,
    elapsedSeconds: number,
  ): { ceilingRaw: number; ceilingWithMargin: number } {
    const t = clampElapsedSecondsForCeiling(elapsedSeconds);
    const perSec = maxGoodPiecesPerSecondTick(improvements);
    const ceilingRaw = perSec * t;
    const ceilingWithMargin =
      ceilingRaw + Math.ceil(ceilingRaw * MARGIN_RATIO) + MARGIN_FLAT;
    return { ceilingRaw, ceilingWithMargin };
  }

  isScorePlausible(
    score: number,
    improvements: ImprovementLevels,
    elapsedSeconds: number,
  ): boolean {
    const { ceilingWithMargin } = this.computeScoreCeiling(
      improvements,
      elapsedSeconds,
    );
    return score <= ceilingWithMargin;
  }
}
