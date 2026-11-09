import { Plugin, FileSystemAdapter, Notice, Menu, setIcon } from 'obsidian';
import { RcloneEngine } from './core/RcloneEngine';
import { Manifest } from './core/Manifest';
import { StatusEngine } from './core/StatusEngine';
import { IgnoreEngine } from './core/IgnoreEngine';
import { SnapshotEngine } from './core/Snapshot';
import { ConflictEngine } from './core/ConflictEngine';
import { ViaTerminalModal } from './ui/TerminalModal';
import { ViaSettingTab } from './settings/settings';
import { DEFAULT_SETTINGS } from './settings/defaults';
import { ViaSettings } from './settings/types';

export default class ViaPlugin extends Plugin {
  settings!: ViaSettings;
  statusBarItem!: HTMLElement;
  public isBusy: boolean = false;

  viaManifest!: Manifest;
  statusEngine!: StatusEngine;
  ignoreEngine!: IgnoreEngine;
  snapshotEngine!: SnapshotEngine;
  conflictEngine!: ConflictEngine;
  rcloneEngine!: RcloneEngine;

  private autoSyncIntervalId: number | null = null;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    if (!this.settings.hasBeenSetup) {
      new Notice(
        'Welcome to Via! Please open Settings > Via Sync to configure your rclone path.',
        10000,
      );
      this.settings.hasBeenSetup = true;
      await this.saveSettings();
    }

    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return;

    this.viaManifest = new Manifest(this.app);
    await this.viaManifest.load();

    this.ignoreEngine = new IgnoreEngine(this.app);
    await this.ignoreEngine.load();

    this.rcloneEngine = new RcloneEngine(this, this.ignoreEngine);

    this.statusEngine = new StatusEngine(
      this.app,
      this.viaManifest,
      this.ignoreEngine,
    );
    this.snapshotEngine = new SnapshotEngine(this.app);
    this.conflictEngine = new ConflictEngine(
      this.viaManifest,
      this.rcloneEngine,
    );

    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.setText('via: ready');
    this.statusBarItem.onclick = () => this.openTerminal();

    this.addRibbonIcon('git-branch', 'Open Via Terminal', () =>
      this.openTerminal(),
    );

    this.addCommand({
      id: 'via-open-terminal',
      name: 'Open Via Terminal',
      callback: () => this.openTerminal(),
    });

    this.addCommand({
      id: 'via-commit',
      name: 'Commit Snapshot',
      callback: async () => {
        const message = await prompt('Commit message:');
        if (message) {
          await this.snapshotEngine.commit(message, this.viaManifest.data);
          new Notice('Via: Snapshot saved.');
        }
      },
    });

    this.addSettingTab(new ViaSettingTab(this.app, this));
    this.setupAutoSync();
  }

  getVaultPath(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();
    throw new Error('Via requires desktop mode.');
  }

  public openTerminal() {
    new ViaTerminalModal(
      this.app,
      this.rcloneEngine,
      this.getVaultPath(),
      this,
      this.statusEngine,
    ).open();
  }

  public setupAutoSync() {
    if (this.autoSyncIntervalId) {
      window.clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = null;
    }
    if (this.settings.autoSyncMinutes > 0) {
      const intervalMs = this.settings.autoSyncMinutes * 60 * 1000;
      this.autoSyncIntervalId = window.setInterval(async () => {
        if (this.isBusy) return;
        try {
          const changes = await this.statusEngine.compute();
          if (changes.length > 0) {
            this.isBusy = true;
            await this.rcloneEngine.execute('push', this.getVaultPath());
            await this.statusEngine.updateManifestFromLocal();
            new Notice(`Via Auto-Sync: ${changes.length} files pushed.`);
          }
        } catch (e) {
          console.error('Via Auto-Sync failed:', e);
        } finally {
          this.isBusy = false;
        }
      }, intervalMs);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    if (this.autoSyncIntervalId) window.clearInterval(this.autoSyncIntervalId);
  }
}
