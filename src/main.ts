import { Plugin, FileSystemAdapter, Notice } from 'obsidian'; // <-- Added Notice
import { RcloneEngine } from './core/RcloneEngine';
import { Manifest } from './core/Manifest';
import { StatusEngine } from './core/StatusEngine';
import { IgnoreEngine } from './core/IgnoreEngine';
import { SnapshotEngine } from './core/Snapshot';
import { ConflictEngine } from './core/ConflictEngine';
import { ViaTerminalModal } from './ui/TerminalModal';
import { ViaSettingTab } from './settings/settings';
import { DEFAULT_SETTINGS } from './settings/defaults';
import { ViaSettings } from './types';

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

    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      console.log('Via: Rclone is not supported on mobile. Plugin disabled.');
      return;
    }

    this.viaManifest = new Manifest(this.app);
    await this.viaManifest.load();

    this.ignoreEngine = new IgnoreEngine(this.app);
    await this.ignoreEngine.load();

    this.rcloneEngine = new RcloneEngine(
      this.settings.rclonePath,
      this.settings.remoteName,
      this.settings.remoteFolder,
    );

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

    this.statusBarItem.onclick = () =>
      (this.app as any).commands.executeCommandById('via:via-open-terminal');

    this.registerInterval(
      window.setInterval(async () => {
        const changes = await this.statusEngine.compute();
        this.statusBarItem.setText(
          changes.length === 0
            ? 'via: ✓ clean'
            : `via: ${changes.length} changes`,
        );
      }, 30000),
    );

    this.addRibbonIcon('git-branch', 'Open Via Terminal', () => {
      this.openTerminal();
    });

    this.addCommand({
      id: 'via-open-terminal',
      name: 'Open Via Terminal',
      callback: () => {
        this.openTerminal();
      },
    });

    this.registerEvent(
      this.app.workspace.on('quit', async () => {
        console.log('Via: App is closing, attempting final sync...');
      }),
    );

    this.addSettingTab(new ViaSettingTab(this.app, this));

    // ADDED: Actually start the auto-sync timer when the plugin loads
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
    // 1. Clear existing timer if there is one
    if (this.autoSyncIntervalId) {
      window.clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = null;
    }

    // 2. If enabled (> 0), start a new timer
    if (this.settings.autoSyncMinutes > 0) {
      const intervalMs = this.settings.autoSyncMinutes * 60 * 1000;

      this.autoSyncIntervalId = window.setInterval(async () => {
        // Don't sync if a manual sync is already running
        if (this.isBusy) return;

        try {
          // Check if there are actually changes before running rclone
          const changes = await this.statusEngine.compute();

          if (changes.length > 0) {
            console.log(
              `Via Auto-Sync: Found ${changes.length} changes. Pushing...`,
            );
            this.isBusy = true;

            // Run the push
            await this.rcloneEngine.execute('push', this.getVaultPath());
            await this.statusEngine.updateManifestFromLocal();

            new Notice(
              `Via Auto-Sync: ${changes.length} files pushed successfully.`,
            );
          }
        } catch (e) {
          console.error('Via Auto-Sync failed:', e);
        } finally {
          this.isBusy = false;
        }
      }, intervalMs);

      console.log(
        `Via: Auto-sync started (every ${this.settings.autoSyncMinutes} mins)`,
      );
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    // CRITICAL: Stop the timer when plugin is disabled to prevent memory leaks
    if (this.autoSyncIntervalId) {
      window.clearInterval(this.autoSyncIntervalId);
    }
    console.log('Via: Plugin unloaded.');
  }
}
