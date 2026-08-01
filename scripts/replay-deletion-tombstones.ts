import prisma from "../app/db.server";
import {
  countDeletionTombstoneConflicts,
  replayDeletionTombstones,
} from "../app/privacy/privacy-service.server";

const confirmation = "REPLAY_DELETION_TOMBSTONES_ON_ISOLATED_RESTORE";
if (process.env.RESTORE_VERIFICATION !== confirmation) {
  throw new Error(`RESTORE_VERIFICATION must equal ${confirmation}`);
}

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
const expectedHost = process.env.RESTORE_DATABASE_EXPECTED_HOST;
const expectedDatabase = process.env.RESTORE_DATABASE_EXPECTED_NAME;
const actualDatabase = databaseUrl.pathname.replace(/^\//u, "");
if (
  !expectedHost ||
  !expectedDatabase ||
  databaseUrl.hostname !== expectedHost ||
  actualDatabase !== expectedDatabase
) {
  throw new Error(
    "The restore database host/name does not match the explicit expected target",
  );
}

try {
  const replayed = await replayDeletionTombstones();
  const conflicts = await countDeletionTombstoneConflicts();
  if (conflicts !== 0) {
    throw new Error("Deletion tombstone conflicts remain after replay");
  }
  process.stdout.write(
    `Deletion tombstone replay passed; protected rows changed: ${replayed}.\n`,
  );
} finally {
  await prisma.$disconnect();
}
