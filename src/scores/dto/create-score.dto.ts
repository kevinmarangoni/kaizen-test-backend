import { Type } from "class-transformer";
import {
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

/** Corpo alinhado ao save do cliente (níveis 0–5 por melhoria). */
export class ImprovementsBodyDto {
  @IsInt() @Min(0) @Max(5) "5s": number;
  @IsInt() @Min(0) @Max(5) kanban: number;
  @IsInt() @Min(0) @Max(5) poka: number;
  @IsInt() @Min(0) @Max(5) tpm: number;
  @IsInt() @Min(0) @Max(5) andon: number;
  @IsInt() @Min(0) @Max(5) jidoka: number;
  @IsInt() @Min(0) @Max(5) heijunka: number;
  @IsInt() @Min(0) @Max(5) jit: number;
}

export class CreateScoreDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  playerName: string;

  @IsInt()
  @Min(0)
  score: number;

  @ValidateNested()
  @Type(() => ImprovementsBodyDto)
  improvements: ImprovementsBodyDto;

  @IsInt()
  @Min(0)
  elapsedSeconds: number;

  @IsUUID("4")
  requestId: string;
}
