export interface ViaSettings {
  rclonePath: string;
  remoteName: string;
  remoteFolder: string;
}

export type SyncStatusType =
  | 'added'
  | 'deleted'
  | 'modified'
  | 'error'
  | 'info';

export interface SyncStatus {
  type: SyncStatusType;
  path: string;
  extra?: string;
}

export interface FileState {
  path: string;
  mtime: number;
  size: number;
  hash?: string;
}

export interface ManifestData {
  version: string;
  lastSync: number;
  files: Record<string, FileState>;
}

export interface CommandResult {
  output: string;
  statusData?: SyncStatus[];
  exitCode: number;
}

export interface Commit {
  id: string;
  message: string;
  timestamp: number;
  fileCount: number;
}

export interface ConflictResult {
  path: string;
  localMtime: number;
  remoteMtime: number;
  lastSyncedMtime: number;
  reason: string;
}
export interface CommandResult {
  output: string;
  statusData?: SyncStatus[];
  exitCode: number;
  summary?: {
    files: number;
    percent: string;
  };
}
