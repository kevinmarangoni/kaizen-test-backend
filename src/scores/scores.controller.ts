import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { CreateScoreDto } from "./dto/create-score.dto";
import { ScoresService } from "./scores.service";

@Controller("scores")
export class ScoresController {
  constructor(private readonly scores: ScoresService) {}

  @Post()
  async postScore(
    @Body() body: CreateScoreDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>> {
    const out = await this.scores.createScore(body);
    res.status(out.status);
    if (out.headers) {
      for (const [k, v] of Object.entries(out.headers)) {
        res.setHeader(k, v);
      }
    }
    return out.body;
  }

  /** Polling do cliente roda a cada 5s; cache curto reduz carga sem perder atualidade percebida. */
  @Get("top")
  @Header("Cache-Control", "public, max-age=5, must-revalidate")
  async top(@Query("limit") limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : 10;
    return this.scores.getTop(Number.isFinite(n) ? n : 10);
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  async me(@Query("playerName") playerName: string) {
    if (!playerName || !playerName.trim()) {
      throw new BadRequestException("playerName é obrigatório");
    }
    return this.scores.getMe(playerName);
  }
}
