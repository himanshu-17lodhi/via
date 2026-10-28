import { App, Modal, Notice } from 'obsidian';
import { RcloneEngine } from '../core/RcloneEngine';
import { StatusEngine } from '../core/StatusEngine';
import ViaPlugin from '../main';
import { SyncStatus, Commit, ConflictResult } from '../types';
import { ConfirmModal } from './ConfirmModal';

export class ViaTerminalModal extends Modal {
  private container!: HTMLElement;
  private outputEl!: HTMLElement;
  private inputEl!: HTMLInputElement;

  private history: string[] = [];
  private historyIndex: number = -1;
  private isFullScreen: boolean = false;

  constructor(
    app: App,
    private engine: RcloneEngine,
    private vaultPath: string,
    private plugin: ViaPlugin,
    private statusEngine: StatusEngine,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass('via-custom-modal');
    const closeBtn = this.modalEl.querySelector(
      '.modal-close-button',
    ) as HTMLElement;
    if (closeBtn) closeBtn.style.display = 'none';

    this.modalEl.setAttr(
      'style',
      `
      background: rgba(241, 245, 249, 0.4) !important;
      backdrop-filter: blur(8px) !important;
      border: none !important;
      box-shadow: none !important;
    `,
    );

    this.buildLayout();
    this.resetTerminal();
    this.bindEvents();
  }

  private buildLayout() {
    this.container = this.contentEl.createDiv();
    this.container.setAttr(
      'style',
      `
      display: flex; flex-direction: column;
      background: #ffffff; color: #334155;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
      border: 1px solid #e2e8f0; border-radius: 12px;
      overflow: hidden; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `,
    );
    this.applyWindowSize();

    const header = this.container.createDiv();
    header.setAttr(
      'style',
      `
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; background: #f8fafc;
      border-bottom: 1px solid #e2e8f0; user-select: none;
    `,
    );

    const dots = header.createDiv();
    dots.setAttr('style', 'display: flex; gap: 8px;');

    this.createDot(dots, '#ef4444', () => this.close());
    this.createDot(dots, '#f59e0b', () => this.resetTerminal());
    this.createDot(dots, '#10b981', () => {
      this.isFullScreen = !this.isFullScreen;
      this.applyWindowSize();
    });

    const title = header.createDiv({ text: 'Via Terminal' });
    title.setAttr(
      'style',
      'color: #94a3b8; font-size: 12px; font-weight: 500; flex-grow: 1; text-align: center; margin-left: -46px;',
    );
    header.createDiv().setAttr('style', 'width: 46px;');

    this.outputEl = this.container.createDiv();
    this.outputEl.setAttr(
      'style',
      `
      flex-grow: 1; padding: 20px 24px; overflow-y: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px; line-height: 1.6; color: #475569;
      background: #ffffff;
    `,
    );

    const inputSection = this.container.createDiv();
    inputSection.setAttr(
      'style',
      'padding: 16px 24px; background: #ffffff; border-top: 1px solid #f1f5f9;',
    );

    const inputWrapper = inputSection.createDiv();
    inputWrapper.setAttr(
      'style',
      `
      display: flex; align-items: center;
      background: #f8fafc; border: 1px solid #e2e8f0;
      border-radius: 8px; padding: 12px 16px;
      transition: border-color 0.2s;
    `,
    );

    const promptSymbol = inputWrapper.createSpan({ text: '❯' });
    promptSymbol.setAttr(
      'style',
      'color: #3b82f6; font-weight: bold; margin-right: 12px; font-size: 16px;',
    );

    this.inputEl = inputWrapper.createEl('input', { type: 'text' });
    this.inputEl.setAttr(
      'style',
      `
      flex-grow: 1; background: transparent; color: #0f172a;
      border: none; outline: none; font-family: ui-monospace, monospace;
      font-size: 13.5px; padding: 0; box-shadow: none;
    `,
    );

    const footer = inputSection.createDiv();
    footer.setAttr(
      'style',
      'display: flex; margin-top: 12px; font-size: 11px; align-items: center; gap: 8px; font-weight: 500;',
    );

    const localLabel = footer.createSpan({ text: '● Local' });
    localLabel.setAttr('style', 'color: #10b981;');

    const arrowLabel = footer.createSpan({ text: '⟷' });
    arrowLabel.setAttr('style', 'color: #cbd5e1;');

    const remoteLabel = footer.createSpan({
      text: `${this.plugin.settings.remoteName}/${this.plugin.settings.remoteFolder}`,
    });
    remoteLabel.setAttr('style', 'color: #94a3b8;');
  }

