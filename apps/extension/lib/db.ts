import Dexie, { type Table } from 'dexie';
import type { Annotation, List, ListItem, Reaction, User } from '@vitrum/model';
import { AGENTS, FRIENDS, ME } from './personas';
import { id } from './util';

class VitrumDB extends Dexie {
  users!: Table<User, string>;
  annotations!: Table<Annotation, string>;
  lists!: Table<List, string>;
  listItems!: Table<ListItem, string>;
  reactions!: Table<Reaction, string>;

  constructor() {
    super('vitrum');
    this.version(1).stores({
      users: 'id, handle, kind',
      annotations: 'id, pageUrl, authorId, parentId, createdAt',
      lists: 'id, name, createdAt',
      listItems: 'id, listId, pageUrl, annotationId, createdAt',
    });
    this.version(2).stores({
      reactions: 'id, annotationId, userId, [annotationId+userId]',
    });
  }
}

export const db = new VitrumDB();

/** Idempotent: creates the built-in users and a starter list on first run. */
export async function ensureBaseData(): Promise<void> {
  const count = await db.users.count();
  if (count > 0) return;
  await db.users.bulkAdd([ME, ...AGENTS, ...FRIENDS]);
  await db.lists.add({ id: id(), name: 'Reading list', createdAt: Date.now() });
}
