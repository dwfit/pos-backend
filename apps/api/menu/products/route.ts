import { db, uid } from "../_data";

export async function GET() {
  return Response.json(db.products);
}

export async function POST(req: Request) {
  const { sku, name, categoryId, sizes } = await req.json();
  if (!sku || !name || !categoryId) return new Response("Missing fields", { status: 400 });
  db.products.push({ id: uid(), sku, name, categoryId, sizes: (sizes || []).map((s:any)=>({size: s.size, price: Number(s.price||0)})) });
  return Response.json({ ok: true });
}
