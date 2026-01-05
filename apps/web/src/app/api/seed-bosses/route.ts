import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');

  if (secret !== 'setup2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Clear existing bosses
    await prisma.boss.deleteMany();

    // Create bosses
    const bosses = [
      { code: 'lizard', name: 'Lizard', title: 'Swamp Creature', baseHp: BigInt(500000), defense: 0, order: 1, isActive: true, iconUrl: '🦎', ragePhases: [1, 1.2, 1.5, 2] },
      { code: 'golem', name: 'Golem', title: 'Stone Guardian', baseHp: BigInt(750000), defense: 5, order: 2, isActive: true, iconUrl: '🗿', ragePhases: [1, 1.2, 1.5, 2] },
      { code: 'spider_queen', name: 'Spider Queen', title: 'Queen of Darkness', baseHp: BigInt(1000000), defense: 10, order: 3, isActive: true, iconUrl: '🕷️', ragePhases: [1, 1.3, 1.6, 2.2] },
      { code: 'werewolf', name: 'Werewolf', title: 'Night Hunter', baseHp: BigInt(1500000), defense: 15, order: 4, isActive: true, iconUrl: '🐺', ragePhases: [1, 1.3, 1.6, 2.2] },
      { code: 'demon', name: 'Demon', title: 'Lord of Hell', baseHp: BigInt(2000000), defense: 20, order: 5, isActive: true, iconUrl: '👹', ragePhases: [1, 1.3, 1.7, 2.5] },
      { code: 'kraken', name: 'Kraken', title: 'Terror of the Deep', baseHp: BigInt(3000000), defense: 30, order: 6, isActive: true, iconUrl: '🐙', ragePhases: [1, 1.4, 1.7, 2.5] },
      { code: 'dragon', name: 'Dragon', title: 'Ancient Beast', baseHp: BigInt(5000000), defense: 50, order: 7, isActive: true, iconUrl: '🐉', ragePhases: [1, 1.4, 1.8, 3] },
      { code: 'hydra', name: 'Hydra', title: 'Many-Headed Serpent', baseHp: BigInt(7500000), defense: 75, order: 8, isActive: true, iconUrl: '🐍', ragePhases: [1, 1.4, 1.9, 3.5] },
      { code: 'phoenix', name: 'Phoenix', title: 'Immortal Flame', baseHp: BigInt(10000000), defense: 100, order: 9, isActive: true, iconUrl: '🔥', ragePhases: [1, 1.5, 2, 4] },
      { code: 'ancient_dragon', name: 'Ancient Dragon', title: 'The Final Boss', baseHp: BigInt(15000000), defense: 150, order: 10, isActive: true, iconUrl: '🏴', ragePhases: [1, 1.5, 2.2, 5] },
    ];

    const created = [];
    for (const boss of bosses) {
      const result = await prisma.boss.create({ data: boss });
      created.push({ id: result.id, name: result.name, hp: Number(result.baseHp) });
    }

    return NextResponse.json({
      success: true,
      message: 'Bosses seeded successfully',
      bosses: created,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({
      error: 'Seed failed',
      details: String(error),
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
