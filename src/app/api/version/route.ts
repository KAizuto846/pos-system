import { readFileSync } from "fs";
import { join } from "path";

let cachedVersion: string | null = null;

export async function GET() {
  if (cachedVersion) {
    return Response.json({ version: cachedVersion });
  }

  try {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf-8")
    );
    cachedVersion = pkg.version || "0.0.0";
  } catch {
    cachedVersion = "0.0.0";
  }

  return Response.json({ version: cachedVersion });
}
