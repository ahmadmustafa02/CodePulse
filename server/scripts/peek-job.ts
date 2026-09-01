import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('job id required');
  const j = await prisma.reviewJob.findUnique({ where: { id } });
  console.log(
    JSON.stringify(
      {
        id: j?.id,
        status: j?.status,
        attempts: j?.attempts,
        lastError: j?.lastError,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
