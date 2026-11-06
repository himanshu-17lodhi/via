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
    console.log('Via: Plugin loaded.');

    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    if (!this.settings.hasBeenSetup) {
      new Notice(
        'Welcome to Via! Please open Settings > Via Sync to configure your rclone path and remote.',
        10000,
      );
      this.settings.hasBeenSetup = true;
      await this.saveSettings();
    }

    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      console.log('Via: Rclone is not supported on mobile. Plugin disabled.');
      return;
    }

    // Init Engines
    this.viaManifest = new Manifest(this.app);
    await this.viaManifest.load();

    this.ignoreEngine = new IgnoreEngine(this.app);
    await this.ignoreEngine.load();

    this.rcloneEngine = new RcloneEngine(
      this.settings.rclonePath,
      this.settings.remoteName,
      this.settings.remoteFolder,
      this.ignoreEngine,
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

    // Setup Status Bar
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.setText('via: ready');

    // Left-click opens the terminal directly
    this.statusBarItem.onclick = () => this.openTerminal();

    // Right-click opens the quick actions menu
    this.statusBarItem.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const menu = new Menu();

      menu.addItem((item) =>
        item
          .setTitle('Open Via Terminal')
          .setIcon('terminal')
          .onClick(() => this.openTerminal()),
      );

      menu.addSeparator();

      menu.addItem((item) =>
        item
          .setTitle('Pull from Remote')
          .setIcon('arrow-down-to-line')
          .onClick(async () => {
            new Notice('Via: Pulling...');
            await this.rcloneEngine.execute('pull', this.getVaultPath());
            await this.statusEngine.updateManifestFromLocal();
            new Notice('Via: Pull complete.');
          }),
      );

      menu.addItem((item) =>
        item
          .setTitle('Push to Remote')
          .setIcon('arrow-up-from-line')
          .onClick(async () => {
            new Notice('Via: Pushing...');
            await this.rcloneEngine.execute('push', this.getVaultPath());
            await this.statusEngine.updateManifestFromLocal();
            new Notice('Via: Push complete.');
          }),
      );

      menu.addItem((item) =>
        item
          .setTitle('Save Snapshot (Commit)')
          .setIcon('save')
          .onClick(async () => {
            await this.snapshotEngine.commit(
              'Quick manual snapshot from status bar',
              this.viaManifest.data,
            );
            new Notice('Via: Snapshot saved.');
          }),
      );

      menu.showAtMouseEvent(e);
    });

    // Background check timer
    this.registerInterval(
      window.setInterval(async () => {
        const changes = await this.statusEngine.compute();

        // Fixed: Dynamic status bar icon + text
        this.statusBarItem.empty();
        if (changes.length === 0) {
          const icon = this.statusBarItem.createSpan();
          setIcon(icon, 'check-circle');
          this.statusBarItem.createSpan({ text: ' via: clean' });
        } else {
          this.statusBarItem.setText(`via: ${changes.length} changes`);
        }
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
            console.log(
              `Via Auto-Sync: Found ${changes.length} changes. Pushing...`,
            );
            this.isBusy = true;

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
    if (this.autoSyncIntervalId) {
      window.clearInterval(this.autoSyncIntervalId);
    }
    console.log('Via: Plugin unloaded.');
  }
}
