import { useState, useEffect } from 'react';
import { getFileLastModified } from '../utils/assets';

/**
 * Hook per ottenere le date di ultima modifica di più file
 */
export function useFileLastModified(urls: string[]): Record<string, string | null> {
  const [dates, setDates] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const fetchDates = async () => {
      const results: Record<string, string | null> = {};
      await Promise.all(
        urls.map(async (url) => {
          const date = await getFileLastModified(url);
          results[url] = date;
        })
      );
      setDates(results);
    };

    fetchDates();
  }, [urls.join(',')]);

  return dates;
}


