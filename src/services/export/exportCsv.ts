import { Directory, File, Paths } from 'expo-file-system'
import type { Repositories } from '../db/repositories'
import { csvRow } from './csv'
import { SUMMARY_HEADER, SAMPLES_HEADER, summaryRowFields, sampleRowFields } from './csvRows'

/**
 * How many rows accumulate in memory before being flushed to disk with one
 * write() call — see docs/07-architecture.md "Export": "Streamed in
 * chunks, not built as one in-memory string." A year of samples is
 * millions of rows; this keeps peak memory bounded to one chunk rather
 * than the whole export, regardless of database size.
 */
const CHUNK_ROWS = 1000

export interface ExportCsvResult {
  summaryFile: File
  samplesFile: File
}

/**
 * Streams the two CSV files docs/03/docs/07 specify — a summary (one row
 * per effort, with full session/set/exercise context so the numbers are
 * interpretable without the app) and raw samples (one row per reading,
 * keyed by effort id). Written to the app's document directory rather
 * than cache, since a share-sheet handoff can take a moment and cache
 * files are not guaranteed to survive that (docs/07 "Export"). Field
 * order/mapping lives in csvRows.ts, which is unit-tested directly; this
 * file is the I/O orchestration around it (chunking, file lifecycle),
 * verified live rather than mocked — see csvRows.test.ts for why.
 */
export async function exportCsv(repos: Repositories): Promise<ExportCsvResult> {
  const dateStamp = new Date().toISOString().slice(0, 10)
  const exportDir = new Directory(Paths.document, 'exports')
  if (!exportDir.exists) exportDir.create({ intermediates: true })

  const summaryFile = new File(exportDir, `pascal-summary-${dateStamp}.csv`)
  const samplesFile = new File(exportDir, `pascal-samples-${dateStamp}.csv`)

  await writeStreamedCsv(
    summaryFile,
    SUMMARY_HEADER,
    repos.efforts.listForExport(),
    summaryRowFields,
  )
  await writeStreamedCsv(
    samplesFile,
    SAMPLES_HEADER,
    repos.samples.listAllForExport(),
    sampleRowFields,
  )

  return { summaryFile, samplesFile }
}

async function writeStreamedCsv<T>(
  file: File,
  header: string[],
  rows: AsyncIterable<T>,
  toFields: (row: T) => (string | number | null)[],
): Promise<void> {
  if (file.exists) file.delete()
  file.create({ intermediates: true })
  file.write(csvRow(header))

  let chunk = ''
  let rowsInChunk = 0
  for await (const row of rows) {
    chunk += csvRow(toFields(row))
    rowsInChunk++
    if (rowsInChunk >= CHUNK_ROWS) {
      file.write(chunk, { append: true })
      chunk = ''
      rowsInChunk = 0
    }
  }
  if (chunk.length > 0) {
    file.write(chunk, { append: true })
  }
}
