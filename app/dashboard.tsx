'use client';
import { useEffect, useRef, useState, type FormEvent, type CSSProperties } from 'react';
import { BatteryCharging, House, PlugZap, Sun, Zap, LockKeyhole, RefreshCw, X, ArrowDownLeft, ArrowUpRight, Settings2, Maximize, Minimize } from 'lucide-react';
import { colours, demoData, type EnergyData, type Reading } from '../lib/energy';
type Station = {
    id: number;
    name: string;
    timezone: string;
};
const kw = (v: number | null | undefined) => v == null ? '—' : (Math.abs(v) / 1000).toFixed(2);
const kwh = (v: number | null | undefined) => v == null ? '—' : v.toFixed(1);
function timestamp(value: string | null | undefined, timezone: string): number | null { if (!value)
    return null; if (/[zZ]$|[+-]\d\d:\d\d$/.test(value)) {
    const v = Date.parse(value);
    return Number.isFinite(v) ? v : null;
} const base = Date.parse(value + 'Z'); if (!Number.isFinite(base))
    return null; const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(base); const offset = parts.find(p => p.type === 'timeZoneName')?.value.match(/GMT([+-])(\d\d):(\d\d)/); return offset ? base - (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) * 60000 : base; }
export default function Dashboard() {
    const [data, setData] = useState<EnergyData | null>(null), [connected, setConnected] = useState(false), [demo, setDemo] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [modal, setModal] = useState(false), [stations, setStations] = useState<Station[]>([]), [station, setStation] = useState(''), [clock, setClock] = useState(Date.now());
    const requestId = useRef(0);
    const [wallboard, setWallboard] = useState(false);
    const [showExcess, setShowExcess] = useState(true);
    const [capacity, setCapacity] = useState('');
    const [reserve, setReserve] = useState('');
    useEffect(() => {
        setWallboard(localStorage.getItem('wallboard') === 'true');
        setShowExcess(localStorage.getItem('show-excess') !== 'false');
        setCapacity(localStorage.getItem('battery-kwh') ?? '');
        setReserve(localStorage.getItem('battery-reserve') ?? '');
    }, []);
    const [showExport, setShowExport] = useState(false);
    useEffect(() => { setShowExport(localStorage.getItem('show-grid-export') === 'true'); }, []);
    async function refresh(id = station) { const version = ++requestId.current; setLoading(true); try {
        const response = await fetch('/api/energy' + (id ? '?station=' + encodeURIComponent(id) : ''), { cache: 'no-store' });
        const result = await response.json() as EnergyData & {
            error?: string;
            stations: Station[];
        };
        if (version !== requestId.current)
            return;
        if (!response.ok)
            throw new Error(result.error ?? 'Unable to fetch readings.');
        setData(result);
        setError('');
    }
    catch (e) {
        if (version === requestId.current)
            setError(e instanceof Error ? e.message : 'Connection unavailable.');
    }
    finally {
        if (version === requestId.current)
            setLoading(false);
    } }
    useEffect(() => { let alive = true; fetch('/api/connection', { cache: 'no-store' }).then(async (r) => { if (!r.ok)
        throw new Error('Please reload and sign in to your dashboard.'); return r.json() as Promise<{
        connected: boolean;
        stations: Station[];
    }>; }).then(s => { if (!alive)
        return; setConnected(s.connected); setStations(s.stations); setStation(String(s.stations[0]?.id ?? '')); if (s.connected)
        void refresh(String(s.stations[0].id));
    else
        setLoading(false); }).catch(e => { if (alive) {
        setError(e.message);
        setLoading(false);
    } }); return () => { alive = false; requestId.current++; }; }, []);
    useEffect(() => { const t = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(t); }, []);
    useEffect(() => { if (!connected || demo)
        return; const tick = () => { if (document.visibilityState === 'visible')
        void refresh(station); }; const t = setInterval(tick, 120000); return () => clearInterval(t); }, [connected, demo, station]);
    async function disconnect() { setLoading(true); try {
        const r = await fetch('/api/connection', { method: 'DELETE' });
        if (!r.ok)
            throw new Error('Could not disconnect. Please try again.');
        requestId.current++;
        setConnected(false);
        setDemo(false);
        setData(null);
        setStations([]);
        setError('');
        setModal(false);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setLoading(false);
    } }
    const r = data?.reading;
    const age = data ? timestamp(r?.lastUpdateTime, data.timezone) : null;
    const stale = !!data && (age === null || clock - age > 600000 || !!error);
    const ageText = age === null ? 'Update time unavailable' : `Updated ${Math.max(0, Math.floor((clock - age) / 60000)) < 1 ? 'less than a minute' : Math.max(0, Math.floor((clock - age) / 60000)) + ' min'} ago`;
    const icons = [BatteryCharging, House, PlugZap, Sun];
    const labels = ['Battery', 'Home load', 'Grid', 'Solar PV'];
    const accent = [colours.battery, colours.load, colours.grid, colours.pv];
    const gridImport = r?.purchasePower, gridExport = r?.gridPower;
    const grid = showExport && gridExport != null ? Math.max(gridImport ?? 0, gridExport) : gridImport ?? null;
    const gridKnown = grid !== null;
    const exporting = showExport && (gridExport ?? 0) > (gridImport ?? 0);
    const outage = !demo && data?.gridUnavailable === true && !stale;
    const excess = showExcess && (r?.batterySOC ?? 0) > 98;
    const outageRecord = useOutage(data, demo || stale || !connected, station);
    const restored = outageRecord?.end != null && clock - outageRecord.end < 86400000 && !demo && connected;
    const runtime = outage && r ? estimateRuntime(r, Number(capacity)) : null;
    const notes = [!r ? 'Battery state of charge' : r.chargePower != null && r.chargePower > 20 ? `Charging · ${kw(r.chargePower)} kW` : r.dischargePower != null && r.dischargePower > 20 ? `Discharging · ${kw(r.dischargePower)} kW` : r.chargePower != null && r.dischargePower != null ? 'Battery idle' : 'Battery flow unavailable', r ? 'Current consumption' : 'Your home’s consumption', !gridKnown ? 'Grid flow unavailable' : grid! < 20 ? 'No grid flow' : !exporting ? 'Importing from grid' : 'Exporting to grid', r?.generationPower == null ? 'Power from your panels' : r.generationPower < 20 ? 'No solar production' : 'Generating from sunlight'];
    const totals = [['Solar generated', 'generationValue'], ['Home consumed', 'consumptionValue'], ['Grid imported', 'purchaseValue'], ['Grid exported', 'gridValue']];
    return <main className={[outage ? 'outage' : '', wallboard ? 'wallboard' : ''].join(' ')}>
    <header className="topbar"><div className="brand"><span className="brand-icon"><Zap size={22}/></span>home energy<span style={{ color: '#698474', fontSize: 12, fontWeight: 400 }}> / Deye</span></div><div className="heading"><div><h1>{data?.stationName ?? 'Overview'}</h1></div><div className="status" aria-live="polite">{demo ? <span className="demo-pill">Demo · sample readings</span> : <><span className={'dot ' + (!connected || stale ? 'off' : '')}/>{loading ? 'Checking connection…' : connected ? (data ? ageText : 'Waiting for readings') : 'Not connected'}</>}</div></div><div className="top-right"><time className="header-clock" suppressHydrationWarning>{new Date(clock).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: data?.timezone ?? 'Africa/Johannesburg' })}</time><FullscreenButton />{connected && <a className="toolbar-link" href={station ? "/inverter?station=" + encodeURIComponent(station) : "/inverter"}>Details</a>}<span className="private"><LockKeyhole size={12}/>Private dashboard</span><button onClick={() => setModal(true)}><Settings2 size={14} style={{ verticalAlign: 'middle', marginRight: 6 }}/>{connected ? 'Settings' : 'Connect Deye'}</button></div></header>
    {!connected && !demo && !loading && <div className="notice"><p>Connect your Deye Cloud account to see your home’s energy.</p><div className="empty-actions"><button className="primary" onClick={() => setModal(true)}>Connect account</button><button onClick={() => { requestId.current++; setDemo(true); setData(demoData()); setError(''); }}>Try a demo</button></div></div>}
    {demo && <div className="notice"><p>You’re viewing sample data. These are not your inverter’s readings.</p><button onClick={() => { setDemo(false); setData(null); if (connected)
        void refresh(); }}>Exit demo</button></div>}
    {error && <div className="notice error" role="alert"><p>{error}{data && !demo ? ' Showing the last readings received.' : ''}</p><button onClick={() => connected ? void refresh() : setModal(true)}>{connected ? 'Try again' : 'Connect'}</button></div>}
    {stale && !error && !demo && <div className="notice error"><p>{age === null ? 'The reading’s update time could not be verified.' : 'These readings are over 10 minutes old. Your inverter or internet connection may be offline.'}</p></div>}
    {stations.length > 1 && connected && !demo && <label style={{ maxWidth: 300, marginBottom: 20 }}>Plant<select value={station} onChange={e => { setStation(e.target.value); setData(null); void refresh(e.target.value); }}>{stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    {outage && <div className="outage-banner" role="alert">Grid unavailable<p>{runtime ?? (Number(capacity) > 0 ? 'Waiting for battery and power readings.' : 'Set battery capacity in Settings for an estimate.')}</p></div>}
    {!outage && restored && outageRecord && <div className="notice restored" role="status"><div><strong>Grid restored</strong><p>{formatDuration(outageRecord.end! - outageRecord.start)} outage · Restored {new Date(outageRecord.end!).toLocaleString('en-ZA', { timeZone: data?.timezone, hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}{outageRecord.startSoc != null && outageRecord.endSoc != null ? ` · Battery ${Math.round(outageRecord.startSoc)}% → ${Math.round(outageRecord.endSoc)}%` : ''}</p></div></div>}<div className="cards">{[0, 3, 1, 2].map(i => { const label = labels[i]; const Icon = icons[i]; return <section className={i === 0 ? "card battery-card" + (r?.batterySOC != null && r.batterySOC < 25 ? " battery-low" : "") : "card"} key={label} style={{ '--accent': accent[i] } as CSSProperties}><div className="card-head"><span>{label}</span><span className={"icon" + (i === 0 && !stale && (r?.chargePower ?? 0) > 20 ? " charging-icon" : "")}><Icon size={27}/></span></div><div className="reading" style={{ color: i === 0 ? 'var(--battery-reading, var(--accent))' : undefined }}>{i === 0 ? (r?.batterySOC == null ? '—' : Math.round(r.batterySOC)) : i === 3 && excess ? 'Excess' : kw(i === 1 ? r?.consumptionPower : i === 2 ? grid : r?.generationPower)}{!(i === 3 && excess) && <span>{i === 0 ? '%' : 'kW'}</span>}</div>{i === 0 && <BatteryDirection data={data} stale={stale}/>}<div className="card-note">{i === 2 && gridKnown && grid! > 20 ? (!exporting ? <ArrowDownLeft size={13}/> : <ArrowUpRight size={13}/>) : null}{i === 2 && outage ? 'Grid unavailable' : i === 3 && excess ? 'Battery above 98%' : notes[i]}</div></section>; })}</div>
    <section className="section energy-totals"><div className="section-heading"><div><h2>Today’s energy</h2></div><span className="date">{data ? new Date(data.date + 'T12:00:00Z').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Today'}</span></div><div className="totals">{totals.filter(([, key]) => showExport || key !== 'gridValue').map(([label, key], i) => <div className="total" key={key}><span className="total-label"><span className="dot" style={{ background: [colours.pv, colours.load, colours.grid, colours.grid][i] }}/>{label}</span><strong>{kwh(data?.totals[key])} <small>kWh</small></strong></div>)}</div><div className="lifetime-strip"><span>Lifetime generation <strong>{kwh(data?.lifetimeGeneration)} <small>kWh</small></strong></span><span>Inverter AC temp <strong>{data?.acTemperature == null ? '—' : data.acTemperature.toFixed(1)} <small>°C</small></strong></span></div>{data?.totalsError && <p role="status">Today’s totals could not be updated.</p>}</section>
    <div className="dashboard-charts"><section className="section power-history"><div className="section-heading"><div><h2>Daily graph</h2><p>Power throughout the day · kW</p></div><button className="refresh" disabled={loading || !connected || demo} onClick={() => void refresh()}><RefreshCw size={13}/>{loading ? 'Updating' : 'Refresh'}</button></div><DailyChart data={data} showExport={showExport}/>{data?.historyError && <p role="status">The daily graph could not be updated.</p>}</section>
    <BatteryTrend data={data} reserve={reserve.trim() !== '' && Number(reserve) >= 0 && Number(reserve) <= 100 ? Number(reserve) : null}/>
    </div>
    <footer className="footer"><span>Deye Cloud · {demo ? 'Sample data' : connected ? 'Refreshes every 2 minutes while open' : 'Awaiting connection'}</span><span>{data?.timezone ?? 'Your plant’s local time'} · Monitoring only</span></footer>
    {modal && <ConnectionModal preferences={<><label className="toggle"><input type="checkbox" checked={wallboard} onChange={e => { setWallboard(e.target.checked); localStorage.setItem('wallboard', String(e.target.checked)); }}/> Wallboard mode</label><label className="toggle"><input type="checkbox" checked={showExcess} onChange={e => { setShowExcess(e.target.checked); localStorage.setItem('show-excess', String(e.target.checked)); }}/> Show Excess above 98%</label><label className="capacity-setting">Total battery capacity (kWh)<input type="number" min="0" step="any" inputMode="decimal" value={capacity} onChange={e => { setCapacity(e.target.value); localStorage.setItem('battery-kwh', e.target.value); }}/><span className="form-help">Used to estimate runtime down to 10% during an outage.</span></label><label className="capacity-setting">Battery reserve (%)<input type="number" min="0" max="100" step="1" value={reserve} onChange={e => { const value = e.target.value; if (value !== '' && (Number(value) < 0 || Number(value) > 100))
        return; setReserve(value); localStorage.setItem('battery-reserve', value); }}/><span className="form-help">Reference line on the battery chart. Set the actual reserve on your inverter.</span></label></>} showExport={showExport} onExport={v => { setShowExport(v); localStorage.setItem('show-grid-export', String(v)); }} connected={connected} onClose={() => setModal(false)} onDisconnect={disconnect} onConnect={s => { requestId.current++; setDemo(false); setData(null); setError(''); setConnected(true); setStations(s); setStation(String(s[0].id)); setModal(false); void refresh(String(s[0].id)); }}/>}
    </main>;
}
function ConnectionModal({ connected, onClose, onConnect, onDisconnect, showExport, onExport, preferences }: {
    preferences: React.ReactNode;
    showExport: boolean;
    onExport: (v: boolean) => void;
    connected: boolean;
    onClose: () => void;
    onConnect: (stations: Station[]) => void;
    onDisconnect: () => void;
}) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const dialog = useRef<HTMLDivElement>(null);
    useEffect(() => { const previous = document.activeElement as HTMLElement; const first = dialog.current?.querySelector<HTMLElement>('button'); first?.focus(); const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy)
        onClose(); if (e.key === 'Tab') {
        const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href]') ?? []);
        if (e.shiftKey && document.activeElement === items[0]) {
            e.preventDefault();
            items.at(-1)?.focus();
        }
        else if (!e.shiftKey && document.activeElement === items.at(-1)) {
            e.preventDefault();
            items[0]?.focus();
        }
    } }; document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); previous?.focus(); }; }, [busy]);
    async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(''); const form = e.currentTarget; try {
        const input = Object.fromEntries(new FormData(form));
        const response = await fetch('/api/connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        const result = await response.json() as EnergyData & {
            error?: string;
            stations: Station[];
        };
        if (!response.ok)
            throw new Error(result.error ?? 'Connection failed.');
        form.reset();
        onConnect(result.stations);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to connect.');
    }
    finally {
        setBusy(false);
    } }
    return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="connect-title" ref={dialog}><div className="modal-top"><h2 id="connect-title">Settings</h2><button className="close" aria-label="Close connection settings" disabled={busy} onClick={onClose}><X size={21}/></button></div><label className="toggle"><input type="checkbox" checked={showExport} onChange={e => onExport(e.target.checked)}/> Show grid export</label>{preferences}<p>Use the application details from your <a href="https://developer.deyecloud.com/app" target="_blank" rel="noreferrer">Deye developer portal</a> and your regular Deye Cloud login.</p><form onSubmit={submit}><label>Data centre<select name="region" defaultValue="eu"><option value="eu">Europe / AMEA</option><option value="am">Americas</option></select></label><span className="form-help">Choose the same data centre as your Deye account and developer application.</span><label>App ID<input name="appId" required maxLength={500} autoComplete="off" spellCheck={false}/></label><label>App Secret<input name="appSecret" type="password" required maxLength={500} autoComplete="off"/></label><label>Deye Cloud email<input name="email" type="email" required maxLength={500} autoComplete="username"/></label><label>Deye Cloud password<input name="password" type="password" required maxLength={500} autoComplete="current-password"/></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary" disabled={busy} type="submit">{busy ? 'Connecting securely…' : connected ? 'Reconnect account' : 'Connect my inverter'}</button><div className="form-help"><LockKeyhole size={11}/> Your password is used only to sign in and is not saved. Your Deye access token is held in an encrypted, HttpOnly session cookie on this device, for up to 30 days. Connect separately on each device.</div>{connected && <button type="button" disabled={busy} onClick={onDisconnect}>Disconnect this device</button>}</form></div></div>;
}
function DailyChart({ data, showExport }: {
    data: EnergyData | null;
    showExport: boolean;
}) {
    const keys = ['generationPower', 'consumptionPower', 'purchasePower', 'gridPower'] as const;
    const names = ['Solar PV', 'Home load', 'Grid import', 'Grid export'];
    const colors = [colours.pv, colours.load, colours.grid, '#81cdb0'];
    const [toggled, setHidden] = useState<string[]>([]);
    const hidden = showExport ? toggled : [...toggled, 'gridPower'];
    const [hover, setHover] = useState<number | null>(null);
    const points = (data?.history ?? []).map(p => { const time = timestamp(p.timeStamp, data!.timezone); if (time === null)
        return null; const parts = new Intl.DateTimeFormat('en-GB', { timeZone: data!.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(time); const h = Number(parts.find(p => p.type === 'hour')?.value), m = Number(parts.find(p => p.type === 'minute')?.value); return { ...p, hour: h + m / 60, time }; }).filter(p => p !== null);
    const max = Math.max(1, ...points.flatMap(p => keys.filter(k => !hidden.includes(k)).map(k => (p[k] ?? 0) / 1000)));
    const ymax = Math.ceil(max);
    const [chartWidth, setChartWidth] = useState(1080);
    const chartRef = useRef<SVGSVGElement>(null);
    useEffect(() => { const svg = chartRef.current; if (!svg)
        return; const observer = new ResizeObserver(([entry]) => setChartWidth(window.matchMedia('(max-width: 560px)').matches ? Math.max(260, Math.round(entry.contentRect.width)) : 1080)); observer.observe(svg); return () => observer.disconnect(); }, [points.length > 0]);
    const x = (h: number) => 37 + h / 24 * (chartWidth - 58), y = (w: number) => 230 - w / 1000 / ymax * 205;
    const selected = hover === null ? null : points[hover];
    return <><div className="legend">{names.map((name, i) => !showExport && i === 3 ? null : <button key={name} aria-pressed={!hidden.includes(keys[i])} onClick={() => setHidden(v => v.includes(keys[i]) ? v.filter(k => k !== keys[i]) : [...v, keys[i]])} style={{ opacity: hidden.includes(keys[i]) ? .4 : 1 }}><i style={{ background: colors[i] }}/>{name}</button>)}</div>{!points.length ? <div className="empty-chart"><p>{data ? 'No readings have been returned for today’s graph yet.' : 'Your daily graph will appear here once Deye is connected.'}</p></div> : <><svg ref={chartRef} className="chart" viewBox={`0 0 ${chartWidth} 270`} role="img" aria-label="Daily power graph. Solar PV, home load, grid import and grid export, in kilowatts. Toggle series using the buttons above." onPointerMove={e => { const bounds = e.currentTarget.getBoundingClientRect(); const hour = ((e.clientX - bounds.left) / bounds.width * chartWidth - 37) / (chartWidth - 58) * 24; let best = 0; points.forEach((p, i) => { if (Math.abs(p.hour - hour) < Math.abs(points[best].hour - hour))
        best = i; }); setHover(best); }} onPointerLeave={() => setHover(null)}>{[0, 1, 2, 3, 4].map(i => <g key={i}><line x1={37} x2={chartWidth - 21} y1={230 - i * 205 / 4} y2={230 - i * 205 / 4} stroke="#29382e" strokeDasharray="3 5"/><text x={29} y={234 - i * 205 / 4} textAnchor="end">{(ymax * i / 4).toFixed(1)}</text></g>)}{(chartWidth < 420 ? [0, 6, 12, 18, 24] : [0, 4, 8, 12, 16, 20, 24]).map(h => <text key={h} x={x(h)} y={258} textAnchor="middle">{String(h).padStart(2, '0')}:00</text>)}{keys.map((key, i) => hidden.includes(key) ? null : <path key={key} d={points.map((p, j) => p[key] == null ? '' : `${j === 0 || points[j - 1][key] == null || p.time - points[j - 1].time > 1200000 ? 'M' : 'L'}${x(p.hour).toFixed(1)},${y(p[key]!).toFixed(1)}`).join(' ')} fill="none" stroke={colors[i]} strokeWidth={2.6} strokeLinejoin="round"/>)}{selected && <line x1={x(selected.hour)} x2={x(selected.hour)} y1={20} y2={230} stroke="#c8d5cb" strokeDasharray="4 4"/>}</svg><div className="form-help" style={{ minHeight: 22 }} aria-live="polite">{selected ? `${new Date(selected.time).toLocaleTimeString('en-ZA', { timeZone: data!.timezone, hour: '2-digit', minute: '2-digit' })} · ${keys.filter(k => !hidden.includes(k)).map(k => names[keys.indexOf(k)] + ': ' + kw(selected[k]) + ' kW').join(' · ')}` : 'Touch or move across the graph to inspect a reading.'}</div></>}</>;
}
function BatteryTrend({ data, reserve }: {
    data: EnergyData | null;
    reserve: number | null;
}) {
    const [cursor, setCursor] = useState<number | null>(null);
    const samples = (data?.history ?? []).flatMap(point => {
        const time = timestamp(point.timeStamp, data!.timezone);
        return time !== null && point.batterySOC !== null && point.batterySOC >= 0 && point.batterySOC <= 100
            ? [{ time, soc: point.batterySOC }]
            : [];
    }).sort((a, b) => a.time - b.time);
    if (samples.length < 2)
        return <section className="section"><h2>Battery charge today</h2><p>Battery history unavailable</p></section>;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const span = last.time - first.time;
    if (span <= 0)
        return <section className="section"><h2>Battery charge today</h2><p>Battery history unavailable</p></section>;
    const path = samples.map((point, index) => {
        const move = index === 0 || point.time - samples[index - 1].time > 20 * 60000;
        return (move ? 'M' : 'L') + (2 + (point.time - first.time) / span * 196).toFixed(1)
            + ' ' + (34 - point.soc / 100 * 32).toFixed(1);
    }).join(' ');
    const low = Math.min(...samples.map(point => point.soc));
    const high = Math.max(...samples.map(point => point.soc));
    const selectedIndex = Math.min(cursor ?? samples.length - 1, samples.length - 1);
    const selected = samples[selectedIndex];
    const formatTime = (time: number) => new Intl.DateTimeFormat('en-GB', {
        timeZone: data!.timezone, hour: '2-digit', minute: '2-digit',
    }).format(time);
    const selectedX = 2 + (selected.time - first.time) / span * 196;
    const selectedY = 34 - selected.soc / 100 * 32;
    return <section className="section battery-detail">
    <div className="section-heading">
      <div><h2>Battery charge today</h2><p>State of charge over time</p></div>
      <span className="date battery-range"><span>Low <strong>{Math.round(low)}%</strong></span><span>High <strong>{Math.round(high)}%</strong></span></span>
    </div>
    <div className="soc-plot">
      <div className="soc-axis" aria-hidden="true"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
      <svg viewBox="0 0 200 36" preserveAspectRatio="none" role="img" aria-label="Battery charge history on a 0 to 100 percent scale">
        <path d="M2 2H198 M2 10H198 M2 18H198 M2 26H198 M2 34H198" stroke="#485365" strokeDasharray="3 4" fill="none"/>
        {reserve !== null && <line x1={2} x2={198} y1={34 - reserve / 100 * 32} y2={34 - reserve / 100 * 32} stroke="#ffb870" strokeWidth="2" vectorEffect="non-scaling-stroke"/>}
        <path d={path} stroke={colours.battery} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d={`M${selectedX} 2V34 M${selectedX - 1} ${selectedY}h2`} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
      </svg>
    </div>
    {reserve !== null && <p className="reserve-label">Reserve · {reserve}%</p>}
    <div className="soc-times">{Array.from({ length: 5 }, (_, i) => <span key={i}>{formatTime(first.time + span * i / 4)}</span>)}</div>
    <label className="soc-inspect">
      <span>Inspect a reading <strong>{formatTime(selected.time)} · {Math.round(selected.soc)}%</strong></span>
      <input type="range" min={0} max={samples.length - 1} value={selectedIndex} aria-valuetext={formatTime(selected.time) + ', ' + Math.round(selected.soc) + ' percent'} onChange={event => setCursor(Number(event.target.value))}/>
    </label>
  </section>;
}
type OutageRecord = {
    start: number;
    end?: number;
    startSoc: number | null;
    endSoc?: number | null;
};
function useOutage(data: EnergyData | null, ignore: boolean, station: string) {
    const key = 'grid-outage:' + station;
    const [saved, setSaved] = useState<{
        key: string;
        record: OutageRecord | null;
    } | null>(null);
    useEffect(() => {
        let record: OutageRecord | null = null;
        try {
            const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
            if (stored && Number.isFinite(stored.start))
                record = stored;
        }
        catch { /* A missing or invalid record starts a new observation. */ }
        if (!ignore && data && station) {
            if (data.gridUnavailable === true && (!record || record.end != null)) {
                record = { start: data.fetchedAt, startSoc: data.reading.batterySOC };
            }
            else if (data.gridUnavailable === false && record && record.end == null && data.fetchedAt >= record.start) {
                record = { ...record, end: data.fetchedAt, endSoc: data.reading.batterySOC };
            }
            if (record)
                localStorage.setItem(key, JSON.stringify(record));
        }
        setSaved({ key, record });
    }, [key, station, data, ignore]);
    return saved?.key === key ? saved.record : null;
}
function formatDuration(ms: number) {
    const minutes = Math.floor(Math.max(0, ms) / 60000);
    if (!minutes)
        return 'Under 1 min';
    return minutes >= 60 ? Math.floor(minutes / 60) + ' h ' + minutes % 60 + ' min' : minutes + ' min';
}
function estimateRuntime(reading: Reading, capacity: number) {
    if (!Number.isFinite(capacity) || capacity <= 0 || reading.batterySOC == null)
        return null;
    if (reading.batterySOC <= 10)
        return 'Battery is at the 10% shutdown level.';
    if (reading.consumptionPower == null || reading.generationPower == null)
        return null;
    const draw = reading.consumptionPower + 120 - reading.generationPower;
    if (draw <= 0)
        return 'Solar covers the current load and inverter draw.';
    const hours = capacity * (Math.min(reading.batterySOC, 100) - 10) / 100 / (draw / 1000);
    return 'About ' + formatDuration(hours * 3600000) + ' to 10% at the current net load.';
}
function FullscreenButton() {
    const [supported, setSupported] = useState(false);
    const [active, setActive] = useState(false);
    const [failure, setFailure] = useState(false);
    useEffect(() => {
        setSupported(Boolean(document.fullscreenEnabled));
        const changed = () => setActive(Boolean(document.fullscreenElement));
        changed();
        document.addEventListener('fullscreenchange', changed);
        return () => document.removeEventListener('fullscreenchange', changed);
    }, []);
    if (!supported)
        return null;
    async function toggle() {
        try {
            if (document.fullscreenElement)
                await document.exitFullscreen();
            else
                await document.documentElement.requestFullscreen();
            setFailure(false);
        }
        catch {
            setFailure(true);
        }
    }
    return <span className="fullscreen-control">
    <button className="fullscreen-button" onClick={toggle} aria-label={active ? 'Exit full screen' : 'Enter full screen'} title={active ? 'Exit full screen' : 'Full screen'}>
      {active ? <Minimize size={18}/> : <Maximize size={18}/>}
    </button>
    {failure && <span role="status" className="form-help">Full screen unavailable</span>}
  </span>;
}
function BatteryDirection({ data, stale }: {
    data: EnergyData | null;
    stale: boolean;
}) {
    if (!data || stale)
        return null;
    const samples = data.history.flatMap(point => {
        const time = timestamp(point.timeStamp, data.timezone);
        return time !== null && point.batterySOC !== null ? [{ time, soc: point.batterySOC }] : [];
    }).sort((a, b) => a.time - b.time);
    const last = samples.at(-1);
    if (!last || Date.now() - last.time > 30 * 60000)
        return null;
    const earlier = samples.find(point => last.time - point.time <= 30 * 60000 && last.time - point.time >= 5 * 60000);
    if (!earlier)
        return null;
    const change = last.soc - earlier.soc;
    const label = Math.abs(change) < 0.5 ? 'Steady' : change > 0 ? 'Rising' : 'Falling';
    return <span className="battery-direction" title="Charge trend over the last 30 minutes">
    <span aria-hidden="true">{label === 'Steady' ? '→' : label === 'Rising' ? '↑' : '↓'}</span> {label}
  </span>;
}