  private createDot(parent: HTMLElement, color: string, onClick: () => void) {
    const dot = parent.createDiv();
    dot.setAttr(
      'style',
      `width: 12px; height: 12px; border-radius: 50%; background: ${color}; cursor: pointer; border: 1px solid rgba(0,0,0,0.1);`,
    );
    dot.onclick = onClick;
  }

  private bindEvents() {
    this.inputEl.addEventListener('keydown', async (e) => {
      if (e.key === 'ArrowUp') return this.historyNavigate(1, e);
      if (e.key === 'ArrowDown') return this.historyNavigate(-1, e);
      if (e.key !== 'Enter') return;

      const raw = this.inputEl.value.trim();
      if (!raw) return;

      this.history.push(raw);
      this.historyIndex = -1;
      this.inputEl.value = '';

      if (raw.toLowerCase() === 'clear') {
        this.resetTerminal();
        return;
      }

      const sub = raw.replace(/^via\s+/i, '');
      await this.runCommand(sub);
    });
  }

  private historyNavigate(dir: number, e: KeyboardEvent) {
    e.preventDefault();
    if (dir === 1 && this.historyIndex < this.history.length - 1)
      this.historyIndex++;
    if (dir === -1 && this.historyIndex > -1) this.historyIndex--;
    this.inputEl.value =
      this.historyIndex === -1
        ? ''
        : this.history[this.history.length - 1 - this.historyIndex];
  }

