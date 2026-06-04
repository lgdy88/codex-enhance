(() => {
  const helperBase = window.__CODEX_SESSION_DELETE_HELPER__ || "http://127.0.0.1:57321";
  const buttonClass = "codex-delete-button";
  const exportButtonClass = "codex-export-button";
  const projectMoveButtonClass = "codex-project-move-button";
  const projectMoveOverlayClass = "codex-project-move-overlay";
  const moreButtonClass = "codex-session-more-button";
  const moreMenuClass = "codex-session-more-menu";
  const actionButtonClass = "codex-session-action-button";
  const actionGroupClass = "codex-session-actions";
  const timelineClass = "codex-conversation-timeline";
  const timelineTrackClass = "codex-conversation-timeline-track";
  const timelineMarkerClass = "codex-conversation-timeline-marker";
  const timelineTooltipClass = "codex-conversation-timeline-tooltip";
  const timelineTargetClass = "codex-conversation-timeline-target";
  const timelineQuestionLimit = 40;
  const timelineMinTopPercent = 2;
  const timelineMaxTopPercent = 98;
  const timelineMaxMarkerGapPercent = 3.5;
  const projectMoveProjectionKey = "codexProjectMoveProjection";
  const legacyProjectMoveOverridesKey = "codexProjectMoveOverrides";
  const projectMoveProjectionTtlMs = 24 * 60 * 60 * 1000;
  const projectMoveProjectionSettleMs = 5 * 60 * 1000;
  const projectMoveRefreshDelaysMs = [50, 250, 750, 1500];
  const chatsSortRefreshIntervalMs = 1500;
  const chatsSortDbRefreshIntervalMs = 5000;
  const projectThreadsRefreshIntervalMs = 5000;
  const projectThreadVisibleLimit = 5;
  const providerStartupPathRepairDelayMs = 1500;
  const styleId = "codex-delete-style";
  const codexDeleteStyleVersion = "12";
  const codexPlusMenuId = "codex-plus-menu";
  const codexPlusMenuFloatingClass = "codex-plus-menu-floating";
  const codexDeleteVersion = "7";
  const codexExportVersion = "1";
  const codexProjectMoveVersion = "1";
  const codexProjectThreadsVersion = "1";
  const codexActionGroupVersion = "3";
  const codexArchiveRowActionsVersion = "1";
  const codexArchiveDeleteAllVersion = "2";
  const codexConversationTimelineVersion = "2";
  const codexPluginMarketplaceUnlockVersion = "10";
  const codexPlusVersion = window.__CODEX_PLUS_VERSION__ || "dev";
  const codexPlusDisplayName = "Dex";
  const codexPlusSettingsKey = "codexPlusSettings";
  const codexAppModulePromises = new Map();
  window.__codexProjectMoveRuntimeId = (window.__codexProjectMoveRuntimeId || 0) + 1;
  const codexProjectMoveRuntimeId = window.__codexProjectMoveRuntimeId;
  clearTimeout(window.__codexProjectMoveProjectionTimer);
  clearTimeout(window.__codexProjectMoveChatsSortTimer);
  clearTimeout(window.__codexProjectThreadsTimer);
  clearTimeout(window.__codexProviderPathRepairTimer);
  document.querySelectorAll(".codex-session-more-menu").forEach((node) => node.remove());
  clearInterval(window.__codexPlusBackendHeartbeat);
  clearInterval(window.__codexPlusProviderWatcher);
  window.__codexProjectMoveProjectionTimer = null;
  window.__codexProjectMoveChatsSortTimer = null;
  window.__codexProjectThreadsTimer = null;
  window.__codexProjectThreadsInFlight = false;
  window.__codexProviderPathRepairTimer = null;
  window.__codexProviderPathRepairInFlight = false;
  window.__codexPlusBackendHeartbeat = null;
  window.__codexPlusProviderWatcher = null;
  window.__codexProjectThreadsState = window.__codexProjectThreadsState || {};
  window.__codexConversationTimelineNodeCounter = window.__codexConversationTimelineNodeCounter || 0;
  const selectors = {
    sidebarThread: "[data-app-action-sidebar-thread-id]",
    threadTitle: "[data-thread-title]",
    appHeader: ".app-header-tint",
    headerContextMenuSurface: '[data-testid="app-shell-header-context-menu-surface"]',
    nativeMenuBar: ".flex.items-center.gap-0\\.5, [class*=\"flex items-center gap-0.5\"]",
    archiveNav: 'button[aria-label="已归档对话"], button[aria-label="Archived conversations"]',
    disabledInstallButton: 'button:disabled.w-full.justify-center, [role="button"][aria-disabled="true"].cursor-not-allowed',
    pluginNavButton: 'nav[role="navigation"] button.h-token-nav-row.w-full',
    pluginSvgPath: 'svg path[d^="M7.94562 14.0277"]',
  };

  function installStyle() {
    const existingStyle = document.getElementById(styleId);
    if (existingStyle?.dataset.codexDeleteStyleVersion === codexDeleteStyleVersion) return;
    existingStyle?.remove();
    const style = document.createElement("style");
    style.id = styleId;
    style.dataset.codexDeleteStyleVersion = codexDeleteStyleVersion;
    style.textContent = `
      .${actionGroupClass} {
        position: absolute;
        right: 28px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 20;
        opacity: 0;
        pointer-events: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .${actionButtonClass},
      .codex-archive-row-button {
        border: 1px solid #ef4444;
        border-radius: 6px;
        background: #f3f4f6;
        color: #374151;
        font-size: 12px;
        line-height: 16px;
        padding: 1px 6px;
        cursor: pointer;
      }
      .codex-archive-row-button {
        border-radius: 7px;
        font: 12px system-ui, sans-serif;
        line-height: 16px;
        padding: 3px 8px;
      }
      .${buttonClass},
      .codex-archive-row-button.${buttonClass} {
        border-color: #ef4444;
        background: #fee2e2;
        color: #991b1b;
      }
      .${exportButtonClass},
      .codex-archive-row-button.${exportButtonClass} {
        border-color: #93c5fd;
        background: #dbeafe;
        color: #1d4ed8;
      }
      .${projectMoveButtonClass} {
        border-color: #10a37f;
        background: #d1fae5;
        color: #065f46;
      }
      .${moreMenuClass} {
        position: fixed;
        z-index: 2147483201;
        min-width: 112px;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 10px;
        background: #242628;
        color: #f4f4f5;
        box-shadow: 0 14px 40px rgba(0,0,0,.28);
        padding: 5px;
        pointer-events: auto;
      }
      .${moreMenuClass}[hidden] { display: none !important; }
      .${moreMenuClass}.codex-session-more-menu-open-up {
        transform: translateY(calc(-100% - 34px));
      }
      .codex-session-more-menu-item {
        width: 100%;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        font: 13px/18px system-ui, sans-serif;
        padding: 6px 8px;
        text-align: left;
      }
      .codex-session-more-menu-item:hover,
      .codex-session-more-menu-item:focus-visible {
        background: #363839;
        outline: none;
      }
      .codex-session-more-menu-icon {
        width: 16px;
        text-align: center;
      }
      [data-codex-delete-row="true"]:hover .${actionGroupClass} {
        opacity: 1;
        pointer-events: auto;
      }
      [data-codex-delete-row="true"].codex-session-more-open .${actionGroupClass} {
        opacity: 1;
        pointer-events: auto;
        z-index: 2147483201;
      }
      [data-codex-delete-row="true"].codex-archive-confirm-visible .${actionGroupClass} { right: 66px; }
      .${projectMoveOverlayClass} {
        position: fixed;
        inset: 0;
        z-index: 2147483200;
        background: rgba(15,23,42,.28);
      }
      .codex-project-move-panel {
        position: fixed;
        width: min(360px, calc(100vw - 32px));
        max-height: min(520px, calc(100vh - 32px));
        overflow: hidden;
        border: 1px solid rgba(15,23,42,.14);
        border-radius: 10px;
        background: #ffffff;
        color: #111827;
        font: 13px system-ui, sans-serif;
        box-shadow: 0 18px 60px rgba(15,23,42,.25);
      }
      .codex-project-move-header { border-bottom: 1px solid #e5e7eb; padding: 10px 12px; }
      .codex-project-move-title { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .codex-project-move-list { max-height: min(440px, calc(100vh - 110px)); overflow-y: auto; padding: 6px; }
      .codex-project-move-item {
        display: block;
        width: 100%;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: #111827;
        padding: 8px 9px;
        text-align: left;
        cursor: pointer;
      }
      .codex-project-move-item:hover,
      .codex-project-move-item:focus-visible { background: #f3f4f6; outline: none; }
      .codex-project-move-item-title { font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .codex-project-move-item-path { margin-top: 2px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .codex-project-move-empty { padding: 18px 12px; color: #6b7280; text-align: center; }
      .codex-project-move-hidden { display: none !important; }
      [data-codex-project-move-injected-list="true"] { display: flex; flex-direction: column; }
      [data-codex-project-thread-list="true"] { display: flex; flex-direction: column; }
      .codex-project-thread-row { color: inherit; }
      .codex-project-thread-title {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding-right: 86px;
      }
      .codex-project-thread-more {
        display: block;
        width: calc(100% - 12px);
        min-height: 28px;
        margin: 4px 6px 6px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #6b7280;
        font: 12px system-ui, sans-serif;
        text-align: left;
        cursor: pointer;
      }
      .codex-project-thread-more:hover,
      .codex-project-thread-more:focus-visible { background: #f3f4f6; color: #111827; outline: none; }
      .codex-archive-delete-all {
        border: 1px solid #ef4444;
        border-radius: 7px;
        background: #fee2e2;
        color: #991b1b;
        font: 12px system-ui, sans-serif;
        line-height: 16px;
        padding: 3px 8px;
        cursor: pointer;
      }
      .codex-archive-action-bar {
        position: fixed;
        right: 28px;
        top: 86px;
        z-index: 2147482999;
        box-shadow: 0 8px 24px rgba(0,0,0,.18);
      }
      .codex-delete-toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483000;
        padding: 10px 12px;
        border-radius: 8px;
        background: #111827;
        color: white;
        font: 13px system-ui, sans-serif;
        box-shadow: 0 8px 30px rgba(0,0,0,.25);
        pointer-events: none;
      }
      .codex-delete-toast button { margin-left: 10px; pointer-events: auto; }
      .codex-delete-confirm-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483200;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15,23,42,.28);
      }
      .codex-delete-confirm-content {
        width: min(420px, calc(100vw - 48px));
        border: 1px solid rgba(15,23,42,.12);
        border-radius: 12px;
        background: #ffffff;
        color: #111827;
        font: 14px system-ui, sans-serif;
        box-shadow: 0 24px 80px rgba(15,23,42,.22);
        padding: 18px;
      }
      .codex-delete-confirm-title { font-size: 16px; font-weight: 650; }
      .codex-delete-confirm-message { margin-top: 8px; color: #4b5563; line-height: 1.45; }
      .codex-delete-confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 18px;
      }
      .codex-delete-confirm-actions button {
        border: 1px solid #d1d5db;
        border-radius: 7px;
        padding: 6px 12px;
        background: #ffffff;
        color: #111827;
        font: 13px system-ui, sans-serif;
        cursor: pointer;
      }
      .codex-delete-confirm-actions [data-codex-delete-confirm="true"] {
        border-color: #ef4444;
        background: #dc2626;
        color: #ffffff;
      }
      html.dark .codex-delete-confirm-overlay,
      html[data-theme="dark"] .codex-delete-confirm-overlay,
      :root[data-theme="dark"] .codex-delete-confirm-overlay {
        background: rgba(0,0,0,.55);
      }
      html.dark .codex-delete-confirm-content,
      html[data-theme="dark"] .codex-delete-confirm-content,
      :root[data-theme="dark"] .codex-delete-confirm-content {
        border-color: rgba(255,255,255,.12);
        background: #2b2b2b;
        color: #f3f4f6;
        box-shadow: 0 24px 80px rgba(0,0,0,.55);
      }
      html.dark .codex-delete-confirm-message,
      html[data-theme="dark"] .codex-delete-confirm-message,
      :root[data-theme="dark"] .codex-delete-confirm-message {
        color: #d1d5db;
      }
      html.dark .codex-delete-confirm-actions button,
      html[data-theme="dark"] .codex-delete-confirm-actions button,
      :root[data-theme="dark"] .codex-delete-confirm-actions button {
        border-color: rgba(255,255,255,.18);
        background: #3f3f46;
        color: #f3f4f6;
      }
      html.dark .codex-delete-confirm-actions [data-codex-delete-confirm="true"],
      html[data-theme="dark"] .codex-delete-confirm-actions [data-codex-delete-confirm="true"],
      :root[data-theme="dark"] .codex-delete-confirm-actions [data-codex-delete-confirm="true"] {
        border-color: #ef4444;
        background: #dc2626;
        color: #ffffff;
      }
      html.dark .${projectMoveOverlayClass},
      html[data-theme="dark"] .${projectMoveOverlayClass},
      :root[data-theme="dark"] .${projectMoveOverlayClass} {
        background: rgba(0,0,0,.55);
      }
      html.dark .codex-project-move-panel,
      html[data-theme="dark"] .codex-project-move-panel,
      :root[data-theme="dark"] .codex-project-move-panel {
        border-color: rgba(255,255,255,.12);
        background: #2b2b2b;
        color: #f3f4f6;
        box-shadow: 0 18px 60px rgba(0,0,0,.55);
      }
      html.dark .codex-project-move-header,
      html[data-theme="dark"] .codex-project-move-header,
      :root[data-theme="dark"] .codex-project-move-header {
        border-bottom-color: rgba(255,255,255,.1);
      }
      html.dark .codex-project-move-item,
      html[data-theme="dark"] .codex-project-move-item,
      :root[data-theme="dark"] .codex-project-move-item {
        color: #f3f4f6;
      }
      html.dark .codex-project-move-item:hover,
      html.dark .codex-project-move-item:focus-visible,
      html[data-theme="dark"] .codex-project-move-item:hover,
      html[data-theme="dark"] .codex-project-move-item:focus-visible,
      :root[data-theme="dark"] .codex-project-move-item:hover,
      :root[data-theme="dark"] .codex-project-move-item:focus-visible {
        background: rgba(255,255,255,.08);
      }
      html.dark .codex-project-move-item-path,
      html[data-theme="dark"] .codex-project-move-item-path,
      :root[data-theme="dark"] .codex-project-move-item-path,
      html.dark .codex-project-move-empty,
      html[data-theme="dark"] .codex-project-move-empty,
      :root[data-theme="dark"] .codex-project-move-empty {
        color: #9ca3af;
      }
      @media (prefers-color-scheme: dark) {
        html:not(.light):not([data-theme="light"]) .codex-delete-confirm-overlay {
          background: rgba(0,0,0,.55);
        }
        html:not(.light):not([data-theme="light"]) .codex-delete-confirm-content {
          border-color: rgba(255,255,255,.12);
          background: #2b2b2b;
          color: #f3f4f6;
          box-shadow: 0 24px 80px rgba(0,0,0,.55);
        }
        html:not(.light):not([data-theme="light"]) .codex-delete-confirm-message {
          color: #d1d5db;
        }
        html:not(.light):not([data-theme="light"]) .codex-delete-confirm-actions button {
          border-color: rgba(255,255,255,.18);
          background: #3f3f46;
          color: #f3f4f6;
        }
        html:not(.light):not([data-theme="light"]) .codex-delete-confirm-actions [data-codex-delete-confirm="true"] {
          border-color: #ef4444;
          background: #dc2626;
          color: #ffffff;
        }
        html:not(.light):not([data-theme="light"]) .${projectMoveOverlayClass} {
          background: rgba(0,0,0,.55);
        }
        html:not(.light):not([data-theme="light"]) .codex-project-move-panel {
          border-color: rgba(255,255,255,.12);
          background: #2b2b2b;
          color: #f3f4f6;
          box-shadow: 0 18px 60px rgba(0,0,0,.55);
        }
        html:not(.light):not([data-theme="light"]) .codex-project-move-header {
          border-bottom-color: rgba(255,255,255,.1);
        }
        html:not(.light):not([data-theme="light"]) .codex-project-move-item {
          color: #f3f4f6;
        }
        html:not(.light):not([data-theme="light"]) .codex-project-move-item:hover,
        html:not(.light):not([data-theme="light"]) .codex-project-move-item:focus-visible {
          background: rgba(255,255,255,.08);
        }
        html:not(.light):not([data-theme="light"]) .codex-project-move-item-path,
        html:not(.light):not([data-theme="light"]) .codex-project-move-empty {
          color: #9ca3af;
        }
      }
      #${codexPlusMenuId}.${codexPlusMenuFloatingClass} {
        position: fixed;
        top: var(--codex-plus-menu-top, 0);
        right: var(--codex-plus-menu-right, 140px);
        left: auto;
        z-index: 2147483645;
        height: var(--codex-plus-menu-height, 30px);
        color: #d1d5db;
        font: 13px system-ui, sans-serif;
        text-align: right;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }
      #${codexPlusMenuId} {
        display: inline-flex;
        align-items: center;
        height: 100%;
        flex: 0 0 auto;
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }
      .codex-plus-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        height: 100%;
        line-height: 1;
        padding: 0 8px;
        cursor: pointer;
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }
      .codex-plus-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,.45);
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }
      .codex-plus-modal-content {
        width: min(520px, calc(100vw - 48px));
        max-height: min(680px, calc(100vh - 40px));
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 18px;
        background: #2b2b2b;
        color: #f3f4f6;
        font: 14px system-ui, sans-serif;
        box-shadow: 0 24px 80px rgba(0,0,0,.45);
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }
      .codex-plus-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px 8px;
        flex: 0 0 auto;
        -webkit-app-region: no-drag;
      }
      .codex-plus-modal-title { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 650; }
      .codex-plus-backend-indicator { width: 9px; height: 9px; border-radius: 999px; background: #a1a1aa; display: inline-block; }
      .codex-plus-backend-indicator[data-status="ok"] { background: #34d399; box-shadow: 0 0 8px rgba(52,211,153,.75); }
      .codex-plus-backend-indicator[data-status="failed"] { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,.75); }
      .codex-plus-backend-indicator[data-status="checking"] { background: #fbbf24; }
      .codex-plus-modal-close {
        border: 0;
        background: transparent;
        color: #d1d5db;
        font-size: 20px;
        cursor: pointer;
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }
      .codex-plus-modal-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
        padding: 4px 20px 16px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,.28) transparent;
      }
      .codex-plus-modal-body::-webkit-scrollbar { width: 10px; }
      .codex-plus-modal-body::-webkit-scrollbar-track { background: transparent; }
      .codex-plus-modal-body::-webkit-scrollbar-thumb {
        border: 2px solid transparent;
        border-radius: 999px;
        background: rgba(255,255,255,.28);
        background-clip: padding-box;
      }
      .codex-plus-modal-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.38); background-clip: padding-box; }
      .codex-plus-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-top: 1px solid rgba(255,255,255,.1);
      }
      .codex-plus-row:first-child { border-top: 0; }
      .codex-plus-row-title { font-weight: 550; line-height: 1.35; }
      .codex-plus-row-description { margin-top: 2px; color: #a1a1aa; font-size: 12px; line-height: 1.4; }
      .codex-plus-toggle {
        width: 42px;
        height: 24px;
        border: 0;
        border-radius: 999px;
        background: #52525b;
        padding: 2px;
      }
      .codex-plus-toggle span {
        display: block;
        width: 20px;
        height: 20px;
        border-radius: 999px;
        background: white;
        transition: transform .12s ease;
      }
      .codex-plus-toggle,
      .codex-plus-action-button,
      .codex-plus-issue-button,
      .codex-plus-provider-actions,
      .codex-plus-backend-status {
        flex-shrink: 0;
        align-self: center;
      }
      .codex-plus-toggle[data-enabled="true"] { background: #10a37f; }
      .codex-plus-toggle[data-enabled="true"] span { transform: translateX(18px); }
      .codex-plus-about { color: #a1a1aa; line-height: 1.5; }
      .codex-plus-tabs { display: flex; gap: 8px; padding: 0 20px 6px; flex: 0 0 auto; }
      .codex-plus-tab-button { border: 1px solid rgba(255,255,255,.14); border-radius: 999px; background: transparent; color: #d1d5db; font: 12px system-ui, sans-serif; padding: 5px 10px; }
      .codex-plus-tab-button[data-active="true"] { background: #10a37f; color: white; border-color: #10a37f; }
      .codex-plus-panel[hidden] { display: none; }
      .codex-plus-action-button,
      .codex-plus-issue-button { border: 1px solid rgba(255,255,255,.18); border-radius: 7px; background: #3f3f46; color: #f3f4f6; font: 12px system-ui, sans-serif; padding: 6px 8px; }
      .codex-plus-danger-button { border-color: rgba(239,68,68,.55); background: #7f1d1d; color: #fee2e2; }
      .codex-plus-backend-status { display: grid; gap: 4px; min-width: 132px; justify-items: end; }
      .codex-plus-backend-label { color: #a1a1aa; font-size: 12px; }
      .codex-plus-backend-label[data-status="ok"] { color: #34d399; }
      .codex-plus-backend-label[data-status="failed"] { color: #f87171; }
      .codex-plus-backend-repair { border: 1px solid rgba(255,255,255,.18); border-radius: 7px; background: #3f3f46; color: #f3f4f6; font: 12px system-ui, sans-serif; padding: 6px 8px; }
      .codex-plus-backend-repair[hidden] { display: none; }
      .codex-plus-user-script-warning { margin-top: 4px; color: #fbbf24; font-size: 12px; }
      .codex-plus-user-script-dirs { margin-top: 6px; color: #a1a1aa; font-size: 11px; line-height: 1.4; word-break: break-all; }
      .codex-plus-user-script-list { margin-top: 8px; display: grid; gap: 6px; }
      .codex-plus-user-script-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; padding: 6px 8px; }
      .codex-plus-user-script-name { font-size: 12px; }
      .codex-plus-user-script-meta { margin-top: 2px; color: #a1a1aa; font-size: 11px; }
      .codex-plus-user-script-error { margin-top: 2px; color: #f87171; font-size: 11px; word-break: break-all; }
      .codex-plus-user-script-actions { display: grid; justify-items: end; gap: 8px; min-width: 120px; }
      .codex-plus-user-script-reload { border: 1px solid rgba(255,255,255,.18); border-radius: 7px; background: #3f3f46; color: #f3f4f6; font: 12px system-ui, sans-serif; padding: 6px 8px; }
      .codex-plus-model-catalog { display: grid; gap: 6px; margin-top: 8px; color: #d1d5db; font-size: 12px; line-height: 1.45; }
      .codex-plus-model-catalog-row { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid rgba(255,255,255,.06); padding-bottom: 4px; }
      .codex-plus-model-catalog-row span:first-child { color: #a1a1aa; }
      .codex-plus-model-catalog-row span:last-child { text-align: right; word-break: break-all; }
      .codex-plus-model-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
      .codex-plus-model-chip { border: 1px solid rgba(255,255,255,.12); border-radius: 999px; background: rgba(16,163,127,.12); color: #d1fae5; padding: 2px 7px; font-size: 11px; }
      .codex-plus-model-actions { display: grid; justify-items: end; gap: 8px; min-width: 92px; }
      .codex-plus-model-compat-warning { margin-top: 4px; color: #fbbf24; font-size: 12px; line-height: 1.4; }
      .codex-plus-model-compat-warning[hidden] { display: none; }
      .codex-plus-provider-diagnostics { display: grid; gap: 6px; margin-top: 8px; color: #d1d5db; font-size: 12px; line-height: 1.45; }
      .codex-plus-provider-diagnostics-row { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid rgba(255,255,255,.06); padding-bottom: 4px; }
      .codex-plus-provider-diagnostics-row span:first-child { color: #a1a1aa; }
      .codex-plus-provider-diagnostics-row span:last-child { text-align: right; word-break: break-all; }
      .codex-plus-provider-actions { display: grid; justify-items: end; gap: 8px; min-width: 92px; }
      .${timelineClass} {
        position: fixed;
        top: calc(72px + 12px);
        right: 12px;
        bottom: calc(28px + 12px);
        width: 24px;
        z-index: 2147482500;
        pointer-events: none;
      }
      .${timelineTrackClass} {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 50%;
        width: 2px;
        transform: translateX(-50%);
        border-radius: 999px;
        background: rgba(209, 213, 219, .55);
      }
      .${timelineMarkerClass} {
        position: absolute;
        left: 50%;
        width: 12px;
        height: 12px;
        border: 0;
        border-radius: 999px;
        transform: translate(-50%, -50%);
        background: #d1d5db;
        cursor: pointer;
        pointer-events: auto;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, .92);
      }
      .${timelineMarkerClass}:hover,
      .${timelineMarkerClass}:focus-visible,
      .${timelineMarkerClass}.codex-conversation-timeline-marker-active {
        background: #8b8b8b;
        outline: none;
      }
      .${timelineTooltipClass} {
        position: absolute;
        right: 20px;
        top: 50%;
        max-width: 260px;
        transform: translateY(-50%);
        border-radius: 8px;
        background: rgba(80, 80, 80, .92);
        color: #ffffff;
        font: 600 13px system-ui, sans-serif;
        line-height: 18px;
        padding: 10px 12px;
        white-space: nowrap;
        box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }
      .${timelineMarkerClass}:hover .${timelineTooltipClass},
      .${timelineMarkerClass}:focus-visible .${timelineTooltipClass} {
        opacity: 1;
        visibility: visible;
        z-index: 2147482501;
      }
      .${timelineTargetClass} {
        animation: codex-conversation-timeline-pulse 1.2s ease-out;
      }
      @keyframes codex-conversation-timeline-pulse {
        0% { box-shadow: 0 0 0 0 rgba(16, 163, 127, .35); }
        100% { box-shadow: 0 0 0 14px rgba(16, 163, 127, 0); }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function defaultCodexPlusSettings() {
    return { pluginMarketplaceUnlock: true, pluginEntryUnlock: true, forcePluginInstall: true, modelWhitelistUnlock: false, sessionDelete: true, markdownExport: true, projectMove: true, conversationTimeline: true, nativeMenuPlacement: true };
  }

  function codexPlusSettings() {
    try {
      const settings = { ...defaultCodexPlusSettings(), ...JSON.parse(localStorage.getItem(codexPlusSettingsKey) || "{}") };
      if (settings.pluginMarketplaceUnlock === undefined && settings.pluginEntryUnlock !== undefined) {
        settings.pluginMarketplaceUnlock = !!settings.pluginEntryUnlock;
      }
      return settings;
    } catch {
      return defaultCodexPlusSettings();
    }
  }

  function setCodexPlusSetting(key, value) {
    const next = { ...codexPlusSettings(), [key]: value };
    if (key === "pluginMarketplaceUnlock") next.pluginEntryUnlock = value;
    localStorage.setItem(codexPlusSettingsKey, JSON.stringify(next));
    renderCodexPlusMenu();
    scan();
  }

  function renderCodexPlusMenu() {
    document.querySelectorAll(".codex-plus-toggle[data-codex-plus-setting]").forEach((button) => {
      const key = button.getAttribute("data-codex-plus-setting");
      button.dataset.enabled = String(!!codexPlusSettings()[key]);
    });
  }

  let codexPlusBackendSettings = { providerSyncEnabled: true };
  let codexPlusBackendSettingsLoaded = false;

  async function loadBackendSettings() {
    try {
      const settings = await postJson("/settings/get", {});
      codexPlusBackendSettings = { ...codexPlusBackendSettings, ...settings };
      codexPlusBackendSettingsLoaded = true;
      refreshCodexPlusBackendToggles();
      scan();
    } catch (_) {
      codexPlusBackendSettingsLoaded = false;
      refreshCodexPlusBackendToggles();
    }
  }

  async function setBackendSetting(key, value) {
    codexPlusBackendSettings = { ...codexPlusBackendSettings, [key]: value };
    refreshCodexPlusBackendToggles();
    try {
      const settings = await postJson("/settings/set", { [key]: value });
      codexPlusBackendSettings = { ...codexPlusBackendSettings, ...settings };
    } finally {
      refreshCodexPlusBackendToggles();
    }
  }

  function refreshCodexPlusBackendToggles() {
    document.querySelectorAll(".codex-plus-toggle[data-codex-backend-setting]").forEach((button) => {
      const key = button.getAttribute("data-codex-backend-setting");
      button.dataset.enabled = String(!!codexPlusBackendSettings[key]);
    });
  }

  let codexPlusUserScripts = { enabled: true, builtin_dir: "", user_dir: "", scripts: [] };
  let codexPlusBackendStatus = { status: "checking", message: "正在检查后端…" };
  let codexPlusProviderStatus = { status: "checking", current_provider: "", config_mtime_ms: 0 };
  let codexPlusProviderDiagnostics = { status: "checking" };
  let codexProviderHistoryTransport = { mode: "local-sqlite", appServer: "not_checked", message: "本地 SQLite bridge 优先" };
  let codexPlusBackendStatusInFlight = false;
  let codexPlusBackendConsecutiveFailures = 0;
  let codexPlusProviderStatusInFlight = false;
  let codexPlusProviderDiagnosticsInFlight = false;

  function renderBackendStatus() {
    const status = codexPlusBackendStatus.status || "failed";
    const label = document.querySelector("[data-codex-backend-status]");
    if (label) {
      label.dataset.status = status;
      label.textContent = codexPlusBackendStatus.message || (status === "ok" ? "后端已连接" : "后端已断开");
    }
    document.querySelectorAll("[data-codex-backend-indicator]").forEach((indicator) => {
      indicator.dataset.status = status;
      indicator.title = status === "ok" ? "后端已连接" : status === "checking" ? "正在检查后端" : "后端已断开";
    });
    const repair = document.querySelector("[data-codex-backend-repair]");
    if (repair) repair.hidden = status === "ok" || status === "checking";
  }

  function withBackendTimeout(request) {
    return Promise.race([
      request,
      new Promise((resolve) => setTimeout(() => resolve({ status: "timeout", message: "后端响应较慢" }), 5000)),
    ]);
  }

  async function checkBackendStatus() {
    if (codexPlusBackendStatusInFlight) return;
    codexPlusBackendStatusInFlight = true;
    try {
      const result = await withBackendTimeout(postJson("/backend/status", {}));
      if (result?.status === "ok") {
        codexPlusBackendConsecutiveFailures = 0;
        codexPlusBackendStatus = result;
      } else {
        codexPlusBackendConsecutiveFailures += 1;
        codexPlusBackendStatus = codexPlusBackendConsecutiveFailures >= 3
          ? { status: "failed", message: result?.message || "后端已断开" }
          : { status: "checking", message: result?.message || "后端响应较慢，正在重试…" };
      }
      renderBackendStatus();
    } catch (error) {
      codexPlusBackendConsecutiveFailures += 1;
      codexPlusBackendStatus = codexPlusBackendConsecutiveFailures >= 3
        ? { status: "failed", message: "后端已断开" }
        : { status: "checking", message: "后端连接不稳定，正在重试…" };
      renderBackendStatus();
    } finally {
      codexPlusBackendStatusInFlight = false;
    }
  }

  async function repairBackend() {
    codexPlusBackendStatus = { status: "checking", message: "正在修复后端…" };
    renderBackendStatus();
    try {
      codexPlusBackendStatus = await postJson("/backend/repair", {});
      if (codexPlusBackendStatus?.status === "ok") codexPlusBackendConsecutiveFailures = 0;
    } catch (error) {
      codexPlusBackendStatus = { status: "failed", message: "后端修复失败" };
    }
    renderBackendStatus();
  }

  function scheduleBackendHeartbeat() {
    if (window.__codexPlusBackendHeartbeat) return;
    window.__codexPlusBackendHeartbeat = setInterval(checkBackendStatus, 5000);
    checkBackendStatus();
  }

  function scheduleProviderWatcher() {
    if (window.__codexPlusProviderWatcher) return;
    window.__codexPlusProviderWatcher = setInterval(loadProviderStatus, 2500);
    loadProviderStatus();
  }

  function userScriptStatusLabel(status) {
    return { loaded: "已加载", failed: "失败", disabled: "已禁用", not_loaded: "未加载", loading: "加载中" }[status] || status || "未知";
  }

  function renderUserScripts() {
    const enabledToggle = document.querySelector("[data-codex-user-scripts-enabled]");
    if (enabledToggle) enabledToggle.dataset.enabled = String(!!codexPlusUserScripts.enabled);
    const dirs = document.querySelector("[data-codex-user-script-dirs]");
    if (dirs) dirs.textContent = `内置：${codexPlusUserScripts.builtin_dir || "未找到"}  用户：${codexPlusUserScripts.user_dir || "未找到"}`;
    const list = document.querySelector("[data-codex-user-script-list]");
    if (!list) return;
    if (!codexPlusUserScripts.scripts?.length) {
      list.textContent = "未发现用户脚本。";
      return;
    }
    list.innerHTML = codexPlusUserScripts.scripts.map((script) => `
      <div class="codex-plus-user-script-item">
        <div>
          <div class="codex-plus-user-script-name">${escapeHtml(script.name || script.key)}</div>
          <div class="codex-plus-user-script-meta">${script.source === "builtin" ? "内置" : "用户"} · ${userScriptStatusLabel(script.status)}</div>
          ${script.error ? `<div class="codex-plus-user-script-error">${escapeHtml(script.error)}</div>` : ""}
        </div>
        <button type="button" class="codex-plus-toggle" data-codex-user-script-key="${escapeHtml(script.key)}" data-enabled="${String(!!script.enabled)}"><span></span></button>
      </div>
    `).join("");
  }

  async function loadUserScripts(path = "/user-scripts/list", payload = {}) {
    const result = await postJson(path, payload);
    if (result?.scripts) {
      codexPlusUserScripts = result;
      renderUserScripts();
    }
  }

  function providerDistributionText(value) {
    const distribution = value && typeof value === "object" ? value : {};
    const entries = Object.entries(distribution);
    if (!entries.length) return "无";
    return entries.map(([provider, count]) => `${provider}: ${count}`).join(", ");
  }

  function providerHistoryTransportText() {
    const mode = codexProviderHistoryTransport.mode === "app-server" ? "Codex app-server thread/list" : "本地 SQLite bridge";
    const appServer = codexProviderHistoryTransport.appServer === "unavailable" ? "；app-server thread/list 不可用" : "";
    const message = codexProviderHistoryTransport.message ? `；${codexProviderHistoryTransport.message}` : "";
    return `${mode}${appServer}${message}`;
  }

  function updateProviderHistoryTransport(next) {
    codexProviderHistoryTransport = { ...codexProviderHistoryTransport, ...next };
    window.__codexProviderHistoryTransport = codexProviderHistoryTransport;
  }

  function renderProviderDiagnostics() {
    const panel = document.querySelector("[data-codex-provider-diagnostics]");
    if (!panel) return;
    const data = codexPlusProviderDiagnostics || {};
    if (data.status === "checking") {
      panel.textContent = "正在读取诊断信息…";
      return;
    }
    if (data.status && data.status !== "ok") {
      panel.textContent = data.message || "Provider 诊断不可用";
      return;
    }
    const pathPending = data.path_repair_pending || {};
    const providerPending = data.provider_converge_pending || {};
    const sqlite = data.sqlite || {};
    const rollout = data.rollout || {};
    const stateDb = data.state_db || {};
    const schema = stateDb.schema || sqlite.schema || {};
    const repairPlan = Array.isArray(data.repair_plan) ? data.repair_plan : [];
    const recent50 = sqlite.recent50 || {};
    const projectVisible = sqlite.project_visible || {};
    panel.innerHTML = [
      ["当前 provider", data.current_provider || "unknown"],
      ["历史查询通道", providerHistoryTransportText()],
      ["rollout provider 分布", providerDistributionText(rollout.provider_distribution)],
      ["SQLite provider 分布", providerDistributionText(sqlite.provider_distribution)],
      ["\\\\? 路径数量", `rollout ${pathPending.rollout_cwd_count || 0} / SQLite ${pathPending.sqlite_cwd_count || 0} / global ${pathPending.global_state_count || 0}`],
      ["最近 50 命中", `${recent50.total || 0} 条，当前 provider ${recent50.current_provider_count || 0} 条，项目匹配 ${recent50.project_match_count || 0} 条`],
      ["项目可见数量", `${projectVisible.total || 0} 条，当前 provider ${projectVisible.current_provider_count || 0} 条`],
      ["SQLite quick_check", stateDb.quick_check || sqlite.quick_check || "unknown"],
      ["SQLite schema", `${schema.status || "unknown"}；threads columns ${(schema.thread_columns || []).length || 0}`],
      ["修复计划", repairPlan.map((step) => `${step.id || "unknown"}:${step.kind || "read"}`).join(", ") || "history.readonly:read"],
      ["待收敛 metadata", `rollout ${providerPending.rollout_files || 0} 个文件 / SQLite ${providerPending.sqlite_rows || 0} 行`],
      ["encrypted_content 风险", data.warning || "provider 收敛只保证列表可见，不保证跨账号/跨 provider 的 encrypted_content 能续聊。"],
    ].map(([label, value]) => `<div class="codex-plus-provider-diagnostics-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(String(value))}</span></div>`).join("");
  }

  async function loadProviderDiagnostics(projectCwd = activeProjectPath()) {
    if (codexPlusProviderDiagnosticsInFlight) return;
    codexPlusProviderDiagnosticsInFlight = true;
    codexPlusProviderDiagnostics = { status: "checking" };
    renderProviderDiagnostics();
    try {
      codexPlusProviderDiagnostics = await postJson("/provider/diagnostics", { project_cwd: projectCwd || "" });
    } catch (error) {
      codexPlusProviderDiagnostics = { status: "failed", message: "Provider 诊断读取失败" };
    } finally {
      codexPlusProviderDiagnosticsInFlight = false;
    }
    renderProviderDiagnostics();
  }

  async function repairProviderPaths() {
    const result = await postJson("/provider/repair-paths", {});
    showToast(result?.message || "路径修复已执行", null);
    await loadProviderDiagnostics();
    refreshProviderHistoryUi();
  }

  async function repairProviderPathsOnStartup() {
    if (window.__codexProviderPathRepairInFlight) return;
    window.__codexProviderPathRepairInFlight = true;
    try {
      const result = await postJson("/provider/repair-paths", {});
      updateProviderHistoryTransport({ message: result?.message || "路径自动修复已执行" });
      refreshProviderHistoryUi();
    } catch (error) {
      updateProviderHistoryTransport({ message: `路径自动修复失败：${providerHistoryErrorSummary(error)}` });
    } finally {
      window.__codexProviderPathRepairInFlight = false;
    }
  }

  function scheduleStartupProviderPathRepair() {
    clearTimeout(window.__codexProviderPathRepairTimer);
    window.__codexProviderPathRepairTimer = setTimeout(() => {
      if (window.__codexProjectMoveRuntimeId !== codexProjectMoveRuntimeId) return;
      repairProviderPathsOnStartup();
    }, providerStartupPathRepairDelayMs);
  }

  async function convergeProviderMetadata() {
    const ok = await approveProviderConvergence();
    if (!ok) return;
    const result = await postJson("/provider/converge", {});
    showToast(result?.message || "Provider metadata 收敛已执行", null);
    await loadProviderDiagnostics();
    refreshProviderHistoryUi();
  }

  async function quarantineProviderStateDb() {
    const ok = await approveProviderStateQuarantine();
    if (!ok) return;
    const result = await postJson("/provider/quarantine-state", {});
    showToast(result?.message || "state_5.sqlite 已隔离", null);
    await loadProviderDiagnostics();
    refreshProviderHistoryUi();
  }

  function approveProviderConvergence() {
    document.querySelectorAll(".codex-delete-confirm-overlay").forEach((node) => node.remove());
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "codex-delete-confirm-overlay";
      overlay.innerHTML = `
        <div class="codex-delete-confirm-content" role="dialog" aria-modal="true" aria-label="Provider metadata 收敛">
          <div class="codex-delete-confirm-title">Provider metadata 收敛</div>
          <div class="codex-delete-confirm-message">这会先备份再把历史 metadata 收敛到当前 provider。它只保证列表可见，不保证跨账号或跨 provider 的 encrypted_content 能续聊。</div>
          <div class="codex-delete-confirm-actions">
            <button type="button" data-codex-provider-converge-cancel="true">取消</button>
            <button type="button" data-codex-provider-converge-accept="true">收敛</button>
          </div>
        </div>
      `;
      const finish = (value, event) => {
        event?.preventDefault();
        event?.stopPropagation();
        event?.target?.blur?.();
        overlay.remove();
        resolve(value);
      };
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest("[data-codex-provider-converge-cancel]")) {
          finish(false, event);
          return;
        }
        if (event.target.closest("[data-codex-provider-converge-accept]")) {
          finish(true, event);
        }
      }, true);
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") finish(false, event);
      }, true);
      document.body.appendChild(overlay);
      overlay.querySelector("[data-codex-provider-converge-cancel]")?.focus();
    });
  }

  function approveProviderStateQuarantine() {
    document.querySelectorAll(".codex-delete-confirm-overlay").forEach((node) => node.remove());
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "codex-delete-confirm-overlay";
      overlay.innerHTML = `
        <div class="codex-delete-confirm-content" role="dialog" aria-modal="true" aria-label="隔离 state_5.sqlite">
          <div class="codex-delete-confirm-title">隔离脏库</div>
          <div class="codex-delete-confirm-message">这会先备份并隔离 state_5.sqlite / WAL / SHM，重启 Codex 后由 Codex 重建本地索引。只在 quick_check/schema 明确异常时使用。</div>
          <div class="codex-delete-confirm-actions">
            <button type="button" data-codex-provider-quarantine-cancel="true">取消</button>
            <button type="button" data-codex-provider-quarantine-accept="true">隔离</button>
          </div>
        </div>
      `;
      const finish = (value, event) => {
        event?.preventDefault();
        event?.stopPropagation();
        event?.target?.blur?.();
        overlay.remove();
        resolve(value);
      };
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest("[data-codex-provider-quarantine-cancel]")) {
          finish(false, event);
          return;
        }
        if (event.target.closest("[data-codex-provider-quarantine-accept]")) {
          finish(true, event);
        }
      }, true);
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") finish(false, event);
      }, true);
      document.body.appendChild(overlay);
      overlay.querySelector("[data-codex-provider-quarantine-cancel]")?.focus();
    });
  }

  async function loadProviderStatus() {
    if (codexPlusProviderStatusInFlight) return;
    codexPlusProviderStatusInFlight = true;
    try {
      const status = await postJson("/provider/status", {});
      const previousProvider = codexPlusProviderStatus.current_provider;
      const previousMtime = codexPlusProviderStatus.config_mtime_ms;
      codexPlusProviderStatus = status || codexPlusProviderStatus;
      if ((previousProvider && previousProvider !== codexPlusProviderStatus.current_provider) || (previousMtime && previousMtime !== codexPlusProviderStatus.config_mtime_ms)) {
        refreshProviderHistoryUi();
      }
    } catch (_) {
      codexPlusProviderStatus = { status: "failed", current_provider: "", config_mtime_ms: 0 };
    } finally {
      codexPlusProviderStatusInFlight = false;
    }
  }

  function providerHistoryEnabled() {
    return codexPlusBackendSettings.providerSyncEnabled !== false;
  }

  let codexModelCatalog = { status: "checking", model: "", default_model: "", model_provider: "", provider_name: "", models: [], sources: [], responses_api: { status: "unknown", endpoint: "", message: "" } };
  let codexModelCatalogLoadedAt = 0;
  let codexModelCatalogPromise = null;
  function codexPlusModelUnlockEnabled() {
    return !!codexPlusSettings().modelWhitelistUnlock;
  }

  function codexPlusModelNames() {
    return uniqueValues([
      codexModelCatalog.default_model,
      codexModelCatalog.model,
      ...(Array.isArray(codexModelCatalog.models) ? codexModelCatalog.models : []),
    ]);
  }

  function codexResponsesApiStatus() {
    const status = codexModelCatalog.responses_api;
    return status && typeof status === "object" ? status : { status: "unknown", endpoint: "", message: "" };
  }

  function codexModelCompatibilityWarningText() {
    if (!codexPlusModelUnlockEnabled()) return "";
    const responsesApi = codexResponsesApiStatus();
    if (responsesApi.status !== "unsupported") return "";
    const provider = codexModelCatalog.provider_name || codexModelCatalog.model_provider || "当前模型供应商";
    const detail = responsesApi.message ? `：${responsesApi.message}` : "";
    return `${provider} 不支持 Codex 使用的 /v1/responses 接口，模型可能能显示，但发起对话会失败。请换支持 Responses API 的中转，或使用兼容转换代理${detail}`;
  }

  function renderCodexModelCompatibilityWarning() {
    const text = codexModelCompatibilityWarningText();
    document.querySelectorAll("[data-codex-model-compat-warning]").forEach((warning) => {
      warning.hidden = !text;
      warning.textContent = text;
    });
  }

  function maybeShowCodexModelCompatibilityWarning() {
    const text = codexModelCompatibilityWarningText();
    if (!text) return;
    const responsesApi = codexResponsesApiStatus();
    const key = `${codexModelCatalog.model_provider || ""}:${responsesApi.endpoint || ""}:${responsesApi.message || ""}`;
    if (window.__codexPlusResponsesApiWarningKey === key) return;
    window.__codexPlusResponsesApiWarningKey = key;
    showToast(text, null);
  }

  function modelCatalogStatusLabel(status) {
    return { ok: "已读取", missing: "未发现配置", not_configured: "未配置模型源", failed: "读取失败", checking: "正在读取" }[status] || status || "未知";
  }

  function responsesApiStatusLabel(status) {
    return { supported: "支持 /v1/responses", unsupported: "不支持 /v1/responses", failed: "探测失败", unknown: "未探测" }[status] || status || "未知";
  }

  function renderCodexModelCatalog() {
    renderCodexModelCompatibilityWarning();
    const panel = document.querySelector("[data-codex-model-catalog]");
    if (!panel) return;
    if (!codexPlusModelUnlockEnabled()) {
      panel.textContent = "未启用模型目录读取。";
      return;
    }
    const data = codexModelCatalog || {};
    if (data.status === "checking") {
      panel.textContent = "正在读取模型目录…";
      return;
    }
    const models = Array.isArray(data.models) ? data.models : [];
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const responsesApi = codexResponsesApiStatus();
    const sourceText = sources.length
      ? sources.map((source) => `${source.name || source.id || "source"}:${source.auth === "present" ? "auth" : "no-auth"}:${source.status || "unknown"}`).join(", ")
      : "无";
    const rows = [
      ["状态", data.message ? `${modelCatalogStatusLabel(data.status)}：${data.message}` : modelCatalogStatusLabel(data.status)],
      ["Provider", data.provider_name || data.model_provider || "unknown"],
      ["默认模型", data.default_model || data.model || "未识别"],
      ["模型数量", String(models.length)],
      ["模型源", sourceText],
      ["Responses API", responsesApi.message ? `${responsesApiStatusLabel(responsesApi.status)}：${responsesApi.message}` : responsesApiStatusLabel(responsesApi.status)],
    ];
    panel.innerHTML = rows.map(([label, value]) => `<div class="codex-plus-model-catalog-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join("");
    if (models.length) {
      const list = document.createElement("div");
      list.className = "codex-plus-model-list";
      list.innerHTML = models.slice(0, 12).map((model) => `<span class="codex-plus-model-chip">${escapeHtml(model)}</span>`).join("");
      if (models.length > 12) {
        const extra = document.createElement("span");
        extra.className = "codex-plus-model-chip";
        extra.textContent = `+${models.length - 12}`;
        list.appendChild(extra);
      }
      panel.appendChild(list);
    }
  }

  async function loadCodexModelCatalog(force = false) {
    if (!codexPlusModelUnlockEnabled() && !force) {
      renderCodexModelCatalog();
      return codexModelCatalog;
    }
    if (!force && codexModelCatalogPromise) return codexModelCatalogPromise;
    if (!force && codexModelCatalogLoadedAt && Date.now() - codexModelCatalogLoadedAt < 10000) return codexModelCatalog;
    codexModelCatalog = { ...codexModelCatalog, status: "checking" };
    renderCodexModelCatalog();
    codexModelCatalogPromise = postJson("/codex-model-catalog", {})
      .then((result) => {
        codexModelCatalog = result && typeof result === "object" ? result : { status: "failed", message: "模型目录响应无效", models: [], sources: [], responses_api: { status: "unknown", endpoint: "", message: "" } };
        codexModelCatalogLoadedAt = Date.now();
        renderCodexModelCatalog();
        maybeShowCodexModelCompatibilityWarning();
        patchCodexModelWhitelist();
        return codexModelCatalog;
      })
      .catch((error) => {
        codexModelCatalog = { status: "failed", message: String(error?.message || error), models: [], sources: [], responses_api: { status: "unknown", endpoint: "", message: "" } };
        codexModelCatalogLoadedAt = Date.now();
        renderCodexModelCatalog();
        return codexModelCatalog;
      })
      .finally(() => {
        codexModelCatalogPromise = null;
      });
    return codexModelCatalogPromise;
  }

  function modelReasoningEfforts() {
    return ["minimal", "low", "medium", "high", "xhigh"].map((reasoningEffort) => ({ reasoningEffort, description: `${reasoningEffort} effort` }));
  }

  function codexPlusModelDescriptor(modelName) {
    return {
      model: modelName,
      name: modelName,
      displayName: modelName,
      description: codexModelCatalog.provider_name || codexModelCatalog.model_provider || "Custom model",
      hidden: false,
      isDefault: (codexModelCatalog.default_model || codexModelCatalog.model) === modelName,
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: modelReasoningEfforts(),
    };
  }

  function modelArrayLooksPatchable(value, allowEmpty = false) {
    return Array.isArray(value)
      && (allowEmpty || value.length > 0)
      && value.every((item) => item && typeof item === "object" && typeof item.model === "string");
  }

  function patchModelArray(models, allowEmpty = false) {
    if (!modelArrayLooksPatchable(models, allowEmpty)) return false;
    const customModels = codexPlusModelNames();
    if (!customModels.length) return false;
    let changed = false;
    const existing = new Map(models.map((item) => [item.model, item]));
    models.forEach((item) => {
      if (customModels.includes(item.model) && item.hidden !== false) {
        item.hidden = false;
        changed = true;
      }
    });
    customModels.forEach((modelName) => {
      if (!existing.has(modelName)) {
        models.push(codexPlusModelDescriptor(modelName));
        changed = true;
      }
    });
    return changed;
  }

  function patchModelContainer(value) {
    if (!value || typeof value !== "object") return false;
    let changed = false;
    if (patchModelArray(value.models, "defaultModel" in value || "availableModels" in value)) changed = true;
    if (patchModelArray(value.data)) changed = true;
    if (patchModelArray(value.result)) changed = true;
    if (patchModelArray(value.pages?.[0]?.data)) changed = true;
    if (patchModelArray(value.result?.data)) changed = true;
    if (patchModelArray(value.result?.models)) changed = true;
    if (patchModelArray(value.message?.result?.data)) changed = true;
    if (patchModelArray(value.message?.result?.models)) changed = true;
    const names = codexPlusModelNames();
    if (value.availableModels instanceof Set) {
      names.forEach((name) => {
        if (!value.availableModels.has(name)) {
          value.availableModels.add(name);
          changed = true;
        }
      });
    }
    if (Array.isArray(value.availableModels)) {
      names.forEach((name) => {
        if (!value.availableModels.includes(name)) {
          value.availableModels.push(name);
          changed = true;
        }
      });
    }
    if (value.defaultModel == null && names.length > 0) {
      value.defaultModel = codexPlusModelDescriptor(names[0]);
      changed = true;
    } else if (typeof value.defaultModel === "string" && names.includes(value.defaultModel) && value.model == null) {
      value.model = value.defaultModel;
      changed = true;
    }
    return changed;
  }

  function patchStatsigModelDynamicConfig(config) {
    const names = codexPlusModelNames();
    const value = config?.value;
    if (!names.length || !value || typeof value !== "object") return config;
    const availableModels = Array.isArray(value.available_models) ? [...value.available_models] : [];
    let changed = false;
    names.forEach((name) => {
      if (!availableModels.includes(name)) {
        availableModels.push(name);
        changed = true;
      }
    });
    const nextValue = {
      ...value,
      available_models: availableModels,
      default_model: names[0] || value.default_model,
    };
    if (!changed && nextValue.default_model === value.default_model) return config;
    try {
      config.value = nextValue;
    } catch {
      return { ...config, value: nextValue };
    }
    return config;
  }

  function statsigClients() {
    const root = window.__STATSIG__ || globalThis.__STATSIG__;
    if (!root || typeof root !== "object") return [];
    const clients = [root.firstInstance, typeof root.instance === "function" ? root.instance() : null];
    if (root.instances && typeof root.instances === "object") clients.push(...Object.values(root.instances));
    return clients.filter((client, index, array) => client && typeof client === "object" && array.indexOf(client) === index);
  }

  function patchStatsigModelWhitelist() {
    statsigClients().forEach((client) => {
      if (client.__codexPlusModelWhitelistPatched || typeof client.getDynamicConfig !== "function") return;
      const originalGetDynamicConfig = client.getDynamicConfig.bind(client);
      client.getDynamicConfig = (name, options) => {
        const result = originalGetDynamicConfig(name, options);
        return name === "107580212" ? patchStatsigModelDynamicConfig(result) : result;
      };
      client.__codexPlusModelWhitelistPatched = true;
      try {
        patchStatsigModelDynamicConfig(client.getDynamicConfig("107580212", { disableExposureLog: true }));
      } catch {
      }
    });
  }

  function patchObjectGraphForModels(root, visited, depth = 0) {
    if (!root || typeof root !== "object" || visited.has(root) || depth > 5) return false;
    visited.add(root);
    let changed = patchModelContainer(root);
    if (root instanceof Element || root === window || root === document || root === document.body || root === document.documentElement) return changed;
    for (const key of Object.keys(root)) {
      if (key === "ownerDocument" || key === "parentElement" || key === "parentNode" || key === "children" || key === "childNodes") continue;
      let value;
      try {
        value = root[key];
      } catch {
        continue;
      }
      if (value && typeof value === "object" && patchObjectGraphForModels(value, visited, depth + 1)) changed = true;
    }
    return changed;
  }

  function reactFiberKeys(element) {
    return Object.keys(element).filter((key) => key.startsWith("__reactFiber") || key.startsWith("__reactInternalInstance") || key.startsWith("__reactProps"));
  }

  function patchReactModelState() {
    const visited = new WeakSet();
    const nodes = [document.body, ...document.querySelectorAll("button, [role='menu'], [role='dialog'], [data-radix-popper-content-wrapper]")].filter(Boolean);
    let changed = false;
    for (const node of nodes.slice(0, 220)) {
      for (const key of reactFiberKeys(node)) {
        if (patchObjectGraphForModels(node[key], visited)) changed = true;
      }
    }
    return changed;
  }

  function selectCodexPlusTab(tab) {
    document.querySelectorAll("[data-codex-plus-tab]").forEach((button) => {
      button.dataset.active = String(button.getAttribute("data-codex-plus-tab") === tab);
    });
    document.querySelectorAll("[data-codex-plus-panel]").forEach((panel) => {
      panel.hidden = panel.getAttribute("data-codex-plus-panel") !== tab;
    });
    if (tab === "userScripts") loadUserScripts();
    if (tab === "provider") loadProviderDiagnostics();
    if (tab === "home") loadCodexModelCatalog();
  }

  function openCodexPlusModal() {
    document.querySelectorAll(".codex-plus-modal-overlay").forEach((node) => node.remove());
    document.querySelectorAll('[data-codex-plus-dialog="true"]').forEach((node) => node.remove());
    const overlay = document.createElement("div");
    overlay.className = "codex-plus-modal-overlay";
    overlay.innerHTML = `
      <div class="codex-plus-modal-content" role="dialog" aria-modal="true" aria-label="${codexPlusDisplayName}">
        <div class="codex-plus-modal-header">
          <div class="codex-plus-modal-title"><span class="codex-plus-backend-indicator" data-codex-backend-indicator="true" data-status="checking"></span><span>${codexPlusDisplayName} ${codexPlusVersion}</span></div>
          <button type="button" class="codex-plus-modal-close" aria-label="关闭">×</button>
        </div>
        <div class="codex-plus-tabs" role="tablist" aria-label="${codexPlusDisplayName}">
          <button type="button" class="codex-plus-tab-button" data-codex-plus-tab="home" data-active="true">主页</button>
          <button type="button" class="codex-plus-tab-button" data-codex-plus-tab="provider" data-active="false">Provider</button>
          <button type="button" class="codex-plus-tab-button" data-codex-plus-tab="userScripts" data-active="false">用户脚本</button>
        </div>
        <div class="codex-plus-modal-body">
          <div class="codex-plus-panel" data-codex-plus-panel="home">
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">后端连接</div><div class="codex-plus-row-description">定期检查 launcher 后端状态；连续失败后才提示修复，避免慢响应误报断开。</div></div>
              <div class="codex-plus-backend-status">
                <div class="codex-plus-backend-label" data-codex-backend-status="true" data-status="checking">正在检查后端…</div>
                <button type="button" class="codex-plus-backend-repair" data-codex-backend-repair="true" hidden>修复后端运行</button>
              </div>
            </div>
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">插件市场解锁</div><div class="codex-plus-row-description">API Key 模式下扩展插件市场请求，尽量显示完整插件列表。</div></div>
              <button type="button" class="codex-plus-toggle" data-codex-plus-setting="pluginMarketplaceUnlock"><span></span></button>
            </div>
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">特殊插件强制安装</div><div class="codex-plus-row-description">解除 App unavailable / 应用不可用导致的前端安装禁用。</div></div>
              <button type="button" class="codex-plus-toggle" data-codex-plus-setting="forcePluginInstall"><span></span></button>
            </div>
            <div class="codex-plus-row">
              <div>
                <div class="codex-plus-row-title">模型白名单解锁</div>
                <div class="codex-plus-row-description">开启后读取 Codex config/env 里的 OpenAI-compatible provider，只展示模型和兼容状态，不展示 token。</div>
                <div class="codex-plus-model-compat-warning" data-codex-model-compat-warning="true" hidden></div>
                <div class="codex-plus-model-catalog" data-codex-model-catalog="true">未启用模型目录读取。</div>
              </div>
              <div class="codex-plus-model-actions">
                <button type="button" class="codex-plus-toggle" data-codex-plus-setting="modelWhitelistUnlock"><span></span></button>
                <button type="button" class="codex-plus-action-button" data-codex-model-catalog-refresh="true">刷新模型</button>
              </div>
            </div>
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">会话删除</div><div class="codex-plus-row-description">在会话列表悬停显示删除按钮，并支持撤销。</div></div>
              <button type="button" class="codex-plus-toggle" data-codex-plus-setting="sessionDelete"><span></span></button>
            </div>
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">Markdown 导出</div><div class="codex-plus-row-description">在会话列表显示导出按钮，按本地 rollout 导出带时间戳的 Markdown。</div></div>
              <button type="button" class="codex-plus-toggle" data-codex-plus-setting="markdownExport"><span></span></button>
            </div>
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">会话项目移动</div><div class="codex-plus-row-description">在会话列表悬停显示移动按钮，可移动到普通对话或其他本地项目。</div></div>
              <button type="button" class="codex-plus-toggle" data-codex-plus-setting="projectMove"><span></span></button>
            </div>
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">对话 Timeline</div><div class="codex-plus-row-description">在对话右侧显示用户提问时间线，悬停查看摘要，点击跳转。</div></div>
              <button type="button" class="codex-plus-toggle" data-codex-plus-setting="conversationTimeline"><span></span></button>
            </div>
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">Provider History Manager</div><div class="codex-plus-row-description">本地 SQLite bridge 优先跨 provider 查询历史；运行中监听 model_provider 变化；路径自动修复，provider metadata 只在兼容模式手动收敛。</div></div>
              <button type="button" class="codex-plus-toggle" data-codex-backend-setting="providerSyncEnabled"><span></span></button>
            </div>
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">原生菜单栏位置</div><div class="codex-plus-row-description">把 Dex 菜单插入顶部原生菜单栏；默认关闭以避免页面重渲染冲突。</div></div>
              <button type="button" class="codex-plus-toggle" data-codex-plus-setting="nativeMenuPlacement"><span></span></button>
            </div>
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">打开 DevTools</div><div class="codex-plus-row-description">打开当前 Codex 页面开发者工具，方便查看用户脚本报错。</div></div>
              <button type="button" class="codex-plus-action-button" data-codex-open-devtools="true">打开 DevTools</button>
            </div>
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">关于 Dex</div><div class="codex-plus-about">Dex 是通过外部 launcher 注入的增强菜单，不修改 Codex App 原始安装文件。<br>GitHub: <a href="https://github.com/lgdy88/codex-enhance" target="_blank" rel="noreferrer">https://github.com/lgdy88/codex-enhance</a></div></div>
            </div>
            <div class="codex-plus-row">
              <div><div class="codex-plus-row-title">提出问题</div><div class="codex-plus-row-description">打开 GitHub Issues 反馈问题或建议。</div></div>
              <button type="button" class="codex-plus-issue-button" data-codex-plus-issue="true">提出问题</button>
            </div>
          </div>
          <div class="codex-plus-panel" data-codex-plus-panel="provider" hidden>
            <div class="codex-plus-row">
              <div>
                <div class="codex-plus-row-title">诊断 / 修复</div>
                <div class="codex-plus-row-description">显示历史查询通道、rollout provider 分布、SQLite provider 分布、\\\\? 路径数量、最近 50 命中和项目可见数量。</div>
                <div class="codex-plus-user-script-warning">兼容模式收敛 provider metadata 前会备份；它只保证列表可见，不保证 encrypted_content 能跨账号或跨 provider 续聊。</div>
                <div class="codex-plus-provider-diagnostics" data-codex-provider-diagnostics="true">正在读取诊断信息…</div>
              </div>
              <div class="codex-plus-provider-actions">
                <button type="button" class="codex-plus-action-button" data-codex-provider-refresh="true">刷新诊断</button>
                <button type="button" class="codex-plus-action-button" data-codex-provider-repair-paths="true">修复路径</button>
                <button type="button" class="codex-plus-action-button codex-plus-danger-button" data-codex-provider-converge="true">收敛到当前 provider</button>
                <button type="button" class="codex-plus-action-button codex-plus-danger-button" data-codex-provider-quarantine-state="true">隔离脏库</button>
              </div>
            </div>
          </div>
          <div class="codex-plus-panel" data-codex-plus-panel="userScripts" hidden>
            <div class="codex-plus-row" data-codex-user-scripts-section="true">
              <div>
                <div class="codex-plus-row-title">用户脚本</div>
                <div class="codex-plus-row-description">启用用户脚本：自动加载内置目录和用户配置目录中的 .js 文件。</div>
                <div class="codex-plus-user-script-warning">禁用后需重载页面或重启 Dex 才能完全移除已执行效果。</div>
                <div class="codex-plus-user-script-dirs" data-codex-user-script-dirs="true">正在读取脚本目录…</div>
                <div class="codex-plus-user-script-list" data-codex-user-script-list="true">正在读取用户脚本…</div>
              </div>
              <div class="codex-plus-user-script-actions">
                <button type="button" class="codex-plus-toggle" data-codex-user-scripts-enabled="true"><span></span></button>
                <button type="button" class="codex-plus-user-script-reload" data-codex-user-scripts-reload="true">重新加载用户脚本</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const closeButton = overlay.querySelector(".codex-plus-modal-close");
    closeButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      overlay.remove();
    }, true);
    overlay.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (event.target === overlay || target?.closest(".codex-plus-modal-close")) {
        overlay.remove();
        return;
      }
      const tabButton = target?.closest("[data-codex-plus-tab]");
      if (tabButton) {
        selectCodexPlusTab(tabButton.getAttribute("data-codex-plus-tab"));
        return;
      }
      if (target?.closest("[data-codex-open-devtools]")) {
        postJson("/devtools/open", {});
        return;
      }
      if (target?.closest("[data-codex-backend-repair]")) {
        repairBackend();
        return;
      }
      const issueButton = target?.closest("[data-codex-plus-issue]");
      if (issueButton) {
        const issueUrl = "https://github.com/lgdy88/codex-enhance/issues";
        window.open(issueUrl, "_blank");
        return;
      }
      const userScriptsEnabled = target?.closest("[data-codex-user-scripts-enabled]");
      if (userScriptsEnabled) {
        loadUserScripts("/user-scripts/set-enabled", { enabled: userScriptsEnabled.dataset.enabled !== "true" });
        return;
      }
      const userScriptToggle = target?.closest("[data-codex-user-script-key]");
      if (userScriptToggle) {
        loadUserScripts("/user-scripts/set-script-enabled", { key: userScriptToggle.getAttribute("data-codex-user-script-key"), enabled: userScriptToggle.dataset.enabled !== "true" });
        return;
      }
      if (target?.closest("[data-codex-user-scripts-reload]")) {
        loadUserScripts("/user-scripts/reload", {});
        return;
      }
      if (target?.closest("[data-codex-provider-refresh]")) {
        loadProviderDiagnostics();
        return;
      }
      if (target?.closest("[data-codex-model-catalog-refresh]")) {
        loadCodexModelCatalog(true);
        return;
      }
      if (target?.closest("[data-codex-provider-repair-paths]")) {
        repairProviderPaths();
        return;
      }
      if (target?.closest("[data-codex-provider-converge]")) {
        convergeProviderMetadata();
        return;
      }
      if (target?.closest("[data-codex-provider-quarantine-state]")) {
        quarantineProviderStateDb();
        return;
      }
      const toggle = target?.closest("[data-codex-plus-setting]");
      if (toggle) {
        const key = toggle.getAttribute("data-codex-plus-setting");
        setCodexPlusSetting(key, !codexPlusSettings()[key]);
        if (key === "modelWhitelistUnlock") loadCodexModelCatalog(true);
        return;
      }
      const backendToggle = target?.closest("[data-codex-backend-setting]");
      if (backendToggle) {
        const key = backendToggle.getAttribute("data-codex-backend-setting");
        setBackendSetting(key, !codexPlusBackendSettings[key]).then(refreshProviderHistoryUi);
        return;
      }
    }, true);
    document.body.appendChild(overlay);
    renderCodexPlusMenu();
    refreshCodexPlusBackendToggles();
    renderBackendStatus();
    loadBackendSettings();
    renderCodexModelCatalog();
    if (codexPlusModelUnlockEnabled()) loadCodexModelCatalog();
    loadUserScripts();
  }

  function findNativeMenuInsertionPoint() {
    if (!codexPlusSettings().nativeMenuPlacement) return null;
    const header = document.querySelector(selectors.appHeader);
    const menuBar = header?.querySelector(selectors.nativeMenuBar);
    if (menuBar) {
      const buttons = Array.from(menuBar.querySelectorAll("button")).filter((button) => !button.closest(`#${codexPlusMenuId}`));
      return { parent: menuBar, before: buttons[buttons.length - 1]?.nextSibling || null, nativeButtonClass: buttons[buttons.length - 1]?.className || "" };
    }
    const contextSurface = header?.querySelector(selectors.headerContextMenuSurface);
    const buttons = Array.from(contextSurface?.querySelectorAll?.("button") || [])
      .filter((button) => !button.closest(`#${codexPlusMenuId}`) && button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0);
    const nativeButton = buttons.find((button) => !button.parentElement?.classList?.contains("inline-flex")) || buttons[0];
    const parent = nativeButton?.parentElement;
    if (!parent) return null;
    return { parent, before: nativeButton, nativeButtonClass: nativeButton.className || "" };
  }

  function removeDuplicateCodexPlusMenus(keep) {
    document.querySelectorAll(`#${codexPlusMenuId}, [data-codex-plus-menu="true"]`).forEach((node) => {
      if (node !== keep) node.remove();
    });
    Array.from(document.querySelectorAll("button")).forEach((button) => {
      if ((button.textContent || "").trim() === `${codexPlusDisplayName} ${codexPlusVersion}` && !button.closest(`#${codexPlusMenuId}`)) {
        button.remove();
      }
    });
  }

  function configureCodexPlusTrigger(menu, trigger, nativeButtonClass) {
    if (!trigger) return;
    if (nativeButtonClass) trigger.className = normalizeCodexPlusTriggerClassName(nativeButtonClass);
    if (trigger.dataset.codexPlusTriggerInstalled === "5") return;
    trigger.dataset.codexPlusTriggerInstalled = "5";
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCodexPlusModal();
    }, true);
  }

  function normalizeCodexPlusTriggerClassName(className) {
    const classes = String(className || "").split(/\s+/).filter(Boolean);
    const incompatibleNativeGroupClasses = new Set(["gap-0", "rounded-l-none", "border-l-0", "pl-0.5", "pr-1.5"]);
    const hasIncompatibleNativeGroupClass = classes.some((name) => incompatibleNativeGroupClasses.has(name));
    const normalized = classes.filter((name) => !incompatibleNativeGroupClasses.has(name));
    if (hasIncompatibleNativeGroupClass) {
      ["gap-1", "rounded-lg", "border-l", "px-2"].forEach((name) => {
        if (!normalized.includes(name)) normalized.push(name);
      });
    }
    return normalized.join(" ");
  }

  function numericCssValue(value) {
    const parsed = Number.parseFloat(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function setCssPropIfChanged(menu, prop, value) {
    if (menu.style.getPropertyValue(prop) !== value) {
      menu.style.setProperty(prop, value);
    }
  }

  function headerTitleRegion(header) {
    const candidates = Array.from(header?.querySelectorAll?.('[data-state], [class*="truncate"], [class*="text-base"]') || []);
    return candidates.find((node) => {
      if (!node?.querySelector?.('[data-state], button')) return false;
      if (!node.textContent?.trim()) return false;
      return node.closest?.(".draggable") || node.closest?.('[class*="grid-cols-[minmax(0,1fr)]"]');
    }) || null;
  }

  function isHeaderToolbarButton(button, header, rect) {
    if (!button || button.closest?.(`#${codexPlusMenuId}`)) return false;
    if (!(rect.width > 0 && rect.height > 0 && rect.left > window.innerWidth / 2)) return false;
    const buttonCluster = button.closest(".ms-auto.flex.shrink-0.items-center");
    if (buttonCluster && header?.contains(buttonCluster)) return true;
    const titleRegion = headerTitleRegion(header);
    if (titleRegion?.contains?.(button)) return false;
    return !!button.closest?.('[class*="ms-auto"][class*="shrink-0"][class*="items-center"]');
  }

  function updateFloatingCodexPlusMenuPosition(menu) {
    if (!menu?.classList?.contains(codexPlusMenuFloatingClass)) return;
    const header = document.querySelector(selectors.appHeader) || document.querySelector("header");
    if (!header) return;
    const toolbarButtons = Array.from(header.querySelectorAll("button"))
      .map((button) => ({ button, rect: button.getBoundingClientRect() }))
      .filter(({ button, rect }) => isHeaderToolbarButton(button, header, rect))
      .sort((left, right) => left.rect.left - right.rect.left);
    const anchor = toolbarButtons[0];
    if (anchor) {
      const measuredGap = toolbarButtons[1] ? toolbarButtons[1].rect.left - toolbarButtons[0].rect.right : 0;
      const styles = anchor.button.parentElement ? getComputedStyle(anchor.button.parentElement) : null;
      const gap = Math.max(numericCssValue(styles?.columnGap || styles?.gap), measuredGap, 0);
      setCssPropIfChanged(menu, "--codex-plus-menu-top", `${anchor.rect.top}px`);
      setCssPropIfChanged(menu, "--codex-plus-menu-height", `${anchor.rect.height}px`);
      setCssPropIfChanged(menu, "--codex-plus-menu-right", `${Math.max(0, window.innerWidth - anchor.rect.left + gap)}px`);
      return;
    }

    const headerRect = header.getBoundingClientRect();
    if (headerRect.height) {
      setCssPropIfChanged(menu, "--codex-plus-menu-top", `${headerRect.top}px`);
      setCssPropIfChanged(menu, "--codex-plus-menu-height", `${headerRect.height}px`);
    }
    menu.style.removeProperty("--codex-plus-menu-right");
  }

  function installCodexPlusMenu() {
    const existing = document.getElementById(codexPlusMenuId);
    removeDuplicateCodexPlusMenus(existing);
    let insertionPoint = findNativeMenuInsertionPoint();
    if (existing && existing.dataset.codexPlusMenuVersion !== "6") {
      existing.remove();
      insertionPoint = findNativeMenuInsertionPoint();
    } else if (existing && insertionPoint && existing.parentElement === insertionPoint.parent) {
      configureCodexPlusTrigger(existing, existing.querySelector("button"), insertionPoint.nativeButtonClass);
      removeDuplicateCodexPlusMenus(existing);
      return;
    } else if (existing && insertionPoint) {
      configureCodexPlusTrigger(existing, existing.querySelector("button"), insertionPoint.nativeButtonClass);
      existing.className = "";
      const safeBefore = insertionPoint.before?.parentElement === insertionPoint.parent ? insertionPoint.before : null;
      insertionPoint.parent.insertBefore(existing, safeBefore);
      removeDuplicateCodexPlusMenus(existing);
      return;
    }
    const menu = document.createElement("div");
    menu.id = codexPlusMenuId;
    menu.dataset.codexPlusMenu = "true";
    menu.dataset.codexPlusMenuVersion = "6";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.textContent = `${codexPlusDisplayName} ${codexPlusVersion}`;
    const indicator = document.createElement("span");
    indicator.className = "codex-plus-backend-indicator";
    indicator.dataset.codexBackendIndicator = "true";
    indicator.dataset.status = codexPlusBackendStatus.status || "checking";
    trigger.prepend(indicator);
    const nativeButtonClass = insertionPoint?.nativeButtonClass || "codex-plus-trigger";
    configureCodexPlusTrigger(menu, trigger, nativeButtonClass);
    menu.appendChild(trigger);
    if (insertionPoint) {
      menu.className = "";
      const safeBefore = insertionPoint.before?.parentElement === insertionPoint.parent ? insertionPoint.before : null;
      insertionPoint.parent.insertBefore(menu, safeBefore);
    } else {
      menu.className = codexPlusMenuFloatingClass;
      document.documentElement.appendChild(menu);
      updateFloatingCodexPlusMenuPosition(menu);
    }
    removeDuplicateCodexPlusMenus(menu);
  }

  function reactFiberFrom(element) {
    const fiberKey = Object.keys(element).find((key) => key.startsWith("__reactFiber"));
    return fiberKey ? element[fiberKey] : null;
  }

  function authContextValueFrom(element) {
    for (let fiber = reactFiberFrom(element); fiber; fiber = fiber.return) {
      for (const value of [fiber.memoizedProps?.value, fiber.pendingProps?.value]) {
        if (value && typeof value === "object" && typeof value.setAuthMethod === "function" && "authMethod" in value) {
          return value;
        }
      }
    }
    return null;
  }

  function spoofChatGPTAuthMethod(element) {
    const auth = authContextValueFrom(element);
    if (!auth || auth.authMethod === "chatgpt") return false;
    auth.setAuthMethod("chatgpt");
    return true;
  }

  function pluginEntryButton() {
    const byIcon = document.querySelector(`${selectors.pluginNavButton} ${selectors.pluginSvgPath}`)?.closest("button");
    if (byIcon) return byIcon;
    return Array.from(document.querySelectorAll(selectors.pluginNavButton))
      .find((button) => /^(插件|Plugins)(\s+-\s+.*)?$/i.test((button.textContent || "").trim())) || null;
  }

  function labelUnlockedPluginEntry(button) {
    const labelTextNode = Array.from(button.querySelectorAll("span, div")).reverse()
      .flatMap((node) => Array.from(node.childNodes))
      .find((node) => node.nodeType === 3 && /^(插件|Plugins)( - 已解锁| - Unlocked)?$/i.test((node.nodeValue || "").trim()));
    if (!labelTextNode) return;
    const current = (labelTextNode.nodeValue || "").trim();
    labelTextNode.nodeValue = /^Plugins/i.test(current) ? "Plugins - Unlocked" : "插件 - 已解锁";
  }

  function enablePluginEntry() {
    if (!codexPlusSettings().pluginEntryUnlock) return;
    const pluginButton = pluginEntryButton();
    if (!pluginButton) return;
    spoofChatGPTAuthMethod(pluginButton);
    pluginButton.disabled = false;
    pluginButton.removeAttribute("disabled");
    pluginButton.style.display = "";
    pluginButton.querySelectorAll("*").forEach((node) => {
      node.style.display = "";
    });
    labelUnlockedPluginEntry(pluginButton);
    const reactPropsKey = Object.keys(pluginButton).find((key) => key.startsWith("__reactProps"));
    if (reactPropsKey) {
      pluginButton[reactPropsKey].disabled = false;
    }
    if (pluginButton.dataset.codexPluginEnabled === "true") return;
    pluginButton.dataset.codexPluginEnabled = "true";
    pluginButton.addEventListener("click", () => {
      spoofChatGPTAuthMethod(pluginButton);
    }, true);
  }

  function appServerRequestMethod(method, params) {
    if (method === "send-cli-request-for-host" && params?.method) return String(params.method);
    return String(method || "");
  }

  function patchPluginMarketplaceRequestParams(method, params) {
    if (method !== "list-plugins" || !params || typeof params !== "object") return params;
    const next = { ...params };
    const hadMarketplaceKinds = Object.prototype.hasOwnProperty.call(next, "marketplaceKinds");
    if (hadMarketplaceKinds) delete next.marketplaceKinds;
    sendCodexPlusDiagnostic("plugin_marketplace_request_expanded", {
      hadMarketplaceKinds,
      cwdCount: Array.isArray(next.cwds) ? next.cwds.length : 0,
    });
    return next;
  }

  function pluginMarketplaceAliasForName(name) {
    if (name === "openai-bundled") return "";
    if (name === "openai-curated") return "dex-openai-curated";
    if (name === "openai-primary-runtime") return "dex-openai-primary-runtime";
    return "";
  }

  function displayNameForPluginMarketplaceName(name, fallback) {
    if (name === "openai-bundled" || name === "dex-openai-bundled") return "OpenAI Plugins 1 (Dex)";
    if (name === "openai-curated" || name === "dex-openai-curated") return "OpenAI Plugins 2 (Dex)";
    if (name === "openai-primary-runtime" || name === "dex-openai-primary-runtime") return "OpenAI Plugins 3 (Dex)";
    return fallback;
  }

  function patchPluginMarketplaceObject(marketplace) {
    if (!marketplace || typeof marketplace !== "object" || marketplace.__codexPlusMarketplaceUnlockPatched) return false;
    const alias = pluginMarketplaceAliasForName(marketplace.name);
    if (!alias && !codexPluginOfficialMarketplaceName(marketplace.name)) return false;
    if (alias) marketplace.name = alias;
    const displayName = displayNameForPluginMarketplaceName(marketplace.name, marketplace.displayName || marketplace.title || marketplace.label || marketplace.name);
    if (!displayName || displayName === marketplace.name) return false;
    marketplace.displayName = displayName;
    marketplace.title = displayName;
    marketplace.label = displayName;
    if (marketplace.interface && typeof marketplace.interface === "object") {
      marketplace.interface = {
        ...marketplace.interface,
        displayName,
        name: displayName,
        title: displayName,
        label: displayName,
      };
    } else {
      marketplace.interface = { displayName, name: displayName, title: displayName, label: displayName };
    }
    marketplace.__codexPlusMarketplaceUnlockPatched = true;
    return true;
  }

  function restorePluginMarketplaceName(name) {
    if (name === "dex-openai-bundled") return "openai-bundled";
    if (name === "dex-openai-curated") return "openai-curated";
    if (name === "dex-openai-primary-runtime") return "openai-primary-runtime";
    return name;
  }

  function codexPluginOfficialMarketplaceName(name) {
    const restored = restorePluginMarketplaceName(name);
    return restored === "openai-bundled" || restored === "openai-curated" || restored === "openai-primary-runtime";
  }

  function isCodexPluginBuildFlavorFilter(callback, sample) {
    if (!Array.isArray(sample) || sample.length === 0 || typeof callback !== "function") return false;
    let source = "";
    try {
      source = Function.prototype.toString.call(callback);
    } catch {
      return false;
    }
    if (!source.includes("!u(e.marketplaceName)||e.marketplaceName===r")) return false;
    if (!sample.some((plugin) => codexPluginOfficialMarketplaceName(plugin?.marketplaceName))) return false;
    return sample.some((plugin) => codexPluginOfficialMarketplaceName(plugin?.marketplaceName) && !callback(plugin));
  }

  function isCodexPluginMarketplaceHiddenFilter(callback, sample) {
    if (!Array.isArray(sample) || sample.length === 0 || typeof callback !== "function") return false;
    let source = "";
    try {
      source = Function.prototype.toString.call(callback);
    } catch {
      return false;
    }
    if (!source.includes("!t.includes(e.name)")) return false;
    if (!sample.some((marketplace) => codexPluginOfficialMarketplaceName(marketplace?.name))) return false;
    return sample.some((marketplace) => codexPluginOfficialMarketplaceName(marketplace?.name) && !callback(marketplace));
  }

  function installPluginBuildFlavorFilterPatch() {
    if (window.__codexPluginBuildFlavorFilterPatch === codexPluginMarketplaceUnlockVersion) return;
    if (!codexPlusSettings().pluginMarketplaceUnlock) return;
    const originalFilter = Array.prototype.__codexPluginBuildFlavorOriginalFilter || Array.prototype.filter;
    if (!Array.prototype.__codexPluginBuildFlavorOriginalFilter) {
      Object.defineProperty(Array.prototype, "__codexPluginBuildFlavorOriginalFilter", {
        value: originalFilter,
        configurable: true,
        writable: true,
      });
    }
    if (Array.prototype.filter.__codexPluginBuildFlavorPatched === codexPluginMarketplaceUnlockVersion) {
      window.__codexPluginBuildFlavorFilterPatch = codexPluginMarketplaceUnlockVersion;
      return;
    }
    const patchedFilter = function codexPluginBuildFlavorFilterPatch(callback, thisArg) {
      if (isCodexPluginBuildFlavorFilter(callback, this)) {
        sendCodexPlusDiagnostic("plugin_build_flavor_filter_bypassed", { pluginCount: this.length });
        return Array.from(this);
      }
      if (isCodexPluginMarketplaceHiddenFilter(callback, this)) {
        sendCodexPlusDiagnostic("plugin_marketplace_hidden_filter_bypassed", { marketplaceCount: this.length });
        return Array.from(this);
      }
      return originalFilter.call(this, callback, thisArg);
    };
    patchedFilter.__codexPluginBuildFlavorPatched = codexPluginMarketplaceUnlockVersion;
    Array.prototype.filter = patchedFilter;
    window.__codexPluginBuildFlavorFilterPatch = codexPluginMarketplaceUnlockVersion;
    sendCodexPlusDiagnostic("plugin_build_flavor_filter_patch_installed", {});
  }

  function restorePluginMarketplaceRequestParams(params, method = "") {
    if (!params || typeof params !== "object") return params;
    let next = params;
    if (Array.isArray(params.marketplaceKinds)) {
      const nextKinds = params.marketplaceKinds.map((kind) => {
        if (kind === "remote:openai-curated") return "openai-curated";
        return restorePluginMarketplaceName(kind);
      });
      next = { ...next, marketplaceKinds: Array.from(new Set(nextKinds)) };
    }
    if (method === "install-plugin") {
      next = next === params ? { ...params } : { ...next };
      if (next.remoteMarketplaceName) next.remoteMarketplaceName = restorePluginMarketplaceName(next.remoteMarketplaceName);
      if (typeof next.marketplacePath === "string" && next.marketplacePath.startsWith("remote:")) {
        const remoteMarketplaceName = next.marketplacePath.slice("remote:".length);
        delete next.marketplacePath;
        next.remoteMarketplaceName = restorePluginMarketplaceName(remoteMarketplaceName);
      }
    }
    return next;
  }

  function patchPluginMarketplaceResult(method, result) {
    if (method !== "list-plugins") return result;
    let patchedCount = 0;
    try {
      const pluginMarketplaceCounts = {};
      if (Array.isArray(result?.marketplaces)) {
        result.marketplaces.forEach((marketplace) => {
          if (Array.isArray(marketplace?.plugins)) {
            marketplace.plugins.forEach((plugin) => {
              const name = plugin?.marketplaceName || marketplace?.name || "";
              if (name) pluginMarketplaceCounts[name] = (pluginMarketplaceCounts[name] || 0) + 1;
            });
          }
          if (patchPluginMarketplaceObject(marketplace)) patchedCount += 1;
        });
        sendCodexPlusDiagnostic("plugin_marketplace_response_debug", {
          marketplaces: result.marketplaces.map((marketplace) => ({
            name: marketplace?.name || "",
            path: marketplace?.path || null,
            displayName: marketplace?.displayName || marketplace?.interface?.displayName || null,
            pluginCount: Array.isArray(marketplace?.plugins) ? marketplace.plugins.length : null,
            remoteMarketplaceName: marketplace?.remoteMarketplaceName || null,
          })),
          pluginMarketplaceCounts,
        });
      }
      if (patchedCount > 0) {
        sendCodexPlusDiagnostic("plugin_marketplace_response_expanded", { patchedCount });
      }
    } catch (error) {
      sendCodexPlusDiagnostic("plugin_marketplace_response_patch_failed", {
        errorName: error?.name || "",
        errorMessage: error?.message || String(error),
      });
    }
    return result;
  }

  function patchPluginMarketplaceRequestClient(client) {
    if (!client || typeof client.sendRequest !== "function") return false;
    if (client.__codexPluginMarketplaceUnlockPatch === codexPluginMarketplaceUnlockVersion) return true;
    const originalSendRequest = client.__codexPluginMarketplaceOriginalSendRequest || client.sendRequest.bind(client);
    client.__codexPluginMarketplaceOriginalSendRequest = originalSendRequest;
    client.sendRequest = async function codexPluginMarketplacePatchedSendRequest(method, params, options) {
      const requestMethod = appServerRequestMethod(String(method || ""), params);
      const requestParams = patchPluginMarketplaceRequestParams(
        requestMethod,
        restorePluginMarketplaceRequestParams(params, requestMethod),
      );
      if (requestMethod === "install-plugin") {
        sendCodexPlusDiagnostic("plugin_install_request_debug", {
          method: String(method || ""),
          requestMethod,
          originalMarketplacePath: params?.marketplacePath || null,
          originalRemoteMarketplaceName: params?.remoteMarketplaceName || null,
          originalPluginName: params?.pluginName || null,
          requestMarketplacePath: requestParams?.marketplacePath || null,
          requestRemoteMarketplaceName: requestParams?.remoteMarketplaceName || null,
          requestPluginName: requestParams?.pluginName || null,
        });
      }
      try {
        const result = await originalSendRequest(method, requestParams, options);
        return patchPluginMarketplaceResult(requestMethod, result);
      } catch (error) {
        if (requestMethod === "install-plugin") {
          sendCodexPlusDiagnostic("plugin_install_request_failed", {
            method: String(method || ""),
            requestMethod,
            requestMarketplacePath: requestParams?.marketplacePath || null,
            requestRemoteMarketplaceName: requestParams?.remoteMarketplaceName || null,
            requestPluginName: requestParams?.pluginName || null,
            errorName: error?.name || "",
            errorMessage: error?.message || String(error),
          });
        }
        throw error;
      }
    };
    client.__codexPluginMarketplaceUnlockPatch = codexPluginMarketplaceUnlockVersion;
    return true;
  }

  function installPluginMarketplaceRequestPatch() {
    if (window.__codexPluginMarketplaceUnlockInstalled === codexPluginMarketplaceUnlockVersion) return;
    if (!codexPlusSettings().pluginMarketplaceUnlock) return;
    const patch = async () => {
      try {
        const module = await loadCodexAppModule("app-server-manager-signals-");
        const candidates = Object.values(module).filter((value) => value && typeof value === "object");
        let patchedCount = 0;
        for (const candidate of candidates) {
          if (patchPluginMarketplaceRequestClient(candidate)) patchedCount += 1;
          if (typeof candidate.sendRequest !== "function" && typeof candidate.get === "function") {
            try {
              if (patchPluginMarketplaceRequestClient(candidate.get())) patchedCount += 1;
            } catch {
            }
          }
        }
        if (patchedCount > 0) {
          window.__codexPluginMarketplaceUnlockInstalled = codexPluginMarketplaceUnlockVersion;
          sendCodexPlusDiagnostic("plugin_marketplace_request_patch_installed", {
            candidateCount: candidates.length,
            patchedCount,
          });
        } else {
          sendCodexPlusDiagnostic("plugin_marketplace_request_patch_not_found", {
            exportCount: Object.keys(module || {}).length,
            candidateCount: candidates.length,
          });
        }
      } catch (error) {
        sendCodexPlusDiagnostic("plugin_marketplace_request_patch_failed", {
          errorName: error?.name || "",
          errorMessage: error?.message || String(error),
        });
      }
    };
    void patch();
  }

  function pluginInstallCandidates() {
    return Array.from(document.querySelectorAll(selectors.disabledInstallButton));
  }

  function installButtonLabel(element) {
    return (element.textContent || "").trim();
  }

  function unblockButtonElement(button) {
    button.disabled = false;
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
    button.classList.remove("disabled", "opacity-50", "cursor-not-allowed", "pointer-events-none");
    button.style.pointerEvents = "auto";
    button.tabIndex = 0;
    const reactPropsKey = Object.keys(button).find((key) => key.startsWith("__reactProps"));
    if (reactPropsKey) {
      button[reactPropsKey].disabled = false;
      button[reactPropsKey]["aria-disabled"] = false;
    }
  }

  function labelForcedInstallButton(button) {
    const textNode = Array.from(button.childNodes).find((node) => node.nodeType === 3 && (/^安装\s/.test((node.nodeValue || "").trim()) || /^Install\s/.test((node.nodeValue || "").trim()) || (node.nodeValue || "").trim() === "强制安装"));
    if (textNode) {
      textNode.nodeValue = "强制安装";
    }
  }

  function unblockPluginInstallButtons() {
    if (!codexPlusSettings().forcePluginInstall) return;
    pluginInstallCandidates().forEach((button) => {
      const text = installButtonLabel(button);
      if (!/^安装\s/.test(text) && !/^Install\s/.test(text) && text !== "强制安装") return;
      unblockButtonElement(button);
      labelForcedInstallButton(button);
    });
  }

  function patchCodexModelWhitelist() {
    if (!codexPlusModelUnlockEnabled()) return;
    if (!codexPlusModelNames().length) {
      loadCodexModelCatalog();
      return;
    }
    patchStatsigModelWhitelist();
    patchReactModelState();
  }

  let cachedSessionRows = [];
  let cachedSessionRowsAt = 0;

  function sessionRows(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && now - cachedSessionRowsAt < 150) {
      cachedSessionRows = cachedSessionRows.filter((row) => row.isConnected);
      if (cachedSessionRows.length > 0) return cachedSessionRows;
    }

    cachedSessionRows = Array.from(document.querySelectorAll(selectors.sidebarThread));
    cachedSessionRowsAt = now;
    return cachedSessionRows;
  }

  function archivePageHintVisible() {
    if (window.location.href.includes("archive")) return true;
    if (document.querySelector('[data-codex-archive-page-row="true"], [data-codex-archive-delete-all]')) return true;
    const archiveNav = document.querySelector(selectors.archiveNav);
    if (archiveNav?.className?.includes?.("bg-token-list-hover-background")) return true;
    return !!Array.from(document.querySelectorAll("h1, h2, h3")).find((element) => (element.textContent || "").trim() === "已归档对话");
  }

  function archiveRowFromUnarchiveButton(button) {
    return button.closest('[data-codex-archive-page-row="true"]')
      || button.closest('[role="listitem"], [role="row"]')
      || button.closest(".flex.w-full.items-center.justify-between")
      || button.parentElement;
  }

  function archivedPageRows() {
    if (!archivePageHintVisible()) return [];
    const rows = Array.from(document.querySelectorAll("button")).filter((button) => (button.textContent || "").trim() === "取消归档").map(archiveRowFromUnarchiveButton).filter(Boolean);
    rows.forEach((row) => {
      row.dataset.codexArchivePageRow = "true";
      row.setAttribute("data-codex-archive-page-row", "true");
    });
    return rows;
  }

  function archivedSessionRows() {
    if (!archivePageHintVisible()) return [];
    return sessionRows().filter((row) => row.querySelector('button[aria-label="取消归档对话"]') || row.outerHTML.includes("取消归档") || row.outerHTML.includes("unarchive"));
  }

  function archivedRows() {
    if (!archivePageHintVisible()) return [];
    return [...archivedSessionRows(), ...archivedPageRows()];
  }

  function archivedPageVisible() {
    return archivePageHintVisible() && archivedRows().length > 0;
  }

  function sessionRefFromRow(row) {
    const href = row.getAttribute("href") || row.querySelector("a")?.getAttribute("href") || "";
    const idMatch = href.match(/(?:session|conversation|thread)[=/:-]([A-Za-z0-9_.-]+)/i) || href.match(/([A-Za-z0-9_-]{8,})$/);
    const codexThreadId = row.getAttribute("data-app-action-sidebar-thread-id") || "";
    const fallbackId = row.getAttribute("data-session-id") || row.getAttribute("data-testid") || "";
    const sessionId = codexThreadId || (idMatch && idMatch[1]) || fallbackId;
    const titleNode = row.querySelector(`${selectors.threadTitle}, .truncate.select-none, .truncate.text-base`);
    const rawTitle = (titleNode?.textContent || (titleNode ? "" : (row.textContent || "Untitled session")));
    const title = (titleNode ? rawTitle : rawTitle.replace(/\s*(导出|删除|移动|移出项目)(\s*(导出|删除|移动|移出项目))*$/g, "")).trim().slice(0, 160);
    return { session_id: sessionId, title };
  }

  async function postJson(path, payload) {
    if (!__codexSessionDeleteBridge) {
      return { status: "failed", message: "桥接不可用，请重启启动器" };
    }
    return await __codexSessionDeleteBridge(path, payload);
  }

  function sendCodexPlusDiagnostic(event, detail = {}) {
    postJson("/diagnostics/log", { event, ...detail }).catch(() => {});
  }

  function codexAppAssetUrl(namePart) {
    const urls = [
      ...Array.from(document.scripts || []).map((script) => script.src),
      ...Array.from(document.querySelectorAll("link[href]") || []).map((link) => link.href),
      ...performance.getEntriesByType("resource").map((entry) => entry.name),
    ].filter(Boolean);
    return urls.find((url) => url.includes("/assets/") && url.includes(namePart) && url.split("?")[0].endsWith(".js")) || "";
  }

  async function loadCodexAppModule(namePart) {
    if (!codexAppModulePromises.has(namePart)) {
      const promise = Promise.resolve().then(async () => {
        const url = codexAppAssetUrl(namePart);
        if (!url) throw new Error(`未找到 Codex App asset: ${namePart}`);
        return await import(url);
      }).catch((error) => {
        codexAppModulePromises.delete(namePart);
        throw error;
      });
      codexAppModulePromises.set(namePart, promise);
    }
    return await codexAppModulePromises.get(namePart);
  }

  function downloadMarkdown(filename, markdown) {
    if (!filename || typeof markdown !== "string") {
      throw new Error("导出结果不完整");
    }
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let codexStateApiPromise = null;
  let chatsSortInFlight = false;
  let chatsSortSignature = "";
  let chatsSortLastFetchAt = 0;

  async function codexStateApi() {
    codexStateApiPromise = codexStateApiPromise || import("./assets/vscode-api-Dc9pX2Bc.js");
    const api = await codexStateApiPromise;
    if (typeof api.n !== "function") throw new Error("Codex 状态 API 不可用");
    return api.n;
  }

  async function codexStateCall(method, params) {
    const call = await codexStateApi();
    return await call(method, params);
  }

  async function getCodexGlobalState(key) {
    const result = await codexStateCall("get-global-state", { params: { key } });
    return result && Object.prototype.hasOwnProperty.call(result, "value") ? result.value : result;
  }

  async function setCodexGlobalState(key, value) {
    return await codexStateCall("set-global-state", { params: { key, value } });
  }

  function objectGlobalState(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0)));
  }

  function threadIdVariants(sessionId) {
    if (typeof sessionId !== "string" || !sessionId.trim()) return [];
    const id = sessionId.trim();
    const bareId = id.startsWith("local:") ? id.slice("local:".length) : id;
    return uniqueValues([id, bareId, `local:${bareId}`]);
  }

  function projectMoveSessionKey(sessionId) {
    const variants = threadIdVariants(sessionId);
    const bareId = variants.find((id) => !id.startsWith("local:"));
    return bareId || variants[0] || "";
  }

  function uuidV7TimestampMs(sessionId) {
    const id = projectMoveSessionKey(sessionId).replaceAll("-", "");
    if (!/^[0-9a-fA-F]{12}/.test(id)) return 0;
    const timestamp = Number.parseInt(id.slice(0, 12), 16);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function numericTimestamp(value) {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
  }

  function timestampValueToMs(value) {
    const timestamp = numericTimestamp(value);
    if (!timestamp) return 0;
    return timestamp < 1000000000000 ? timestamp * 1000 : timestamp;
  }

  function sortMsForSession(sessionId, preferredValue) {
    return numericTimestamp(preferredValue) || uuidV7TimestampMs(sessionId);
  }

  function timestampMsFromPayload(payload) {
    return numericTimestamp(payload?.updated_at_ms) || timestampValueToMs(payload?.updated_at) || numericTimestamp(payload?.created_at_ms);
  }

  function relativeTimeLabel(timestampMs, nowMs = Date.now()) {
    const timestamp = numericTimestamp(timestampMs);
    if (!timestamp) return "";
    const elapsedSeconds = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
    if (elapsedSeconds < 60) return "刚刚";
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) return `${elapsedMinutes} 分`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `${elapsedHours} 小时`;
    const elapsedDays = Math.floor(elapsedHours / 24);
    if (elapsedDays < 7) return `${elapsedDays} 天`;
    const elapsedWeeks = Math.floor(elapsedDays / 7);
    if (elapsedWeeks < 5) return `${elapsedWeeks} 周`;
    const elapsedMonths = Math.floor(elapsedDays / 30);
    if (elapsedMonths < 12) return `${Math.max(1, elapsedMonths)} 月`;
    return `${Math.floor(elapsedDays / 365)} 年`;
  }

  function normalizeWorkspacePath(path) {
    const normalized = String(path || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    return normalized || String(path || "").trim();
  }

  function sameWorkspacePath(left, right) {
    const leftPath = normalizeWorkspacePath(left);
    const rightPath = normalizeWorkspacePath(right);
    return !!leftPath && !!rightPath && leftPath === rightPath;
  }

  function displayProjectName(path) {
    const trimmed = String(path || "").replace(/\/+$/, "");
    return trimmed.split(/[\\/]+/).filter(Boolean).pop() || trimmed || "未命名项目";
  }

  function normalizeProjectLabel(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function projectsSection() {
    return document.querySelector('[data-app-action-sidebar-section-heading="Projects"]');
  }

  function chatsSection() {
    return document.querySelector('[data-app-action-sidebar-section-heading="Chats"]');
  }

  function activeProjectPath() {
    const activeProject = Array.from(document.querySelectorAll('[data-app-action-sidebar-project-row]')).find((row) => row.getAttribute("aria-current") === "page" || row.dataset.active === "true");
    return activeProject?.getAttribute("data-app-action-sidebar-project-id") || nativeProjectTargets()[0]?.path || "";
  }

  function projectRowListItem(projectRow) {
    return projectRow.closest?.('[role="listitem"][aria-label]') || projectRow.closest?.('[role="listitem"]') || projectRow;
  }

  function nativeProjectTargets() {
    const section = projectsSection();
    const seen = new Set();
    const targets = [];
    Array.from(document.querySelectorAll('[data-app-action-sidebar-project-row]')).forEach((row) => {
      if (section && !section.contains(row)) return;
      const path = row.getAttribute("data-app-action-sidebar-project-id") || "";
      const normalizedPath = normalizeWorkspacePath(path);
      if (!normalizedPath || seen.has(normalizedPath)) return;
      const label = row.getAttribute("data-app-action-sidebar-project-label") || row.getAttribute("aria-label") || displayProjectName(path);
      seen.add(normalizedPath);
      targets.push({ kind: "project", label: String(label || displayProjectName(path)), description: path, path, normalizedPath, row, listItem: projectRowListItem(row) });
    });
    return targets;
  }

  function serializableProjectTarget(target) {
    return { kind: target.kind, label: target.label, description: target.description, path: target.path, normalizedPath: target.normalizedPath || normalizeWorkspacePath(target.path) };
  }

  function projectMoveTargets() {
    return [
      { kind: "projectless", label: "普通对话", description: "不属于任何项目", path: "", normalizedPath: "" },
      ...nativeProjectTargets().map(serializableProjectTarget),
    ];
  }

  function readLegacyProjectMoveProjection() {
    try {
      const parsed = JSON.parse(localStorage.getItem(legacyProjectMoveOverridesKey) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const now = Date.now();
      const next = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (!value || typeof value !== "object" || !value.targetCwd) continue;
        const sessionId = projectMoveSessionKey(value.sessionId || key);
        if (!sessionId) continue;
        next[sessionId] = {
          sessionId,
          targetKind: "project",
          targetCwd: String(value.targetCwd),
          targetLabel: String(value.targetLabel || displayProjectName(value.targetCwd)),
          title: String(value.title || ""),
          sortMs: sortMsForSession(sessionId, value.sortMs || value.updatedAtMs || value.updated_at_ms),
          sortMsTrusted: false,
          at: typeof value.at === "number" ? value.at : now,
        };
      }
      return next;
    } catch {
      return {};
    }
  }

  function readProjectMoveProjection() {
    try {
      const parsed = JSON.parse(localStorage.getItem(projectMoveProjectionKey) || "{}");
      const raw = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      const merged = { ...readLegacyProjectMoveProjection(), ...raw };
      const now = Date.now();
      const projection = {};
      for (const [key, value] of Object.entries(merged)) {
        if (!value || typeof value !== "object") continue;
        const sessionId = projectMoveSessionKey(value.sessionId || key);
        if (!sessionId) continue;
        if (typeof value.at === "number" && now - value.at > projectMoveProjectionTtlMs) continue;
        const targetKind = value.targetKind === "projectless" ? "projectless" : "project";
        const targetCwd = String(value.targetCwd || value.path || "");
        if (targetKind === "project" && !targetCwd) continue;
        projection[sessionId] = {
          sessionId,
          targetKind,
          targetCwd,
          targetLabel: String(value.targetLabel || value.label || (targetKind === "projectless" ? "普通对话" : displayProjectName(targetCwd))),
          title: String(value.title || ""),
          sortMs: sortMsForSession(sessionId, value.sortMs || value.updatedAtMs || value.updated_at_ms),
          sortMsTrusted: value.sortMsTrusted === true,
          at: typeof value.at === "number" ? value.at : now,
        };
      }
      return projection;
    } catch {
      return readLegacyProjectMoveProjection();
    }
  }

  function writeProjectMoveProjection(projection) {
    try {
      localStorage.setItem(projectMoveProjectionKey, JSON.stringify(projection || {}));
      localStorage.removeItem(legacyProjectMoveOverridesKey);
    } catch (error) {
      window.__codexProjectMoveProjectionFailures = window.__codexProjectMoveProjectionFailures || [];
      window.__codexProjectMoveProjectionFailures.push(String(error?.stack || error));
    }
  }

  function saveProjectMoveProjection(ref, target, sortMs) {
    const id = projectMoveSessionKey(ref.session_id);
    if (!id || !target) return;
    const projection = readProjectMoveProjection();
    projection[id] = {
      sessionId: id,
      targetKind: target.kind === "projectless" ? "projectless" : "project",
      targetCwd: target.path || "",
      targetLabel: target.label || (target.kind === "projectless" ? "普通对话" : displayProjectName(target.path)),
      title: ref.title || "",
      sortMs: sortMsForSession(ref.session_id, sortMs || target.sortMs),
      sortMsTrusted: target.sortMsTrusted === true,
      at: Date.now(),
    };
    writeProjectMoveProjection(projection);
  }

  function clearProjectMoveProjection(ref) {
    const projection = readProjectMoveProjection();
    const keys = threadIdVariants(ref.session_id).map(projectMoveSessionKey).filter(Boolean);
    let changed = false;
    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(projection, key)) {
        delete projection[key];
        changed = true;
      }
    });
    if (changed) writeProjectMoveProjection(projection);
  }

  function removeProjectThreadStateSession(ref) {
    const keys = new Set(threadIdVariants(ref?.session_id || "").map(projectMoveSessionKey).filter(Boolean));
    if (!keys.size) return;
    Object.values(window.__codexProjectThreadsState || {}).forEach((state) => {
      if (!Array.isArray(state?.threads)) return;
      state.threads = state.threads.filter((thread) => !keys.has(projectMoveSessionKey(thread?.session_id || "")));
    });
  }

  async function clearDeletedSessionGlobalState(ref) {
    const variants = threadIdVariants(ref?.session_id || "");
    if (!variants.length) return;
    const variantSet = new Set(variants);
    const existingIds = await getCodexGlobalState("projectless-thread-ids").catch(() => []);
    if (Array.isArray(existingIds)) {
      const nextIds = existingIds.filter((id) => !variantSet.has(String(id || "")));
      if (nextIds.length !== existingIds.length) await setCodexGlobalState("projectless-thread-ids", nextIds);
    }
    const hints = objectGlobalState(await getCodexGlobalState("thread-workspace-root-hints").catch(() => ({})));
    let changed = false;
    variants.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(hints, id)) {
        delete hints[id];
        changed = true;
      }
    });
    if (changed) await setCodexGlobalState("thread-workspace-root-hints", hints);
  }

  async function cleanupDeletedSessionState(ref) {
    clearProjectMoveProjection(ref);
    removeProjectThreadStateSession(ref);
    try {
      await clearDeletedSessionGlobalState(ref);
    } catch (error) {
      window.__codexSessionDeleteCleanupFailures = window.__codexSessionDeleteCleanupFailures || [];
      window.__codexSessionDeleteCleanupFailures.push(String(error?.stack || error));
    }
  }

  function refreshAfterSessionDelete(ref) {
    resetProjectThreadState();
    scheduleChatsSortCorrection(0);
    refreshProjectThreadFallbacks();
    refreshRecentConversationsForHost().finally(() => {
      projectMoveRefreshDelaysMs.forEach((delay) => setTimeout(() => {
        scheduleChatsSortCorrection(0);
        refreshProjectThreadFallbacks();
      }, delay));
    });
  }

  function projectionForSessionId(sessionId, projection = readProjectMoveProjection()) {
    const key = projectMoveSessionKey(sessionId);
    return key ? projection[key] || null : null;
  }

  function projectRowFromListItem(projectItem) {
    if (!projectItem) return null;
    if (projectItem.matches?.("[data-app-action-sidebar-project-row]")) return projectItem;
    return projectItem.querySelector?.("[data-app-action-sidebar-project-row]") || null;
  }

  function targetPath(target) {
    return target?.path || target?.targetCwd || "";
  }

  function targetLabel(target) {
    return target?.label || target?.targetLabel || displayProjectName(targetPath(target));
  }

  function projectItemMatchesTarget(projectItem, target) {
    const projectRow = projectRowFromListItem(projectItem);
    const projectPath = projectRow?.getAttribute?.("data-app-action-sidebar-project-id") || "";
    if (projectPath && sameWorkspacePath(projectPath, targetPath(target))) return true;
    const actual = normalizeProjectLabel(projectRow?.getAttribute?.("data-app-action-sidebar-project-label") || projectItem?.getAttribute?.("aria-label"));
    const labels = uniqueValues([targetLabel(target), displayProjectName(targetPath(target))]).map(normalizeProjectLabel).filter(Boolean);
    return !!actual && labels.includes(actual);
  }

  function findProjectListItem(target) {
    const nativeTarget = nativeProjectTargets().find((project) => sameWorkspacePath(project.path, targetPath(target)));
    if (nativeTarget?.listItem) return nativeTarget.listItem;
    const section = projectsSection();
    if (!section) return null;
    return Array.from(section.querySelectorAll('[role="listitem"][aria-label]')).find((item) => projectItemMatchesTarget(item, target)) || null;
  }

  async function writeClipboardText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  function closestProjectListItem(row) {
    const item = row.closest?.('[role="listitem"][aria-label]');
    return item?.closest?.('[data-app-action-sidebar-section-heading="Projects"]') ? item : null;
  }

  function rowIsInChats(row) {
    return !!row.closest?.('[data-app-action-sidebar-section-heading="Chats"]');
  }

  function chatsThreadList() {
    return chatsSection()?.querySelector?.('[role="list"][aria-label="对话"], [role="list"]') || null;
  }

  function rowIsUnderTargetProject(row, target) {
    const item = closestProjectListItem(row);
    return !!item && projectItemMatchesTarget(item, target);
  }

  function rowIsUnderTarget(row, target) {
    return target?.targetKind === "projectless" || target?.kind === "projectless" ? rowIsInChats(row) : rowIsUnderTargetProject(row, target);
  }

  function rowListItem(row) {
    return row.closest?.('[role="listitem"]') || row;
  }

  function rowContentRoot(row) {
    return Array.from(row?.children || []).find((child) => String(child.className || "").includes("h-full w-full items-center")) || null;
  }

  function normalizedText(node) {
    return String(node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function classNameText(node) {
    return String(node?.className || "");
  }

  function isRelativeTimeText(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return /^(刚刚|just now|\d+\s*(秒|秒钟|分|分钟|小时|天|日|周|星期|个月|月|年|sec|secs|second|seconds|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years))$/i.test(value);
  }

  function nodeIsThreadTitle(row, node) {
    return Array.from(row?.querySelectorAll?.('[data-thread-title], .truncate.select-none, .truncate.text-base') || [])
      .some((titleNode) => titleNode === node || titleNode.contains(node));
  }

  function closestTimeWrapper(row, node) {
    const root = rowContentRoot(row) || row;
    let current = node?.parentElement || null;
    while (current && current !== root && current !== row) {
      const className = classNameText(current);
      if (current.dataset?.codexProjectMoveTimeWrapper === "true" || (className.includes("ml-[3px]") && className.includes("min-w-[26px]"))) return current;
      current = current.parentElement;
    }
    return null;
  }

  function nodeInsideStatusIcon(row, node) {
    const stop = closestTimeWrapper(row, node) || rowContentRoot(row) || row;
    let current = node || null;
    while (current && current !== stop && current !== row) {
      const className = classNameText(current);
      if (className.includes("animate-spin")) return true;
      if (className.includes("size-5") && className.includes("shrink-0")) return true;
      if (className.includes("contain-paint") && className.includes("contain-layout")) return true;
      current = current.parentElement;
    }
    return false;
  }

  function cleanupManagedStatusIconTimeNodes(row) {
    Array.from(row?.querySelectorAll?.('[data-codex-project-move-time="true"]') || []).forEach((node) => {
      if (!nodeInsideStatusIcon(row, node)) return;
      const text = normalizedText(node);
      delete node.dataset.codexProjectMoveTime;
      delete node.dataset.codexProjectMoveTimeMs;
      if (node.children.length === 0 && isRelativeTimeText(text)) node.textContent = "";
    });
  }

  function nodeLooksLikeTimeLabel(row, node) {
    if (nodeInsideStatusIcon(row, node)) return false;
    if (node?.dataset?.codexProjectMoveTime === "true") return true;
    if (node.children.length > 0) return false;
    const text = normalizedText(node);
    const className = classNameText(node);
    if ((className.includes("tabular-nums") || className.includes("text-token-description-foreground")) && text.length <= 24) return true;
    if (!isRelativeTimeText(text)) return false;
    const rowRect = row?.getBoundingClientRect?.();
    const nodeRect = node?.getBoundingClientRect?.();
    if (!rowRect || !nodeRect || rowRect.width <= 0 || nodeRect.width <= 0) return false;
    return nodeRect.left >= rowRect.left + rowRect.width * 0.45 || nodeRect.right >= rowRect.right - 96;
  }

  function rowTimeLabelCandidates(row) {
    cleanupManagedStatusIconTimeNodes(row);
    const root = rowContentRoot(row) || row;
    const raw = Array.from(root?.querySelectorAll?.("div, span, time, small") || []).filter((node) => {
      if (nodeIsThreadTitle(row, node)) return false;
      return nodeLooksLikeTimeLabel(row, node);
    });
    return raw.filter((node) => !raw.some((other) => other !== node && node.contains(other)));
  }

  function rowTimeLabelNode(row) {
    const candidates = rowTimeLabelCandidates(row);
    return candidates.find((node) => node.dataset?.codexProjectMoveTime !== "true" && !node.closest?.('[data-codex-project-move-time-wrapper="true"]')) || candidates[0] || null;
  }

  function removeTimeLabelNode(row, node) {
    if (!node || !row?.contains?.(node)) return;
    const wrapper = node.closest?.('[data-codex-project-move-time-wrapper="true"]') || closestTimeWrapper(row, node);
    if (wrapper && wrapper !== row && row.contains(wrapper)) {
      wrapper.remove();
      return;
    }
    node.remove();
  }

  function cleanupRowTimeLabels(row, keepNode) {
    if (!keepNode) return;
    rowTimeLabelCandidates(row).forEach((node) => {
      if (node === keepNode) return;
      if (node.dataset?.codexProjectMoveTime === "true" || node.closest?.('[data-codex-project-move-time-wrapper="true"]')) removeTimeLabelNode(row, node);
    });
  }

  function ensureRowTimeLabelNode(row) {
    const existing = rowTimeLabelNode(row);
    if (existing) {
      cleanupRowTimeLabels(row, existing);
      return existing;
    }
    const root = rowContentRoot(row);
    if (!root) return null;
    const wrapper = document.createElement("div");
    wrapper.className = "ml-[3px] flex items-center justify-end gap-1 min-w-[26px]";
    wrapper.dataset.codexProjectMoveTimeWrapper = "true";
    const inner = document.createElement("div");
    const label = document.createElement("div");
    label.className = "text-token-description-foreground text-sm leading-4 empty:hidden tabular-nums overflow-visible truncate text-right group-focus-within:opacity-0 group-hover:opacity-0";
    label.dataset.codexProjectMoveTime = "true";
    inner.appendChild(label);
    wrapper.appendChild(inner);
    root.appendChild(wrapper);
    return label;
  }

  function updateRowTimeLabel(row, sortMs) {
    const label = ensureRowTimeLabelNode(row);
    if (!label) return;
    const timestamp = numericTimestamp(sortMs);
    const text = relativeTimeLabel(timestamp);
    label.dataset.codexProjectMoveTime = "true";
    label.dataset.codexProjectMoveTimeMs = String(timestamp || 0);
    if (text && label.textContent !== text) label.textContent = text;
    cleanupRowTimeLabels(row, label);
  }

  function rowProjectionKind(row) {
    return row?.dataset?.codexProjectMoveTargetKind || rowListItem(row)?.dataset?.codexProjectMoveTargetKind || "";
  }

  function rowSortMs(row, ref = sessionRefFromRow(row), target = null) {
    return sortMsForSession(ref.session_id, target?.sortMs || row?.dataset?.codexProjectMoveSortMs || rowListItem(row)?.dataset?.codexProjectMoveSortMs);
  }

  function threadRowFromListItem(item) {
    if (!item) return null;
    if (item.matches?.("[data-app-action-sidebar-thread-id]")) return item;
    return item.querySelector?.("[data-app-action-sidebar-thread-id]") || null;
  }

  function rowPinned(row) {
    return row?.getAttribute?.("data-app-action-sidebar-thread-pinned") === "true" || rowListItem(row)?.getAttribute?.("data-app-action-sidebar-thread-pinned") === "true";
  }

  function insertRowItemByTime(list, item, row, target) {
    const ref = sessionRefFromRow(row);
    const sortMs = rowSortMs(row, ref, target);
    item.dataset.codexProjectMoveSortMs = String(sortMs || 0);
    row.dataset.codexProjectMoveSortMs = String(sortMs || 0);
    if (target?.sortMsTrusted) updateRowTimeLabel(row, sortMs);
    const pinned = rowPinned(row);
    const sessionKey = projectMoveSessionKey(ref.session_id);
    const existingItems = Array.from(list.children).filter((child) => child !== item);
    let firstNonThreadItem = null;
    for (const child of existingItems) {
      const childRow = threadRowFromListItem(child);
      if (!childRow) {
        firstNonThreadItem = firstNonThreadItem || child;
        continue;
      }
      const childPinned = rowPinned(childRow);
      if (childPinned && !pinned) continue;
      if (!childPinned && pinned) {
        list.insertBefore(item, child);
        return;
      }
      const childRef = sessionRefFromRow(childRow);
      const childSortMs = rowSortMs(childRow, childRef);
      const childKey = projectMoveSessionKey(childRef.session_id);
      if (sortMs > childSortMs || (sortMs === childSortMs && sessionKey > childKey)) {
        list.insertBefore(item, child);
        return;
      }
    }
    if (firstNonThreadItem) {
      list.insertBefore(item, firstNonThreadItem);
      return;
    }
    list.appendChild(item);
  }

  function projectMoveInjectedList(projectItem) {
    let list = projectItem.querySelector('[data-codex-project-move-injected-list="true"]');
    if (!list) {
      const body = Array.from(projectItem.children).find((child) => child.classList?.contains("overflow-hidden")) || projectItem;
      list = document.createElement("div");
      list.setAttribute("role", "list");
      list.setAttribute("data-codex-project-move-injected-list", "true");
      list.className = "flex flex-col";
      body.appendChild(list);
    }
    return list;
  }

  function projectThreadList(projectItem, target) {
    const targetCwd = targetPath(target);
    const projectLists = Array.from(projectItem.querySelectorAll("[data-app-action-sidebar-project-list-id]"));
    return projectLists.find((list) => sameWorkspacePath(list.getAttribute("data-app-action-sidebar-project-list-id"), targetCwd))
      || projectLists[0]
      || projectMoveInjectedList(projectItem);
  }

  function projectEmptyStateNodes(projectItem) {
    const emptyLabels = new Set(["暂无对话", "No conversations"]);
    return Array.from(projectItem.querySelectorAll("div, span")).filter((node) => {
      if (node.classList?.contains("overflow-hidden")) return false;
      if (node.closest('[data-app-action-sidebar-thread-id], [data-codex-project-move-injected-list="true"], [data-codex-project-thread-list="true"]')) return false;
      return emptyLabels.has(normalizeProjectLabel(node.textContent));
    });
  }

  function setProjectEmptyStateHidden(projectItem, hidden) {
    projectEmptyStateNodes(projectItem).forEach((node) => {
      if (hidden) {
        node.dataset.codexProjectMoveEmptyHidden = "true";
        node.classList.add("codex-project-move-hidden");
      } else if (node.dataset.codexProjectMoveEmptyHidden === "true") {
        delete node.dataset.codexProjectMoveEmptyHidden;
        node.classList.remove("codex-project-move-hidden");
      }
    });
  }

  function nativeProjectRows(projectItem) {
    if (!projectItem) return [];
    return Array.from(projectItem.querySelectorAll(selectors.sidebarThread))
      .filter((row) => row.dataset.codexProjectThreadInjected !== "true");
  }

  function visibleProjectThreadList(projectItem) {
    return Array.from(projectItem.querySelectorAll("[data-app-action-sidebar-project-list-id]"))
      .find((list) => list.offsetParent !== null) || null;
  }

  function projectThreadFallbackList(projectItem) {
    let list = projectItem.querySelector('[data-codex-project-thread-list="true"]');
    if (!list) {
      const body = Array.from(projectItem.children).find((child) => child.classList?.contains("overflow-hidden")) || projectItem;
      list = document.createElement("div");
      list.setAttribute("role", "list");
      list.setAttribute("data-codex-project-thread-list", "true");
      list.dataset.codexProjectThreadsVersion = codexProjectThreadsVersion;
      body.appendChild(list);
    }
    return list;
  }

  function projectThreadTitle(thread) {
    return String(thread?.title || "Untitled").replace(/\s+/g, " ").trim().slice(0, 180) || "Untitled";
  }

  function projectThreadRef(thread) {
    return { session_id: `local:${projectMoveSessionKey(thread?.session_id || "")}`, title: projectThreadTitle(thread) };
  }

  function projectThreadSortMs(thread) {
    return timestampMsFromPayload(thread) || sortMsForSession(thread?.session_id, thread?.updated_at_ms || thread?.updated_at);
  }

  function createProjectThreadRow(thread, projectPath) {
    const ref = projectThreadRef(thread);
    const row = document.createElement("div");
    row.className = "group relative h-token-nav-row cursor-interaction rounded-lg px-row-x py-row-y text-sm hover:bg-token-list-hover-background focus-visible:outline-offset-[-2px] codex-project-thread-row";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("data-app-action-sidebar-thread-id", ref.session_id);
    row.setAttribute("data-app-action-sidebar-thread-kind", "local");
    row.setAttribute("data-app-action-sidebar-thread-pinned", "false");
    row.setAttribute("data-app-action-sidebar-thread-row", "");
    row.setAttribute("data-app-action-sidebar-thread-title", ref.title);
    row.dataset.codexProjectThreadInjected = "true";
    row.dataset.codexProjectMoveSortMs = String(projectThreadSortMs(thread) || 0);
    row.dataset.codexProjectThreadCwd = projectPath || String(thread?.cwd || "");
    row.innerHTML = `<div class="flex h-full w-full items-center text-sm leading-4"><span class="codex-project-thread-title truncate select-none" data-thread-title>${escapeHtml(ref.title)}</span></div>`;
    attachProjectThreadOpenHandlers(row, thread);
    updateRowTimeLabel(row, row.dataset.codexProjectMoveSortMs);
    tryAttachButton(row);
    return row;
  }

  function createProjectThreadRowItem(row) {
    const item = document.createElement("div");
    item.setAttribute("role", "listitem");
    item.className = "after:block after:h-px after:content-[''] last:after:hidden";
    item.dataset.codexProjectThreadItem = "true";
    item.appendChild(row);
    return item;
  }

  function projectThreadRowItem(row) {
    return row.closest?.('[data-codex-project-thread-item="true"]') || null;
  }

  function ensureProjectThreadRowItem(list, row) {
    const existingItem = projectThreadRowItem(row);
    if (existingItem) return existingItem;
    const item = createProjectThreadRowItem(row);
    if (!item.parentElement) list.appendChild(item);
    return item;
  }

  function attachProjectThreadOpenHandlers(row, thread) {
    row.addEventListener("click", (event) => openProjectThreadFromEvent(event, row, thread));
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openProjectThreadFromEvent(event, row, thread);
    });
  }

  function openProjectThreadFromEvent(event, row, thread) {
    if (event.defaultPrevented || event.target?.closest?.("button")) return;
    openProjectThread(row, thread).catch((error) => showToast(`打开会话失败：${String(error?.message || error)}`, null));
  }

  async function openProjectThread(row, thread) {
    const threadId = projectMoveSessionKey(thread?.session_id || sessionRefFromRow(row).session_id);
    if (!threadId) throw new Error("未找到会话 ID");
    await loadProjectThreadIntoCodex(threadId);
    window.location.assign(`/local/${encodeURIComponent(threadId)}?hostId=local`);
  }

  async function loadProjectThreadIntoCodex(threadId) {
    try {
      const signals = await import("./assets/app-server-manager-signals-C1h8B-R-.js");
      if (typeof signals.rn === "function") {
        await signals.rn("load-recent-conversation-ids-for-host", { hostId: "local", conversationIds: [threadId] });
        await signals.rn("prewarm-conversation-for-host", { hostId: "local", conversationId: threadId });
      }
    } catch (error) {
      window.__codexProjectThreadOpenFailures = window.__codexProjectThreadOpenFailures || [];
      window.__codexProjectThreadOpenFailures.push(String(error?.stack || error));
    }
  }

  async function appServerThreadList(projectCwd, limit = 30, cursor = "") {
    if (!providerHistoryEnabled()) return null;
    if (codexProviderHistoryTransport.appServer === "unavailable") return null;
    try {
      const signals = await import("./assets/app-server-manager-signals-C1h8B-R-.js");
      if (typeof signals.rn !== "function") {
        updateProviderHistoryTransport({ appServer: "unavailable", message: "app-server bridge 不可用" });
        return null;
      }
      const result = await signals.rn("thread/list", {
        modelProviders: [],
        cwd: workspacePathVariants(projectCwd),
        limit,
        cursor: cursor || undefined,
        sortKey: "updated_at",
      });
      updateProviderHistoryTransport({ mode: "app-server", appServer: "available", message: "app-server 查询成功" });
      return result;
    } catch (error) {
      window.__codexProviderHistoryAppServerFailures = window.__codexProviderHistoryAppServerFailures || [];
      window.__codexProviderHistoryAppServerFailures.push(String(error?.stack || error));
      updateProviderHistoryTransport({ appServer: "unavailable", message: providerHistoryErrorSummary(error) });
      return null;
    }
  }

  function providerHistoryErrorSummary(error) {
    return String(error?.message || error?.stack || error || "unknown").split("\n", 1)[0].slice(0, 160);
  }

  function workspacePathVariants(projectCwd) {
    const raw = String(projectCwd || "").trim();
    if (!raw) return [];
    const normalized = raw.replace(/\//g, "\\");
    const variants = [raw, normalized];
    if (normalized.startsWith("\\\\?\\")) variants.push(normalized.slice(4));
    else if (/^[A-Za-z]:\\/.test(normalized)) variants.push(`\\\\?\\${normalized}`);
    return uniqueValues(variants);
  }

  function normalizeThreadListResponse(result) {
    if (!result || typeof result !== "object") return null;
    const rawThreads = Array.isArray(result.threads) ? result.threads : Array.isArray(result.items) ? result.items : Array.isArray(result.conversations) ? result.conversations : [];
    if (!rawThreads.length && !result.next_cursor && !result.nextCursor && !result.cursor) return null;
    return {
      status: "ok",
      threads: rawThreads.map(normalizeAppServerThread).filter(Boolean),
      next_cursor: result.next_cursor || result.nextCursor || result.cursor || "",
      has_more: !!(result.has_more || result.hasMore || result.next_cursor || result.nextCursor),
    };
  }

  function normalizeAppServerThread(thread) {
    const id = thread?.id || thread?.thread_id || thread?.conversationId || thread?.conversation_id || thread?.session_id;
    if (!id) return null;
    return {
      session_id: id,
      title: thread.title || thread.name || "Untitled",
      cwd: thread.cwd || thread.workspace || thread.project_cwd || "",
      model_provider: thread.model_provider || thread.modelProvider || "",
      updated_at: thread.updated_at || thread.updatedAt || "",
      updated_at_ms: thread.updated_at_ms || thread.updatedAtMs || "",
      created_at_ms: thread.created_at_ms || thread.createdAtMs || "",
    };
  }

  async function fetchProjectThreads(projectPath, state) {
    const localResult = await postJson("/project-threads", { project_cwd: projectPath, limit: 30, cursor: state.cursor }).catch((error) => ({ status: "failed", message: providerHistoryErrorSummary(error), threads: [] }));
    if (localResult?.status === "ok") {
      updateProviderHistoryTransport({ mode: "local-sqlite", message: "本地 SQLite 查询成功" });
      return localResult;
    }
    const appServerResult = normalizeThreadListResponse(await appServerThreadList(projectPath, 30, state.cursor));
    if (appServerResult) return appServerResult;
    return localResult || { status: "failed", threads: [] };
  }

  function visibleProjectThreadRows(projectItem) {
    return nativeProjectRows(projectItem).filter((row) => row.offsetParent !== null);
  }

  function visibleProjectThreadFallbackRows(projectItem) {
    return Array.from(projectItem?.querySelectorAll?.('[data-codex-project-thread-list="true"] [data-app-action-sidebar-thread-id]') || [])
      .filter((row) => row.offsetParent !== null);
  }

  function renderedProjectThreadIds(projectItem) {
    return new Set(nativeProjectRows(projectItem).map((row) => projectMoveSessionKey(sessionRefFromRow(row).session_id)).filter(Boolean));
  }

  function projectThreadStateKey(projectPath) {
    return normalizeWorkspacePath(projectPath || "");
  }

  function projectThreadState(projectPath) {
    const key = projectThreadStateKey(projectPath);
    window.__codexProjectThreadsState[key] = window.__codexProjectThreadsState[key] || { visibleLimit: projectThreadVisibleLimit, cursor: "", hasMore: false, threads: [] };
    return window.__codexProjectThreadsState[key];
  }

  function resetProjectThreadState() {
    window.__codexProjectThreadsState = {};
  }

  function projectThreadCandidates(projectItem, threads) {
    const existingIds = renderedProjectThreadIds(projectItem);
    return threads.filter((thread) => !existingIds.has(projectMoveSessionKey(thread?.session_id || "")));
  }

  function projectCanRenderFallback(projectItem) {
    return !!projectItem && projectItem.offsetParent !== null && !!visibleProjectThreadList(projectItem);
  }

  function renderProjectThreadFallback(projectItem, projectPath, threads) {
    if (!projectCanRenderFallback(projectItem)) return;
    const state = projectThreadState(projectPath);
    const visibleSlots = Math.max(0, state.visibleLimit);
    const candidates = projectThreadCandidates(projectItem, threads).slice(0, visibleSlots);
    const list = projectThreadFallbackList(projectItem);
    const existing = new Map(Array.from(list.querySelectorAll("[data-app-action-sidebar-thread-id]")).map((row) => [projectMoveSessionKey(row.getAttribute("data-app-action-sidebar-thread-id")), row]));
    const nextIds = new Set();
    candidates.forEach((thread) => upsertProjectThreadFallbackRow(list, existing, nextIds, thread, projectPath));
    removeMissingProjectThreadRows(existing, nextIds);
    renderProjectThreadMoreButton(list, projectItem, projectPath, state, threads.length);
    setProjectEmptyStateHidden(projectItem, candidates.length > 0 || visibleProjectThreadRows(projectItem).length > 0);
  }

  function renderProjectThreadMoreButton(list, projectItem, projectPath, state, knownCount) {
    list.querySelector("[data-codex-project-thread-more]")?.remove();
    if (!state.hasMore && knownCount <= state.visibleLimit) return;
    const more = document.createElement("button");
    more.type = "button";
    more.className = "codex-project-thread-more";
    more.setAttribute("data-codex-project-thread-more", "true");
    more.textContent = state.hasMore ? "显示更多" : "显示更多已加载对话";
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      loadMoreProjectThreads(projectItem, projectPath).catch((error) => showToast(`加载更多失败：${String(error?.message || error)}`, null));
    }, true);
    list.appendChild(more);
  }

  async function loadMoreProjectThreads(projectItem, projectPath) {
    const state = projectThreadState(projectPath);
    state.visibleLimit += projectThreadVisibleLimit;
    if (state.hasMore && state.cursor) {
      const result = await fetchProjectThreads(projectPath, state);
      if (result?.status === "ok" && Array.isArray(result.threads)) {
        mergeProjectThreadPage(state, result);
      }
    }
    renderProjectThreadFallback(projectItem, projectPath, state.threads || []);
  }

  function mergeProjectThreadPage(state, result) {
    const byId = new Map((state.threads || []).map((thread) => [projectMoveSessionKey(thread?.session_id || ""), thread]));
    result.threads.forEach((thread) => {
      const key = projectMoveSessionKey(thread?.session_id || "");
      if (key) byId.set(key, thread);
    });
    state.threads = Array.from(byId.values()).sort((left, right) => projectThreadSortMs(right) - projectThreadSortMs(left));
    state.cursor = result.next_cursor || "";
    state.hasMore = !!result.has_more || !!state.cursor;
  }

  function upsertProjectThreadFallbackRow(list, existing, nextIds, thread, projectPath) {
    const key = projectMoveSessionKey(thread?.session_id || "");
    if (!key) return;
    nextIds.add(key);
    const row = existing.get(key) || createProjectThreadRow(thread, projectPath);
    const item = ensureProjectThreadRowItem(list, row);
    const sortMs = projectThreadSortMs(thread);
    row.dataset.codexProjectMoveSortMs = String(sortMs || 0);
    row.setAttribute("data-app-action-sidebar-thread-title", projectThreadTitle(thread));
    const titleNode = row.querySelector("[data-thread-title]");
    if (titleNode) titleNode.textContent = projectThreadTitle(thread);
    insertRowItemByTime(list, item, row, { sortMs, sortMsTrusted: true });
  }

  function removeMissingProjectThreadRows(existing, nextIds) {
    existing.forEach((row, key) => {
      if (!nextIds.has(key)) (projectThreadRowItem(row) || row).remove();
    });
  }

  async function refreshProjectThreadFallbacks() {
    if (!codexPlusSettings().projectMove || !providerHistoryEnabled() || window.__codexProjectThreadsInFlight) return;
    const targets = nativeProjectTargets().filter((target) => projectCanRenderFallback(target.listItem));
    const incompleteTargets = targets.filter((target) => visibleProjectThreadFallbackRows(target.listItem).length < projectThreadState(target.path).visibleLimit);
    if (incompleteTargets.length === 0) return;
    window.__codexProjectThreadsInFlight = true;
    try {
      await Promise.all(incompleteTargets.map(async (target) => {
        const state = projectThreadState(target.path);
        if (!state.threads.length || (state.hasMore && state.threads.length < state.visibleLimit)) {
          const result = await fetchProjectThreads(target.path, state);
          if (result?.status === "ok" && Array.isArray(result.threads)) mergeProjectThreadPage(state, result);
        }
        renderProjectThreadFallback(target.listItem, target.path, state.threads || []);
      }));
    } finally {
      window.__codexProjectThreadsInFlight = false;
    }
  }

  function removeProjectThreadFallback(projectItem) {
    projectItem?.querySelector?.('[data-codex-project-thread-list="true"]')?.remove();
    setProjectEmptyStateHidden(projectItem, false);
  }

  function scheduleProjectThreadFallbacks(delay = 120) {
    if (!codexPlusSettings().projectMove || window.__codexProjectThreadsTimer) return;
    window.__codexProjectThreadsTimer = setTimeout(() => {
      if (window.__codexProjectMoveRuntimeId !== codexProjectMoveRuntimeId) return;
      window.__codexProjectThreadsTimer = null;
      refreshProjectThreadFallbacks().finally(() => scheduleProjectThreadFallbacks(projectThreadsRefreshIntervalMs));
    }, delay);
  }

  function updateProjectMoveEmptyStates() {
    document.querySelectorAll('[data-codex-project-move-injected-list="true"]').forEach((list) => {
      const projectItem = list.closest('[role="listitem"][aria-label]');
      const hasRows = Array.from(list.children).some((child) => child.querySelector?.("[data-app-action-sidebar-thread-id]") || child.matches?.("[data-app-action-sidebar-thread-id]"));
      if (!hasRows) list.remove();
      if (projectItem) setProjectEmptyStateHidden(projectItem, hasRows);
    });
    document.querySelectorAll('[data-codex-project-move-empty-hidden="true"]').forEach((node) => {
      const projectItem = node.closest('[role="listitem"][aria-label]');
      const list = projectItem?.querySelector?.('[data-codex-project-move-injected-list="true"]');
      if (!list || list.children.length === 0) {
        delete node.dataset.codexProjectMoveEmptyHidden;
        node.classList.remove("codex-project-move-hidden");
      }
    });
  }

  function moveRowToProjectList(row, target) {
    const projectItem = findProjectListItem(target);
    if (!projectItem) return false;
    const list = projectThreadList(projectItem, target);
    const item = rowListItem(row);
    if (!list) return false;
    insertRowItemByTime(list, item, row, target);
    cachedSessionRowsAt = 0;
    item.dataset.codexProjectMoveTargetKind = "project";
    item.dataset.codexProjectMoveTargetCwd = targetPath(target);
    row.dataset.codexProjectMoveTargetKind = "project";
    row.dataset.codexProjectMoveTargetCwd = targetPath(target);
    setProjectEmptyStateHidden(projectItem, true);
    return true;
  }

  function moveRowToChats(row, target = null) {
    const list = chatsThreadList();
    if (!list) return false;
    const item = rowListItem(row);
    insertRowItemByTime(list, item, row, target);
    cachedSessionRowsAt = 0;
    item.dataset.codexProjectMoveTargetKind = "projectless";
    row.dataset.codexProjectMoveTargetKind = "projectless";
    delete item.dataset.codexProjectMoveTargetCwd;
    delete row.dataset.codexProjectMoveTargetCwd;
    updateProjectMoveEmptyStates();
    return true;
  }

  function applyProjectMoveProjection() {
    if (!codexPlusSettings().projectMove) return;
    const projection = readProjectMoveProjection();
    const targetRowsById = new Map();
    const settledRefs = [];
    const now = Date.now();
    const rows = sessionRows(true);
    rows.forEach((row) => {
      const ref = sessionRefFromRow(row);
      const target = projectionForSessionId(ref.session_id, projection);
      if (target && rowIsUnderTarget(row, target)) {
        const rowId = projectMoveSessionKey(ref.session_id);
        const hadProjectionKind = !!rowProjectionKind(row);
        const existingRow = targetRowsById.get(rowId);
        if (existingRow && existingRow !== row) {
          const existingIsProjection = !!rowProjectionKind(existingRow);
          const currentIsProjection = !!rowProjectionKind(row);
          const rowToRemove = existingIsProjection && !currentIsProjection ? existingRow : row;
          rowListItem(rowToRemove).remove();
          if (rowToRemove === existingRow) targetRowsById.set(rowId, row);
          if (rowToRemove === row) return;
        } else {
          targetRowsById.set(rowId, row);
        }
        if (!hadProjectionKind && typeof target.at === "number" && now - target.at > projectMoveProjectionSettleMs) settledRefs.push(ref);
        const moved = target.targetKind === "projectless" ? moveRowToChats(row, target) : moveRowToProjectList(row, target);
        if (moved) targetRowsById.set(rowId, row);
        const projectItem = closestProjectListItem(row);
        if (projectItem) setProjectEmptyStateHidden(projectItem, true);
      }
    });
    rows.forEach((row) => {
      const ref = sessionRefFromRow(row);
      const rowId = projectMoveSessionKey(ref.session_id);
      const target = projectionForSessionId(ref.session_id, projection);
      if (!target) {
        const item = rowListItem(row);
        delete row.dataset.codexProjectMoveTargetKind;
        delete row.dataset.codexProjectMoveTargetCwd;
        delete item.dataset.codexProjectMoveTargetKind;
        delete item.dataset.codexProjectMoveTargetCwd;
        return;
      }
      if (rowIsUnderTarget(row, target)) return;
      if (targetRowsById.has(rowId)) {
        rowListItem(row).remove();
        return;
      }
      const moved = target.targetKind === "projectless" ? moveRowToChats(row, target) : moveRowToProjectList(row, target);
      if (moved) targetRowsById.set(rowId, row);
    });
    settledRefs.forEach(clearProjectMoveProjection);
    updateProjectMoveEmptyStates();
  }

  function scheduleProjectMoveProjection() {
    if (!codexPlusSettings().projectMove || window.__codexProjectMoveProjectionTimer) return;
    window.__codexProjectMoveProjectionTimer = setTimeout(() => {
      if (window.__codexProjectMoveRuntimeId !== codexProjectMoveRuntimeId) return;
      window.__codexProjectMoveProjectionTimer = null;
      applyProjectMoveProjection();
    }, 80);
  }

  async function refreshRecentConversationsForHost() {
    try {
      const signals = await import("./assets/app-server-manager-signals-C1h8B-R-.js");
      if (typeof signals.rn === "function") await signals.rn("refresh-recent-conversations-for-host", { hostId: "local", sortKey: "updated_at" });
    } catch (error) {
      window.__codexProjectMoveRefreshFailures = window.__codexProjectMoveRefreshFailures || [];
      window.__codexProjectMoveRefreshFailures.push(String(error?.stack || error));
    }
  }

  function refreshAfterProjectMove() {
    const refreshVisibleSidebar = () => {
      applyProjectMoveProjection();
      scheduleChatsSortCorrection(0);
    };
    refreshVisibleSidebar();
    refreshRecentConversationsForHost().finally(() => {
      projectMoveRefreshDelaysMs.forEach((delay) => setTimeout(refreshVisibleSidebar, delay));
    });
  }

  function refreshProviderHistoryUi() {
    resetProjectThreadState();
    refreshRecentConversationsForHost();
    scheduleChatsSortCorrection(0);
    refreshProjectThreadFallbacks();
    loadProviderDiagnostics();
  }

  function visibleChatsRows() {
    const list = chatsThreadList();
    if (!list) return [];
    return Array.from(list.children).map(threadRowFromListItem).filter(Boolean).filter((row) => rowIsInChats(row));
  }

  function chatsSortNeedsCorrection(rows) {
    let previousPinned = true;
    let previousSortMs = Infinity;
    let previousKey = "\uffff";
    for (const row of rows) {
      const pinned = rowPinned(row);
      const ref = sessionRefFromRow(row);
      const sortMs = rowSortMs(row, ref);
      const key = projectMoveSessionKey(ref.session_id);
      if (previousPinned && !pinned) {
        previousPinned = false;
        previousSortMs = sortMs;
        previousKey = key;
        continue;
      }
      if (!previousPinned && pinned) return true;
      if (sortMs > previousSortMs || (sortMs === previousSortMs && key > previousKey)) return true;
      previousSortMs = sortMs;
      previousKey = key;
    }
    return false;
  }

  function reorderChatsRows(rows) {
    const list = chatsThreadList();
    if (!list || rows.length < 2) return;
    const rowItems = new Set(rows.map(rowListItem));
    const firstNonThreadItem = Array.from(list.children).find((child) => !rowItems.has(child) && !threadRowFromListItem(child));
    const orderedRows = [...rows].sort((left, right) => {
      const leftPinned = rowPinned(left);
      const rightPinned = rowPinned(right);
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
      const leftRef = sessionRefFromRow(left);
      const rightRef = sessionRefFromRow(right);
      const leftSortMs = rowSortMs(left, leftRef);
      const rightSortMs = rowSortMs(right, rightRef);
      if (leftSortMs !== rightSortMs) return rightSortMs - leftSortMs;
      return projectMoveSessionKey(rightRef.session_id).localeCompare(projectMoveSessionKey(leftRef.session_id));
    });
    orderedRows.forEach((row) => list.insertBefore(rowListItem(row), firstNonThreadItem || null));
    cachedSessionRowsAt = 0;
  }

  async function applyChatsSortCorrection() {
    if (!codexPlusSettings().projectMove || chatsSortInFlight) return;
    const rows = visibleChatsRows();
    if (rows.length < 2) return;
    const refs = rows.map(sessionRefFromRow).filter((ref) => ref.session_id);
    const signature = refs.map((ref) => projectMoveSessionKey(ref.session_id)).join("|");
    const allRowsHaveSortMs = rows.every((row) => numericTimestamp(row.dataset.codexProjectMoveSortMs || rowListItem(row).dataset.codexProjectMoveSortMs));
    const shouldRefreshSortKeys = signature !== chatsSortSignature || !allRowsHaveSortMs || Date.now() - chatsSortLastFetchAt > chatsSortDbRefreshIntervalMs;
    if (!shouldRefreshSortKeys && !chatsSortNeedsCorrection(rows)) return;
    chatsSortInFlight = true;
    try {
      if (shouldRefreshSortKeys) {
        const result = await postJson("/thread-sort-keys", { sessions: refs }).catch(() => ({ status: "failed", sort_keys: [] }));
        chatsSortLastFetchAt = Date.now();
        const byId = new Map();
        if (result?.status === "ok" && Array.isArray(result?.sort_keys)) {
          result.sort_keys.forEach((item) => {
            const key = projectMoveSessionKey(String(item?.session_id || ""));
            if (key) byId.set(key, item);
          });
        }
        rows.forEach((row) => {
          const ref = sessionRefFromRow(row);
          const payload = byId.get(projectMoveSessionKey(ref.session_id));
          const trustedSortMs = timestampMsFromPayload(payload);
          const sortMs = trustedSortMs || sortMsForSession(ref.session_id, row.dataset.codexProjectMoveSortMs || rowListItem(row).dataset.codexProjectMoveSortMs);
          row.dataset.codexProjectMoveSortMs = String(sortMs || 0);
          rowListItem(row).dataset.codexProjectMoveSortMs = String(sortMs || 0);
          if (trustedSortMs) updateRowTimeLabel(row, trustedSortMs);
        });
      }
      if (chatsSortNeedsCorrection(rows)) reorderChatsRows(rows);
      chatsSortSignature = visibleChatsRows().map((row) => projectMoveSessionKey(sessionRefFromRow(row).session_id)).join("|");
    } finally {
      chatsSortInFlight = false;
    }
  }

  function scheduleChatsSortCorrection(delay = chatsSortRefreshIntervalMs) {
    if (!codexPlusSettings().projectMove || window.__codexProjectMoveChatsSortTimer) return;
    window.__codexProjectMoveChatsSortTimer = setTimeout(() => {
      if (window.__codexProjectMoveRuntimeId !== codexProjectMoveRuntimeId) return;
      window.__codexProjectMoveChatsSortTimer = null;
      applyChatsSortCorrection().catch((error) => {
        window.__codexProjectMoveSortFailures = window.__codexProjectMoveSortFailures || [];
        window.__codexProjectMoveSortFailures.push(String(error?.stack || error));
      }).finally(() => {
        if (codexPlusSettings().projectMove) scheduleChatsSortCorrection();
      });
    }, delay);
  }

  async function setProjectlessThreadIds(ref, mode) {
    const variants = threadIdVariants(ref.session_id);
    if (variants.length === 0) throw new Error("未找到会话 ID");
    const existingIds = await getCodexGlobalState("projectless-thread-ids").catch(() => []);
    const ids = Array.isArray(existingIds) ? existingIds : [];
    const variantSet = new Set(variants);
    const nextIds = mode === "add" ? uniqueValues([...ids, ...variants]) : ids.filter((id) => !variantSet.has(id));
    if (nextIds.length !== ids.length || nextIds.some((id, index) => id !== ids[index])) await setCodexGlobalState("projectless-thread-ids", nextIds);
  }

  async function clearThreadWorkspaceHints(ref) {
    const variants = threadIdVariants(ref.session_id);
    if (variants.length === 0) return;
    const hints = objectGlobalState(await getCodexGlobalState("thread-workspace-root-hints").catch(() => ({})));
    const hintKeys = variants.filter((id) => Object.prototype.hasOwnProperty.call(hints, id));
    if (hintKeys.length > 0) {
      hintKeys.forEach((id) => delete hints[id]);
      await setCodexGlobalState("thread-workspace-root-hints", hints);
    }
  }

  async function moveSessionToProjectless(ref) {
    if (!ref.session_id) throw new Error("未找到会话 ID");
    await setProjectlessThreadIds(ref, "add");
    await clearThreadWorkspaceHints(ref);
    const sortKey = await postJson("/thread-sort-key", ref).catch(() => ({}));
    return { status: "moved", session_id: ref.session_id, updated_at: sortKey?.updated_at, updated_at_ms: sortKey?.updated_at_ms, created_at_ms: sortKey?.created_at_ms };
  }

  function isNativeProjectTarget(target) {
    return target?.kind === "project" && nativeProjectTargets().some((project) => sameWorkspacePath(project.path, target.path));
  }

  async function moveSessionToProject(ref, target) {
    if (!ref.session_id) throw new Error("未找到会话 ID");
    if (!target?.path) throw new Error("目标项目路径为空");
    if (!isNativeProjectTarget(target)) throw new Error("目标项目不在 Codex 项目列表中");
    const result = await postJson("/move-thread-workspace", { ...ref, target_cwd: target.path });
    if (result.status !== "moved") throw new Error(result.message || "移动项目失败");
    await setProjectlessThreadIds(ref, "remove");
    await clearThreadWorkspaceHints(ref);
    return result;
  }

  function showToast(message, undoToken) {
    document.querySelectorAll(".codex-delete-toast").forEach((node) => node.remove());
    const toast = document.createElement("div");
    toast.className = "codex-delete-toast";
    toast.textContent = message;
    if (undoToken) {
      const undo = document.createElement("button");
      undo.textContent = "撤销";
      undo.addEventListener("click", async () => {
        const result = await postJson("/undo", { undo_token: undoToken });
        toast.textContent = result.message || "撤销完成";
        setTimeout(() => toast.remove(), 5000);
      });
      toast.appendChild(undo);
    }
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 10000);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function confirmDelete(title) {
    document.querySelectorAll(".codex-delete-confirm-overlay").forEach((node) => node.remove());
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "codex-delete-confirm-overlay";
      overlay.innerHTML = `
        <div class="codex-delete-confirm-content" role="dialog" aria-modal="true" aria-label="删除会话">
          <div class="codex-delete-confirm-title">删除会话</div>
          <div class="codex-delete-confirm-message">删除“${escapeHtml(title)}”？</div>
          <div class="codex-delete-confirm-actions">
            <button type="button" data-codex-delete-cancel="true">取消</button>
            <button type="button" data-codex-delete-confirm="true">删除</button>
          </div>
        </div>
      `;
      const finish = (value, event) => {
        event?.preventDefault();
        event?.stopPropagation();
        event?.target?.blur?.();
        overlay.remove();
        resolve(value);
      };
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest("[data-codex-delete-cancel]")) {
          finish(false, event);
          return;
        }
        if (event.target.closest("[data-codex-delete-confirm]")) {
          finish(true, event);
        }
      }, true);
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") finish(false, event);
      }, true);
      document.body.appendChild(overlay);
      overlay.querySelector("[data-codex-delete-cancel]")?.focus();
    });
  }

  function rowHref(row) {
    return row.getAttribute("href") || row.querySelector("a")?.getAttribute("href") || "";
  }

  function isCurrentSessionRow(row, ref) {
    if (row.getAttribute("aria-current") === "page" || row.getAttribute("aria-current") === "true") return true;
    const href = rowHref(row);
    if (href) {
      try {
        const url = new URL(href, window.location.href);
        if (url.href === window.location.href || url.pathname === window.location.pathname) return true;
      } catch {
        if (window.location.href.includes(href)) return true;
      }
    }
    return !!ref.session_id && window.location.href.includes(ref.session_id);
  }

  function releaseDeleteFocus(row, button) {
    button.blur();
    if (row.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  async function removeDeletedRow(row, button, ref) {
    releaseDeleteFocus(row, button);
    const shouldReload = isCurrentSessionRow(row, ref);
    await cleanupDeletedSessionState(ref);
    row.remove();
    refreshAfterSessionDelete(ref);
    if (shouldReload) {
      window.location.reload();
    }
  }

  function updateDeleteButtonOffsets() {
    sessionRows().forEach((row) => {
      const hasArchiveConfirm = Array.from(row.querySelectorAll("button")).some((button) => {
        const rect = button.getBoundingClientRect();
        const label = button.getAttribute("aria-label") || "";
        const text = (button.textContent || "").trim();
        if (button.classList.contains(buttonClass) || button.classList.contains(exportButtonClass) || label === "归档对话" || label === "置顶对话") return false;
        return text === "确认" || (text.length > 0 && rect.width > 0 && rect.width <= 36 && rect.x > row.getBoundingClientRect().right - 50);
      });
      row.classList.toggle("codex-archive-confirm-visible", hasArchiveConfirm);
    });
  }

  function openDeleteConfirmForRow(row, button, ref, event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    releaseDeleteFocus(row, button);
    confirmDelete(ref.title).then(async (confirmed) => {
      if (!confirmed) return;
      releaseDeleteFocus(row, button);
      const result = await postJson("/delete", ref);
      if (result.status === "server_deleted" || result.status === "local_deleted") {
        await removeDeletedRow(row, button, ref);
        showToast(result.message || "删除成功", result.undo_token);
      } else {
        showToast(result.message || "删除失败", null);
      }
    });
  }

  async function exportMarkdown(ref) {
    const result = await postJson("/export-markdown", ref);
    if (result.status === "exported" && result.filename && typeof result.markdown === "string") {
      downloadMarkdown(result.filename, result.markdown);
      showToast(result.message || "导出成功", null);
      return;
    }
    showToast(result.message || "导出失败", null);
  }

  function sortStateFromMoveResult(result, ref, row) {
    const trustedSortMs = timestampMsFromPayload(result);
    return { sortMs: trustedSortMs || rowSortMs(row, ref), sortMsTrusted: !!trustedSortMs };
  }

  function finishProjectMove(row, button, ref, target, message) {
    releaseDeleteFocus(row, button);
    button.disabled = false;
    button.textContent = "移动";
    saveProjectMoveProjection(ref, target, target.sortMs || rowSortMs(row, ref, target));
    if (target.kind === "projectless") moveRowToChats(row, target);
    refreshAfterProjectMove();
    showToast(message, null);
  }

  async function applyProjectMove(row, button, ref, target) {
    button.disabled = true;
    button.textContent = "移动中";
    try {
      if (target.kind === "projectless") {
        const result = await moveSessionToProjectless(ref);
        finishProjectMove(row, button, ref, { ...target, ...sortStateFromMoveResult(result, ref, row) }, `已移动到普通对话：“${ref.title || ref.session_id}”`);
      } else {
        const result = await moveSessionToProject(ref, target);
        finishProjectMove(row, button, ref, { ...target, ...sortStateFromMoveResult(result, ref, row) }, `已移动到“${target.label}”：“${ref.title || ref.session_id}”`);
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = "移动";
      showToast(`移动失败：${error?.message || error}`, null);
    }
  }

  async function openProjectMoveMenuForRow(row, button, ref, event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    releaseDeleteFocus(row, button);
    document.querySelectorAll(`.${projectMoveOverlayClass}`).forEach((node) => node.remove());
    const overlay = document.createElement("div");
    overlay.className = projectMoveOverlayClass;
    overlay.innerHTML = `
      <div class="codex-project-move-panel" role="dialog" aria-modal="true" aria-label="移动对话">
        <div class="codex-project-move-header">
          <div class="codex-project-move-title">移动“${escapeHtml(ref.title || ref.session_id)}”</div>
        </div>
        <div class="codex-project-move-list"><div class="codex-project-move-empty">加载项目中...</div></div>
      </div>
    `;
    const panel = overlay.querySelector(".codex-project-move-panel");
    const rect = button.getBoundingClientRect();
    const panelWidth = Math.min(360, Math.max(240, window.innerWidth - 32));
    panel.style.left = `${Math.max(16, Math.min(window.innerWidth - panelWidth - 16, rect.right - panelWidth))}px`;
    panel.style.top = `${Math.max(16, Math.min(window.innerHeight - 120, rect.bottom + 6))}px`;
    const close = () => overlay.remove();
    overlay.addEventListener("click", (clickEvent) => {
      if (clickEvent.target === overlay) close();
    }, true);
    overlay.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        close();
      }
    }, true);
    document.body.appendChild(overlay);
    try {
      const targets = projectMoveTargets();
      const list = overlay.querySelector(".codex-project-move-list");
      if (!list) return;
      list.innerHTML = "";
      if (targets.length === 0) {
        list.innerHTML = `<div class="codex-project-move-empty">没有可用目标</div>`;
        return;
      }
      for (const target of targets) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "codex-project-move-item";
        item.innerHTML = `
          <div class="codex-project-move-item-title">${escapeHtml(target.label)}</div>
          <div class="codex-project-move-item-path">${escapeHtml(target.description)}</div>
        `;
        item.addEventListener("click", async (selectEvent) => {
          selectEvent.preventDefault();
          selectEvent.stopPropagation();
          close();
          await applyProjectMove(row, button, ref, target);
        }, true);
        list.appendChild(item);
      }
      list.querySelector("button")?.focus();
    } catch (error) {
      close();
      showToast(`加载项目失败：${error?.message || error}`, null);
    }
  }

  function installDeleteButtonEventDelegation() {
    document.removeEventListener("pointerup", window.__codexSessionDeleteDocumentDeleteHandler, true);
    document.removeEventListener("click", window.__codexSessionDeleteDocumentDeleteHandler, true);
    const handler = (event) => {
      const button = event.target?.closest?.(`.${buttonClass}`);
      const row = button?.closest?.("[data-app-action-sidebar-thread-id]");
      if (!button || !row) return;
      const ref = sessionRefFromRow(row);
      if (!ref.session_id) return;
      openDeleteConfirmForRow(row, button, ref, event);
    };
    window.__codexSessionDeleteDocumentDeleteHandler = handler;
    document.addEventListener("pointerup", handler, true);
    document.addEventListener("click", handler, true);
  }

  function actionGroupFromRow(row) {
    return row.querySelector(`.${actionGroupClass}`);
  }

  function removeActionGroups(row) {
    row.querySelectorAll(`.${actionGroupClass}`).forEach((group) => group.remove());
    document.querySelectorAll(`.${moreMenuClass}`).forEach((menu) => {
      if (menu.__codexSessionMoreRow === row) menu.remove();
    });
    row.classList.remove("codex-session-more-open");
  }

  function stopActionButtonEvent(row, button, event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    releaseDeleteFocus(row, button);
  }

  function installActionButtonEvents(row, button, onActivate) {
    ["pointerdown", "mousedown", "mouseup", "touchstart"].forEach((eventName) => {
      button.addEventListener(eventName, (event) => stopActionButtonEvent(row, button, event), true);
    });
    button.addEventListener("pointerup", onActivate, true);
    button.addEventListener("click", onActivate, true);
  }

  function installMoreButtonEvents(row, button, onActivate) {
    ["pointerdown", "mousedown", "mouseup", "touchstart"].forEach((eventName) => {
      button.addEventListener(eventName, (event) => stopActionButtonEvent(row, button, event), true);
    });
    button.addEventListener("pointerup", onActivate, true);
    button.addEventListener("click", (event) => stopActionButtonEvent(row, button, event), true);
  }

  function refreshActionButton(originalButton, row, onActivate) {
    if (!originalButton.isConnected) return;
    const replacement = originalButton.cloneNode(true);
    installActionButtonEvents(row, replacement, onActivate);
    originalButton.replaceWith(replacement);
    return replacement;
  }

  function closeSessionMoreMenus(exceptMenu = null) {
    document.querySelectorAll(`.${moreMenuClass}`).forEach((menu) => {
      if (menu === exceptMenu) return;
      menu.hidden = true;
      menu.__codexSessionMoreRow?.classList?.remove("codex-session-more-open");
      menu.__codexSessionMoreButton?.setAttribute("aria-expanded", "false");
    });
  }

  function toggleSessionMoreMenu(row, button, menu) {
    const shouldOpen = menu.hidden;
    closeSessionMoreMenus(menu);
    menu.hidden = !shouldOpen;
    row.classList.toggle("codex-session-more-open", shouldOpen);
    button.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) positionSessionMoreMenu(button, menu);
  }

  function installSessionMoreMenuAutoClose(row, menu) {
    const closeIfOutside = () => {
      window.setTimeout(() => {
        if (menu.hidden) return;
        const active = document.activeElement;
        const group = menu.__codexSessionMoreGroup;
        if (group?.matches?.(":hover") || menu.matches?.(":hover") || menu.contains(active)) return;
        menu.hidden = true;
        row.classList.remove("codex-session-more-open");
        menu.__codexSessionMoreButton?.setAttribute("aria-expanded", "false");
      }, 80);
    };
    menu.__codexSessionMoreGroup?.addEventListener("pointerleave", closeIfOutside, true);
    menu.addEventListener("pointerleave", closeIfOutside, true);
    menu.addEventListener("focusout", closeIfOutside, true);
  }

  function positionSessionMoreMenu(button, menu) {
    menu.classList.remove("codex-session-more-menu-open-up");
    const rect = button.getBoundingClientRect();
    const menuWidth = Math.max(112, menu.getBoundingClientRect().width || 112);
    const menuHeight = Math.max(76, menu.getBoundingClientRect().height || 76);
    const left = Math.min(window.innerWidth - menuWidth - 8, Math.max(8, rect.right - menuWidth));
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(8, rect.bottom + 4)}px`;
    if (rect.bottom + 30 + menuHeight > window.innerHeight - 8) {
      menu.classList.add("codex-session-more-menu-open-up");
    }
  }

  function createSessionMoreMenuItem(label, icon, onActivate) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "codex-session-more-menu-item";
    item.innerHTML = `<span class="codex-session-more-menu-icon">${icon}</span><span>${escapeHtml(label)}</span>`;
    item.addEventListener("click", onActivate, true);
    return item;
  }

  function attachButton(row) {
    const settings = codexPlusSettings();
    if (!settings.sessionDelete && !settings.markdownExport && !settings.projectMove) {
      removeActionGroups(row);
      row.dataset.codexDeleteRow = "false";
      row.dataset.codexProjectMoveRow = "false";
      return;
    }
    const existingGroup = actionGroupFromRow(row);
    const existingDeleteButton = existingGroup?.querySelector(`.${buttonClass}`);
    const existingMoreButton = existingGroup?.querySelector(`.${moreButtonClass}`);
    const existingExportButton = existingGroup?.querySelector(`.${exportButtonClass}`);
    const existingMoveButton = existingGroup?.querySelector(`.${projectMoveButtonClass}`);
    const needsMoreMenu = settings.markdownExport || settings.projectMove;
    const hasUnexpectedDelete = !settings.sessionDelete && !!existingDeleteButton;
    const hasUnexpectedMore = !needsMoreMenu && !!existingMoreButton;
    const hasUnexpectedExport = !!existingExportButton;
    const hasUnexpectedMove = !!existingMoveButton;
    const missingDelete = settings.sessionDelete && !existingDeleteButton;
    const missingMore = needsMoreMenu && !existingMoreButton;
    const deleteReady = !settings.sessionDelete || existingDeleteButton?.dataset.codexDeleteVersion === codexDeleteVersion;
    const groupReady = existingGroup?.dataset.codexActionGroupVersion === codexActionGroupVersion;
    if (groupReady && deleteReady && !hasUnexpectedDelete && !hasUnexpectedMore && !hasUnexpectedExport && !hasUnexpectedMove && !missingDelete && !missingMore) return;
    removeActionGroups(row);
    row.dataset.codexDeleteRow = "false";
    row.dataset.codexProjectMoveRow = "false";
    const ref = sessionRefFromRow(row);
    if (!ref.session_id) return;
    row.dataset.codexDeleteRow = "true";
    row.dataset.codexProjectMoveRow = String(!!settings.projectMove);
    const group = document.createElement("div");
    group.className = actionGroupClass;
    group.dataset.codexActionGroupVersion = codexActionGroupVersion;
    if (settings.markdownExport || settings.projectMove) {
      const moreButton = document.createElement("button");
      moreButton.type = "button";
      moreButton.className = `${actionButtonClass} ${moreButtonClass}`;
      moreButton.setAttribute("aria-haspopup", "menu");
      moreButton.setAttribute("aria-expanded", "false");
      moreButton.textContent = "更多";
      const moreMenu = document.createElement("div");
      moreMenu.className = moreMenuClass;
      moreMenu.setAttribute("role", "menu");
      moreMenu.hidden = true;
      if (settings.markdownExport) {
        moreMenu.appendChild(createSessionMoreMenuItem("导出", "⇩", (event) => {
          stopActionButtonEvent(row, moreButton, event);
          closeSessionMoreMenus();
          exportMarkdown(ref);
        }));
      }
      if (settings.projectMove) {
        moreMenu.appendChild(createSessionMoreMenuItem("移动", "↗", (event) => {
          stopActionButtonEvent(row, moreButton, event);
          closeSessionMoreMenus();
          openProjectMoveMenuForRow(row, moreButton, ref, event);
        }));
      }
      const openMoreMenu = (event) => {
        stopActionButtonEvent(row, moreButton, event);
        toggleSessionMoreMenu(row, moreButton, moreMenu);
      };
      installMoreButtonEvents(row, moreButton, openMoreMenu);
      group.appendChild(moreButton);
      moreMenu.__codexSessionMoreRow = row;
      moreMenu.__codexSessionMoreButton = moreButton;
      moreMenu.__codexSessionMoreGroup = group;
      document.body.appendChild(moreMenu);
      installSessionMoreMenuAutoClose(row, moreMenu);
    }
    if (settings.sessionDelete) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = `${actionButtonClass} ${buttonClass}`;
      deleteButton.dataset.codexDeleteVersion = codexDeleteVersion;
      deleteButton.textContent = "删除";
      const openDeleteConfirm = (event) => openDeleteConfirmForRow(row, deleteButton, ref, event);
      installActionButtonEvents(row, deleteButton, openDeleteConfirm);
      group.appendChild(deleteButton);
      setTimeout(() => refreshActionButton(deleteButton, row, openDeleteConfirm), 0);
    }
    row.appendChild(group);
  }

  function tryAttachButton(row) {
    try {
      attachButton(row);
    } catch (error) {
      window.__codexSessionDeleteAttachButtonFailures = window.__codexSessionDeleteAttachButtonFailures || [];
      window.__codexSessionDeleteAttachButtonFailures.push(String(error?.stack || error));
    }
  }

  function reactArchivedThreadFromNode(node) {
    const reactKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    let fiber = reactKey ? node[reactKey] : null;
    for (let depth = 0; fiber && depth < 20; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps || fiber.pendingProps || {};
      if (props.archivedThread?.id) return props.archivedThread;
      const childThread = props.children?.props?.archivedThread;
      if (childThread?.id) return childThread;
    }
    return null;
  }

  function archivedThreadFromRow(row) {
    for (const node of [row, ...row.querySelectorAll("*")]) {
      const thread = reactArchivedThreadFromNode(node);
      if (thread?.id || thread?.sessionId) return thread;
    }
    return null;
  }

  function archivedRefFromRow(row) {
    const archivedThread = archivedThreadFromRow(row);
    if (archivedThread?.id || archivedThread?.sessionId) {
      return { session_id: archivedThread.id || archivedThread.sessionId, title: archivedThread.title || row.querySelector(".truncate.text-base")?.textContent?.trim() || "Untitled session" };
    }
    const sidebarRef = sessionRefFromRow(row);
    if (sidebarRef.session_id) return sidebarRef;
    const titleNode = row.querySelector(".truncate.text-base, [data-thread-title], a, div");
    const title = ((titleNode || row).textContent || "Untitled session")
      .replace("取消归档", "")
      .replace("删除", "")
      .replace(/\d{4}年\d{1,2}月\d{1,2}日.*$/, "")
      .replace(/\s+·\s+.*$/, "")
      .trim()
      .slice(0, 160);
    return { session_id: "", title };
  }

  async function resolveArchivedThread(row) {
    const ref = archivedRefFromRow(row);
    if (ref.session_id) return ref;
    const resolved = await postJson("/archived-thread", { title: ref.title });
    return resolved?.session_id ? resolved : ref;
  }

  function stopArchivedButtonEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function isArchiveTitleText(value) {
    return value === "已归档对话" || value === "Archived conversations";
  }

  function archiveTitleContainer() {
    const heading = Array.from(document.querySelectorAll("h1, h2, h3"))
      .find((element) => isArchiveTitleText((element.textContent || "").trim()));
    if (heading) return heading;
    return Array.from(document.querySelectorAll("h1, h2, h3, div, span"))
      .find((element) => isArchiveTitleText((element.textContent || "").trim()) && element.getBoundingClientRect().x > 350);
  }

  async function deleteArchivedSessions(rows) {
    let deleted = 0;
    for (const row of rows) {
      const ref = await resolveArchivedThread(row);
      if (!ref.session_id) continue;
      const result = await postJson("/delete", ref);
      if (result.status === "server_deleted" || result.status === "local_deleted") {
        await cleanupDeletedSessionState(ref);
        row.remove();
        refreshAfterSessionDelete(ref);
        deleted += 1;
      }
    }
    showToast(`已删除 ${deleted} 个归档会话`, null);
  }

  function attachArchivedPageDeleteButton(row) {
    const settings = codexPlusSettings();
    row.querySelectorAll("[data-codex-archive-row-action]").forEach((button) => button.remove());
    row.dataset.codexArchiveDeleteRow = "false";
    if (!settings.sessionDelete && !settings.markdownExport) return;
    const unarchiveButton = Array.from(row.querySelectorAll("button")).find((button) => (button.textContent || "").trim() === "取消归档");
    if (!unarchiveButton) return;
    row.dataset.codexArchiveDeleteRow = "true";
    row.dataset.codexArchiveRowActionsVersion = codexArchiveRowActionsVersion;
    let insertionPoint = unarchiveButton;
    if (settings.markdownExport) {
      const exportButton = document.createElement("button");
      exportButton.type = "button";
      exportButton.className = `codex-archive-delete-all codex-archive-row-button ${exportButtonClass}`;
      exportButton.dataset.codexArchiveRowAction = "export";
      exportButton.textContent = "导出";
      ["pointerdown", "mousedown", "mouseup", "touchstart"].forEach((eventName) => {
        exportButton.addEventListener(eventName, stopArchivedButtonEvent, true);
      });
      exportButton.addEventListener("click", async (event) => {
        stopArchivedButtonEvent(event);
        const ref = await resolveArchivedThread(row);
        if (!ref.session_id) {
          showToast("导出失败：未找到归档会话 ID", null);
          return;
        }
        await exportMarkdown(ref);
      }, true);
      insertionPoint.insertAdjacentElement("afterend", exportButton);
      insertionPoint = exportButton;
    }
    if (settings.sessionDelete) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = `codex-archive-delete-all codex-archive-row-button ${buttonClass}`;
      deleteButton.dataset.codexArchiveRowAction = "delete";
      deleteButton.textContent = "删除";
      ["pointerdown", "mousedown", "mouseup", "touchstart"].forEach((eventName) => {
        deleteButton.addEventListener(eventName, stopArchivedButtonEvent, true);
      });
      deleteButton.addEventListener("click", async (event) => {
        stopArchivedButtonEvent(event);
        const ref = await resolveArchivedThread(row);
        if (!ref.session_id) {
          showToast("删除失败：未找到归档会话 ID", null);
          return;
        }
        if (!(await confirmDelete(ref.title))) return;
        const result = await postJson("/delete", ref);
        if (result.status === "server_deleted" || result.status === "local_deleted") {
          await cleanupDeletedSessionState(ref);
          row.remove();
          refreshAfterSessionDelete(ref);
          showToast(result.message || "删除成功", result.undo_token);
        } else {
          showToast(result.message || "删除失败", null);
        }
      }, true);
      insertionPoint.insertAdjacentElement("afterend", deleteButton);
    }
  }

  function installArchivedDeleteAllButton() {
    const existingButton = document.querySelector("[data-codex-archive-delete-all]");
    if (!codexPlusSettings().sessionDelete || !archivedPageVisible()) {
      existingButton?.remove();
      return;
    }
    const rows = archivedRows();
    if (rows.length === 0) {
      existingButton?.remove();
      return;
    }
    if (existingButton?.dataset.codexArchiveDeleteAllVersion === codexArchiveDeleteAllVersion) return;
    existingButton?.remove();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "codex-archive-delete-all codex-archive-action-bar";
    Object.assign(button.style, {
      position: "static",
      marginLeft: "12px",
      verticalAlign: "middle",
      zIndex: "2147482999",
      cursor: "pointer",
      pointerEvents: "auto",
      maxWidth: "fit-content",
      alignSelf: "flex-start",
    });
    button.dataset.codexArchiveDeleteAll = "true";
    button.dataset.codexArchiveDeleteAllVersion = codexArchiveDeleteAllVersion;
    button.textContent = "删除全部归档";
    ["pointerdown", "mousedown", "mouseup", "touchstart"].forEach((eventName) => {
      button.addEventListener(eventName, stopArchivedButtonEvent, true);
    });
    const openArchivedDeleteAllConfirm = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const currentRows = archivedRows();
      if (currentRows.length === 0) return;
      if (!(await confirmDelete(`全部 ${currentRows.length} 个归档会话`))) return;
      await deleteArchivedSessions(currentRows);
    };
    button.addEventListener("pointerup", openArchivedDeleteAllConfirm, true);
    button.addEventListener("click", openArchivedDeleteAllConfirm, true);
    const title = archiveTitleContainer();
    if (title) {
      title.insertAdjacentElement("afterend", button);
    } else {
      document.body.appendChild(button);
    }
  }

  function truncateTimelineQuestion(text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    const chars = Array.from(normalized);
    if (chars.length <= timelineQuestionLimit) return normalized;
    return `${chars.slice(0, timelineQuestionLimit).join("")}…`;
  }

  function conversationTimelineRoot() {
    return document.querySelector(".thread-scroll-container") || document.querySelector("main") || document.querySelector('[role="main"]');
  }

  function timelineQuestionSelector() {
    return [
      '[data-message-author-role="user"]',
      '[data-testid="conversation-turn"][data-message-author-role="user"]',
      '[data-testid="conversation-turn"] [data-message-author-role="user"]',
      '[class*="user-message"]',
      '[class*="UserMessage"]',
    ].join(", ");
  }

  function nodeOrAncestorLooksLikeCodexUserBubble(node) {
    if (node.nodeType !== 1) return false;
    const className = String(node.className || "");
    if (className.includes("bg-token-foreground/5") && node.parentElement?.classList?.contains("items-end")) return true;
    const bubble = node.closest?.("[class*='bg-token-foreground/5']");
    return !!bubble?.parentElement?.classList?.contains("items-end");
  }

  function nodeLooksLikeCodexUserBubble(node) {
    if (nodeOrAncestorLooksLikeCodexUserBubble(node)) return true;
    return !!node.querySelector?.(".group.flex.w-full.flex-col.items-end.justify-end.gap-1 > [class*='bg-token-foreground/5']");
  }

  function nodeLooksLikeTimelineQuestion(node) {
    if (node.nodeType !== 1 || isExtensionUiNode(node)) return false;
    const questionSelector = timelineQuestionSelector();
    return !!node.matches?.(questionSelector) || !!node.closest?.(questionSelector) || !!node.querySelector?.(questionSelector) || nodeLooksLikeCodexUserBubble(node);
  }

  function conversationTimelineQuestionCandidates(root) {
    const explicitCandidates = Array.from(root.querySelectorAll([
      '[data-message-author-role="user"]',
      '[data-testid="conversation-turn"][data-message-author-role="user"]',
      '[data-testid="conversation-turn"] [data-message-author-role="user"]',
      '[class*="user-message"]',
      '[class*="UserMessage"]',
    ].join(", ")));
    const codexUserBubbles = Array.from(root.querySelectorAll(".group.flex.w-full.flex-col.items-end.justify-end.gap-1")).flatMap((group) => {
      return Array.from(group.children).filter((child) => String(child.className || "").includes("bg-token-foreground/5"));
    });
    return [...explicitCandidates, ...codexUserBubbles];
  }

  function extractTimelineQuestionText(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("button, svg, [aria-hidden='true'], .sr-only").forEach((child) => child.remove());
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  function timelineNodeId(node) {
    if (!node.__codexConversationTimelineNodeId) {
      window.__codexConversationTimelineNodeCounter += 1;
      node.__codexConversationTimelineNodeId = String(window.__codexConversationTimelineNodeCounter);
    }
    return node.__codexConversationTimelineNodeId;
  }

  function visibleTimelineNode(node) {
    if (!node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 || !!node.textContent?.trim();
  }

  function conversationTimelineQuestions() {
    const root = conversationTimelineRoot();
    if (!root?.matches?.('.thread-scroll-container, main, [role="main"]')) return [];
    const seen = new Set();
    return conversationTimelineQuestionCandidates(root).flatMap((node) => {
      if (node.closest('[data-app-action-sidebar-thread-id]')) return [];
      if (isExtensionUiNode(node)) return [];
      const target = node.closest('[data-testid="conversation-turn"]') || node;
      if (seen.has(target)) return [];
      seen.add(target);
      if (!visibleTimelineNode(target)) return [];
      const text = extractTimelineQuestionText(node);
      if (!text) return [];
      return [{ node: target, text, nodeId: timelineNodeId(target) }];
    });
  }

  function timelineScrollerViewportTop(scroller) {
    if (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) return 0;
    return scroller.getBoundingClientRect().top;
  }

  function timelineScrollableHeight(scroller) {
    return Math.max(1, scroller.scrollHeight - scroller.clientHeight);
  }

  function timelineRawMarkerTop(question, scroller) {
    const scrollOffset = scroller.scrollTop + question.node.getBoundingClientRect().top - timelineScrollerViewportTop(scroller);
    const percent = (scrollOffset / timelineScrollableHeight(scroller)) * 100;
    return Math.max(timelineMinTopPercent, Math.min(timelineMaxTopPercent, percent));
  }

  function timelineMarkerTops(questions, scroller) {
    if (questions.length <= 1) return [50];
    const minGap = Math.min(timelineMaxMarkerGapPercent, (timelineMaxTopPercent - timelineMinTopPercent) / Math.max(questions.length - 1, 1));
    const tops = questions.map((question) => timelineRawMarkerTop(question, scroller));
    for (let index = 1; index < tops.length; index += 1) {
      tops[index] = Math.max(tops[index], tops[index - 1] + minGap);
    }
    for (let index = tops.length - 1; index >= 0; index -= 1) {
      const maxForIndex = timelineMaxTopPercent - ((tops.length - 1 - index) * minGap);
      tops[index] = Math.min(tops[index], maxForIndex);
    }
    return tops.map((top) => Math.max(timelineMinTopPercent, Math.min(timelineMaxTopPercent, top)));
  }

  function removeConversationTimeline() {
    document.querySelectorAll(`.${timelineClass}`).forEach((node) => node.remove());
  }

  function nearestTimelineScroller(node) {
    for (let current = node?.parentElement; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight) return current;
    }
    return document.querySelector(".thread-scroll-container") || document.scrollingElement || document.documentElement;
  }

  function scrollTimelineTarget(node) {
    const scroller = nearestTimelineScroller(node);
    const nodeRect = node.getBoundingClientRect();
    const nextTop = scroller.scrollTop + nodeRect.top - timelineScrollerViewportTop(scroller) - (scroller.clientHeight / 2) + (nodeRect.height / 2);
    scroller.scrollTo({ top: nextTop, behavior: "smooth" });
  }

  function highlightTimelineTarget(node) {
    node.classList.remove(timelineTargetClass);
    void node.offsetWidth;
    node.classList.add(timelineTargetClass);
    clearTimeout(node.__codexConversationTimelineHighlightTimer);
    node.__codexConversationTimelineHighlightTimer = setTimeout(() => {
      node.classList.remove(timelineTargetClass);
    }, 1300);
  }

  function createConversationTimelineMarker(question) {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = timelineMarkerClass;
    marker.style.top = `${question.markerTop}%`;
    marker.setAttribute("aria-label", `跳转到：${truncateTimelineQuestion(question.text)}`);
    const tooltip = document.createElement("span");
    tooltip.className = timelineTooltipClass;
    tooltip.id = `codex-conversation-timeline-tooltip-${question.nodeId}`;
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = truncateTimelineQuestion(question.text);
    marker.setAttribute("aria-describedby", tooltip.id);
    marker.appendChild(tooltip);
    const activateMarker = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      document.querySelectorAll(`.${timelineMarkerClass}.codex-conversation-timeline-marker-active`).forEach((node) => {
        node.classList.remove("codex-conversation-timeline-marker-active");
      });
      marker.classList.add("codex-conversation-timeline-marker-active");
      scrollTimelineTarget(question.node);
      highlightTimelineTarget(question.node);
    };
    marker.addEventListener("pointerup", activateMarker, true);
    marker.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activateMarker(event);
    }, true);
    return marker;
  }

  function prepareTimelineQuestions(questions) {
    if (questions.length === 0) return [];
    const scroller = nearestTimelineScroller(questions[0].node);
    const tops = timelineMarkerTops(questions, scroller);
    return questions.map((question, index) => ({ ...question, markerTop: Number(tops[index].toFixed(3)) }));
  }

  function timelineSignature(questions) {
    return questions.map((question) => `${question.nodeId}:${Math.round(question.markerTop * 10)}:${truncateTimelineQuestion(question.text)}`).join("|");
  }

  function refreshConversationTimeline() {
    if (!codexPlusSettings().conversationTimeline) {
      removeConversationTimeline();
      return;
    }
    const questions = prepareTimelineQuestions(conversationTimelineQuestions());
    if (questions.length === 0) {
      removeConversationTimeline();
      return;
    }
    const signature = timelineSignature(questions);
    const existing = document.querySelector(`.${timelineClass}`);
    if (
      existing?.dataset.codexConversationTimelineVersion === codexConversationTimelineVersion &&
      existing?.dataset.codexConversationTimelineSignature === signature
    ) {
      return;
    }
    removeConversationTimeline();
    const container = document.createElement("div");
    container.className = timelineClass;
    container.dataset.codexConversationTimelineVersion = codexConversationTimelineVersion;
    container.dataset.codexConversationTimelineSignature = signature;
    const track = document.createElement("div");
    track.className = timelineTrackClass;
    container.appendChild(track);
    questions.forEach((question) => {
      container.appendChild(createConversationTimelineMarker(question));
    });
    document.body.appendChild(container);
  }

  function scanLightweight() {
    installStyle();
    installCodexPlusMenu();
    scheduleBackendHeartbeat();
    scheduleProviderWatcher();
    installDeleteButtonEventDelegation();
  }

  function scanDeferred() {
    enablePluginEntry();
    installPluginBuildFlavorFilterPatch();
    installPluginMarketplaceRequestPatch();
    unblockPluginInstallButtons();
    patchCodexModelWhitelist();
    sessionRows().forEach(tryAttachButton);
    updateDeleteButtonOffsets();
    scheduleProjectMoveProjection();
    scheduleChatsSortCorrection();
    scheduleProjectThreadFallbacks();
    archivedPageRows().forEach(attachArchivedPageDeleteButton);
    installArchivedDeleteAllButton();
    refreshConversationTimeline();
  }

  function runScanStep(step) {
    try {
      step();
    } catch (error) {
      window.__codexSessionDeleteScanFailures = window.__codexSessionDeleteScanFailures || [];
      window.__codexSessionDeleteScanFailures.push(String(error?.stack || error));
    }
  }

  function scan() {
    runScanStep(scanLightweight);
    requestAnimationFrame(() => runScanStep(scanDeferred));
  }

  function isExtensionUiNode(node) {
    return !!node?.closest?.(`.codex-delete-toast, .codex-delete-confirm-overlay, .codex-plus-modal-overlay, .${projectMoveOverlayClass}, .${moreMenuClass}, .${timelineClass}, .codex-conversation-timeline, #codex-plus-menu`);
  }

  const scanRelevantSelector = [
    selectors.sidebarThread,
    '[data-app-action-sidebar-section-heading="Chats"]',
    '[data-app-action-sidebar-section-heading="Projects"]',
    '[data-codex-project-move-row="true"]',
    '[data-codex-project-thread-list="true"]',
    '[data-app-action-sidebar-project-row]',
    '[data-codex-archive-page-row="true"]',
    "[data-codex-archive-delete-all]",
    '[data-message-author-role]',
    '[data-testid="conversation-turn"]',
    '[class*="user-message"]',
    '[class*="UserMessage"]',
    selectors.appHeader,
    selectors.archiveNav,
    selectors.disabledInstallButton,
  ].join(", ");

  function nodeSelfOrAncestorMatchesScanRelevance(node) {
    if (node.nodeType !== 1) return false;
    if (isExtensionUiNode(node)) return false;
    const questionSelector = timelineQuestionSelector();
    return !!node.matches?.(scanRelevantSelector) ||
      !!node.closest?.(scanRelevantSelector) ||
      !!node.matches?.(questionSelector) ||
      !!node.closest?.(questionSelector) ||
      nodeOrAncestorLooksLikeCodexUserBubble(node);
  }

  function isScanRelevantNode(node) {
    if (node.nodeType !== 1) return false;
    if (isExtensionUiNode(node)) return false;
    return nodeSelfOrAncestorMatchesScanRelevance(node) || !!node.querySelector?.(scanRelevantSelector) || nodeLooksLikeTimelineQuestion(node);
  }

  function isChatContentMutation(mutation) {
    const target = mutation.target;
    if (!target?.closest?.('[data-message-author-role], [data-testid="conversation-turn"], main .prose')) return false;
    return !Array.from(mutation.addedNodes).some((node) => node.nodeType === 1 && isScanRelevantNode(node)) &&
      !Array.from(mutation.removedNodes).some((node) => node.nodeType === 1 && isScanRelevantNode(node));
  }

  function shouldScheduleScan(mutations) {
    if (!mutations) return true;
    return mutations.some((mutation) => {
      if (isChatContentMutation(mutation)) return false;
      const target = mutation.target;
      if (isExtensionUiNode(target)) return false;
      if (target?.nodeType === 1 && nodeSelfOrAncestorMatchesScanRelevance(target)) return true;
      const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
      return changedNodes.some((node) => node.nodeType === 1 && isScanRelevantNode(node));
    });
  }

  function runScheduledScan() {
    window.__codexSessionDeleteScanPending = false;
    clearTimeout(window.__codexSessionDeleteScanTimer);
    window.__codexSessionDeleteScanTimer = null;
    scan();
  }

  function scheduleScan(mutations) {
    if (!shouldScheduleScan(mutations)) return;
    if (window.__codexSessionDeleteScanPending) return;
    window.__codexSessionDeleteScanPending = true;
    window.__codexSessionDeleteScanTimer = setTimeout(runScheduledScan, 200);
  }

  scan();
  loadBackendSettings();
  scheduleStartupProviderPathRepair();
  window.__codexProjectMoveApplyProjection = applyProjectMoveProjection;
  window.__codexProjectMoveReadProjection = readProjectMoveProjection;
  window.__codexProjectMoveTargets = projectMoveTargets;
  window.__codexProjectMoveSortChats = applyChatsSortCorrection;
  window.__codexProjectThreadsRefresh = refreshProjectThreadFallbacks;
  window.removeEventListener("resize", window.__codexPlusResizeHandler);
  let codexPlusResizeRafId = 0;
  window.__codexPlusResizeHandler = () => {
    cancelAnimationFrame(codexPlusResizeRafId);
    codexPlusResizeRafId = requestAnimationFrame(() => {
      updateFloatingCodexPlusMenuPosition(document.getElementById(codexPlusMenuId));
      runScanStep(refreshConversationTimeline);
    });
  };
  window.addEventListener("resize", window.__codexPlusResizeHandler);
  window.__codexSessionDeleteObserver?.disconnect();
  window.__codexSessionDeleteObserver = new MutationObserver(scheduleScan);
  window.__codexSessionDeleteObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
