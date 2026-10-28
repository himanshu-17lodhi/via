import { Plugin, FileSystemAdapter } from 'obsidian';
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

  viaManifest!: Manifest;
  statusEngine!: StatusEngine;
  ignoreEngine!: IgnoreEngine;
  snapshotEngine!: SnapshotEngine;
  conflictEngine!: ConflictEngine;
  rcloneEngine!: RcloneEngine;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Ensure we are on desktop
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
      this.app.commands.executeCommandById('via:via-terminal');

    // Auto-refresh status bar every 30 seconds
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
      id: 'via-terminal',
      name: 'Open Via Terminal',
      callback: () => {
        this.openTerminal();
      },
    });

    this.addSettingTab(new ViaSettingTab(this.app, this));
  }

  getVaultPath(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();
    throw new Error('Via requires desktop mode.');
  }

  private openTerminal() {
    new ViaTerminalModal(
      this.app,
      this.rcloneEngine,
      this.getVaultPath(),
      this,
      this.statusEngine,
    ).open();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
