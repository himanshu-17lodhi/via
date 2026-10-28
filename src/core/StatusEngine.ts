import { App } from 'obsidian';
import { Manifest } from './Manifest';
import { IgnoreEngine } from './IgnoreEngine';
import { SyncStatus } from '../types';

export class StatusEngine {
  constructor(
    private app: App,
    private manifest: Manifest,
    private ignoreEngine: IgnoreEngine,
  ) {}

  async compute(): Promise<SyncStatus[]> {
    const result: SyncStatus[] = [];
    const localFiles = this.app.vault.getFiles();
    const localPaths = new Set<string>();

    // 1. Detect Added / Modified
    for (const file of localFiles) {
      if (this.ignoreEngine.shouldIgnore(file.path)) continue;
      localPaths.add(file.path);

      const tracked = this.manifest.getFile(file.path);
      const stat = await this.app.vault.adapter.stat(file.path);
      if (!stat) continue;

      if (!tracked) {
        result.push({ type: 'added', path: file.path });
      } else if (stat.mtime !== tracked.mtime || stat.size !== tracked.size) {
        result.push({ type: 'modified', path: file.path });
      }
    }

    // 2. Detect Deleted
    for (const trackedPath of Object.keys(this.manifest.data.files)) {
      if (!localPaths.has(trackedPath)) {
        result.push({ type: 'deleted', path: trackedPath });
      }
    }

    return result;
  }

  async updateManifestFromLocal(): Promise<void> {
    const files = this.app.vault.getFiles();
    for (const file of files) {
      if (this.ignoreEngine.shouldIgnore(file.path)) continue;
      const stat = await this.app.vault.adapter.stat(file.path);
      if (!stat) continue;

      this.manifest.setFile(file.path, {
        path: file.path,
        mtime: stat.mtime,
        size: stat.size,
      });
    }

    const localPaths = new Set(files.map((f) => f.path));
    for (const trackedPath of Object.keys(this.manifest.data.files)) {
      if (!localPaths.has(trackedPath)) {
        this.manifest.removeFile(trackedPath);
      }
    }

    this.manifest.markSynced();
    await this.manifest.save();
  }
}
