export type Reading = {
    batterySOC: number | null;
    generationPower: number | null;
    consumptionPower: number | null;
    chargePower: number | null;
    dischargePower: number | null;
    purchasePower: number | null;
    gridPower: number | null;
    lastUpdateTime: string | null;
};
export type EnergyData = {
    gridUnavailable?: boolean | null;
    lifetimeGeneration?: number | null;
    acTemperature?: number | null;
    stationName: string;
    timezone: string;
    date: string;
    reading: Reading;
    totals: Record<string, number | null>;
    history: Array<Reading & {
        timeStamp: string;
    }>;
    historyError?: boolean;
    totalsError?: boolean;
    fetchedAt: number;
};
export function numeric(v: unknown): number | null { return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null; }
export function apiTimestamp(value: unknown): string | null {
    if (typeof value !== 'number' && typeof value !== 'string')
        return null;
    if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
        const date = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T');
        return Number.isFinite(Date.parse(date)) ? date : null;
    }
    const epoch = Number(value);
    if (epoch < 1e9 || epoch >= 1e14)
        return null;
    return new Date(epoch < 1e12 ? epoch * 1000 : epoch).toISOString();
}
export function normalize(v: Record<string, unknown>): Reading {
    const battery = numeric(v.batteryPower);
    const wire = numeric(v.wirePower);
    const charge = numeric(v.chargePower);
    const discharge = numeric(v.dischargePower);
    return { batterySOC: numeric(v.batterySOC), generationPower: numeric(v.generationPower), consumptionPower: numeric(v.consumptionPower), chargePower: charge === null ? (battery === null ? null : Math.max(0, -battery)) : Math.abs(charge), dischargePower: discharge === null ? (battery === null ? null : Math.max(0, battery)) : Math.abs(discharge), purchasePower: numeric(v.purchasePower) ?? (wire === null ? null : Math.max(0, wire)), gridPower: numeric(v.gridPower) ?? (wire === null ? null : Math.max(0, -wire)), lastUpdateTime: apiTimestamp(v.lastUpdateTime) ?? apiTimestamp(v.collectionTime) };
}
export const colours = { battery: '#b8ed91', load: '#ff808e', grid: '#70b7ee', pv: '#f0c86c' };
export function demoData(): EnergyData { const now = Date.now(); const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); const start = Date.parse(date + 'T00:00:00+02:00'); const history = Array.from({ length: 97 }, (_, i) => { const sun = Math.max(0, Math.sin((i / 4 - 6) * Math.PI / 12)); return { ...normalize({ batterySOC: 45 + sun * 45, generationPower: Math.round(sun * 5900), consumptionPower: Math.round(900 + Math.sin(i * 1.7) * 200 + (i > 69 && i < 80 ? 1800 : 0)), chargePower: sun * 1200, dischargePower: sun ? 0 : 600, purchasePower: 0, gridPower: 0 }), timeStamp: new Date(start + i * 900000).toISOString() }; }).filter(p => Date.parse(p.timeStamp) <= now); return { stationName: 'My home', timezone: 'Africa/Johannesburg', date, reading: { batterySOC: 78, generationPower: 4620, consumptionPower: 1840, chargePower: 2780, dischargePower: 0, purchasePower: 0, gridPower: 0, lastUpdateTime: new Date(now - 45000).toISOString() }, totals: { generationValue: 24.8, consumptionValue: 16.4, purchaseValue: 2.1, gridValue: 0.4 }, history, fetchedAt: now }; }
