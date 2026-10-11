import { getDatabase } from '@/db/database';
import { requestToPromise, withTransaction } from '@/db/idb';
import { GOAL_CURRENT_ID, STORE_GOALS } from '@/db/schema';
import type { SavingsGoal } from '@/types/models';

export async function getGoal(): Promise<SavingsGoal | null> {
  const db = await getDatabase();
  const goal = await withTransaction(db, STORE_GOALS, 'readonly', (transaction) =>
    requestToPromise<SavingsGoal | undefined>(
      transaction.objectStore(STORE_GOALS).get(GOAL_CURRENT_ID),
    ),
  );
  return goal ?? null;
}

export async function putGoal(goal: SavingsGoal): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, STORE_GOALS, 'readwrite', (transaction) => {
    transaction.objectStore(STORE_GOALS).put(goal);
  });
}
