import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export type CategorySpec = {
  name: string;
  keywords?: string[];
};

export type ExampleItem = {
  title: string;
  category: string;
};

export type AppConfig = {
  startDateISO: string;
  calendarId: string;
  categories: CategorySpec[];
  examples: ExampleItem[];
  useAI: boolean;
  geminiApiKey?: string;
  geminiModel?: string;
  aiBatchSize: number;
  categoriesFile?: string;
  examplesFile?: string;
};

function readJSONFile<T>(filePath: string): T | null {
  try {
     const abs = path.resolve(process.cwd(), filePath);
     const data = fs.readFileSync(abs, 'utf8');
     return JSON.parse(data) as T;
  } catch (err) {
     return null;
  }
}

export function loadCategories(filePath?: string): CategorySpec[] {
  const fallback = path.resolve(process.cwd(), 'tools/categories.sample.json');
  const target = filePath || process.env.CATEGORIES_FILE || fallback;
  const categories = readJSONFile<CategorySpec[]>(target);
  return categories || [];
}

export function loadExamples(filePath?: string): ExampleItem[] {
  const target = filePath || process.env.EXAMPLES_FILE;
  if (!target) return [];
  const examples = readJSONFile<ExampleItem[]>(target);
  return examples || [];
}

function defaultStartDate(): string {
  const fromEnv = process.env.START_DATE;
  if (fromEnv) return fromEnv;
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function buildConfig(opts: {
  fromArg?: string;
  calendarIdArg?: string;
  categoriesFileArg?: string;
  examplesFileArg?: string;
  useAIArg?: boolean;
} = {}): AppConfig {
  const startDateISO = (opts.fromArg || process.env.START_DATE || defaultStartDate()).slice(0,10);
  const calendarId = opts.calendarIdArg || process.env.GOOGLE_CALENDAR_ID || 'primary';
  const categoriesFile = opts.categoriesFileArg || process.env.CATEGORIES_FILE;
  const examplesFile = opts.examplesFileArg || process.env.EXAMPLES_FILE;
  const categories = loadCategories(categoriesFile);
  const examples = loadExamples(examplesFile);
  const useAI = Boolean(opts.useAIArg || (process.env.USE_AI === 'true'));
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const aiBatchSize = Number(process.env.AI_BATCH_SIZE || 50);

  return {
    startDateISO,
    calendarId,
    categories,
    examples,
    useAI,
    geminiApiKey,
    geminiModel,
    aiBatchSize,
    categoriesFile,
    examplesFile
  };
}


