import React, { useState, useRef, useCallback } from 'react';
import { GDriveCacheSummaryBar } from '../components/GDriveCacheSummaryBar';
import { GDriveFolderTree } from '../components/GDriveFolderTree';
import { GDriveFolderDetail } from '../components/GDriveFolderDetail';

export function GDriveCacheExplorerTab({ t, folderExplorer, onRescanVault, onCancelRescanVault, rescanBusy, rescanProgress, scanPhase }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('televault_gdrive_sidebar_w'));
      if (saved >= 200 && saved <= 550) return saved;
    } catch {}
    return 280;
  });

  const isDraggingRef = useRef(false);
  const containerRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (ev) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = Math.min(
        Math.max(ev.clientX - containerRect.left, 200),
        Math.min(550, containerRect.width - 320)
      );
      setSidebarWidth(Math.round(newWidth));
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        setSidebarWidth((w) => {
          try {
            localStorage.setItem('televault_gdrive_sidebar_w', String(w));
          } catch {}
          return w;
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  const handleDoubleClickReset = useCallback(() => {
    setSidebarWidth(280);
    try {
      localStorage.setItem('televault_gdrive_sidebar_w', '280');
    } catch {}
  }, []);

  if (!folderExplorer) return null;

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Summary Cards */}
      <GDriveCacheSummaryBar
        summary={folderExplorer.summary}
        t={t}
        onRescanVault={onRescanVault}
        onCancelRescanVault={onCancelRescanVault}
        rescanBusy={rescanBusy}
        rescanProgress={rescanProgress}
        onSyncAllPending={folderExplorer.handleSyncAllPending}
        syncAllBusy={folderExplorer.syncAllBusy}
        scanPhase={scanPhase}
      />

      {/* Split Panel: Folder Tree | Resizer | Detail */}
      <div
        ref={containerRef}
        className="flex-1 flex min-h-0 overflow-hidden rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] shadow-2xs"
      >
        {/* Sidebar — Folder Tree */}
        <div
          className="shrink-0 h-full min-h-0 flex flex-col overflow-hidden"
          style={{ width: `${sidebarWidth}px`, minWidth: '200px', maxWidth: '550px' }}
        >
          <GDriveFolderTree
            t={t}
            treeData={folderExplorer.treeData}
            expandedFolders={folderExplorer.expandedFolders}
            selectedFolderId={folderExplorer.selectedFolderId}
            selectedFolderPath={folderExplorer.selectedFolderPath}
            treeLoading={folderExplorer.treeLoading}
            treeSearch={folderExplorer.treeSearch}
            setTreeSearch={folderExplorer.setTreeSearch}
            treeSearchResults={folderExplorer.treeSearchResults}
            treeSearchLoading={folderExplorer.treeSearchLoading}
            selectFolderFromSearch={folderExplorer.selectFolderFromSearch}
            toggleFolder={folderExplorer.toggleFolder}
            selectFolder={folderExplorer.selectFolder}
            syncFolderBusy={folderExplorer.syncFolderBusy}
            handleSyncFolder={folderExplorer.handleSyncFolder}
            hideIgnored={folderExplorer.hideIgnored}
            handleToggleHideIgnored={folderExplorer.handleToggleHideIgnored}
          />
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClickReset}
          className="shrink-0 w-1 z-20 hover:w-1.5 hover:bg-[var(--gd-primary)] active:bg-[var(--gd-primary)] bg-[var(--gd-border)]/40 cursor-col-resize transition-all flex items-center justify-center select-none"
          title="Drag to resize / Double click to reset"
        >
          <div className="w-0.5 h-6 rounded-full bg-[var(--gd-text-secondary)]/30 pointer-events-none" />
        </div>

        {/* Main — Folder Detail */}
        <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col overflow-hidden">
          <GDriveFolderDetail
            t={t}
            items={folderExplorer.items}
            total={folderExplorer.total}
            page={folderExplorer.page}
            setPage={folderExplorer.setPage}
            limit={folderExplorer.limit}
            setLimit={folderExplorer.setLimit}
            search={folderExplorer.search}
            handleSearchChange={folderExplorer.handleSearchChange}
            status={folderExplorer.status}
            handleStatusChange={folderExplorer.handleStatusChange}
            sortBy={folderExplorer.sortBy}
            sortOrder={folderExplorer.sortOrder}
            handleSort={folderExplorer.handleSort}
            loading={folderExplorer.loading}
            actionBusyId={folderExplorer.actionBusyId}
            syncFolderBusy={folderExplorer.syncFolderBusy}
            handleSyncFile={folderExplorer.handleSyncFile}
            handleSyncFolder={folderExplorer.handleSyncFolder}
            handleOpenInVault={folderExplorer.handleOpenInVault}
            navigateToFolder={folderExplorer.navigateToFolder}
            selectedFolderId={folderExplorer.selectedFolderId}
            selectedFolderPath={folderExplorer.selectedFolderPath}
            navigateToBreadcrumb={folderExplorer.navigateToBreadcrumb}
          />
        </div>
      </div>
    </div>
  );
}
