import { exec } from 'child_process';
import { promisify } from 'util';
import { SyncStatus, FileState } from '../types';
import { IgnoreEngine } from './IgnoreEngine';

const execAsync = promisify(exec);

export class RcloneEngine {
  constructor(
    private rclonePath: string,
    private remoteName: string,
    private remoteFolder: string,
    private ignoreEngine: IgnoreEngine,
  ) {}

  private getRemoteString(): string {
    return `${this.remoteName}:${this.remoteFolder}`;
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

  async copyFile(src: string, dest: string): Promise<void> {
    const cmd = `"${this.rclonePath}" copy "${src}" "${dest}"`;
    await execAsync(cmd);
  }

  async execute(subCommand: string, vaultPath: string): Promise<CommandResult> {
    const remote = this.getRemoteString();
    const excludes = this.getExcludes();
    let cmd = '';
    let parseAsStatus = false;

    if (subCommand === 'help') {
      return {
        output: [
          'Available Via Commands:',
          '  via status        - Check local changes instantly (no network)',
          '  via conflicts     - Detect conflicts before pushing',
          '  via diff          - Show exact file changes between local & remote',
          '  via push          - Upload local changes to the remote',
          '  via pull          - Download remote changes to local',
          '  via sync          - Bidirectional merge (resolves conflicts)',
          '  via commit "msg"  - Save a snapshot of current state',
          '  via log           - View commit history',
          '  via help          - Show this menu',
          '  clear             - Clear the terminal screen',
        ].join('\n'),
        exitCode: 0,
      };
    }

    switch (subCommand) {
      case 'status':
        cmd = `"${this.rclonePath}" sync "${vaultPath}" "${remote}" --dry-run --combined - ${excludes}`;
        parseAsStatus = true;
        break;
      case 'push':
        cmd = `"${this.rclonePath}" sync "${vaultPath}" "${remote}" ${excludes} --stats-one-line`;
        break;
      case 'pull':
        cmd = `"${this.rclonePath}" sync "${remote}" "${vaultPath}" ${excludes} --stats-one-line`;
        break;
      case 'sync':
        cmd = `"${this.rclonePath}" bisync "${vaultPath}" "${remote}" --create-empty-src-dirs --resync ${excludes} --stats-one-line`;
        break;
      case 'diff':
        cmd = `"${this.rclonePath}" diff "${vaultPath}" "${remote}" ${excludes} --combined -`;
        parseAsStatus = false;
        break;
      case 'log':
        cmd = `"${this.rclonePath}" check "${vaultPath}" "${remote}" --combined - ${excludes}`;
        parseAsStatus = true;
        break;
      default:
        return {
          output: `via: '${subCommand}' is not a command. See 'via help'.`,
          exitCode: 1,
        };
    }

    try {
      const { stdout, stderr } = await execAsync(cmd);
      const raw = stdout || stderr;

      if (parseAsStatus) {
        return {
          output: raw,
          statusData: this.parseCheckOutput(raw),
          exitCode: 0,
        };
      }

      if (['push', 'pull', 'sync'].includes(subCommand)) {
        const cleanOutput = raw
          .split('\n')
          .filter((line) => !line.includes('NOTICE: gdrive'))
          .join('\n');

        const match = cleanOutput.match(
          /Transferred:\s+(\d+)\s*\/\s*\d+,\s*(\d+)%/,
        );

        return {
          output: cleanOutput,
          exitCode: 0,
          summary: {
            files: match ? parseInt(match[1]) : 0,
            percentage: match ? `${match[2]}%` : '0%',
          },
        };
      }

      return { output: raw || 'Command executed.', exitCode: 0 };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          output:
            '⚠ Error: rclone is not installed or not in your system PATH.\nPlease download rclone from rclone.org and configure your path in Settings > Via Sync.',
          exitCode: 1,
        };
      }

      if ((subCommand === 'diff' || subCommand === 'log') && error.stdout) {
        return {
          output: error.stdout,
          statusData: this.parseCheckOutput(error.stdout),
          exitCode: 0, // Treat as success for UI rendering
        };
      }

      if (
        error.message.includes('network') ||
        error.message.includes('connection')
      ) {
        return {
          output: '⚠ Error: Cannot reach the remote. Are you offline?',
          exitCode: 1,
        };
      }

      return { output: `⚠ Error: ${error.message}`, exitCode: 1 };
    }
  }

  async fetchRemoteState(): Promise<Record<string, FileState>> {
    const remote = this.getRemoteString();
    const cmd = `"${this.rclonePath}" lsjson "${remote}" --recursive --files-only`;
    const { stdout } = await execAsync(cmd);
    const files = JSON.parse(stdout) as Array<{
      Path: string;
      Size: number;
      ModTime: string;
    }>;
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
      if (line.startsWith('+ ')) {
        result.push({ type: 'added', path: line.substring(2).trim() });
      } else if (line.startsWith('- ')) {
        result.push({ type: 'deleted', path: line.substring(2).trim() });
      } else if (line.startsWith('* ')) {
        result.push({ type: 'modified', path: line.substring(2).trim() });
      } else if (line.startsWith('! ')) {
        result.push({ type: 'error', path: line.substring(2).trim() });
      }
    }
    return result;
  }

  private parseCheckOutput(raw: string): SyncStatus[] {
    const lines = raw.split('\n').filter((l) => l.trim() !== '');
    const result: SyncStatus[] = [];

    for (const line of lines) {
      if (line.includes('ERROR :')) {
        const parts = line.split('ERROR :')[1].split(':');
        const path = parts[0].trim();
        const reason = parts.slice(1).join(':').trim();

        result.push({
          type: 'modified',
          path: path,
          extra: reason,
        });
      } else if (line.includes('differences found')) {
        result.push({
          type: 'info',
          path: line.split('NOTICE: ')[1] || line.trim(),
        });
      }
    }
    return result;
  }
}

export interface CommandResult {
  output: string;
  statusData?: SyncStatus[];
  exitCode: number;
  summary?: { files: number; percentage: string };
}
