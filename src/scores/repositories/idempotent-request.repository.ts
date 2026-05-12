import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { IdempotentRequest } from "../schemas/idempotent-request.schema";

@Injectable()
export class IdempotentRequestRepository {
  constructor(
    @InjectModel(IdempotentRequest.name)
    private readonly model: Model<IdempotentRequest>,
  ) {}

  findByRequestId(requestId: string) {
    return this.model.findOne({ requestId }).lean<IdempotentRequest | null>().exec();
  }

  async persistResponse(
    requestId: string,
    httpStatus: number,
    responseBody: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.model
        .findOneAndUpdate(
          { requestId },
          {
            $setOnInsert: {
              requestId,
              httpStatus,
              responseBody,
            },
          },
          { upsert: true },
        )
        .exec();
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) return;
      throw err;
    }
  }
}
