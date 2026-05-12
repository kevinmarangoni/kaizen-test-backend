import { loadEnvFilesWithOverride } from "./load-env";

loadEnvFilesWithOverride();

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { AppModule } from "./app.module";

async function bootstrap() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const corsOrigins =
    process.env.CORS_ORIGIN?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  if (nodeEnv === "production" && corsOrigins.length === 0) {
    throw new Error(
      "CORS_ORIGIN é obrigatório em produção (origens separadas por vírgula).",
    );
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(json({ limit: "10kb" }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: nodeEnv === "production" ? corsOrigins : corsOrigins.length ? corsOrigins : true,
    credentials: true,
  });
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  await app.listen(port);
}
bootstrap().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
