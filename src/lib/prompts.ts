import { input, select, number } from '@inquirer/prompts';

export async function askAIName(): Promise<string> {
  return input({
    message: 'What should your AI be called?',
    default: 'Assistant',
    validate: (value) => value.trim().length > 0 || 'Name cannot be empty',
  });
}

export async function askUserName(): Promise<string> {
  return input({
    message: 'What is your name?',
    validate: (value) => value.trim().length > 0 || 'Name cannot be empty',
  });
}

export async function askTimezone(): Promise<string> {
  return input({
    message: 'Your timezone (IANA format)',
    default: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

export async function askPersonalitySlider(trait: string, description: string, defaultValue: number): Promise<number> {
  const result = await number({
    message: `${trait} (${description})`,
    default: defaultValue,
    min: 0,
    max: 100,
    validate: (value) => {
      if (value === undefined) return 'Please enter a number';
      if (value < 0 || value > 100) return 'Must be between 0 and 100';
      return true;
    },
  });
  return result ?? defaultValue;
}

export async function askExistingInstall(): Promise<'augment' | 'fresh'> {
  return select({
    message: 'Existing ~/.claude/ detected. How should we proceed?',
    choices: [
      { name: 'Augment — add framework files alongside existing config', value: 'augment' as const },
      { name: 'Fresh — overwrite with new configuration', value: 'fresh' as const },
    ],
  });
}
