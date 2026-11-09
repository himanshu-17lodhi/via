import { App, PluginSettingTab, Setting } from 'obsidian';

export function renderSetupGuide(containerEl: HTMLElement) {
  const guideBox = containerEl.createDiv({
    attr: {
      style: `
        background: var(--background-secondary);
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 24px;
        border-left: 4px solid var(--interactive-accent);
      `,
    },
  });

  guideBox.createEl('h3', {
    text: 'Quick Setup Guide',
    attr: {
      style: `
        margin-top: 0;
        margin-bottom: 12px;
        color: var(--text-normal);
      `,
    },
  });

  const steps = guideBox.createEl('ol', {
    attr: {
      style: `
        margin: 0;
        padding-left: 20px;
        line-height: 1.6;
        font-size: 13.5px;
        color: var(--text-normal);
      `,
    },
  });

  const createStep = (title: string, description?: string) => {
    const item = steps.createEl('li', {
      attr: { style: 'margin-bottom: 10px;' },
    });

    item.createEl('b', { text: title });

    if (description) {
      item.createEl('span', { text: ` ${description}` });
    }

    return item;
  };

  const createCommand = (
    parent: HTMLElement,
    command: string,
    prefix?: string
  ) => {
    if (prefix) {
      parent.createEl('br');
      parent.createEl('span', { text: prefix });
    }

    parent.createEl('br');

    parent.createEl('code', {
      text: command,
      attr: {
        style: `
          display: inline-block;
          margin-top: 4px;
          padding: 2px 6px;
          background: var(--background-primary);
          border-radius: 4px;
        `,
      },
    });
  };

  const step1 = createStep(
    'Install rclone:',
    'Download it from the official rclone downloads page.'
  );

  step1.createEl('br');
  step1.createEl('a', {
    text: 'rclone.org/downloads',
    href: 'https://rclone.org/downloads/',
  });

  step1.createEl('span', {
    text: ' Windows users can also open PowerShell and run:',
  });

  createCommand(step1, 'winget install Rclone.Rclone');

  const step2 = createStep(
    'Configure your Cloud:',
    'Open your computer’s terminal (PowerShell, Command Prompt, or Terminal) and run:'
  );

  createCommand(step2, 'rclone config');

  step2.createEl('br');
  step2.createEl('span', {
    text:
      'Follow the prompts to create a new remote. Give it a simple name, such as ',
  });

  step2.createEl('code', { text: 'gdrive' });

  step2.createEl('span', { text: ' or ' });
  step2.createEl('code', { text: 'onedrive' });
  step2.createEl('span', { text: '.' });

  const step3 = createStep(
    'Find your Config Path:',
    'In the terminal, run:'
  );

  createCommand(step3, 'rclone config file');

  step3.createEl('br');
  step3.createEl('span', {
    text: 'It will print a path, for example:',
  });

  step3.createEl('br');
  step3.createEl('code', {
    text: 'C:\\Users\\Name\\AppData\\Roaming\\rclone\\rclone.conf',
    attr: {
      style: `
        display: inline-block;
        margin-top: 4px;
        padding: 2px 6px;
        background: var(--background-primary);
        border-radius: 4px;
      `,
    },
  });

  const step4 = createStep(
    'Fill out the settings below:',
    'Paste the config path into the '
  );

  step4.createEl('b', { text: 'Config File Path' });
  step4.createEl('span', {
    text:
      ' box. Then enter the exact remote name you created in Step 2, along with the remote folder where your vault should be stored.',
  });
}