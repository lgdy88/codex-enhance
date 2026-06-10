import { CircleArrowUp, Moon, RefreshCw, Rocket, Sun } from "lucide-react";

import dexLogo from "./assets/dex-logo.png";

import { NoticeDialog } from "@/components/app";
import { Button } from "@/components/ui/button";
import { useAppController } from "@/hooks/use-app-controller";
import { routes, routeSubtitle, routeTitle } from "@/routes";
import {
  AboutScreen,
  EnhanceScreen,
  LogsScreen,
  ImageGenerationScreen,
  MaintenanceScreen,
  OverviewScreen,
  PromptAgentScreen,
  ProviderSyncScreen,
  RemoteControlScreen,
  UserScriptsScreen,
} from "@/screens";

export function App() {
  const {
    actions,
    busy,
    launchForm,
    logs,
    officialPluginHealth,
    imageForm,
    imageGenerating,
    imageGenerationPrompt,
    imageGenerationResult,
    imageGenerationResults,
    imageGenerationStartedAtMs,
    imageGeneration,
    promptAgent,
    promptAgentForm,
    promptEnhancing,
    navigate,
    notice,
    overview,
    providerResult,
    remoteBotForm,
    remoteBotResult,
    remoteBridge,
    remoteControl,
    remoteDependencies,
    remoteForm,
    remoteInventory,
    removeOwnedData,
    route,
    setLaunchForm,
    setNotice,
    setRemoteBotForm,
    setRemoteForm,
    setImageForm,
    setImageGenerationPrompt,
    setPromptAgentForm,
    setRemoveOwnedData,
    setSettingsForm,
    settings,
    settingsForm,
    theme,
    update,
    watcher,
  } = useAppController();

  return (
    <div className={`shell ${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src={dexLogo} alt="Dex" />
          {update?.updateAvailable ? (
            <Button
              aria-label={`发现 Dex 更新 ${update.latestVersion ?? ""}`}
              className="brand-update-button active"
              disabled={busy}
              onClick={() => void navigate("about")}
              size="icon"
              title={`发现 Dex 更新 ${update.latestVersion ?? ""}`}
              type="button"
              variant="ghost"
            >
              <CircleArrowUp className="h-5 w-5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <nav className="nav">
          {routes.map((item) => {
            const Icon = item.icon;
            return (
              <button className={`nav-item ${route === item.id ? "active" : ""}`} key={item.id} onClick={() => void navigate(item.id)} title={item.label} type="button">
                <span className="nav-icon">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{routeTitle(route)}</h1>
            <p>{routeSubtitle(route)}</p>
          </div>
          <div className="topbar-actions">
            <Button onClick={actions.toggleTheme} size="icon" title={theme === "dark" ? "切换到浅色" : "切换到深色"} variant="outline">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button onClick={() => void actions.launch()} title="启动 Dex">
              <Rocket className="h-4 w-4" />
              启动 Dex
            </Button>
            <Button onClick={() => void actions.restart()} title="重启 Codex" variant="outline">
              <Rocket className="h-4 w-4" />
              重启 Codex
            </Button>
            <Button onClick={() => void actions.refreshCurrent()} size="icon" title="刷新当前页面" variant="outline">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </header>
        {busy ? <div className="busy">正在处理...</div> : null}
        <section className="screen">
          {route === "overview" ? <OverviewScreen overview={overview} actions={actions} /> : null}
          {route === "pluginUnlock" ? <EnhanceScreen mode="plugins" form={settingsForm} onFormChange={setSettingsForm} actions={actions} /> : null}
          {route === "conversationEnhance" ? <EnhanceScreen mode="conversation" form={settingsForm} onFormChange={setSettingsForm} actions={actions} /> : null}
          {route === "userScripts" ? <UserScriptsScreen settings={settings} actions={actions} /> : null}
          {route === "providerSync" ? (
            <ProviderSyncScreen settings={settings} form={settingsForm} result={providerResult} onFormChange={setSettingsForm} actions={actions} />
          ) : null}
          {route === "imageGeneration" ? (
            <ImageGenerationScreen
              settings={imageGeneration}
              form={imageForm}
              prompt={imageGenerationPrompt}
              result={imageGenerationResult}
              results={imageGenerationResults}
              generating={imageGenerating}
              promptEnhancing={promptEnhancing}
              promptAgentConfigured={promptAgent?.config.apiKeyConfigured === true}
              startedAtMs={imageGenerationStartedAtMs}
              onFormChange={setImageForm}
              onPromptChange={setImageGenerationPrompt}
              actions={actions}
            />
          ) : null}
          {route === "promptAgent" ? (
            <PromptAgentScreen settings={promptAgent} form={promptAgentForm} onFormChange={setPromptAgentForm} actions={actions} />
          ) : null}
          {route === "remoteControl" ? (
            <RemoteControlScreen
              result={remoteControl}
              dependencies={remoteDependencies}
              inventory={remoteInventory}
              bridge={remoteBridge}
              botForm={remoteBotForm}
              botResult={remoteBotResult}
              form={remoteForm}
              onFormChange={setRemoteForm}
              onBotFormChange={setRemoteBotForm}
              actions={actions}
            />
          ) : null}
          {route === "maintenance" ? (
            <>
              <MaintenanceScreen
                overview={overview}
                watcher={watcher}
                officialPluginHealth={officialPluginHealth}
                settings={settings}
                settingsForm={settingsForm}
                launchForm={launchForm}
                onSettingsFormChange={setSettingsForm}
                onLaunchFormChange={setLaunchForm}
                removeOwnedData={removeOwnedData}
                onRemoveOwnedDataChange={setRemoveOwnedData}
                actions={actions}
              />
              <LogsScreen logs={logs} actions={actions} />
            </>
          ) : null}
          {route === "about" ? <AboutScreen overview={overview} update={update} actions={actions} /> : null}
        </section>
      </main>
      {notice ? <NoticeDialog notice={notice} onClose={() => setNotice(null)} /> : null}
    </div>
  );
}
