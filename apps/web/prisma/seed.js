const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clear existing bosses
  await prisma.boss.deleteMany();

  // Create bosses
  const bosses = [
    { code: 'lizard', name: 'Lizard', title: 'Swamp Creature', baseHp: 500000n, defense: 0, order: 1, isActive: true, iconUrl: '🦎', ragePhases: JSON.stringify([1, 1.2, 1.5, 2]) },
    { code: 'golem', name: 'Golem', title: 'Stone Guardian', baseHp: 750000n, defense: 5, order: 2, isActive: true, iconUrl: '🗿', ragePhases: JSON.stringify([1, 1.2, 1.5, 2]) },
    { code: 'spider_queen', name: 'Spider Queen', title: 'Queen of Darkness', baseHp: 1000000n, defense: 10, order: 3, isActive: true, iconUrl: '🕷️', ragePhases: JSON.stringify([1, 1.3, 1.6, 2.2]) },
    { code: 'demon', name: 'Demon', title: 'Lord of Hell', baseHp: 2000000n, defense: 20, order: 4, isActive: true, iconUrl: '👹', ragePhases: JSON.stringify([1, 1.3, 1.7, 2.5]) },
    { code: 'dragon', name: 'Dragon', title: 'Ancient Beast', baseHp: 5000000n, defense: 50, order: 5, isActive: true, iconUrl: '🐉', ragePhases: JSON.stringify([1, 1.4, 1.8, 3]) },
    { code: 'phoenix', name: 'Phoenix', title: 'Immortal Flame', baseHp: 10000000n, defense: 100, order: 6, isActive: true, iconUrl: '🔥', ragePhases: JSON.stringify([1, 1.5, 2, 4]) },
  ];

  for (const boss of bosses) {
    await prisma.boss.create({ data: boss });
    console.log(`Created boss: ${boss.name}`);
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
