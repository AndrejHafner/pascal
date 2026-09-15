import type { SQLiteDatabase } from 'expo-sqlite'
import { ExerciseRepository } from './exerciseRepository'
import { SessionRepository } from './sessionRepository'
import { TrainingSetRepository } from './trainingSetRepository'
import { EffortRepository } from './effortRepository'
import { SampleRepository } from './sampleRepository'
import { MaxRecordRepository } from './maxRecordRepository'
import { SessionPlanRepository } from './sessionPlanRepository'

export {
  ExerciseRepository,
  SessionRepository,
  TrainingSetRepository,
  EffortRepository,
  SampleRepository,
  MaxRecordRepository,
  SessionPlanRepository,
}

export interface Repositories {
  exercises: ExerciseRepository
  sessions: SessionRepository
  trainingSets: TrainingSetRepository
  efforts: EffortRepository
  samples: SampleRepository
  maxRecords: MaxRecordRepository
  sessionPlans: SessionPlanRepository
}

export function createRepositories(db: SQLiteDatabase): Repositories {
  return {
    exercises: new ExerciseRepository(db),
    sessions: new SessionRepository(db),
    trainingSets: new TrainingSetRepository(db),
    efforts: new EffortRepository(db),
    samples: new SampleRepository(db),
    maxRecords: new MaxRecordRepository(db),
    sessionPlans: new SessionPlanRepository(db),
  }
}