  private async runCommand(sub: string) {
    this.renderPromptBlock(sub);
    this.plugin.statusBarItem.setText(`via: executing...`);

    const resultBlock = this.outputEl.createDiv();
    const spinner = this.startSpinner(resultBlock);

    try {
      if (sub.startsWith('commit')) {
        const message = sub
          .replace('commit', '')
          .trim()
          .replace(/^"(.*)"$/, '$1');
        const snapshot = await this.plugin.snapshotEngine.commit(
          message,
          this.plugin.viaManifest.data,
        );
        clearInterval(spinner);
        resultBlock.empty();
        this.renderCommit(resultBlock, snapshot);
      } else if (sub === 'log') {
        const commits = await this.plugin.snapshotEngine.list();
        clearInterval(spinner);
        resultBlock.empty();
        this.renderLog(resultBlock, commits);
      } else if (sub === 'conflicts') {
        const conflicts = await this.plugin.conflictEngine.detectConflicts();
        clearInterval(spinner);
        resultBlock.empty();
        this.renderConflicts(resultBlock, conflicts);
      } else if (sub.startsWith('restore ')) {
        const commitId = sub.replace('restore ', '').trim();
        const snapshot = await this.plugin.snapshotEngine.getSnapshot(commitId);
        clearInterval(spinner);

        if (!snapshot) {
          resultBlock.empty();
          resultBlock.setText(`Error: Commit '${commitId}' not found.`);
          resultBlock.setAttr(
            'style',
            'color: #ef4444; font-family: ui-monospace, monospace;',
          );
        } else {
          const confirmMsg = `This will overwrite local files and delete untracked files to match the snapshot from commit [${commitId}].\n\nAre you sure you want to proceed?`;

          new ConfirmModal(
            this.app,
            'Restore Snapshot',
            confirmMsg,
            true,
            async (confirmed) => {
              resultBlock.empty();
              if (!confirmed) {
                resultBlock.setText('Restore cancelled.');
                resultBlock.setAttr(
                  'style',
                  'color: #94a3b8; font-style: italic;',
                );
                return;
              }

              const currentFiles = this.app.vault.getFiles();
              let deletedCount = 0;
              for (const file of currentFiles) {
                if (
                  !snapshot.files[file.path] &&
                  !file.path.startsWith('.via/')
                ) {
                  await this.app.vault.delete(file);
                  deletedCount++;
                }
              }

              this.plugin.viaManifest.data = snapshot;
              await this.plugin.viaManifest.save();

              const successDiv = resultBlock.createDiv({
                text: `✓ Restored to commit [${commitId}]`,
              });
              successDiv.setAttr(
                'style',
                'color: #10b981; font-weight: 600; font-size: 13.5px; margin-bottom: 4px; font-family: -apple-system, sans-serif;',
              );

              const infoDiv = resultBlock.createDiv({
                text: `Deleted ${deletedCount} untracked files.`,
              });
              infoDiv.setAttr(
                'style',
                'color: #64748b; font-size: 13px; font-family: -apple-system, sans-serif;',
              );

              const hintDiv = resultBlock.createDiv({
                text: 'Run "via pull" to fetch the file contents from the remote.',
              });
              hintDiv.setAttr(
                'style',
                'color: #f59e0b; font-size: 12px; margin-top: 8px; font-family: -apple-system, sans-serif;',
              );
            },
          ).open();
        }
      } else if (sub === 'status') {
        const changes = await this.statusEngine.compute();
        clearInterval(spinner);
        resultBlock.empty();
        this.renderStatusTree(resultBlock, changes);
      } else {
        // 1. AUTO-SNAPSHOT
        if (['push', 'pull', 'sync'].includes(sub)) {
          const timestamp = new Date().toLocaleString();
          await this.plugin.snapshotEngine.commit(
            `Auto-save before ${sub} (${timestamp})`,
            this.plugin.viaManifest.data,
          );
        }

        // 2. EXECUTE COMMAND
        const result = await this.engine.execute(sub, this.vaultPath);
        clearInterval(spinner);
        resultBlock.empty();

        if (sub === 'help') {
          this.renderHelpMenu(resultBlock);
        } else if (result.statusData) {
          this.renderStatusTree(resultBlock, result.statusData);
        } else if (sub === 'diff') {
          this.renderDiff(resultBlock, result.output);
        } else if (result.summary && ['push', 'pull', 'sync'].includes(sub)) {
          const actionName =
            sub === 'push' ? 'Pushed' : sub === 'pull' ? 'Pulled' : 'Synced';
          const successDiv = resultBlock.createDiv({
            text: `✓ ${actionName} successfully!`,
          });
          successDiv.setAttr(
            'style',
            'color: #10b981; font-weight: 600; font-size: 13.5px; margin-bottom: 4px; font-family: -apple-system, sans-serif;',
          );

          const statsDiv = resultBlock.createDiv({
            text: `Transferred ${result.summary.files} files`,
          });
          statsDiv.setAttr(
            'style',
            'color: #64748b; font-size: 13px; font-family: -apple-system, sans-serif;',
          );

          if (result.output.includes('ERROR')) {
            const errorDiv = resultBlock.createDiv({
              text: 'Some files failed to transfer. Run "via diff" to see details.',
            });
            errorDiv.setAttr(
              'style',
              'color: #ef4444; font-size: 12px; margin-top: 8px; font-family: -apple-system, sans-serif;',
            );
          }
        } else {
          resultBlock.setText(result.output);
        }

        // 3. UPDATE MANIFEST AFTER SUCCESS
        if (result.exitCode === 0 && ['push', 'pull', 'sync'].includes(sub)) {
          await this.statusEngine.updateManifestFromLocal();
          const manifestMsg = this.outputEl.createDiv({
            text: '✓ Manifest updated locally',
          });
          manifestMsg.setAttr(
            'style',
            'color: #94a3b8; margin-top: 12px; font-size: 11px; font-family: -apple-system, sans-serif;',
          );
        }
      }
    } catch (err: any) {
      clearInterval(spinner);
      resultBlock.empty();
      resultBlock.setText(`Error: ${err.message}`);
      resultBlock.setAttr('style', 'color: #ef4444;');
    }

    this.outputEl.scrollTop = this.outputEl.scrollHeight;
    this.plugin.statusBarItem.setText('via: ready');
  }

  private renderPromptBlock(sub: string) {
    const block = this.outputEl.createDiv();
    block.setAttr(
      'style',
      'margin-top: 24px; margin-bottom: 8px; display: flex; gap: 8px; align-items: center;',
    );
    const promptIcon = block.createSpan({ text: '❯' });
    promptIcon.setAttr(
      'style',
      'color: #3b82f6; font-weight: bold; font-size: 16px;',
    );
    const promptText = block.createSpan({ text: `via ${sub}` });
    promptText.setAttr(
      'style',
      'color: #0f172a; font-weight: 500; font-family: ui-monospace, monospace; font-size: 13.5px;',
    );
  }

  private startSpinner(container: HTMLElement): number {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    container.setAttr('style', 'color: #94a3b8; margin-top: 4px;');
    return window.setInterval(() => {
      container.setText(`${frames[i++ % frames.length]} Running...`);
      this.outputEl.scrollTop = this.outputEl.scrollHeight;
    }, 80);
  }

