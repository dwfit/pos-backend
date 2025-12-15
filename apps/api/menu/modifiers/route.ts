import { db, uid } from "../_data";

export async function GET() {
  return Response.json(db.modifiers);
}

export async function POST(req: Request) {
  const { name, min = 0, max = 1 } = await req.json();
  if (!name) return new Response("name required", { status: 400 });
  db.modifiers.push({ id: uid(), name, min: Number(min), max: Number(max), items: [] });
  return Response.json({ ok: true });
}
