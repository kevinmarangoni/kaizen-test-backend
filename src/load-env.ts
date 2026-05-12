import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

/**
 * Garante que `api/.env` (e `.env` na raiz) sobrescrevem variáveis já definidas no ambiente
 * (ex.: MONGODB_URI placeholder no perfil do IDE). O @nestjs/config, por defeito, não faz override.
 */
export function loadEnvFilesWithOverride(): void {
  const paths = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "api", ".env")];
  for (const filePath of paths) {
    if (!existsSync(filePath)) continue;
    const parsed = parse(readFileSync(filePath));
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  }
}
