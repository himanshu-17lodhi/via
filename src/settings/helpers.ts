import { Setting, Notice } from 'obsidian';
import ViaPlugin from '../main';
import { exec } from 'child_process';

export function setupFileBrowser(setting: Setting, plugin: ViaPlugin, onUpdate: () => void) {
  setting.addButton((btn) =>
    btn.setButtonText('Browse...').onClick(async () => {
      try {
        const electron = (window as any).require('electron');
        const dialog = electron.remote?.dialog ?? electron.dialog;
        const result = dialog.showOpenDialogSync({
          properties: ['openFile'],
          filters: [{ name: 'Executables', extensions: ['exe', 'bin', '*'] }],
        });
        if (result && result.length > 0) {
          plugin.settings.rclonePath = result[0];
          await plugin.saveSettings();
          onUpdate();
        }
      } catch (e) {
        new Notice('Could not open file browser. Please type the path manually.');
      }
    }),
  );
}

export function testRcloneConnection(plugin: ViaPlugin, btn: any) {
  btn.setButtonText('Testing...');
  btn.setDisabled(true);

  const configFlag = plugin.settings.rcloneConfigPath ? `--config "${plugin.settings.rcloneConfigPath}"` : '';
  const cmd = `"${plugin.settings.rclonePath}" ${configFlag} lsd "${plugin.settings.remoteName}:${plugin.settings.remoteFolder}"`;

  exec(cmd, (error) => {
    if (error) {
      new Notice(`Test Failed. Check config path or remote name.`);
    } else {
      new Notice('Connection passed!');
    }
    btn.setButtonText('Test Now');
    btn.setDisabled(false);
  });
}