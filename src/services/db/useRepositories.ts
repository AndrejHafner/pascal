import { useEffect, useState } from 'react'
import { openDatabase } from './client'
import { createRepositories } from './repositories'
import type { Repositories } from './repositories'

/**
 * Opens the app database once and hands back the repositories — the
 * common "load repos, then render" pattern every screen touching
 * persistence needs. Returns null while opening (migrations run on first
 * open — see docs/07 "Database" — so this can take a moment on cold start).
 */
export function useRepositories(): Repositories | null {
  const [repos, setRepos] = useState<Repositories | null>(null)

  useEffect(() => {
    let cancelled = false
    openDatabase().then((db) => {
      if (!cancelled) setRepos(createRepositories(db))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return repos
}
