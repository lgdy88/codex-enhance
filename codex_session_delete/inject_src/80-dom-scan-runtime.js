  function scanLightweight() {
    installStyle();
    installCodexPlusMenu();
    scheduleBackendHeartbeat();
    scheduleProviderWatcher();
    installDeleteButtonEventDelegation();
  }

  function scanDeferred() {
    enablePluginEntry();
    unblockPluginInstallButtons();
    patchCodexModelWhitelist();
    sessionRows().forEach(tryAttachButton);
    updateDeleteButtonOffsets();
    installProjectFileTreeHandlers();
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
    return !!node?.closest?.(`.codex-delete-toast, .codex-delete-confirm-overlay, .codex-plus-modal-overlay, .${projectMoveOverlayClass}, .${projectFileTreePanelClass}, .${timelineClass}, .codex-conversation-timeline, #codex-plus-menu`);
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
  scheduleStartupProviderPathRepair();
  window.__codexProjectMoveApplyProjection = applyProjectMoveProjection;
  window.__codexProjectMoveReadProjection = readProjectMoveProjection;
  window.__codexProjectMoveTargets = projectMoveTargets;
  window.__codexProjectMoveSortChats = applyChatsSortCorrection;
  window.__codexProjectThreadsRefresh = refreshProjectThreadFallbacks;
  window.__codexProjectFileTreeOpen = openProjectFileTree;
  window.__codexProjectFileTreeCollapse = collapseProjectFileTreePanel;
  window.__codexProjectFileTreeClose = removeProjectFileTreePanel;
  window.removeEventListener("resize", window.__codexPlusResizeHandler);
  let codexPlusResizeRafId = 0;
  window.__codexPlusResizeHandler = () => {
    cancelAnimationFrame(codexPlusResizeRafId);
    codexPlusResizeRafId = requestAnimationFrame(() => {
      updateFloatingCodexPlusMenuPosition(document.getElementById(codexPlusMenuId));
      positionProjectFileTreePanel();
      runScanStep(refreshConversationTimeline);
    });
  };
  window.addEventListener("resize", window.__codexPlusResizeHandler);
  window.__codexSessionDeleteObserver?.disconnect();
  window.__codexSessionDeleteObserver = new MutationObserver(scheduleScan);
  window.__codexSessionDeleteObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