  private renderStatusTree(container: HTMLElement, data: SyncStatus[]) {
    if (data.length === 0) {
      const cleanMsg = container.createDiv({
        text: '✨ Working tree clean. Everything is synced.',
      });
      cleanMsg.setAttr(
        'style',
        'color: #10b981; font-style: italic; margin-top: 8px;',
      );
      return;
    }

    const groups = {
      added: data.filter((d) => d.type === 'added'),
      modified: data.filter((d) => d.type === 'modified'),
      deleted: data.filter((d) => d.type === 'deleted'),
    };

    const createFileRow = (
      parent: HTMLElement,
      symbol: string,
      path: string,
      color: string,
    ) => {
      const row = parent.createDiv();
      row.setAttr(
        'style',
        `
        display: flex; gap: 8px; align-items: baseline; 
        padding: 6px 10px; border-radius: 6px; margin-bottom: 3px;
        background: #f8fafc; border: 1px solid #f1f5f9;
      `,
      );
      const icon = row.createSpan({ text: symbol });
      icon.setAttr(
        'style',
        `color: ${color}; font-weight: bold; font-family: ui-monospace, monospace;`,
      );
      const text = row.createSpan({ text: path });
      text.setAttr(
        'style',
        'color: #334155; font-family: ui-monospace, monospace; font-size: 12.5px; word-break: break-all;',
      );
    };

    if (groups.added.length) {
      const addedHeader = container.createDiv({
        text: 'Added (New files to sync):',
      });
      addedHeader.setAttr(
        'style',
        'color: #10b981; font-weight: 600; margin-top: 12px; margin-bottom: 6px; font-size: 13px; font-family: -apple-system, sans-serif;',
      );
      groups.added.forEach((f) =>
        createFileRow(container, '+', f.path, '#10b981'),
      );
    }
    if (groups.modified.length) {
      const modHeader = container.createDiv({ text: 'Modified:' });
      modHeader.setAttr(
        'style',
        'color: #f59e0b; font-weight: 600; margin-top: 12px; margin-bottom: 6px; font-size: 13px; font-family: -apple-system, sans-serif;',
      );
      groups.modified.forEach((f) =>
        createFileRow(container, '*', f.path, '#f59e0b'),
      );
    }
    if (groups.deleted.length) {
      const delHeader = container.createDiv({ text: 'Deleted:' });
      delHeader.setAttr(
        'style',
        'color: #ef4444; font-weight: 600; margin-top: 12px; margin-bottom: 6px; font-size: 13px; font-family: -apple-system, sans-serif;',
      );
      groups.deleted.forEach((f) =>
        createFileRow(container, '-', f.path, '#ef4444'),
      );
    }
  }

  private renderDiff(container: HTMLElement, raw: string) {
    for (const line of raw.split('\n')) {
      const div = container.createDiv();
      div.setAttr(
        'style',
        'font-family: ui-monospace, monospace; line-height: 1.5; padding: 2px 8px; border-radius: 4px; margin-bottom: 2px;',
      );
      if (line.startsWith('+')) {
        div.setText(line);
        div.style.color = '#059669';
        div.style.background = '#ecfdf5';
      } else if (line.startsWith('-')) {
        div.setText(line);
        div.style.color = '#dc2626';
        div.style.background = '#fef2f2';
      } else if (line.startsWith('*')) {
        div.setText(line);
        div.style.color = '#d97706';
        div.style.background = '#fffbeb';
      } else {
        div.setText(line);
        div.style.color = '#64748b';
      }
    }
  }

  private renderCommit(container: HTMLElement, commit: Commit) {
    const success = container.createDiv({ text: `✓ Committed [${commit.id}]` });
    success.setAttr(
      'style',
      'color: #10b981; font-weight: 600; margin-bottom: 8px; font-family: -apple-system, sans-serif;',
    );
    const msgLine = container.createDiv({
      text: `Message: "${commit.message}"`,
    });
    msgLine.setAttr(
      'style',
      'color: #475569; font-size: 13px; font-family: -apple-system, sans-serif;',
    );
    const countLine = container.createDiv({
      text: `${commit.fileCount} files tracked`,
    });
    countLine.setAttr(
      'style',
      'color: #94a3b8; font-size: 12px; margin-top: 4px; font-family: -apple-system, sans-serif;',
    );
  }

