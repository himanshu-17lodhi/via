import { ViaSettings } from './types';

export const DEFAULT_SETTINGS: ViaSettings = {
  hasBeenSetup: false,
  rclonePath: 'rclone',
  rcloneConfigPath: '', 
  remoteName: 'via rclone', 
  remoteFolder: 'ObsidianVault',
  autoSyncMinutes: 0,
};