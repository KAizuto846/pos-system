import { auth } from "@/lib/auth";
import { createWorker } from "tesseract.js";

// Helper: extract dates from text using regex patterns
function extractDates(pattern: RegExp, input: string, transform: (...groups: string[]) => Date | null): string[] {
  const results: string[] = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let match;
  while ((match = regex.exec(input)) !== null) {
    try {
      const date = transform(...match.slice(1));
      if (date && !isNaN(date.getTime())) {
        const iso = date.toISOString().split("T")[0];
        if (!results.includes(iso)) results.push(iso);
      }
    } catch { /* skip malformed */ }
  }
  return results;
}

const monthMap: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;
    const productId = formData.get("productId") as string | null;

    if (!imageFile) {
      return Response.json({ error: "No se recibió imagen" }, { status: 400 });
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // OCR con Tesseract.js en español
    const worker = await createWorker("spa");
    const { data } = await worker.recognize(buffer);
    await worker.terminate();

    const text = data.text || "";
    const foundDates: string[] = [];

    // DD/MM/YYYY
    foundDates.push(...extractDates(
      /\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/g, text,
      (_d, _m, _y) => new Date(parseInt(_y), parseInt(_m) - 1, parseInt(_d))
    ));

    // YYYY/MM/DD
    foundDates.push(...extractDates(
      /\b(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})\b/g, text,
      (_y, _m, _d) => new Date(parseInt(_y), parseInt(_m) - 1, parseInt(_d))
    ));

    // DD de MES de YYYY
    foundDates.push(...extractDates(
      /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})\b/gi, text,
      (_d, monthName, _y) => {
        const m = monthMap[monthName.toLowerCase()];
        return m ? new Date(parseInt(_y), m - 1, parseInt(_d)) : null;
      }
    ));

    // EXP/CAD/VTO labels
    foundDates.push(...extractDates(
      /(?:EXP|CAD|VENCE|VTO|VAL|VEN)[:\s]*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/gi, text,
      (_d, _m, _y) => new Date(parseInt(_y), parseInt(_m) - 1, parseInt(_d))
    ));

    // DD Mon YYYY
    foundDates.push(...extractDates(
      /\b(\d{2})\s+([A-Z][a-z]{2,})\s+(\d{4})\b/g, text,
      (_d, _mon, _y) => new Date(`${_mon} ${_d}, ${_y}`)
    ));

    const uniqueDates = [...new Set(foundDates)].sort();

    return Response.json({
      success: true,
      rawText: text.trim().substring(0, 1000),
      datesFound: uniqueDates,
      imageSize: buffer.length,
      productId: productId || null,
    });
  } catch (error) {
    console.error("Error scanning expiry:", error);
    return Response.json({ error: "Error al escanear fecha de vencimiento" }, { status: 500 });
  }
}
