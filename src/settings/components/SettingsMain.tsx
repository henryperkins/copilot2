import { ResetSettingsConfirmModal } from "@/components/modals/ResetSettingsConfirmModal";
import CopilotPlugin from "@/main";
import { resetSettings } from "@/settings/model";
import React from "react";
import AdvancedSettings from "./AdvancedSettings";
import ApiSettings from "./ApiSettings";
import CopilotPlusSettings from "./CopilotPlusSettings";
import GeneralSettings from "./GeneralSettings";
import QASettings from "./QASettings";

interface SettingsMainProps {
  plugin: CopilotPlugin;
}

const SettingsMain: React.FC<SettingsMainProps> = ({ plugin }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h1 style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          Copilot Settings <small>v{plugin.manifest.version}</small>
        </div>
        <button
          onClick={() => new ResetSettingsConfirmModal(plugin.app, () => resetSettings()).open()}
        >
          Reset to Default Settings
        </button>
      </h1>

      <CopilotPlusSettings app={plugin.app} />
      <GeneralSettings app={plugin.app} />
      <ApiSettings app={plugin.app} />
      <QASettings app={plugin.app} vectorStoreManager={plugin.vectorStoreManager} />
      <AdvancedSettings app={plugin.app} />
    </div>
  );
};

export default SettingsMain;
