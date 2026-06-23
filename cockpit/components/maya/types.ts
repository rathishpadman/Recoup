import type { ConnectorReadinessCockpitModel, ForensicsCockpitModel } from "../../app/cockpit-data.ts";
import type { DemoSession } from "../../app/demo-auth.ts";

export interface MayaForensicsSurfaceProps {
  connectors: ConnectorReadinessCockpitModel;
  model: ForensicsCockpitModel;
  session: DemoSession;
}
