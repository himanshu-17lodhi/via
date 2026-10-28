import { Manifest } from './Manifest';
import { RcloneEngine } from './RcloneEngine';
import { ConflictResult } from '../types';

export class ConflictEngine {
  constructor(
    private manifest: Manifest,
    private rcloneEngine: RcloneEngine,
  ) {}

  async detectConflicts(): Promise<ConflictResult[]> {
    const conflicts: ConflictResult[] = [];
    const remoteState = await this.rcloneEngine.fetchRemoteState();
    const lastSynced = this.manifest.data.files;

    // Compare each file
    const allPaths = new Set([
      ...Object.keys(lastSynced),
      ...Object.keys(remoteState),
    ]);

    for (const path of allPaths) {
      const local = lastSynced[path];
      const remote = remoteState[path];

      if (!local || !remote) continue;

      // If remote mtime differs from what we last recorded, the remote changed
      if (remote.mtime !== local.mtime) {
        conflicts.push({
          path,
          localMtime: local.mtime,
          remoteMtime: remote.mtime,
          lastSyncedMtime: local.mtime,
          reason: 'Remote file changed since last sync',
        });
      }
    }

    return conflicts;
  }
}
