-- Data lama: tautkan pembimbing perusahaan yang sudah ada ke kelompok lama.
-- Pembimbing dengan ID paling kecil menjadi penilai utama awal; Admin dapat
-- mengubahnya pada Detail Kelompok.
INSERT INTO `group_dudi_mentors` (`id`, `groupId`, `dudiUserId`, `isPrimary`, `assignedAt`)
SELECT CONCAT('backfill_', LEFT(MD5(CONCAT(g.id, cm.userId)), 18)), g.id, cm.userId,
       (cm.userId = (
         SELECT MIN(cm2.userId) FROM `company_mentors` cm2 WHERE cm2.companyId = g.companyId
       )), NOW(3)
FROM `groups` g
JOIN `company_mentors` cm ON cm.companyId = g.companyId
LEFT JOIN `group_dudi_mentors` gdm ON gdm.groupId = g.id AND gdm.dudiUserId = cm.userId
WHERE g.deletedAt IS NULL AND gdm.id IS NULL;
