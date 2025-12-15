import { prisma } from './db';
async function run(){
  const br=await prisma.branch.upsert({ where:{code:'HQ'}, update:{name:'Head Office'}, create:{code:'HQ', name:'Head Office'} });
  const cat=await prisma.category.create({ data:{ name:'Burgers', sort:1 } });
  const p1=await prisma.product.create({ data:{ sku:'BG-001', name:'Classic Burger', categoryId:cat.id, basePrice:18, taxRate:0.15 } });
  await prisma.productSize.createMany({ data:[{productId:p1.id,name:'Single',price:18,code:'S'},{productId:p1.id,name:'Double',price:24,code:'D'}] });
  const p2=await prisma.product.create({ data:{ sku:'BG-002', name:'Cheese Burger', categoryId:cat.id, basePrice:20, taxRate:0.15 } });
  await prisma.productSize.createMany({ data:[{productId:p2.id,name:'Single',price:20,code:'S'},{productId:p2.id,name:'Double',price:26,code:'D'}] });
  console.log('Seeded Branch/Category/Products. BranchId:', br.id); process.exit(0);
}
run().catch(e=>{ console.error(e); process.exit(1); });
