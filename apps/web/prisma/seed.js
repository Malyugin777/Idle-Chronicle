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
    { code: 'werewolf', name: 'Werewolf', title: 'Night Hunter', baseHp: 1500000n, defense: 15, order: 4, isActive: true, iconUrl: '🐺', ragePhases: JSON.stringify([1, 1.3, 1.6, 2.2]) },
    { code: 'demon', name: 'Demon', title: 'Lord of Hell', baseHp: 2000000n, defense: 20, order: 5, isActive: true, iconUrl: '👹', ragePhases: JSON.stringify([1, 1.3, 1.7, 2.5]) },
    { code: 'kraken', name: 'Kraken', title: 'Terror of the Deep', baseHp: 3000000n, defense: 30, order: 6, isActive: true, iconUrl: '🐙', ragePhases: JSON.stringify([1, 1.4, 1.7, 2.5]) },
    { code: 'dragon', name: 'Dragon', title: 'Ancient Beast', baseHp: 5000000n, defense: 50, order: 7, isActive: true, iconUrl: '🐉', ragePhases: JSON.stringify([1, 1.4, 1.8, 3]) },
    { code: 'hydra', name: 'Hydra', title: 'Many-Headed Serpent', baseHp: 7500000n, defense: 75, order: 8, isActive: true, iconUrl: '🐍', ragePhases: JSON.stringify([1, 1.4, 1.9, 3.5]) },
    { code: 'phoenix', name: 'Phoenix', title: 'Immortal Flame', baseHp: 10000000n, defense: 100, order: 9, isActive: true, iconUrl: '🔥', ragePhases: JSON.stringify([1, 1.5, 2, 4]) },
    { code: 'ancient_dragon', name: 'Ancient Dragon', title: 'The Final Boss', baseHp: 15000000n, defense: 150, order: 10, isActive: true, iconUrl: '🏴', ragePhases: JSON.stringify([1, 1.5, 2.2, 5]) },
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
