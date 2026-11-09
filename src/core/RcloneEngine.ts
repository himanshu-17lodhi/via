import { exec } from 'child_process';
import { promisify } from 'util';
import { SyncStatus, FileState, CommandResult } from '../settings/types';
import { IgnoreEngine } from './IgnoreEngine';
import ViaPlugin from '../main';

const execAsync = promisify(exec);

export class RcloneEngine {
  constructor(
    private plugin: ViaPlugin,
    private ignoreEngine: IgnoreEngine,
  ) {}

  private getBaseCommand(): string {
    const rcloneExe = this.plugin.settings.rclonePath || 'rclone';
    const configPath = this.plugin.settings.rcloneConfigPath;

    let cmd = `"${rcloneExe}"`;
    if (configPath && configPath.trim() !== '') {
      cmd += ` --config "${configPath.trim()}"`;
    }
    return cmd;
  }

  private getRemoteString(): string {
    const remote = this.plugin.settings.remoteName || 'via rclone';
    const folder = this.plugin.settings.remoteFolder || 'ObsidianVault';
    return `${remote}:${folder}`;
  }

  private getExcludes(): string {
    const flags: string[] = [];
    for (const pattern of this.ignoreEngine.getPatterns()) {
      if (pattern.endsWith('/')) {
        flags.push(`--exclude "${pattern}**"`);
      } else if (pattern.includes('*')) {
        flags.push(`--exclude "${pattern}"`);
      } else {
        flags.push(`--exclude "/${pattern}"`);
        flags.push(`--exclude "/${pattern}/**"`);
      }
    }
    return flags.join(' ');
  }

  async execute(subCommand: string, vaultPath: string): Promise<CommandResult> {
    const remote = this.getRemoteString();
    const excludes = this.getExcludes();
    const baseCmd = this.getBaseCommand();
    let cmd = '';
    let parseAsStatus = false;

    if (subCommand === 'help') {
      return { output: 'Available commands: pull, push, sync, status', exitCode: 0 };
    }

    switch (subCommand) {
      case 'status':
        cmd = `${baseCmd} sync "${vaultPath}" "${remote}" --dry-run --combined - ${excludes}`;
        parseAsStatus = true;
        break;
      case 'push':
        cmd = `${baseCmd} sync "${vaultPath}" "${remote}" ${excludes} --stats-one-line`;
        break;
      case 'pull':
        cmd = `${baseCmd} sync "${remote}" "${vaultPath}" ${excludes} --stats-one-line`;
        break;
      case 'sync':
        cmd = `${baseCmd} bisync "${vaultPath}" "${remote}" --create-empty-src-dirs --resync ${excludes} --stats-one-line`;
        break;
      default:
        return { output: `via: '${subCommand}' is not a command.`, exitCode: 1 };
    }

    try {
      const { stdout, stderr } = await execAsync(cmd);
      const raw = stdout || stderr;

      if (parseAsStatus) {
        return { output: raw, statusData: this.parseStatusOutput(raw), exitCode: 0 };
      }

      if (['push', 'pull', 'sync'].includes(subCommand)) {
        const match = raw.match(/Transferred:\s+(\d+)\s*\/\s*\d+,\s*(\d+)%/);
        return {
          output: raw,
          exitCode: 0,
          summary: {
            files: match ? parseInt(match[1]) : 0,
            percent: match ? `${match[2]}%` : '0%',
          },
        };
      }
      return { output: raw || 'Command executed.', exitCode: 0 };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { output: '⚠ Error: rclone is not installed or not in your PATH.', exitCode: 1 };
      }
      if (error.message.includes("didn't find section in config file")) {
        return { output: `⚠ Error: Rclone could not find the remote "${this.plugin.settings.remoteName}". Please check your Settings.`, exitCode: 1 };
      }
      return { output: `⚠ Error: ${error.message}`, exitCode: 1 };
    }
  }

  async fetchRemoteState(): Promise<Record<string, FileState>> {
    const remote = this.getRemoteString();
    const cmd = `${this.getBaseCommand()} lsjson "${remote}" --recursive --files-only`;
    const { stdout } = await execAsync(cmd);
    const files = JSON.parse(stdout) as Array<{ Path: string; Size: number; ModTime: string }>;
    const result: Record<string, FileState> = {};
    for (const file of files) {
      result[file.Path] = {
        path: file.Path,
        size: file.Size,
        mtime: new Date(file.ModTime).getTime(),
      };
    }
    return result;
  }

  private parseStatusOutput(raw: string): SyncStatus[] {
    const lines = raw.split('\n').filter((l) => l.trim() !== '');
    const result: SyncStatus[] = [];
    for (const line of lines) {
      if (line.startsWith('+ ')) result.push({ type: 'added', path: line.substring(2).trim() });
      else if (line.startsWith('- ')) result.push({ type: 'deleted', path: line.substring(2).trim() });
      else if (line.startsWith('* ')) result.push({ type: 'modified', path: line.substring(2).trim() });
      else if (line.startsWith('! ')) result.push({ type: 'error', path: line.substring(2).trim() });
    }
    return result;
  }
}