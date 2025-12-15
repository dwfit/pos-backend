import { db, uid } from "../../../_data";

export async function POST(_req: Request, { params }: { params: { groupId: string } }) {
  const body = await _req.json();
  const g = db.modifiers.find(x => x.id === params.groupId);
  if (!g) return new Response("group not found", { status: 404 });
  if (!body?.name) return new Response("item name required", { status: 400 });
  g.items.push({ id: uid(), name: body.name, price: Number(body.price || 0) });
  return Response.json({ ok: true });
}
