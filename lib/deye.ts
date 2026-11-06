import { env } from 'cloudflare:workers';
import { apiTimestamp, normalize, numeric, type EnergyData } from './energy';
const hosts: Record<string, string> = { eu: 'https://eu1-developer.deyecloud.com', am: 'https://us1-developer.deyecloud.com' };
export type Session = {
    token: string;
    region: string;
    user: string;
    expires: number;
    stations: Array<{
        id: number;
        name: string;
        timezone: string;
    }>;
};
const encoder = new TextEncoder();
let devKey: CryptoKey | undefined;
async function key() { const secret = (env as unknown as Record<string, string>).SESSION_KEY; if (!secret) {
    if (import.meta.env.PROD)
        throw new Error('Secure connection setup is unavailable. Please try again later.');
    return devKey ??= await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
} return crypto.subtle.importKey('raw', Uint8Array.from(atob(secret), c => c.charCodeAt(0)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
const b64 = (v: Uint8Array) => btoa(String.fromCharCode(...v)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
export async function seal(s: Session) { const iv = crypto.getRandomValues(new Uint8Array(12)); const bytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), encoder.encode(JSON.stringify(s)))); const value = b64(iv) + '.' + b64(bytes); if (value.length > 3800)
    throw new Error('Deye returned a session too large for this browser.'); return value; }
export async function open(value: string, user: string): Promise<Session | null> { try {
    const [iv, data] = value.split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(), unb64(data));
    const s = JSON.parse(new TextDecoder().decode(plain)) as Session;
    return s.user === user && s.expires > Date.now() && hosts[s.region] ? s : null;
}
catch {
    return null;
} }
export function sessionCookie(value: string, maxAge: number, secure: boolean) { return `deye_session=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`; }
export function readCookie(r: Request) { return r.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('deye_session='))?.slice(13) ?? ''; }
async function call(region: string, path: string, body: unknown, token?: string): Promise<Record<string, any>> { const res = await fetch(hosts[region] + '/v1.0' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token.startsWith('Bearer ') ? token : 'Bearer ' + token } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(18000) }); if (res.status === 429)
    throw new Error('Deye’s request limit was reached. Please wait a few minutes.'); if (res.status === 401 || res.status === 403)
    throw new Error('Deye access expired or was denied. Please reconnect your account.'); if (!res.ok)
    throw new Error('Deye Cloud is temporarily unavailable. Please try again.'); const data = await res.json() as Record<string, any>; if (!data.success)
    throw new Error('Deye could not complete this request. Check your account, app credentials and data centre.'); return data; }
export async function connect(input: Record<string, unknown>, user: string): Promise<Session> { const { appId, appSecret, email, password, region } = input; if (typeof region !== 'string' || !hosts[region] || ![appId, appSecret, email, password].every(v => typeof v === 'string' && v.length > 0 && v.length < 512))
    throw new Error('Please fill in all the connection details.'); const digest = await crypto.subtle.digest('SHA-256', encoder.encode(password as string)); const hash = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join(''); const auth = await call(region, '/account/token?appId=' + encodeURIComponent(appId as string), { appSecret, email, password: hash }); if (typeof auth.accessToken !== 'string')
    throw new Error('Deye did not return an access token.'); const list = await call(region, '/station/list', { page: 1, size: 50 }, auth.accessToken); const stations = (list.stationList ?? []).map((s: any) => ({ id: Number(s.id), name: String(s.name ?? 'My home'), timezone: String(s.regionTimezone ?? 'Africa/Johannesburg') })).filter((s: any) => Number.isSafeInteger(s.id)); if (!stations.length)
    throw new Error('No plants were found. Check that this account can see your plant in Deye Cloud.'); if (stations.length > 10)
    throw new Error('This dashboard supports personal accounts with up to 10 plants.'); return { token: auth.accessToken, region, user, stations, expires: Date.now() + Math.min(Number(auth.expiresIn) || 3600, 2592000) * 1000 }; }
