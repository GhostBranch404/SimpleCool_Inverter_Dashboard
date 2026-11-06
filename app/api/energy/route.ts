import { getChatGPTUser } from '../../chatgpt-auth';
import { energy, open, readCookie } from '../../../lib/deye';
export const dynamic='force-dynamic';
export async function GET(request:Request){const headers={'Cache-Control':'no-store'};const user=await getChatGPTUser();if(!user)return Response.json({error:'Please sign in.'},{status:401,headers});const s=await open(readCookie(request),user.userId);if(!s)return Response.json({error:'Please reconnect your Deye account.'},{status:401,headers});try{const id=Number(new URL(request.url).searchParams.get('station')??s.stations[0].id);return Response.json(await energy(s,id),{headers});}catch(e){return Response.json({error:e instanceof Error?e.message:'Unable to fetch readings.'},{status:502,headers});}}
