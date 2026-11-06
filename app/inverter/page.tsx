import { requireChatGPTUser } from '../chatgpt-auth';
import InverterDetails from './details';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireChatGPTUser('/inverter');
  return <InverterDetails/>;
}
