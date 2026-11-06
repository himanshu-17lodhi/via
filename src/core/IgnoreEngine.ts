import { App } from 'obsidian';

const DEFAULTS: string[] = [
  '.obsidian/workspace.json',
  '.obsidian/workspaces.json',
  '.trash/',
  '.via/',
];

const VIAIGNORE_PATH = '.viaignore';

export class IgnoreEngine {
  private patterns: string[] = [...DEFAULTS];

  private userPatterns: string[] = [];

  constructor(private app: App) {}

  async load(): Promise<void> {
    try {
      const content = await this.app.vault.adapter.read('.viaignore');
      const userPatterns = IgnoreEngine.parse(content);
    } catch {
      this.patterns = [];
    }
    this.rebuild();
  }

  async save(): Promise<void> {
    const body =
      this.userPatterns.join('\n') + (this.userPatterns.length ? '\n' : '');
    await this.app.vault.adapter.write(VIAIGNORE_PATH, body);
    this.rebuild();
  }

  private rebuild(): void {
    this.patterns = [...DEFAULTS, ...this.userPatterns];
  }

  private static parse(content: string): string[] {
    return content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  }

  /**
   * Returns true if a new pattern was added, false if empty/duplicate.
   * */
  async addPattern(raw: string): Promise<boolean> {
    const pattern = raw.trim();
    if (!pattern) return false;
    if (this.userPatterns.includes(pattern)) return false;
    this.userPatterns.push(pattern);
    await this.save();
    return true;
  }

  /**
   * Returns true if a pattern was removed. Only user patterns can be removed.
   * */
  async removePattern(raw: string): Promise<boolean> {
    const pattern = raw.trim();
    const before = this.userPatterns.length;
    this.userPatterns = this.userPatterns.filter((p) => p !== pattern);
    if (this.userPatterns.length === before) return false;
    await this.save();
    return true;
  }

  /**
   * Removes all user patterns. Defaults remain active.
   * */
  async clearUserPatterns(): Promise<void> {
    this.userPatterns = [];
    await this.save();
  }

  /**
   * Bulk replace (used by the modal editor).
   * */
  async setUserPatterns(patterns: string[]): Promise<void> {
    this.userPatterns = patterns
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith('#'));
    await this.save();
  }

  shouldIgnore(path: string): boolean {
    return this.patterns.some((pattern) => {
      if (pattern.endsWith('/')) {
        return path.startsWith(pattern);
      }
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(path);
      }
      return path === pattern || path.startsWith(pattern + '/');
    });
  }

  getPatterns(): string[] {
    return [...this.patterns];
  }

  getDefaults(): string[] {
    return [...DEFAULTS];
  }

  getUserPatterns(): string[] {
    return [...this.userPatterns];
  }
}
