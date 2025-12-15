import { db, uid } from "../_data";

export async function GET() {
  return Response.json(db.categories);
}

export async function POST(req: Request) {
  const { name, parentId } = await req.json();
  if (!name) return new Response("name required", { status: 400 });
  db.categories.push({ id: uid(), name, parentId: parentId || null });
  return Response.json({ ok: true });
}
