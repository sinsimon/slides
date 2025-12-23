import { stringify } from 'csv-stringify/sync';

export type EmailCsvRow = {
  numeroMail: string;
  threadId: string;
  subject: string;
  from: string;
  cliente: string;
  data: string; // YYYY-MM-DD
  categoria: string;
  riassunto: string;
  risolto: boolean;
  body: string;
};

export function emailsToCsv(rows: EmailCsvRow[]): string {
  return stringify(rows, {
    header: true,
    columns: ['numeroMail', 'threadId', 'subject', 'from', 'cliente', 'data', 'categoria', 'riassunto', 'risolto', 'body']
  });
}
