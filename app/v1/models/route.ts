import { MODELS } from "@/lib/data";
import { IMAGE_MODELS } from "@/lib/images";

export function GET(req: Request) {
  const onlyUncensored = new URL(req.url).searchParams.get("uncensored") === "true";
  const data = MODELS.filter((m) => !onlyUncensored || m.uncensored).map((m) => ({
    id: m.id,
    object: "model",
    owned_by: m.provider,
    name: m.name,
    context_length: m.context,
    uncensored: m.uncensored,
    pricing: { prompt_per_1m_usd: m.input, completion_per_1m_usd: m.output },
  }));
  const images = IMAGE_MODELS.filter((m) => !onlyUncensored || m.uncensored).map((m) => ({
    id: m.id, object: "model", type: "image", name: m.name, uncensored: m.uncensored, pricing: { per_image_usd: m.perImage },
  }));
  return Response.json({ object: "list", data: [...data, ...images] });
}
