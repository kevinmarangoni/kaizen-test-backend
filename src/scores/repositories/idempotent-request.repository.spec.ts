import { IdempotentRequestRepository } from "./idempotent-request.repository";

describe("IdempotentRequestRepository.persistResponse", () => {
  it("engole E11000 de upsert concorrente", async () => {
    const exec = jest.fn().mockRejectedValue({ code: 11000 });
    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue({ exec }),
    };
    const repo = new IdempotentRequestRepository(model as never);
    await expect(
      repo.persistResponse("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", 200, { ok: true }),
    ).resolves.toBeUndefined();
  });
});
