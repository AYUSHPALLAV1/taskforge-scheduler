import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ log: [] });
async function main() {
  const u = await p.user.findFirst({ where: { email: 'demo@taskforge.dev' } });
  if (!u) { console.log('USER NOT FOUND!'); return; }
  console.log('User ID:', u.id);
  console.log('isActive:', u.isActive);
  console.log('email:', u.email);
  
  // Verify findUnique by ID (what validateUser does)
  const byId = await p.user.findUnique({ where: { id: u.id } });
  console.log('findUnique by ID:', byId ? 'FOUND isActive=' + byId.isActive : 'NOT FOUND');
}
main().catch(console.error).finally(() => p.$disconnect());