  private renderLog(container: HTMLElement, commits: Commit[]) {
    if (commits.length === 0) {
      const empty = container.createDiv({
        text: 'No commits yet. Try: via commit "initial snapshot"',
      });
      empty.setAttr(
        'style',
        'color: #94a3b8; font-style: italic; font-family: -apple-system, sans-serif;',
      );
      return;
    }
    const header = container.createDiv({
      text: `Commit History (${commits.length})`,
    });
    header.setAttr(
      'style',
      'color: #0f172a; font-weight: 600; margin-bottom: 12px; font-family: -apple-system, sans-serif;',
    );

    for (const commit of commits) {
      const entry = container.createDiv();
      entry.setAttr(
        'style',
        'margin-bottom: 16px; padding-left: 12px; border-left: 2px solid #e2e8f0;',
      );
      const idLine = container.createDiv();
      idLine.setAttr(
        'style',
        'display: flex; gap: 8px; align-items: baseline; font-family: -apple-system, sans-serif;',
      );

      const idSpan = idLine.createSpan({ text: commit.id });
      idSpan.setAttr(
        'style',
        'color: #3b82f6; font-weight: 600; font-family: ui-monospace, monospace; font-size: 12px;',
      );

      const dateSpan = idLine.createSpan({
        text: new Date(commit.timestamp).toLocaleString(),
      });
      dateSpan.setAttr('style', 'color: #94a3b8; font-size: 11px;');

      const msgDiv = entry.createDiv({ text: commit.message });
      msgDiv.setAttr(
        'style',
        'color: #0f172a; font-size: 13px; margin-top: 4px; font-family: -apple-system, sans-serif;',
      );

      const countDiv = entry.createDiv({ text: `${commit.fileCount} files` });
      countDiv.setAttr(
        'style',
        'color: #94a3b8; font-size: 11px; margin-top: 2px; font-family: -apple-system, sans-serif;',
      );
    }
  }

  // FEATURE 3: INTERACTIVE CONFLICT RESOLUTION
  private renderConflicts(container: HTMLElement, conflicts: ConflictResult[]) {
    if (conflicts.length === 0) {
      const clean = container.createDiv({
        text: '✓ No conflicts detected. Safe to push.',
      });
      clean.setAttr(
        'style',
        'color: #10b981; font-weight: 500; font-family: -apple-system, sans-serif;',
      );
      return;
    }

    const header = container.createDiv({
      text: `⚠ ${conflicts.length} conflict(s) detected:`,
    });
    header.setAttr(
      'style',
      'color: #ef4444; font-weight: 600; margin-bottom: 12px; font-family: -apple-system, sans-serif;',
    );

    for (const conflict of conflicts) {
      const entry = container.createDiv();
      entry.setAttr(
        'style',
        'margin-bottom: 12px; padding: 12px 14px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px;',
      );

      const pathDiv = entry.createDiv({ text: conflict.path });
      pathDiv.setAttr(
        'style',
        'color: #dc2626; font-family: ui-monospace, monospace; font-size: 12px; font-weight: 500;',
      );

      const reasonDiv = entry.createDiv({ text: conflict.reason });
      reasonDiv.setAttr(
        'style',
        'color: #7f1d1d; font-size: 11px; margin-top: 4px; font-family: -apple-system, sans-serif;',
      );

      // Interactive Buttons
      const btnContainer = entry.createDiv();
      btnContainer.setAttr(
        'style',
        'display: flex; gap: 8px; margin-top: 10px;',
      );

      const keepLocalBtn = btnContainer.createEl('button', {
        text: 'Keep Local',
      });
      keepLocalBtn.setAttr(
        'style',
        'font-size: 11px; padding: 4px 8px; cursor: pointer; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 4px; font-weight: 500;',
      );
      keepLocalBtn.onclick = async () => {
        new Notice(`Forcing local version of ${conflict.path} to remote...`);
        // Force push this specific file to remote
        await this.engine.execute(
          `rclone copy "${conflict.path}" "${this.plugin.settings.remoteName}:${this.plugin.settings.remoteFolder}/${conflict.path}"`,
          this.vaultPath,
        );
        entry.setAttr('style', 'display: none;'); // Hide from list after action
      };

      const keepRemoteBtn = btnContainer.createEl('button', {
        text: 'Keep Remote',
      });
      keepRemoteBtn.setAttr(
        'style',
        'font-size: 11px; padding: 4px 8px; cursor: pointer; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 4px; font-weight: 500;',
      );
      keepRemoteBtn.onclick = async () => {
        new Notice(`Pulling remote version of ${conflict.path}...`);
        // Force pull this specific file from remote
        await this.engine.execute(
          `rclone copy "${this.plugin.settings.remoteName}:${this.plugin.settings.remoteFolder}/${conflict.path}" "${conflict.path}"`,
          this.vaultPath,
        );
        entry.setAttr('style', 'display: none;'); // Hide from list after action
      };
    }
  }