const devices = new Map<string, {
    sn: string;
    until: number;
}>();
async function deviceSnapshot(session: Session, stationId: number, cacheKey: string) {
    const unavailable = { gridUnavailable: null as boolean | null, lifetimeGeneration: null as number | null, acTemperature: null as number | null };
    try {
        let device = devices.get(cacheKey);
        if (!device || device.until < Date.now()) {
            const list = await call(session.region, '/station/device', { stationIds: [stationId], page: 1, size: 50 }, session.token);
            const inverters = (list.deviceListItems ?? []).filter((item: any) => item.deviceType === 'INVERTER');
            device = { sn: inverters.length === 1 ? String(inverters[0].deviceSn ?? '') : '', until: Date.now() + 3600000 };
            if (devices.size > 30)
                devices.clear();
            devices.set(cacheKey, device);
        }
        if (!device.sn)
            return unavailable;
        const result = await call(session.region, '/device/latest', { deviceList: [device.sn], deviceType: 'INVERTER' }, session.token);
        const latest = result.deviceDataList?.[0];
        const reportedAt = apiTimestamp(latest?.collectionTime);
        if (!reportedAt)
            return unavailable;
        const age = Date.now() - Date.parse(reportedAt);
        if (age > 600000 || age < -60000)
            return unavailable;
        const readings: any[] = latest.dataList ?? [];
        const value = (key: string) => numeric(readings.find(item => item.key === key)?.value);
        const relay = readings.find(item => item.key === 'GridRelayStatus')?.value;
        const voltage = value('GridVoltageL1L2');
        let gridUnavailable: boolean | null = null;
        if (relay === 'Pull-in')
            gridUnavailable = false;
        else if (voltage !== null)
            gridUnavailable = Math.abs(voltage) < 10;
        return { gridUnavailable, lifetimeGeneration: value('TotalActiveProduction'), acTemperature: value('AC Temperature') };
    }
    catch {
        return unavailable;
    }
}
type Cache = {
    expires: number;
    historyFetchedAt: number;
    data: EnergyData;
};
const cache = new Map<string, Cache>();
const pending = new Map<string, Promise<EnergyData>>();
export async function energy(s: Session, stationId: number): Promise<EnergyData> {
    const station = s.stations.find(v => v.id === stationId);
    if (!station)
        throw new Error('Select a plant linked to this account.');
    const cacheKey = s.user + ':' + s.token.slice(-24) + ':' + stationId;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now())
        return cached.data;
    if (pending.has(cacheKey))
        return pending.get(cacheKey)!;
    const task = (async () => {
        const [latest, outage] = await Promise.all([call(s.region, '/station/latest', { stationId }, s.token), deviceSnapshot(s, stationId, cacheKey)]);
        let timezone = station.timezone;
        try {
            new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
        }
        catch {
            timezone = 'Africa/Johannesburg';
        }
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format();
        const next = new Date(Date.parse(date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
        const old = cached?.data;
        let history = old?.date === date ? old.history : [];
        let totals = old?.date === date ? old.totals : {};
        let historyError = false, totalsError = false;
        let historyFetchedAt = cached?.historyFetchedAt ?? 0;
        if (!old || old.date !== date || Date.now() - historyFetchedAt > 600000) {
            const results = await Promise.allSettled([dailyPower(s, stationId, date, timezone), call(s.region, '/station/history', { stationId, granularity: 2, startAt: date, endAt: next }, s.token)]);
            if (results[0].status === 'fulfilled') {
                history = (results[0].value.stationDataItems ?? []).map((v: any) => ({ ...normalize(v), timeStamp: apiTimestamp(v.timeStamp) ?? apiTimestamp(v.dateTime) ?? apiTimestamp(v.collectionTime) })).filter((v: any) => typeof v.timeStamp === 'string').sort((a: any, b: any) => a.timeStamp.localeCompare(b.timeStamp));
            }
            else
                historyError = true;
            if (results[1].status === 'fulfilled') {
                const v = results[1].value.stationDataItems?.[0] ?? {};
                totals = Object.fromEntries(['generationValue', 'consumptionValue', 'purchaseValue', 'gridValue'].map(k => [k, numeric(v[k])]));
            }
            else
                totalsError = true;
            historyFetchedAt = Date.now();
        }
        else {
            historyError = old?.historyError ?? false;
            totalsError = old?.totalsError ?? false;
        }
        const reading = normalize(latest);
        if (!reading.lastUpdateTime) {
            try {
                const detail = await call(s.region, '/station/detail', { stationId }, s.token);
                reading.lastUpdateTime = apiTimestamp(detail.station?.lastUpdateTime);
            }
            catch { /* Keep the timestamp unknown if Deye cannot supply it. */ }
        }
        const data = { ...outage, stationName: station.name, timezone, date, reading, totals, history, historyError, totalsError, fetchedAt: Date.now() };
        if (cache.size > 30)
            cache.clear();
        cache.set(cacheKey, { data, historyFetchedAt, expires: Date.now() + 120000 });
        return data;
    })();
    pending.set(cacheKey, task);
    try {
        return await task;
    }
    finally {
        pending.delete(cacheKey);
    }
}
async function dailyPower(session: Session, stationId: number, date: string, timezone: string) {
    try {
        const frames = await call(session.region, '/station/history', { stationId, granularity: 1, startAt: date }, session.token);
        if (frames.stationDataItems?.length)
            return frames;
    }
    catch {
        // Some plants reject the frame query. Try the timestamp-based endpoint.
    }
    const midnight = Date.parse(date + 'T00:00:00Z');
    const zone = new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'longOffset' })
        .formatToParts(midnight).find(part => part.type === 'timeZoneName')?.value;
    const offset = zone?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
    const offsetMinutes = offset ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
    const startTimestamp = midnight / 1000 - offsetMinutes * 60;
    const endTimestamp = Math.floor(Date.now() / 1000);
    if (endTimestamp <= startTimestamp)
        return { stationDataItems: [] };
    return call(session.region, '/station/history/power', { stationId, startTimestamp, endTimestamp }, session.token);
}
export async function inverterDetails(session: Session, stationId: number) {
    if (!session.stations.some(station => station.id === stationId)) {
        throw new Error('Select a plant linked to this account.');
    }
    const inventory = await call(session.region, '/station/device', { stationIds: [stationId], page: 1, size: 50 }, session.token);
    const serials: string[] = [...new Set<string>((inventory.deviceListItems ?? inventory.deviceList ?? [])
            .filter((device: any) => device.deviceType === 'INVERTER' && device.deviceSn)
            .map((device: any) => String(device.deviceSn)))];
    const batches = [];
    for (let i = 0; i < serials.length; i += 10) {
        batches.push(call(session.region, '/device/latest', { deviceList: serials.slice(i, i + 10), deviceType: 'INVERTER' }, session.token));
    }
    const results = await Promise.all(batches);
    const devices = results.flatMap(result => result.deviceDataList ?? []);
    return serials.map((serial, index) => {
        const device = devices.find(device => String(device.deviceSn) === serial);
        return {
            name: serials.length === 1 ? 'Inverter' : 'Inverter ' + (index + 1),
            reportedAt: apiTimestamp(device?.collectionTime),
            readings: (device?.dataList ?? []).filter((reading: any) => typeof reading.key === 'string')
                .map((reading: any) => ({
                key: reading.key as string,
                value: typeof reading.value === 'string' || typeof reading.value === 'number' || typeof reading.value === 'boolean'
                    ? String(reading.value) : null,
                unit: typeof reading.unit === 'string' ? reading.unit : '',
            })),
        };
    });
}
