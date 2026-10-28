import { App } from 'obsidian';

export class IgnoreEngine {
  private patterns: string[] = [];

  constructor(private app: App) {}

  async load(): Promise<void> {
    const defaults = [
      '.obsidian/workspace.json',
      '.obsidian/workspaces.json',
      '.trash/',
      '.via/',
    ];

    try {
      const content = await this.app.vault.adapter.read('.viaignore');
      const userPatterns = content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));

      this.patterns = [...defaults, ...userPatterns];
    } catch {
      this.patterns = defaults;
    }
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
}
