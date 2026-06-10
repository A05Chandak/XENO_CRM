import { api } from "../../lib/api";
import { CampaignWizard } from "../../components/campaign-wizard";

export default async function CampaignsPage() {
  const [segments, campaigns] = await Promise.all([api.segments(), api.campaigns()]);
  return <CampaignWizard segments={segments} campaigns={campaigns} />;
}