  private renderHelpMenu(container: HTMLElement) {
    const commands = [
      { cmd: 'via status', desc: 'Check local changes instantly (no network)' },
      {
        cmd: 'via diff',
        desc: 'Show exact file changes between local & remote',
      },
      { cmd: 'via push', desc: 'Upload local changes to the remote' },
      { cmd: 'via pull', desc: 'Download remote changes to local' },
      { cmd: 'via sync', desc: 'Bidirectional merge (resolves conflicts)' },
      { cmd: 'via conflicts', desc: 'Detect conflicts before pushing' },
      { cmd: 'via commit "msg"', desc: 'Save a snapshot of current state' },
      { cmd: 'via log', desc: 'View commit history' },
      { cmd: 'via restore <id>', desc: 'Restore vault to a previous commit' },
      { cmd: 'clear', desc: 'Clear the terminal screen' },
    ];

    const wrapper = container.createDiv();
    wrapper.setAttr(
      'style',
      'display: flex; flex-direction: column; gap: 2px; margin-top: 8px; font-family: -apple-system, sans-serif;',
    );
    const title = wrapper.createDiv({ text: 'Available Commands' });
    title.setAttr(
      'style',
      'color: #0f172a; font-weight: 600; margin-bottom: 8px; font-size: 13px;',
    );

    commands.forEach((c) => {
      const row = wrapper.createDiv();
      row.setAttr(
        'style',
        'display: flex; gap: 16px; padding: 4px 0; align-items: center;',
      );
      const cmdEl = row.createDiv({ text: c.cmd });
      cmdEl.setAttr(
        'style',
        'color: #3b82f6; font-family: ui-monospace, monospace; font-size: 12.5px; font-weight: 500; width: 140px; flex-shrink: 0;',
      );
      const descEl = row.createDiv({ text: c.desc });
      descEl.setAttr('style', 'color: #64748b; font-size: 13px;');
    });
  }

  private applyWindowSize() {
    if (this.isFullScreen) {
      this.container.style.width = '100vw';
      this.container.style.height = '100vh';
      this.container.style.borderRadius = '0px';
    } else {
      this.container.style.width = '850px';
      this.container.style.maxWidth = '100%';
      this.container.style.height = '600px';
      this.container.style.borderRadius = '12px';
    }
    this.inputEl?.focus();
  }

  private resetTerminal() {
    this.outputEl.empty();
    const welcome = this.outputEl.createDiv();
    welcome.setAttr(
      'style',
      'display: flex; flex-direction: column; gap: 8px; padding-bottom: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    );
    const title = welcome.createDiv({ text: 'Via Version Control' });
    title.setAttr(
      'style',
      'color: #0f172a; font-weight: 700; font-size: 18px; margin-bottom: 8px; letter-spacing: -0.5px;',
    );

    const createCheckLine = (text: string, highlight?: string) => {
      const line = welcome.createDiv();
      line.setAttr(
        'style',
        'display: flex; align-items: center; gap: 8px; color: #475569; font-size: 13px;',
      );
      const check = line.createSpan({ text: '✓' });
      check.setAttr('style', 'color: #10b981; font-weight: bold;');
      line.createSpan({ text: text });
      if (highlight) {
        const hlSpan = line.createSpan({ text: highlight });
        hlSpan.setAttr('style', 'color: #3b82f6; font-weight: 500;');
      }
    };

    createCheckLine('Settings loaded');
    createCheckLine('Rclone engine discovered');
    createCheckLine(
      'Remote: ',
      `${this.plugin.settings.remoteName}:${this.plugin.settings.remoteFolder}`,
    );

    const hint = welcome.createDiv();
    hint.setAttr('style', 'margin-top: 16px; color: #94a3b8; font-size: 12px;');
    hint.innerHTML = `Type <span style="color: #0f172a; background: #f1f5f9; padding: 3px 8px; border-radius: 6px; font-family: ui-monospace, monospace; font-weight: 500; border: 1px solid #e2e8f0;">via help</span>`;
  }

  onClose() {
    this.contentEl.empty();
  }
}
