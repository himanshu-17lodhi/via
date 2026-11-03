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

    this.modalEl.addClass('via-terminal-modal');
    const closeBtn = this.modalEl.querySelector(
      '.modal-close-button',
    ) as HTMLElement;
    if (closeBtn) closeBtn.style.display = 'none';

    this.buildLayout();
    this.resetTerminal();
    this.bindEvents();
  }

  private buildLayout() {
    this.container = this.contentEl.createDiv({
      cls: 'via-terminal-container',
    });
    this.applyWindowSize();

    // Header
    const header = this.container.createDiv({ cls: 'via-terminal-header' });

    const dots = header.createDiv({ cls: 'via-terminal-dots' });
    this.createDot(dots, 'close', () => this.close());
    this.createDot(dots, 'reset', () => this.resetTerminal());
    this.createDot(dots, 'fullscreen', () => {
      this.isFullScreen = !this.isFullScreen;
      this.applyWindowSize();
    });

    header.createDiv({ text: 'Via Terminal', cls: 'via-terminal-title' });
    header.createDiv().setAttr('style', 'width: 46px;'); // Spacer

    // Output area
    this.outputEl = this.container.createDiv({ cls: 'via-terminal-output' });

    // Input area
    const inputSection = this.container.createDiv({
      cls: 'via-terminal-input-section',
    });
    const inputWrapper = inputSection.createDiv({
      cls: 'via-terminal-input-wrapper',
    });

    inputWrapper.createSpan({ text: '❯', cls: 'via-terminal-prompt-symbol' });

    this.inputEl = inputWrapper.createEl('input', {
      type: 'text',
      cls: 'via-terminal-input',
    });

    // Footer
    const footer = inputSection.createDiv({ cls: 'via-terminal-footer' });
    footer.createSpan({ text: '● Local', cls: 'via-footer-local' });
    footer.createSpan({ text: '⟷', cls: 'via-footer-arrow' });
    footer.createSpan({
      text: `${this.plugin.settings.remoteName}/${this.plugin.settings.remoteFolder}`,
      cls: 'via-footer-remote',
    });
  }

  private createDot(parent: HTMLElement, type: string, onClick: () => void) {
    const dot = parent.createDiv({ cls: `via-terminal-dot ${type}` });
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
            'color: var(--text-error); font-family: var(--font-monospace);',
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
                  'color: var(--text-muted); font-style: italic;',
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
                'color: var(--text-success); font-weight: 600; font-size: 13.5px; margin-bottom: 4px;',
              );

              const infoDiv = resultBlock.createDiv({
                text: `Deleted ${deletedCount} untracked files.`,
              });
              infoDiv.setAttr(
                'style',
                'color: var(--text-muted); font-size: 13px;',
              );

              const hintDiv = resultBlock.createDiv({
                text: 'Run "via pull" to fetch the file contents from the remote.',
              });
              hintDiv.setAttr(
                'style',
                'color: var(--color-orange); font-size: 12px; margin-top: 8px;',
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
        if (['push', 'pull', 'sync'].includes(sub)) {
          const timestamp = new Date().toLocaleString();
          await this.plugin.snapshotEngine.commit(
            `Auto-save before ${sub} (${timestamp})`,
            this.plugin.viaManifest.data,
          );
        }

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
            'color: var(--text-success); font-weight: 600; font-size: 13.5px; margin-bottom: 4px;',
          );

          const statsDiv = resultBlock.createDiv({
            text: `Transferred ${result.summary.files} files`,
          });
          statsDiv.setAttr(
            'style',
            'color: var(--text-muted); font-size: 13px;',
          );

          if (result.output.includes('ERROR')) {
            const errorDiv = resultBlock.createDiv({
              text: 'Some files failed to transfer. Run "via diff" to see details.',
            });
            errorDiv.setAttr(
              'style',
              'color: var(--text-error); font-size: 12px; margin-top: 8px;',
            );
          }
        } else {
          resultBlock.setText(result.output);
        }

        if (result.exitCode === 0 && ['push', 'pull', 'sync'].includes(sub)) {
          await this.statusEngine.updateManifestFromLocal();
          const manifestMsg = this.outputEl.createDiv({
            text: '✓ Manifest updated locally',
          });
          manifestMsg.setAttr(
            'style',
            'color: var(--text-faint); margin-top: 12px; font-size: 11px;',
          );
        }
      }
    } catch (err: any) {
      clearInterval(spinner);
      resultBlock.empty();
      resultBlock.setText(`Error: ${err.message}`);
      resultBlock.setAttr('style', 'color: var(--text-error);');
    }

    this.outputEl.scrollTop = this.outputEl.scrollHeight;
    this.plugin.statusBarItem.setText('via: ready');
  }

  private renderPromptBlock(sub: string) {
    const block = this.outputEl.createDiv({ cls: 'via-prompt-block' });
    block.createSpan({ text: '❯', cls: 'via-terminal-prompt-symbol' });
    block.createSpan({ text: `via ${sub}`, cls: 'via-prompt-text' });
  }

  private startSpinner(container: HTMLElement): number {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    container.setAttr('style', 'color: var(--text-muted); margin-top: 4px;');
    return window.setInterval(() => {
      container.setText(`${frames[i++ % frames.length]} Running...`);
      this.outputEl.scrollTop = this.outputEl.scrollHeight;
    }, 80);
  }

  private renderStatusTree(container: HTMLElement, data: SyncStatus[]) {
    if (data.length === 0) {
      container.createDiv({
        text: '✨ Working tree clean. Everything is synced.',
        cls: 'via-status-clean',
      });
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
      type: 'added' | 'modified' | 'deleted',
    ) => {
      const row = parent.createDiv({ cls: 'via-file-row' });
      row.createSpan({ text: symbol, cls: `via-file-icon ${type}` });
      row.createSpan({ text: path, cls: 'via-file-text' });
    };

    if (groups.added.length) {
      container.createDiv({
        text: 'Added (New files to sync):',
        cls: 'via-status-header added',
      });
      groups.added.forEach((f) =>
        createFileRow(container, '+', f.path, 'added'),
      );
    }
    if (groups.modified.length) {
      container.createDiv({
        text: 'Modified:',
        cls: 'via-status-header modified',
      });
      groups.modified.forEach((f) =>
        createFileRow(container, '*', f.path, 'modified'),
      );
    }
    if (groups.deleted.length) {
      container.createDiv({
        text: 'Deleted:',
        cls: 'via-status-header deleted',
      });
      groups.deleted.forEach((f) =>
        createFileRow(container, '-', f.path, 'deleted'),
      );
    }
  }

  private renderDiff(container: HTMLElement, raw: string) {
    for (const line of raw.split('\n')) {
      const div = container.createDiv({ cls: 'via-diff-line' });
      if (line.startsWith('+')) {
        div.setText(line);
        div.addClass('via-diff-add');
      } else if (line.startsWith('-')) {
        div.setText(line);
        div.addClass('via-diff-del');
      } else if (line.startsWith('*')) {
        div.setText(line);
        div.addClass('via-diff-mod');
      } else {
        div.setText(line);
        div.style.color = 'var(--text-muted)';
      }
    }
  }

  private renderCommit(container: HTMLElement, commit: Commit) {
    const success = container.createDiv({ text: `✓ Committed [${commit.id}]` });
    success.setAttr(
      'style',
      'color: var(--text-success); font-weight: 600; margin-bottom: 8px;',
    );

    const msgLine = container.createDiv({
      text: `Message: "${commit.message}"`,
    });
    msgLine.setAttr('style', 'color: var(--text-normal); font-size: 13px;');

    const countLine = container.createDiv({
      text: `${commit.fileCount} files tracked`,
    });
    countLine.setAttr(
      'style',
      'color: var(--text-muted); font-size: 12px; margin-top: 4px;',
    );
  }

  private renderLog(container: HTMLElement, commits: Commit[]) {
    if (commits.length === 0) {
      container.createDiv({
        text: 'No commits yet. Try: via commit "initial snapshot"',
        cls: 'via-status-clean',
      });
      return;
    }
    container.createDiv({
      text: `Commit History (${commits.length})`,
      cls: 'via-help-title',
    });

    for (const commit of commits) {
      const entry = container.createDiv({ cls: 'via-conflict-card' }); // Reusing some styling
      entry.setAttr(
        'style',
        'border-left-color: var(--interactive-accent); background: var(--background-secondary); margin-bottom: 16px;',
      );

      const idLine = entry.createDiv({ cls: 'via-terminal-footer' });
      idLine.createSpan({ text: commit.id, cls: 'via-help-cmd' });
      idLine.createSpan({
        text: new Date(commit.timestamp).toLocaleString(),
        cls: 'via-footer-arrow',
      });

      const msgDiv = entry.createDiv({
        text: commit.message,
        cls: 'via-file-text',
      });
      msgDiv.setAttr('style', 'margin-top: 4px;');

      const countDiv = entry.createDiv({
        text: `${commit.fileCount} files`,
        cls: 'via-footer-remote',
      });
    }
  }

  private renderConflicts(container: HTMLElement, conflicts: ConflictResult[]) {
    if (conflicts.length === 0) {
      container.createDiv({
        text: '✓ No conflicts detected. Safe to push.',
        cls: 'via-status-clean',
      });
      return;
    }

    container.createDiv({
      text: `⚠ ${conflicts.length} conflict(s) detected:`,
      cls: 'via-status-header deleted',
    });

    for (const conflict of conflicts) {
      const entry = container.createDiv({ cls: 'via-conflict-card' });

      entry
        .createDiv({ text: conflict.path, cls: 'via-file-text' })
        .setAttr('style', 'color: var(--text-error);');

      entry
        .createDiv({ text: conflict.reason, cls: 'via-help-desc' })
        .setAttr(
          'style',
          'color: var(--text-muted); font-size: 11px; margin-top: 4px;',
        );

      const btnContainer = entry.createDiv({ cls: 'via-terminal-footer' });
      btnContainer.setAttr('style', 'margin-top: 10px;');

      const keepLocalBtn = btnContainer.createEl('button', {
        text: 'Keep Local',
        cls: 'via-btn keep-local',
      });
      keepLocalBtn.onclick = async () => {
        new Notice(`Forcing local version of ${conflict.path} to remote...`);
        await this.engine.execute(
          `rclone copy "${conflict.path}" "${this.plugin.settings.remoteName}:${this.plugin.settings.remoteFolder}/${conflict.path}"`,
          this.vaultPath,
        );
        entry.style.display = 'none';
      };

      const keepRemoteBtn = btnContainer.createEl('button', {
        text: 'Keep Remote',
        cls: 'via-btn keep-remote',
      });
      keepRemoteBtn.onclick = async () => {
        new Notice(`Pulling remote version of ${conflict.path}...`);
        await this.engine.execute(
          `rclone copy "${this.plugin.settings.remoteName}:${this.plugin.settings.remoteFolder}/${conflict.path}" "${conflict.path}"`,
          this.vaultPath,
        );
        entry.style.display = 'none';
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
      'display: flex; flex-direction: column; gap: 2px; margin-top: 8px;',
    );
    wrapper.createDiv({ text: 'Available Commands', cls: 'via-help-title' });

    commands.forEach((c) => {
      const row = wrapper.createDiv({ cls: 'via-help-row' });
      row.createDiv({ text: c.cmd, cls: 'via-help-cmd' });
      row.createDiv({ text: c.desc, cls: 'via-help-desc' });
    });
  }

  private applyWindowSize() {
    if (!this.container) return;
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
    welcome.createDiv({
      text: 'Via Version Control',
      cls: 'via-welcome-title',
    });

    const createCheckLine = (text: string, highlight?: string) => {
      const line = welcome.createDiv({ cls: 'via-welcome-line' });
      line.createSpan({ text: '✓', cls: 'via-welcome-check' });
      line.createSpan({ text: text });
      if (highlight) {
        line.createSpan({ text: highlight, cls: 'via-welcome-remote' });
      }
    };

    createCheckLine('Settings loaded');
    createCheckLine('Rclone engine discovered');
    createCheckLine(
      'Remote: ',
      `${this.plugin.settings.remoteName}:${this.plugin.settings.remoteFolder}`,
    );

    const hint = welcome.createDiv();
    hint.setAttr(
      'style',
      'margin-top: 16px; color: var(--text-muted); font-size: 12px;',
    );
    hint.innerHTML = `Type <span style="color: var(--text-normal); background: var(--background-secondary); padding: 3px 8px; border-radius: 6px; font-family: var(--font-monospace); font-weight: 500; border: 1px solid var(--background-modifier-border);">via help</span>`;
  }

  onClose() {
    this.contentEl.empty();
  }
}
