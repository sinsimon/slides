import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CREDENTIALS_DIR = path.resolve(process.cwd(), 'tools/.credentials');
const TOKEN_PATH = path.join(CREDENTIALS_DIR, 'token.json');

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
  const port = 3456;
  const redirectUri = `http://localhost:${port}/oauth2callback`;
  oAuth2Client.redirectUri = redirectUri;

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    redirect_uri: redirectUri
  });

  console.log('\nApri questo URL nel browser per autorizzare l\'accesso al calendario:');
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

  const redirectUri = 'http://localhost:3456/oauth2callback';
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

export type CalendarEvent = {
  id: string;
  summary: string;
  start: string; // ISO
  end: string;   // ISO
  durationHours: number;
};

export async function fetchEvents(params: {
  calendarId: string;
  timeMinISO: string; // inclusive
  timeMaxISO?: string; // default now
}): Promise<CalendarEvent[]> {
  const auth = await getAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const timeMaxISO = params.timeMaxISO || new Date().toISOString();

  const res = await calendar.events.list({
    calendarId: params.calendarId,
    timeMin: params.timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500
  });

  const items = res.data.items || [];
  return items
    .filter(e => e.start && e.end)
    .map(e => {
      const isAllDay = Boolean(e.start?.date && !e.start?.dateTime);
      const start = e.start?.dateTime || (e.start?.date ? new Date(e.start.date + 'T00:00:00.000Z').toISOString() : '');
      const end = e.end?.dateTime || (e.end?.date ? new Date(e.end.date + 'T00:00:00.000Z').toISOString() : '');
      let durationHours = 0;
      if (!isAllDay) {
        const durationMs = start && end ? (new Date(end).getTime() - new Date(start).getTime()) : 0;
        durationHours = Math.max(0, durationMs / (1000 * 60 * 60));
      }
      return {
        id: e.id || Math.random().toString(36).slice(2),
        summary: e.summary || 'Senza titolo',
        start,
        end,
        durationHours
      } as CalendarEvent;
    });
}
