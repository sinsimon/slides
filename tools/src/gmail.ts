import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CREDENTIALS_DIR = path.resolve(process.cwd(), 'tools/.credentials');
const TOKEN_PATH = path.join(CREDENTIALS_DIR, 'token-gmail.json');

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readSavedToken(): any | null {
  try {
    const data = fs.readFileSync(TOKEN_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function saveToken(token: any) {
  ensureDir(CREDENTIALS_DIR);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

async function getNewToken(oAuth2Client: any): Promise<any> {
  const port = 3457;
  const redirectUri = `http://localhost:${port}/oauth2callback`;
  oAuth2Client.redirectUri = redirectUri;

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    redirect_uri: redirectUri
  });

  console.log('\nApri questo URL nel browser per autorizzare l\'accesso a Gmail:');
  console.log(authUrl);

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:${port}`);
      if (url.pathname === '/oauth2callback') {
        const code = url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h3>Autorizzazione ricevuta. Puoi chiudere questa finestra.</h3>');
        server.close();
        if (code) resolve(code);
        else reject(new Error('Missing code'));
      } else {
        res.writeHead(404).end();
      }
    });
    server.listen(port);
  });

  const { tokens } = await oAuth2Client.getToken({ code, redirect_uri: redirectUri });
  saveToken(tokens);
  return tokens;
}

export async function getAuthorizedClient(): Promise<any> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET mancanti in .env');
  }

  const redirectUri = 'http://localhost:3457/oauth2callback';
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const saved = readSavedToken();
  if (saved) {
    oAuth2Client.setCredentials(saved);
  } else {
    const tokens = await getNewToken(oAuth2Client);
    oAuth2Client.setCredentials(tokens);
  }

  return oAuth2Client;
}

export type EmailMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string; // ISO
  snippet: string;
  body: string;
};

export type ThreadMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string; // ISO
  snippet: string;
  body: string;
  isFromSupport: boolean; // true se è una risposta dal support, false se è dal cliente
};

function decodeBase64Url(base64Url: string): string {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function extractBody(parts: any[]): string {
  let text = '';
  let plainText = '';
  let htmlText = '';
  
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plainText += decodeBase64Url(part.body.data) + '\n';
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      const html = decodeBase64Url(part.body.data);
      // Rimuovi tag HTML, entità HTML, e normalizza spazi
      htmlText += html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Rimuovi CSS
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Rimuovi JavaScript
        .replace(/<[^>]+>/g, ' ') // Rimuovi tag HTML
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&[a-z]+;/gi, ' ') // Rimuovi altre entità HTML
        .replace(/\s+/g, ' ')
        .trim() + '\n';
    } else if (part.parts && Array.isArray(part.parts)) {
      const nested = extractBody(part.parts);
      if (nested) {
        if (part.mimeType === 'text/plain') plainText += nested;
        else if (part.mimeType === 'text/html') htmlText += nested;
        else text += nested; // Per altri tipi
      }
    }
  }
  
  // Preferisci plain text, altrimenti usa HTML pulito
  return (plainText || htmlText || text).trim();
}

function getHeader(headers: any[], name: string): string {
  const h = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

export async function fetchEmails(params: {
  query?: string; // Gmail search query, es: "to:support@avacy.com" o "label:support"
  maxResults?: number;
  timeMinISO?: string;
  timeMaxISO?: string;
}): Promise<EmailMessage[]> {
  const auth = await getAuthorizedClient();
  const gmail = google.gmail({ version: 'v1', auth });

  // Costruisci la query
  let query = params.query || '';
  if (params.timeMinISO) {
    const after = Math.floor(new Date(params.timeMinISO).getTime() / 1000);
    query += (query ? ' ' : '') + `after:${after}`;
  }
  if (params.timeMaxISO) {
    const before = Math.floor(new Date(params.timeMaxISO).getTime() / 1000);
    query += (query ? ' ' : '') + `before:${before}`;
  }

  const messages: EmailMessage[] = [];
  let pageToken: string | undefined = undefined;
  const maxResults = params.maxResults || 500;

  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: Math.min(500, maxResults - messages.length),
      pageToken
    });

    const messageIds = res.data.messages || [];
    if (messageIds.length === 0) break;

    // Fetch dettagli per ogni messaggio
    for (const msg of messageIds) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full'
        });

        const payload = detail.data.payload;
        if (!payload) continue;

        const headers = payload.headers || [];
        const subject = getHeader(headers, 'Subject');
        const from = getHeader(headers, 'From');
        const to = getHeader(headers, 'To');
        const dateHeader = getHeader(headers, 'Date');
        const date = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();

        const snippet = detail.data.snippet || '';
        let body = '';
        
        // Estrai il body in modo più robusto
        if (payload.parts && Array.isArray(payload.parts)) {
          body = extractBody(payload.parts);
        } else if (payload.body?.data) {
          body = decodeBase64Url(payload.body.data);
        } else if (payload.mimeType === 'text/plain' && payload.body?.data) {
          body = decodeBase64Url(payload.body.data);
        } else if (payload.mimeType === 'text/html' && payload.body?.data) {
          const html = decodeBase64Url(payload.body.data);
          body = html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&[a-z]+;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        
        // Se il body è vuoto o troppo corto, usa lo snippet come fallback
        const finalBody = (body && body.length > 50) ? body : (snippet || '');

        messages.push({
          id: msg.id!,
          threadId: detail.data.threadId || '',
          subject,
          from,
          to,
          date,
          snippet,
          body: finalBody
        });
      } catch (err) {
        console.error(`Errore nel fetch del messaggio ${msg.id}:`, err);
      }
    }

    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken && messages.length < maxResults);

  return messages;
}

export async function fetchThread(threadId: string): Promise<ThreadMessage[]> {
  const auth = await getAuthorizedClient();
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full'
    });

    const messages: ThreadMessage[] = [];
    const threadMessages = thread.data.messages || [];

    for (const msg of threadMessages) {
      const payload = msg.payload;
      if (!payload) continue;

      const headers = payload.headers || [];
      const subject = getHeader(headers, 'Subject');
      const from = getHeader(headers, 'From');
      const to = getHeader(headers, 'To');
      const dateHeader = getHeader(headers, 'Date');
      const date = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();

      const snippet = msg.snippet || '';
      let body = '';
      
      // Estrai il body con la stessa logica migliorata
      if (payload.parts && Array.isArray(payload.parts)) {
        body = extractBody(payload.parts);
      } else if (payload.body?.data) {
        body = decodeBase64Url(payload.body.data);
      } else if (payload.mimeType === 'text/plain' && payload.body?.data) {
        body = decodeBase64Url(payload.body.data);
      } else if (payload.mimeType === 'text/html' && payload.body?.data) {
        const html = decodeBase64Url(payload.body.data);
        body = html
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&[a-z]+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      const finalBody = (body && body.length > 50) ? body : (snippet || '');

      // Determina se è dal support (controlla se "from" contiene il dominio support o se "to" contiene support)
      const supportEmail = process.env.GMAIL_SUPPORT_QUERY?.match(/to:([^\s]+)/)?.[1] || 'support@avacysolution.com';
      const isFromSupport = from.toLowerCase().includes(supportEmail.split('@')[0]) || 
                           from.toLowerCase().includes('support') ||
                           to.toLowerCase().includes(supportEmail);

      messages.push({
        id: msg.id || '',
        threadId,
        subject,
        from,
        to,
        date,
        snippet,
        body: finalBody,
        isFromSupport
      });
    }

    return messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  } catch (err) {
    console.error(`Errore nel fetch del thread ${threadId}:`, err);
    return [];
  }
}

const EMAILS_CACHE_DIR = path.resolve(process.cwd(), 'tools/.cache');
const EMAILS_CACHE_FILE = path.join(EMAILS_CACHE_DIR, 'emails-cache.json');

export function saveEmailsCache(emails: EmailMessage[], query: string, timeMinISO?: string, timeMaxISO?: string): void {
  ensureDir(EMAILS_CACHE_DIR);
  const cache = {
    query,
    timeMinISO,
    timeMaxISO,
    cachedAt: new Date().toISOString(),
    emails
  };
  fs.writeFileSync(EMAILS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

export function loadEmailsCache(query: string, timeMinISO?: string, timeMaxISO?: string): EmailMessage[] | null {
  try {
    const data = fs.readFileSync(EMAILS_CACHE_FILE, 'utf8');
    const cache = JSON.parse(data);
    
    // Verifica che query e date corrispondano
    if (cache.query !== query) return null;
    if (cache.timeMinISO !== timeMinISO) return null;
    if (cache.timeMaxISO !== timeMaxISO) return null;
    
    console.log(`Caricando ${cache.emails.length} email dalla cache (salvate il ${cache.cachedAt.slice(0, 10)})`);
    return cache.emails;
  } catch {
    return null;
  }
}
