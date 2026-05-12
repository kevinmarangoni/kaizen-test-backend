import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AnticheatService } from "./anticheat.service";
import {
  IdempotentRequest,
  IdempotentRequestSchema,
} from "./schemas/idempotent-request.schema";
import {
  PlayerAggregate,
  PlayerAggregateSchema,
} from "./schemas/player-aggregate.schema";
import { IdempotentRequestRepository } from "./repositories/idempotent-request.repository";
import { PlayerAggregateRepository } from "./repositories/player-aggregate.repository";
import { RankingGateway } from "./ranking.gateway";
import { ScoresController } from "./scores.controller";
import { ScoresService } from "./scores.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IdempotentRequest.name, schema: IdempotentRequestSchema },
      { name: PlayerAggregate.name, schema: PlayerAggregateSchema },
    ]),
  ],
  controllers: [ScoresController],
  providers: [
    ScoresService,
    AnticheatService,
    RankingGateway,
    PlayerAggregateRepository,
    IdempotentRequestRepository,
  ],
  exports: [ScoresService],
})
export class ScoresModule {}
