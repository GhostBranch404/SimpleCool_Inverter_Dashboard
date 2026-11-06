'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';

type Reading = {key: string; value: string | null; unit: string};
type Device = {name: string; reportedAt: string | null; readings: Reading[]};
type Details = {devices: Device[]; stations: {id: number; name: string}[]; station: number};

function category(key: string) {
  key = key.replaceAll('_', ' ');
  if (/battery|batt|\bsoc\b|bms|charg(?:e|ing)/i.test(key)) return 'Battery';
  if (/pv\d*\b|solar|mppt|dcinput|activeproduction/i.test(key)) return 'Solar';
  if (/grid|meter|externalct|purchase|export|import/i.test(key)) return 'Grid';
  if (/load|output|inverter|temperature|consumption|acvoltage|accurrent|frequency|powerfactor/i.test(key)) return 'Load & inverter';
  return 'Other';
}

export default function InverterDetails() {
  const [data, setData] = useState<Details | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [station, setStation] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const selected = station || new URLSearchParams(window.location.search).get('station');
        const response = await fetch('/api/inverter' + (selected ? '?station=' + encodeURIComponent(selected) : ''), {signal: controller.signal});
        const result = await response.json() as Details & {error?: string};
        if (!response.ok) throw new Error(result.error ?? 'Unable to fetch readings.');
        if (!controller.signal.aborted) setData(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to fetch readings.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [station, refresh]);

  const filter = query.trim().toLowerCase();
  return <main className="inverter-details">
    <header className="topbar">
      <a className="toolbar-link" href="/"><ArrowLeft size={16}/> Dashboard</a>
      <button className="refresh" disabled={loading} onClick={() => setRefresh(value => value + 1)}>
        <RefreshCw size={15}/> {loading ? 'Loading…' : 'Refresh'}
      </button>
    </header>
    <h1>Inverter details</h1>
    <p>Open a group or search across every reading reported by Deye Cloud.</p>
    {error && <div className="notice error" role="alert"><p>{error}</p></div>}
    {data && <div className="details-filters">
      {data.stations.length > 1 && <label>Plant
        <select value={station || String(data.station)} onChange={event => {setData(null);setStation(event.target.value);}}>
          {data.stations.map(plant => <option key={plant.id} value={plant.id}>{plant.name}</option>)}
        </select>
      </label>}
      <label><span><Search size={13}/> Search readings</span>
        <input type="search" placeholder="Voltage, current, temperature…" value={query} onChange={event => setQuery(event.target.value)}/>
      </label>
      <label>Group<select value={group} onChange={event => setGroup(event.target.value)}>
        {['All', 'Grid', 'Solar', 'Battery', 'Load & inverter', 'Other'].map(name => <option key={name}>{name}</option>)}
      </select></label>
    </div>}
    {loading && !data && <p role="status">Fetching inverter readings…</p>}
    {data && !data.devices.length && <p>No inverter was found for this plant.</p>}
    {data?.devices.map(device => {
      const visible = device.readings.filter(reading =>
        (group === 'All' || category(reading.key) === group) &&
        (reading.key + ' ' + reading.unit).toLowerCase().includes(filter));
      return <section className="section" key={device.name}>
        <div className="section-heading">
          <div><h2>{device.name}</h2><p>{visible.length} of {device.readings.length} readings</p></div>
          <span className="date">{device.reportedAt ? 'Reported ' + new Date(device.reportedAt).toLocaleString() : 'Report time unavailable'}</span>
        </div>
        {visible.length ? <div className="reading-groups">
          {['Grid', 'Solar', 'Battery', 'Load & inverter', 'Other'].map(name => {
            const readings = visible.filter(reading => category(reading.key) === name);
            if (!readings.length) return null;
            return <details className="reading-group" key={name + ':' + group + ':' + filter}
              open={Boolean(filter || group !== 'All')}>
              <summary>
                <span>{name}</span>
                <span className="reading-count">{readings.length}</span>
              </summary>
              <dl className="reading-list">
                {readings.map((reading, index) => <div key={reading.key + index}>
                  <dt>{reading.key}</dt>
                  <dd>{reading.value ?? '—'}{reading.value !== null && reading.unit && <small> {reading.unit}</small>}</dd>
                </div>)}
              </dl>
            </details>;
          })}
        </div> : <p>{device.readings.length ? 'No matching readings.' : 'Deye hasn’t returned measurements for this inverter.'}</p>}
      </section>;
    })}
  </main>;
}



