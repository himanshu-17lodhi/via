import { App, PluginSettingTab, Setting } from 'obsidian';
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
      .setDesc('Path to your rclone executable')
      .addText((text) =>
        text
          .setPlaceholder('rclone')
          .setValue(this.plugin.settings.rclonePath)
          .onChange(async (value) => {
            this.plugin.settings.rclonePath = value.trim() || 'rclone';
            await this.plugin.saveSettings();
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
      .setName('Google Drive Folder')
      .setDesc('Target directory inside your Google Drive remote')
      .addText((text) =>
        text
          .setPlaceholder('ObsidianVault')
          .setValue(this.plugin.settings.remoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.remoteFolder = value.trim() || 'ObsidianVault';
            await this.plugin.saveSettings();
          }),
      );
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
  }
}
