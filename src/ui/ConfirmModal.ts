import { App, Modal } from 'obsidian';

export class ConfirmModal extends Modal {
  private resolvePromise: (value: boolean) => void;

  constructor(
    app: App,
    private title: string,
    private message: string,
    private danger: boolean = false,
    resolve: (value: boolean) => void,
  ) {
    super(app);
    this.resolvePromise = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl
      .createEl('h3', { text: this.title })
      .setAttr('style', 'margin-top: 0; color: #0f172a;');
    contentEl
      .createEl('p', { text: this.message })
      .setAttr('style', 'color: #475569; margin-bottom: 24px;');

    const btnContainer = contentEl.createDiv();
    btnContainer.setAttr(
      'style',
      'display: flex; justify-content: flex-end; gap: 12px;',
    );

    const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.setAttr(
      'style',
      'background: transparent; border: 1px solid #e2e8f0; color: #64748b; padding: 8px 16px; border-radius: 6px; cursor: pointer;',
    );
    cancelBtn.onclick = () => {
      this.resolvePromise(false);
      this.close();
    };

    const confirmBtn = btnContainer.createEl('button', { text: 'Proceed' });
    confirmBtn.setAttr(
      'style',
      `background: ${this.danger ? '#ef4444' : '#3b82f6'}; border: none; color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;`,
    );
    confirmBtn.onclick = () => {
      this.resolvePromise(true);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
