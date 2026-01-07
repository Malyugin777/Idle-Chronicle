-- ═══════════════════════════════════════════════════════════
-- МИГРАЦИЯ: Перевод generic предметов в novice сет
--
-- Проблема: При дропе создавались generic предметы ("Меч", "Перчатки")
-- вместо использования существующих из items.ts
--
-- Решение: Переназначить все UserEquipment на starter-* предметы
-- ═══════════════════════════════════════════════════════════

-- 1. Показать все Equipment (для диагностики)
-- SELECT id, code, name, slot, rarity, droppable FROM "Equipment";

-- 2. Показать сколько UserEquipment ссылаются на не-starter предметы
-- SELECT COUNT(*) FROM "UserEquipment" ue
-- JOIN "Equipment" e ON ue."equipmentId" = e.id
-- WHERE e.code NOT LIKE 'starter-%';

-- 3. Переназначить UserEquipment на starter- предметы по слоту
-- WEAPON → starter-sword
UPDATE "UserEquipment"
SET "equipmentId" = (SELECT id FROM "Equipment" WHERE code = 'starter-sword' LIMIT 1)
WHERE "equipmentId" IN (
  SELECT id FROM "Equipment"
  WHERE slot = 'WEAPON' AND code NOT LIKE 'starter-%'
);

-- HELMET → starter-helmet
UPDATE "UserEquipment"
SET "equipmentId" = (SELECT id FROM "Equipment" WHERE code = 'starter-helmet' LIMIT 1)
WHERE "equipmentId" IN (
  SELECT id FROM "Equipment"
  WHERE slot = 'HELMET' AND code NOT LIKE 'starter-%'
);

-- CHEST → starter-chest
UPDATE "UserEquipment"
SET "equipmentId" = (SELECT id FROM "Equipment" WHERE code = 'starter-chest' LIMIT 1)
WHERE "equipmentId" IN (
  SELECT id FROM "Equipment"
  WHERE slot = 'CHEST' AND code NOT LIKE 'starter-%'
);

-- GLOVES → starter-gloves
UPDATE "UserEquipment"
SET "equipmentId" = (SELECT id FROM "Equipment" WHERE code = 'starter-gloves' LIMIT 1)
WHERE "equipmentId" IN (
  SELECT id FROM "Equipment"
  WHERE slot = 'GLOVES' AND code NOT LIKE 'starter-%'
);

-- LEGS → starter-legs
UPDATE "UserEquipment"
SET "equipmentId" = (SELECT id FROM "Equipment" WHERE code = 'starter-legs' LIMIT 1)
WHERE "equipmentId" IN (
  SELECT id FROM "Equipment"
  WHERE slot = 'LEGS' AND code NOT LIKE 'starter-%'
);

-- BOOTS → starter-boots
UPDATE "UserEquipment"
SET "equipmentId" = (SELECT id FROM "Equipment" WHERE code = 'starter-boots' LIMIT 1)
WHERE "equipmentId" IN (
  SELECT id FROM "Equipment"
  WHERE slot = 'BOOTS' AND code NOT LIKE 'starter-%'
);

-- SHIELD → starter-shield
UPDATE "UserEquipment"
SET "equipmentId" = (SELECT id FROM "Equipment" WHERE code = 'starter-shield' LIMIT 1)
WHERE "equipmentId" IN (
  SELECT id FROM "Equipment"
  WHERE slot = 'SHIELD' AND code NOT LIKE 'starter-%'
);

-- 4. Удалить все generic Equipment (которые больше не используются)
DELETE FROM "Equipment"
WHERE code NOT LIKE 'starter-%';

-- 5. Убедиться что starter предметы не droppable (они выдаются только в начале)
UPDATE "Equipment"
SET droppable = false
WHERE code LIKE 'starter-%';

-- 6. Проверка результата
-- SELECT e.code, e.name, e.slot, COUNT(ue.id) as users_count
-- FROM "Equipment" e
-- LEFT JOIN "UserEquipment" ue ON e.id = ue."equipmentId"
-- GROUP BY e.id
-- ORDER BY e.slot;
