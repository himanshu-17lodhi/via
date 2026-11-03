import { App, Modal } from 'obsidian';

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private titleStr: string,
    private message: string,
    private danger: boolean = false,
    private resolve: (value: boolean) => void,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl
      .createEl('h3', { text: this.titleStr })
      .setAttr('style', 'margin-top: 0; color: var(--text-normal);');

    contentEl
      .createEl('p', { text: this.message })
      .setAttr('style', 'color: var(--text-muted); margin-bottom: 24px;');

    const btnContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => {
      this.resolve(false);
      this.close();
    };

    const confirmBtn = btnContainer.createEl('button', { text: 'Proceed' });
    if (this.danger) {
      confirmBtn.addClass('mod-warning'); // Native Obsidian red button
    } else {
      confirmBtn.addClass('mod-cta'); // Native Obsidian blue button
    }

    confirmBtn.onclick = () => {
      this.resolve(true);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
