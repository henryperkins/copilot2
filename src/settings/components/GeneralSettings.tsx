import { CustomModel } from "@/aiParams";
import { ChainType } from "@/chainFactory";
import { ChatModelProviders, DEFAULT_OPEN_AREA } from "@/constants";
import { setSettings, updateSetting, useSettingsValue } from "@/settings/model";
import React from "react";
import CommandToggleSettings from "./CommandToggleSettings";
import {
  ModelSettingsComponent,
  SliderComponent,
  TextComponent,
  ToggleComponent,
} from "./SettingBlocks";
import { BUILTIN_CHAT_MODELS, ChatModels } from "@/constants";
import { App } from "obsidian";

interface GeneralSettingsProps {
  app: App;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ app }) => {
  const settings = useSettingsValue();

  const handleUpdateModels = (models: Array<CustomModel>) => {
    const updatedActiveModels = models.map((model) => ({
      ...model,
      baseUrl: model.baseUrl || "",
      apiKey: model.apiKey || "",
    }));

    const o1PreviewModel = BUILTIN_CHAT_MODELS.find(
      (model) => model.name === ChatModels.o1_preview
    );

    if (o1PreviewModel) {
      const existingO1Preview = updatedActiveModels.find(
        (model) => model.name === ChatModels.o1_preview
      );
      if (!existingO1Preview) {
        updatedActiveModels.push({ ...o1PreviewModel, enabled: false, baseUrl: "", apiKey: "" });
      } else {
        // Ensure the o1-preview model is always disabled by default
        existingO1Preview.enabled = false;
      }
    }

    updateSetting("activeModels", updatedActiveModels);
  };

  // modelKey is name | provider, e.g. "gpt-4o|openai"
  const onSetDefaultModelKey = (modelKey: string) => {
    updateSetting("defaultModelKey", modelKey);
  };

  const onDeleteModel = (modelKey: string) => {
    const [modelName, provider] = modelKey.split("|");
    const updatedActiveModels = settings.activeModels.filter(
      (model) => !(model.name === modelName && model.provider === provider)
    );

    // Check if the deleted model was the default model
    let newDefaultModelKey = settings.defaultModelKey;
    if (modelKey === settings.defaultModelKey) {
      const newDefaultModel = updatedActiveModels.find((model) => model.enabled);
      if (newDefaultModel) {
        newDefaultModelKey = `${newDefaultModel.name}|${newDefaultModel.provider}`;
      } else {
        newDefaultModelKey = "";
      }
    }

    setSettings({
      activeModels: updatedActiveModels,
      defaultModelKey: newDefaultModelKey,
    });
  };

  return (
    <div>
      <h2>General Settings</h2>
      <ModelSettingsComponent
        app={app}
        activeModels={settings.activeModels}
        onUpdateModels={handleUpdateModels}
        providers={Object.values(ChatModelProviders)}
        onDeleteModel={onDeleteModel}
        defaultModelKey={settings.defaultModelKey}
        onSetDefaultModelKey={onSetDefaultModelKey}
        isEmbeddingModel={false}
      />
      <div className="chat-icon-selection-tooltip">
        <h2>Default Mode</h2>
        <div className="select-wrapper">
          <select
            id="defaultChainSelect"
            className="default-chain-selection"
            value={settings.defaultChainType}
            onChange={(e) => updateSetting("defaultChainType", e.target.value as ChainType)}
          >
            <option value={ChainType.LLM_CHAIN}>Chat</option>
            <option value={ChainType.VAULT_QA_CHAIN}>Vault QA (Basic)</option>
            <option value={ChainType.COPILOT_PLUS_CHAIN}>Copilot Plus (Alpha)</option>
          </select>
        </div>
      </div>
      <TextComponent
        name="Default Conversation Folder Name"
        description="The default folder name where chat conversations will be saved. Default is 'copilot-conversations'"
        placeholder="copilot-conversations"
        value={settings.defaultSaveFolder}
        onChange={(e) => updateSetting("defaultSaveFolder", e.target.value)}
      />
      <TextComponent
        name="Default Conversation Tag"
        description="The default tag to be used when saving a conversation. Default is 'ai-conversations'"
        placeholder="ai-conversation"
        value={settings.defaultConversationTag}
        onChange={(e) => updateSetting("defaultConversationTag", e.target.value)}
      />
      <ToggleComponent
        name="Autosave Chat"
        description="Automatically save the chat when starting a new one or when the plugin reloads"
        value={settings.autosaveChat}
        onChange={(value) => updateSetting("autosaveChat", value)}
      />
      <ToggleComponent
        name="Suggested Prompts"
        description="Show suggested prompts in the chat view"
        value={settings.showSuggestedPrompts}
        onChange={(value) => updateSetting("showSuggestedPrompts", value)}
      />
      <div className="chat-icon-selection-tooltip">
        <h2>Open Plugin In</h2>
        <div className="select-wrapper">
          <select
            id="openPluginInSelect"
            value={settings.defaultOpenArea}
            onChange={(e) => updateSetting("defaultOpenArea", e.target.value as DEFAULT_OPEN_AREA)}
          >
            <option value={DEFAULT_OPEN_AREA.VIEW}>Sidebar View</option>
            <option value={DEFAULT_OPEN_AREA.EDITOR}>Editor</option>
          </select>
        </div>
      </div>
      <TextComponent
        name="Custom Prompts Folder Name"
        description="The default folder name where custom prompts will be saved. Default is 'copilot-custom-prompts'"
        placeholder="copilot-custom-prompts"
        value={settings.customPromptsFolder}
        onChange={(e) => updateSetting("customPromptsFolder", e.target.value)}
      />
      <h6>
        Please be mindful of the number of tokens and context conversation turns you set here, as
        they will affect the cost of your API requests.
      </h6>
      <SliderComponent
        name="Temperature"
        description="Default is 0.1. Higher values will result in more creativeness, but also more mistakes. Set to 0 for no randomness."
        min={0}
        max={2}
        step={0.05}
        value={settings.temperature}
        onChange={(value) => updateSetting("temperature", value)}
      />
      <SliderComponent
        name="Token limit"
        description={
          <>
            <p>
              The maximum number of <em>output tokens</em> to generate. Default is 1000.
            </p>
            <em>
              This number plus the length of your prompt (input tokens) must be smaller than the
              context window of the model.
            </em>
          </>
        }
        min={0}
        max={16000}
        step={100}
        value={settings.maxTokens}
        onChange={(value) => updateSetting("maxTokens", value)}
      />
      <SliderComponent
        name="Conversation turns in context"
        description="The number of previous conversation turns to include in the context. Default is 15 turns, i.e. 30 messages."
        min={1}
        max={50}
        step={1}
        value={settings.contextTurns}
        onChange={(value) => updateSetting("contextTurns", value)}
      />
      <CommandToggleSettings
        enabledCommands={settings.enabledCommands}
        setEnabledCommands={(value) => updateSetting("enabledCommands", value)}
      />
    </div>
  );
};

export default GeneralSettings;
