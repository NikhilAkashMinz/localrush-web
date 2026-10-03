// Picks the database: MongoDB when MONGODB_URI is set, otherwise memory.
// The choice is made once and kept on globalThis, so hot reloads in development and every
// API route share the same connection (and, in memory mode, the same data).

import { createMemoryRepo } from './memory';
import type { Repo } from './types';

type Holder = { __localrushRepo?: Promise<Repo> };
const holder = globalThis as Holder;

export function getRepo(): Promise<Repo> {
  if (!holder.__localrushRepo) {
    const uri = process.env.MONGODB_URI;
    if (uri) {
      holder.__localrushRepo = import('./mongo').then((m) => m.createMongoRepo(uri));
      // A failed connection should be retried on the next request, not remembered forever.
      holder.__localrushRepo.catch(() => {
        holder.__localrushRepo = undefined;
      });
    } else {
      console.warn('[localrush] MONGODB_URI is not set: keeping data in memory. It resets when the server restarts.');
      holder.__localrushRepo = Promise.resolve(createMemoryRepo());
    }
  }
  return holder.__localrushRepo;
}

/** Tests only: start again with a fresh in-memory database. */
export function useFreshMemoryRepo() {
  const repo = createMemoryRepo();
  holder.__localrushRepo = Promise.resolve(repo);
  return repo;
}

/** Tests only: use this database from now on. */
export function useRepo(repo: Repo) {
  holder.__localrushRepo = Promise.resolve(repo);
  return repo;
}

export const storeMode = () => (process.env.MONGODB_URI ? 'mongo' : 'memory');
