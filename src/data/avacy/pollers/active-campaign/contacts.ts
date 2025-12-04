import { fetch } from 'undici';

export type ActiveCampaignPollVars = {
	ACTIVE_CAMPAIGN_API_URL: string;
	ACTIVE_CAMPAIGN_API_KEY: string;
};

type ActiveCampaignMeta = {
  total?: number;
  next?: string | null;
};

type ActiveCampaignContact = Record<string, unknown> & {
  id: string;
};

type ActiveCampaignField = Record<string, unknown> & {
  id: string;
  title?: string;
  type?: string;
};

type ActiveCampaignFieldValue = Record<string, unknown> & {
  id: string;
  contact?: string;
  field?: string;
  value?: string | number | null;
};

async function fetchPaginatedCollection<T extends Record<string, unknown>>(
  baseUrl: string,
  apiKey: string,
  endpoint: string,
  key: string,
  logLabel: string
): Promise<T[]> {
  const results: T[] = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`${baseUrl}${endpoint}`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));

    console.log(`${logLabel} offset=${offset} limit=${limit}`);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Api-Token': apiKey,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ActiveCampaign error ${res.status}: ${text}`);
    }

    const body = (await res.json()) as Record<string, unknown> & { meta?: ActiveCampaignMeta };
    const batch = (body[key] as T[]) ?? [];
    console.log(`  → ${batch.length} records`);

    results.push(...batch);

    const total = body.meta?.total;
    offset += limit;

    if (batch.length < limit) {
      hasMore = false;
    } else if (typeof total === 'number' && offset >= total) {
      hasMore = false;
    }
  }

  return results;
}

export async function fetchActiveCampaignContacts(vars: ActiveCampaignPollVars): Promise<{
	fetchedAt: string;
	total: number;
	fields: Array<{ id: string; title?: string; type?: string }>;
	contacts: Array<Record<string, unknown> & { customFields: Record<string, string> }>;
}> {
  const baseUrl = vars.ACTIVE_CAMPAIGN_API_URL.replace(/\/$/, '');
  const apiKey = vars.ACTIVE_CAMPAIGN_API_KEY;

  console.log('=== ActiveCampaign: fetch contacts, fields & field values ===');

  const contacts = await fetchPaginatedCollection<ActiveCampaignContact>(
    baseUrl,
    apiKey,
    '/api/3/contacts',
    'contacts',
    'Fetching contacts'
  );

  const fields = await fetchPaginatedCollection<ActiveCampaignField>(
    baseUrl,
    apiKey,
    '/api/3/fields',
    'fields',
    'Fetching custom fields'
  );

  const fieldValues = await fetchPaginatedCollection<ActiveCampaignFieldValue>(
    baseUrl,
    apiKey,
    '/api/3/fieldValues',
    'fieldValues',
    'Fetching field values'
  );

  console.log(`Total contacts: ${contacts.length}`);
  console.log(`Total fields: ${fields.length}`);
  console.log(`Total field values: ${fieldValues.length}`);

  const fieldById = new Map<string, ActiveCampaignField>();
  fields.forEach((field) => {
    if (typeof field.id === 'string') {
      fieldById.set(field.id, field);
    }
  });

  const customFieldsByContact = new Map<string, Record<string, string>>();

  fieldValues.forEach((fv) => {
    const contactId = typeof fv.contact === 'string' ? fv.contact : undefined;
    const fieldId = typeof fv.field === 'string' ? fv.field : undefined;
    if (!contactId || !fieldId) return;

    const fieldInfo = fieldById.get(fieldId);
    const title = (typeof fieldInfo?.title === 'string' && fieldInfo.title.trim().length > 0)
      ? fieldInfo.title.trim()
      : `Field ${fieldId}`;

    const value = fv.value ?? '';

    if (!customFieldsByContact.has(contactId)) {
      customFieldsByContact.set(contactId, {});
    }

    customFieldsByContact.get(contactId)![title] = String(value ?? '');
  });

  const contactsWithCustom = contacts.map((contact) => {
    const contactId = String(contact.id);
    const customFields = customFieldsByContact.get(contactId) ?? {};
    return {
      ...contact,
      customFields,
    };
  });

  const simplifiedFields = fields.map((field) => ({
    id: field.id,
    title: field.title,
    type: field.type,
  }));

  return {
    fetchedAt: new Date().toISOString(),
    total: contacts.length,
    fields: simplifiedFields,
    contacts: contactsWithCustom,
  };
}

export default fetchActiveCampaignContacts;
