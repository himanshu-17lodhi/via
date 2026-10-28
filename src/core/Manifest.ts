import { App, normalizePath } from 'obsidian';
import { ManifestData, FileState } from '../types';

const MANIFEST_PATH = normalizePath('.via/manifest.json');
const VIA_DIR = normalizePath('.via');

export class Manifest {
  public data: ManifestData = {
    version: '1.0',
    lastSync: 0,
    files: {},
  };

  constructor(private app: App) {}

  async load(): Promise<void> {
    try {
      const content = await this.app.vault.adapter.read(MANIFEST_PATH);
      this.data = JSON.parse(content);
    } catch {
      this.data = { version: '1.0', lastSync: 0, files: {} };
    }
  }

  async save(): Promise<void> {
    try {
      await this.app.vault.adapter.mkdir(VIA_DIR);
    } catch {
      // Directory already exists
    }
    await this.app.vault.adapter.write(
      MANIFEST_PATH,
      JSON.stringify(this.data, null, 2),
    );
  }

  getFile(path: string): FileState | undefined {
    return this.data.files[path];
  }

  setFile(path: string, state: FileState): void {
    this.data.files[path] = state;
  }

  removeFile(path: string): void {
    delete this.data.files[path];
  }

  markSynced(): void {
    this.data.lastSync = Date.now();
  }
}
