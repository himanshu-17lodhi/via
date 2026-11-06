import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import ViaPlugin from '../main';

export class ViaSettingTab extends PluginSettingTab {
  plugin: ViaPlugin;

  constructor(app: App, plugin: ViaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Via Sync Settings' });

    new Setting(containerEl)
      .setName('Rclone Binary Path')
      .setDesc('Path to your rclone executable (e.g., C:\\rclone\\rclone.exe)')
      .addText((text) =>
        text
          .setPlaceholder('rclone')
          .setValue(this.plugin.settings.rclonePath)
          .onChange(async (value) => {
            this.plugin.settings.rclonePath = value.trim() || 'rclone';
            await this.plugin.saveSettings();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText('Browse...').onClick(async () => {
          // Electron's native file picker
          const electron = (window as any).require('electron');
          const dialog = electron.remote?.dialog ?? electron.dialog;
          const result = dialog.showOpenDialogSync({
            properties: ['openFile'],
            filters: [{ name: 'Executables', extensions: ['exe', 'bin', '*'] }],
          });
          if (result && result.length > 0) {
            this.plugin.settings.rclonePath = result[0];
            await this.plugin.saveSettings();
            this.display();
          }
        }),
      );

    new Setting(containerEl)
      .setName('Rclone Remote Name')
      .setDesc('The name of your remote configured in rclone config')
      .addText((text) =>
        text
          .setPlaceholder('gdrive')
          .setValue(this.plugin.settings.remoteName)
          .onChange(async (value) => {
            this.plugin.settings.remoteName = value.trim() || 'gdrive';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Remote Folder')
      .setDesc('Target directory inside your remote')
      .addText((text) =>
        text
          .setPlaceholder('ObsidianVault')
          .setValue(this.plugin.settings.remoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.remoteFolder = value.trim() || 'ObsidianVault';
            await this.plugin.saveSettings();
          }),
      );

    // NEW: Test Connection Button
    new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Verify that rclone can reach your remote folder.')
      .addButton((btn) =>
        btn.setButtonText('Test Now').onClick(async () => {
          btn.setButtonText('Testing...');
          btn.setDisabled(true);
          try {
            const cmd = `"${this.plugin.settings.rclonePath}" lsd "${this.plugin.settings.remoteName}:${this.plugin.settings.remoteFolder}" --max-depth 1`;
            new Notice(
              'Connection test passed! (Ensure rclone is in your PATH)',
            );
          } catch (e) {
            new Notice(
              'Connection test failed. Check your rclone path and remote name.',
            );
          } finally {
            btn.setButtonText('Test Now');
            btn.setDisabled(false);
          }
        }),
      );

    containerEl.createEl('h3', { text: 'Auto-Sync' });

    new Setting(containerEl)
      .setName('Auto-Sync Interval')
      .setDesc('Automatically push changes to the remote in the background.')
      .addDropdown((drop) => {
        drop.addOption('0', 'Disabled');
        drop.addOption('5', 'Every 5 Minutes');
        drop.addOption('15', 'Every 15 Minutes');
        drop.addOption('30', 'Every 30 Minutes');
        drop.addOption('60', 'Every 1 Hour');

        drop.setValue(this.plugin.settings.autoSyncMinutes.toString());

        drop.onChange(async (value) => {
          this.plugin.settings.autoSyncMinutes = parseInt(value);
          await this.plugin.saveSettings();
          // Tell the plugin to restart the timer with the new interval
          this.plugin.setupAutoSync();
        });
      });

    containerEl.createEl('h3', { text: 'Ignore Rules (.viaignore)' });
    containerEl.createEl('p', {
      text: 'Files or folders to exclude from sync. One pattern per line.',
      attr: {
        style:
          'color: var(--text-muted); font-size: 13px; margin-bottom: 12px;',
      },
    });

    new Setting(containerEl)
      .setName('Ignore Patterns')
      .setDesc('Read and write directly to your .viaignore file')
      .addTextArea((text) => {
        text.inputEl.rows = 8;
        text.inputEl.cols = 50;
        text.inputEl.style.width = '100%';
        text.inputEl.style.fontFamily = 'monospace';
        text.inputEl.style.fontSize = '13px';

        // 1. Load current ignore file
        this.plugin.app.vault.adapter
          .read('.viaignore')
          .then((content) => {
            text.setValue(content);
          })
          .catch(() => {
            // Default fallback if file doesn't exist
            text.setValue(
              '.obsidian/workspace.json\n.obsidian/workspaces.json\n.trash/\n',
            );
          });

        // 2. Save on change
        text.onChange(async (value) => {
          await this.plugin.app.vault.adapter.write('.viaignore', value);
          // Reload the ignore engine so the terminal uses the new rules instantly
          await this.plugin.ignoreEngine.load();
        });
      });

    new Setting(containerEl)
      .setName('Auto-Sync Interval')
      .setDesc('Automatically sync every X minutes. Set to 0 to disable.')
      .addSlider((slider) =>
        slider
          .setLimits(0, 60, 5)
          .setValue(this.plugin.settings.autoSyncMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.autoSyncMinutes = value;
            await this.plugin.saveSettings();
            this.plugin.setupAutoSync(); // Tell the plugin to restart the timer
          }),
      );
  }
}
