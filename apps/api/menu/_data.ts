// In-memory store (dev only)
type Category = { id: string; name: string; parentId?: string | null };
type Product = { id: string; sku: string; name: string; categoryId: string; sizes: { size: string; price: number }[] };
type ModifierItem = { id: string; name: string; price: number };
type ModifierGroup = { id: string; name: string; min: number; max: number; items: ModifierItem[] };

export const db = {
  categories: [
    { id: "c1", name: "Burgers" },
    { id: "c2", name: "Drinks" },
  ] as Category[],
  products: [
    { id: "p1", sku: "BG-001", name: "Classic Burger", categoryId: "c1", sizes: [{ size: "Regular", price: 18 }] },
    { id: "p2", sku: "DR-101", name: "Orange Juice", categoryId: "c2", sizes: [{ size: "300ml", price: 9 }] },
  ] as Product[],
  modifiers: [
    { id: "m1", name: "Add-ons", min: 0, max: 3, items: [
      { id: "mi1", name: "Cheese", price: 2 },
      { id: "mi2", name: "Bacon", price: 4 },
    ]},
  ] as ModifierGroup[],
};

export const uid = () => Math.random().toString(36).slice(2, 9);
