import type {
  AppSettings,
  Allocation,
  DatabaseMeta,
  ForecastSnapshot,
  IncomeOpportunity,
  IncomeRecord,
  ISODateTimeString,
  SavingsGoal,
  Transaction,
} from '@/types/models';

export const BACKUP_APP_ID = 'brz-fund' as const;

/** 备份格式版本；与 IndexedDB schema 版本解耦，独立演进。 */
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupData {
  goals: SavingsGoal[];
  opportunities: IncomeOpportunity[];
  incomes: IncomeRecord[];
  transactions: Transaction[];
  allocations: Allocation[];
  snapshots: ForecastSnapshot[];
  settings: AppSettings[];
  meta: DatabaseMeta[];
}

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  backupVersion: number;
  schemaVersion: number;
  exportedAt: ISODateTimeString;
  appVersion: string;
  data: BackupData;
}

export type CsvCell = string | number | null | undefined;
