import { prisma } from "@/lib/db/prisma";

async function main() {
  const users = await prisma.app_users.findMany({
    select: { user_id: true, alias: true, first_name: true, last_name: true, role: true, active: true },
    orderBy: { created_at: "desc" },
    take: 5,
  });
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
