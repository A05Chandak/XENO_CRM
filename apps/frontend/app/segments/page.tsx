import { api } from "../../lib/api";
import { SegmentStudio } from "../../components/segment-studio";

export default async function SegmentsPage() {
  const segments = await api.segments();
  return <SegmentStudio initialSegments={segments} />;
}
