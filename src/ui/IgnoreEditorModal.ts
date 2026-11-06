import { App, Modal, Notice } from 'obsidian';
import { IgnoreEngine } from '../core/IgnoreEngine';

export class IgnoreEditorModal extends Modal {
  constructor(
    app: App,
    private ignoreEngine: IgnoreEngine,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Edit .viaignore' });

    const info = contentEl.createEl('p', {
      text: 'One pattern per line. Lines starting with # are comments. Built-in defaults are not shown here.',
    });
    info.style.cssText =
      'color:var(--text-muted);font-size:13px;margin-bottom:12px;';

    const ta = contentEl.createEl('textarea');
    ta.value = this.ignoreEngine.getUserPatterns().join('\n');
    ta.rows = 14;
    ta.style.cssText =
      'width:100%;font-family:var(--font-monospace);font-size:13px;' +
      'padding:8px;border-radius:6px;resize:vertical;' +
      'background:var(--background-secondary);color:var(--text-normal);' +
      'border:1px solid var(--background-modifier-border);';

    const row = contentEl.createDiv({ cls: 'modal-button-container' });
    row.style.cssText =
      'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';

    const cancel = row.createEl('button', { text: 'Cancel' });
    cancel.onclick = () => this.close();

    const save = row.createEl('button', { text: 'Save', cls: 'mod-cta' });
    save.onclick = async () => {
      await this.ignoreEngine.setUserPatterns(ta.value.split('\n'));
      new Notice('Via: .viaignore saved.');
      this.close();
    };

    setTimeout(() => ta.focus(), 0);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
