import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server } from "socket.io";
import type { TopEntry } from "./scores.service";

function parseCorsOrigins(): string[] | boolean {
  const raw = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean);
  if (raw?.length) return raw;
  return process.env.NODE_ENV === "production" ? false : true;
}

@WebSocketGateway({
  namespace: "/ranking",
  cors: { origin: parseCorsOrigins(), credentials: true },
})
export class RankingGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly log = new Logger(RankingGateway.name);
  private lastEmittedJson: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: TopEntry[] | null = null;

  handleConnection(client: { id: string }) {
    this.log.log({ msg: "ranking_ws_connect", clientId: client.id });
  }

  /** Envia o top 10 com debounce + dedupe para evitar rajadas em muitos saves. */
  broadcast(top: TopEntry[]): void {
    const json = JSON.stringify(top);
    if (json === this.lastEmittedJson) return;
    this.pending = top;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (!this.pending) return;
      const out = JSON.stringify(this.pending);
      if (out !== this.lastEmittedJson) {
        this.server.emit("ranking", this.pending);
        this.lastEmittedJson = out;
      }
      this.pending = null;
    }, 150);
  }
}
