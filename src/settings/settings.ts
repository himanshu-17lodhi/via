import { App, PluginSettingTab, Setting } from 'obsidian';
import ViaPlugin from '../main';
import { setupFileBrowser, testRcloneConnection } from './helpers';
import { renderSetupGuide } from './Guide';

export class ViaSettingTab extends PluginSettingTab {
  plugin: ViaPlugin;

  constructor(app: App, plugin: ViaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Via Sync Setup' });


    renderSetupGuide(containerEl);
    
    new Setting(containerEl)
      .setName('Rclone Config File Path')
      .setDesc('Absolute path to rclone.conf. Crucial for Windows.')
      .addText((text) =>
        text
          .setPlaceholder('C:\\Users\\Name\\AppData\\Roaming\\rclone\\rclone.conf')
          .setValue(this.plugin.settings.rcloneConfigPath || '')
          .onChange(async (value) => {
            this.plugin.settings.rcloneConfigPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    const binarySetting = new Setting(containerEl)
      .setName('Rclone Binary Path')
      .setDesc('Path to your rclone executable (e.g., rclone)')
      .addText((text) =>
        text
          .setPlaceholder('rclone')
          .setValue(this.plugin.settings.rclonePath)
          .onChange(async (value) => {
            this.plugin.settings.rclonePath = value.trim() || 'rclone';
            await this.plugin.saveSettings();
          })
      );
    setupFileBrowser(binarySetting, this.plugin, () => this.display());

    new Setting(containerEl)
      .setName('Rclone Remote Name')
      .setDesc('The name of your remote configured in rclone config (e.g., via rclone)')
      .addText((text) =>
        text
          .setPlaceholder('via rclone')
          .setValue(this.plugin.settings.remoteName)
          .onChange(async (value) => {
            this.plugin.settings.remoteName = value.trim() || 'via rclone';
            await this.plugin.saveSettings();
          })
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
          })
      );

    new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Verify that rclone can reach your remote folder.')
      .addButton((btn) =>
        btn.setButtonText('Test Now').onClick(() => {
          testRcloneConnection(this.plugin, btn);
        })
      );

    containerEl.createEl('h3', { text: 'Auto-Sync' });

    new Setting(containerEl)
      .setName('Auto-Sync Interval')
      .setDesc('Automatically push changes to the remote in the background.')
      .addSlider((slider) =>
        slider
          .setLimits(0, 60, 5)
          .setValue(this.plugin.settings.autoSyncMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.autoSyncMinutes = value;
            await this.plugin.saveSettings();
            this.plugin.setupAutoSync();
          })
      );
  }
}