import { getChatGPTUser } from '../../chatgpt-auth';
import { inverterDetails, open, readCookie } from '../../../lib/deye';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = {'Cache-Control': 'no-store'};
  const user = await getChatGPTUser();
  if (!user) return Response.json({error: 'Please sign in.'}, {status: 401, headers});
  const session = await open(readCookie(request), user.userId);
  if (!session) return Response.json({error: 'Connect Deye from the dashboard to see your inverter details.'}, {status: 401, headers});

  const station = Number(new URL(request.url).searchParams.get('station') ?? session.stations[0].id);
  try {
    const devices = await inverterDetails(session, station);
    return Response.json({devices, stations: session.stations.map(({id, name}) => ({id, name})), station}, {headers});
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : 'Unable to fetch inverter readings.'}, {status: 502, headers});
  }
}
