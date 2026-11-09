import { App, normalizePath } from 'obsidian';
import { ManifestData, Commit } from '../settings/types';

const SNAPSHOT_DIR = normalizePath('.via/snapshots');

export class SnapshotEngine {
  constructor(private app: App) {}

  async commit(message: string, manifest: ManifestData): Promise<Commit> {
    const timestamp = Date.now();
    const id = Math.random().toString(36).substring(2, 10);
    const filename = `${SNAPSHOT_DIR}/${timestamp}-${id}.json`;

    const snapshot: Commit = {
      id,
      message: message || '(no message)',
      timestamp,
      fileCount: Object.keys(manifest.files).length,
    };

    const payload = { ...snapshot, files: manifest.files };

    try {
      await this.app.vault.adapter.mkdir(SNAPSHOT_DIR);
    } catch {
      // Directory already exists
    }

    await this.app.vault.adapter.write(
      filename,
      JSON.stringify(payload, null, 2),
    );
    return snapshot;
  }

  async list(): Promise<Commit[]> {
    try {
      const list = await this.app.vault.adapter.list(SNAPSHOT_DIR);
      const commits: Commit[] = [];

      for (const file of list.files) {
        try {
          const content = await this.app.vault.adapter.read(file);
          const data = JSON.parse(content);
          commits.push({
            id: data.id,
            message: data.message,
            timestamp: data.timestamp,
            fileCount: data.fileCount,
          });
        } catch {
          // Skip malformed snapshots
        }
      }

      return commits.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }
  async prune(maxCount: number = 50): Promise<void> {
    try {
      const commits = await this.list();
      if (commits.length <= maxCount) return;

      const toDelete = commits.slice(maxCount);
      const list = await this.app.vault.adapter.list(SNAPSHOT_DIR);

      for (const commit of toDelete) {
        const target = list.files.find((f) => f.includes(commit.id));
        if (target) {
          await this.app.vault.adapter.remove(target);
        }
      }
    } catch (e) {
      console.error('Via: Failed to prune snapshots', e);
    }
  }

  async getSnapshot(id: string): Promise<ManifestData | null> {
    const list = await this.app.vault.adapter.list(SNAPSHOT_DIR);
    const target = list.files.find((f) => f.includes(id));
    if (!target) return null;

    const content = await this.app.vault.adapter.read(target);
    const data = JSON.parse(content);
    return { version: '1.0', lastSync: data.timestamp, files: data.files };
  }
}
