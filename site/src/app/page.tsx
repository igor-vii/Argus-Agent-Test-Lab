import Landing from "@/components/landing";
import { LatestSealBlock } from "@/components/latest-seal";

/**
 * Server component (build-time).
 * `latest` is rendered on the server from src/data/latest-seal.json — static
 * indexable HTML inside the client tree, invisible-block problem avoided.
 */
export default function Home() {
  return <Landing latest={<LatestSealBlock />} />;
}
