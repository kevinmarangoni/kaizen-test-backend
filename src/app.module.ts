import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { LoggerModule } from "nestjs-pino";
import { ScoresModule } from "./scores/scores.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      /** Tenta `api/.env` com cwd em `api/`; em monorepo, às vezes cwd é a raiz — inclui `api/.env`. */
      envFilePath: [".env", ".env.local", "api/.env"],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        genReqId: (req, res) => {
          const h = req.headers["x-request-id"];
          const id =
            typeof h === "string" && h.trim().length > 0 ? h.trim() : randomUUID();
          res.setHeader("x-request-id", id);
          return id;
        },
      },
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>("MONGODB_URI")?.trim();
        if (!uri) {
          throw new Error(
            "Defina MONGODB_URI no arquivo api/.env (ou no ambiente). Ex.: copie .env.example para .env.",
          );
        }
        return { uri };
      },
      inject: [ConfigService],
    }),
    ScoresModule,
  ],
})
export class AppModule {}
