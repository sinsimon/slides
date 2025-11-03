import { stringify } from 'csv-stringify/sync';

export type CsvRow = {
  titolo: string;
  data: string; // YYYY-MM-DD
  ore: number;  // decimale
  categoria: string;
};

export function rowsToCsv(rows: CsvRow[]): string {
  return stringify(rows, {
    header: true,
    columns: ['titolo', 'data', 'ore', 'categoria']
  });
}




