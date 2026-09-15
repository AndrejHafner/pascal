import { Directory, File, Paths } from 'expo-file-system'
import { openDatabase, DB_NAME } from '../db/client'

const DB_SUBDIRECTORY = 'SQLite'

/**
 * Full-database export — the data-loss mitigation docs/06 flags as "worth
 * treating as a v1 requirement rather than a nicety": CSV loses the
 * ability to resume training seamlessly on a new device, a raw copy of
 * the SQLite file does not.
 *
 * The database runs in WAL mode (docs/07), which means recently committed
 * writes can sit in a separate `-wal` file rather than the main `.db`
 * file until a checkpoint happens. A naive file copy could produce a
 * database missing its most recent session. `wal_checkpoint(TRUNCATE)`
 * forces everything back into the main file and empties the WAL first, so
 * the copied file is a complete, self-contained snapshot that opens
 * correctly on its own — no sidecar `-wal`/`-shm` files needed alongside it.
 */
export async function exportDatabase(): Promise<File> {
  const db = await openDatabase()
  await db.execAsync(`PRAGMA wal_checkpoint(TRUNCATE);`)

  const sourceDbDir = new Directory(Paths.document, DB_SUBDIRECTORY)
  const sourceFile = new File(sourceDbDir, DB_NAME)
  if (!sourceFile.exists) {
    throw new Error(`Database file not found at ${sourceFile.uri}`)
  }

  const dateStamp = new Date().toISOString().slice(0, 10)
  const exportDir = new Directory(Paths.document, 'exports')
  if (!exportDir.exists) exportDir.create({ intermediates: true })

  const destination = new File(exportDir, `pascal-database-${dateStamp}.db`)
  if (destination.exists) destination.delete()
  await sourceFile.copy(destination)

  return destination
}
