
import { useState, useEffect } from 'react';
import { loadJsonData } from '../utils/assets';

export interface LeaderboardEntry {
  domain: string;
  visits: number;
  request_percentage: string; // Decimal/string from DB
  month: number;
  year: number;
  tenant_id: string | null;
}

export function useLeaderboard() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadJsonData<LeaderboardEntry[]>('avacy/json/vapor/leaderboard.json')
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
