const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('televault', {
  session: {
    hydrate: () => ipcRenderer.invoke('session:hydrate'),
    getState: () => ipcRenderer.invoke('session:getState'),
    signInGoogle: () => ipcRenderer.invoke('session:signInGoogle'),
    signOut: () => ipcRenderer.invoke('session:signOut'),
    forceLogoutExpiredTrial: () => ipcRenderer.invoke('session:forceLogoutExpiredTrial'),
    saveTelegramApi: (apiId, apiHash) =>
      ipcRenderer.invoke('session:saveTelegramApi', { apiId, apiHash }),
    submitPhone: (phone) => ipcRenderer.invoke('session:submitPhone', { phone }),
    submitEmail: (email) => ipcRenderer.invoke('session:submitEmail', { email }),
    submitEmailCode: (code) => ipcRenderer.invoke('session:submitEmailCode', { code }),
    submitRegistration: (firstName, lastName) =>
      ipcRenderer.invoke('session:submitRegistration', { firstName, lastName }),
    submitCode: (code) => ipcRenderer.invoke('session:submitCode', { code }),
    submitPassword: (password) => ipcRenderer.invoke('session:submitPassword', { password }),
    signOutTelegram: () => ipcRenderer.invoke('session:signOutTelegram'),
    switchAccount: (accountId) => ipcRenderer.invoke('session:switchAccount', accountId),
    addAccount: () => ipcRenderer.invoke('session:addAccount'),
    resetTelegramApi: () => ipcRenderer.invoke('session:resetTelegramApi'),
    factoryReset: () => ipcRenderer.invoke('session:factoryReset'),
    checkAccountStatus: () => ipcRenderer.invoke('session:checkAccountStatus'),
    onChanged: (callback) => {
      const listener = (_evt, state) => callback(state);
      ipcRenderer.on('session:changed', listener);
      return () => ipcRenderer.removeListener('session:changed', listener);
    },
  },
  vault: {
    getListing: (folder, sortField, sortDirection) =>
      ipcRenderer.invoke('vault:getListing', { folder, sortField, sortDirection }),
    getTree: (expanded) => ipcRenderer.invoke('vault:getTree', { expanded }),
    getStats: () => ipcRenderer.invoke('vault:getStats'),
    getDashboard: (rangeDays) => ipcRenderer.invoke('vault:getDashboard', { rangeDays }),
    getDayFiles: (date, limit) => ipcRenderer.invoke('vault:getDayFiles', { date, limit }),
    search: (query, tags) => ipcRenderer.invoke('vault:search', { query, tags }),
    allTags: (opts) => ipcRenderer.invoke('vault:allTags', opts),
    getFolderTags: (folderPath) => ipcRenderer.invoke('vault:getFolderTags', { folderPath }),
    allFolders: () => ipcRenderer.invoke('vault:allFolders'),
    getFoldersDetails: (paths, opts) => ipcRenderer.invoke('vault:getFoldersDetails', { paths, ...(opts || {}) }),
    getFlatStories: (opts) => ipcRenderer.invoke('vault:getFlatStories', opts),
    getFlatFiles: (opts) => ipcRenderer.invoke('vault:getFlatFiles', opts),
    createFolder: (parentFolder, name) =>
      ipcRenderer.invoke('vault:createFolder', { parentFolder, name }),
    renameFile: (messageId, newName) =>
      ipcRenderer.invoke('vault:renameFile', { messageId, newName }),
    renameFolder: (folderPath, newName) =>
      ipcRenderer.invoke('vault:renameFolder', { folderPath, newName }),
    moveFile: (messageId, destFolder) =>
      ipcRenderer.invoke('vault:moveFile', { messageId, destFolder }),
    moveFolder: (folderPath, destFolder) =>
      ipcRenderer.invoke('vault:moveFolder', { folderPath, destFolder }),
    moveEntries: (messageIds, folders, destination) =>
      ipcRenderer.invoke('vault:moveEntries', { messageIds, folders, destination }),
    cancelMove: () => ipcRenderer.invoke('vault:cancelMove'),
    trash: (messageIds, folders) =>
      ipcRenderer.invoke('vault:trash', { messageIds, folders }),
    restore: (messageIds, folders) =>
      ipcRenderer.invoke('vault:restore', { messageIds, folders }),
    deletePermanent: (messageIds, folders) =>
      ipcRenderer.invoke('vault:deletePermanent', { messageIds, folders }),
    emptyTrash: () => ipcRenderer.invoke('vault:emptyTrash'),
    setFolderTags: (folderPath, tags) =>
      ipcRenderer.invoke('vault:setFolderTags', { folderPath, tags }),
    renameTag: (from, to) => ipcRenderer.invoke('vault:renameTag', { from, to }),
    deleteTag: (tag) => ipcRenderer.invoke('vault:deleteTag', { tag }),
    checkDuplicate: (sha256) => ipcRenderer.invoke('vault:checkDuplicate', { sha256 }),
    scanDuplicates: () => ipcRenderer.invoke('vault:scanDuplicates'),
    resolveDuplicateGroup: ({ keepMessageId, trashMessageIds }) =>
      ipcRenderer.invoke('vault:resolveDuplicateGroup', { keepMessageId, trashMessageIds }),
    pickUploadFiles: () => ipcRenderer.invoke('vault:pickUploadFiles'),
    pickUploadFolder: () => ipcRenderer.invoke('vault:pickUploadFolder'),
    uploadPaths: (localPaths, destFolder) =>
      ipcRenderer.invoke('vault:uploadPaths', { localPaths, destFolder }),
    download: (messageId) => ipcRenderer.invoke('vault:download', { messageId }),
    downloadFolder: (folderPath) => ipcRenderer.invoke('vault:downloadFolder', { folderPath }),
    onDownloadFolderProgress: (callback) => {
      const listener = (_evt, payload) => callback(payload);
      ipcRenderer.on('vault:downloadFolderProgress', listener);
      return () => ipcRenderer.removeListener('vault:downloadFolderProgress', listener);
    },
    saveAs: (messageId) => ipcRenderer.invoke('vault:saveAs', { messageId }),
    openFile: (messageId) => ipcRenderer.invoke('vault:openFile', { messageId }),
    getLocalPath: (messageId) => ipcRenderer.invoke('vault:getLocalPath', { messageId }),
    readFileText: (messageId) => ipcRenderer.invoke('vault:readFileText', { messageId }),
    getTransfers: () => ipcRenderer.invoke('vault:getTransfers'),
    cancelTransfer: (taskId) => ipcRenderer.invoke('vault:cancelTransfer', { taskId }),
    retryTransfer: (taskId) => ipcRenderer.invoke('vault:retryTransfer', { taskId }),
    resumeTransfer: (taskId) => ipcRenderer.invoke('vault:resumeTransfer', { taskId }),
    clearFinishedTransfers: () => ipcRenderer.invoke('vault:clearFinishedTransfers'),
    onChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('vault:changed', listener);
      return () => ipcRenderer.removeListener('vault:changed', listener);
    },
    onTransfersChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('transfers:changed', listener);
      return () => ipcRenderer.removeListener('transfers:changed', listener);
    },
    onDeleteProgress: (callback) => {
      const listener = (_evt, payload) => callback(payload);
      ipcRenderer.on('vault:deleteProgress', listener);
      return () => ipcRenderer.removeListener('vault:deleteProgress', listener);
    },
    onTrashProgress: (callback) => {
      const listener = (_evt, payload) => callback(payload);
      ipcRenderer.on('vault:trashProgress', listener);
      return () => ipcRenderer.removeListener('vault:trashProgress', listener);
    },
    onMoveProgress: (callback) => {
      const listener = (_evt, payload) => callback(payload);
      ipcRenderer.on('vault:moveProgress', listener);
      return () => ipcRenderer.removeListener('vault:moveProgress', listener);
    },
    rescanHistory: (opts) => ipcRenderer.invoke('vault:rescanHistory', opts),
    cancelRescan: () => ipcRenderer.invoke('vault:cancelRescan'),
    onScanProgress: (callback) => {
      const listener = (_evt, payload) => callback(payload);
      ipcRenderer.on('vault:scanProgress', listener);
      return () => ipcRenderer.removeListener('vault:scanProgress', listener);
    },
  },
  sharedVault: {
    discover: () => ipcRenderer.invoke('sharedVault:discover'),
    list: () => ipcRenderer.invoke('sharedVault:list'),
    scan: (chatId) => ipcRenderer.invoke('sharedVault:scan', { chatId }),
    rescan: (chatId) => ipcRenderer.invoke('vault:rescanHistory', { chatId }),
    getListing: (chatId, folder, sortField, sortDirection) =>
      ipcRenderer.invoke('sharedVault:getListing', { chatId, folder, sortField, sortDirection }),
    search: (chatId, query) => ipcRenderer.invoke('sharedVault:search', { chatId, query }),
    downloadFolder: (chatId, folderPath) => ipcRenderer.invoke('sharedVault:downloadFolder', { chatId, folderPath }),
    download: (chatId, messageId) => ipcRenderer.invoke('sharedVault:download', { chatId, messageId }),
    getStats: (chatId) => ipcRenderer.invoke('sharedVault:getStats', { chatId }),
    onChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('sharedVault:changed', listener);
      return () => ipcRenderer.removeListener('sharedVault:changed', listener);
    },
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (values) => ipcRenderer.invoke('settings:set', values),
    pickSaveAsDirectory: () => ipcRenderer.invoke('settings:pickSaveAsDirectory'),
    clearSaveAsDirectory: () => ipcRenderer.invoke('settings:clearSaveAsDirectory'),
  },
  backup: {
    export: (includeSessions) =>
      ipcRenderer.invoke('backup:export', { includeSessions: Boolean(includeSessions) }),
    import: () => ipcRenderer.invoke('backup:import'),
  },
  sync: {
    getConfig: () => ipcRenderer.invoke('sync:getConfig'),
    setConfig: (config) => ipcRenderer.invoke('sync:setConfig', config),
    pickFolder: () => ipcRenderer.invoke('sync:pickFolder'),
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    start: () => ipcRenderer.invoke('sync:start'),
    stop: () => ipcRenderer.invoke('sync:stop'),
    runInitialSync: (strategy) => ipcRenderer.invoke('sync:runInitialSync', { strategy }),
    getInitialCounts: () => ipcRenderer.invoke('sync:getInitialCounts'),
    onChanged: (callback) => {
      const listener = (_evt, snapshot) => callback(snapshot);
      ipcRenderer.on('sync:changed', listener);
      return () => ipcRenderer.removeListener('sync:changed', listener);
    },
  },
  gdrive: {
    getStatus: () => ipcRenderer.invoke('gdrive:getStatus'),
    saveCredentials: (clientId, clientSecret) => ipcRenderer.invoke('gdrive:saveCredentials', { clientId, clientSecret }),
    connect: (clientId, clientSecret) => ipcRenderer.invoke('gdrive:connect', { clientId, clientSecret }),
    cancelConnect: () => ipcRenderer.invoke('gdrive:cancelConnect'),
    disconnect: (opts) => ipcRenderer.invoke('gdrive:disconnect', opts),
    setPaused: (paused) => ipcRenderer.invoke('gdrive:setPaused', { paused }),
    listFolder: (folderId) => ipcRenderer.invoke('gdrive:listFolder', { folderId }),
    addSubscription: (sub) => ipcRenderer.invoke('gdrive:addSubscription', sub),
    removeSubscription: (driveId) => ipcRenderer.invoke('gdrive:removeSubscription', { driveId }),
    toggleSubscription: (driveId, enabled) => ipcRenderer.invoke('gdrive:toggleSubscription', { driveId, enabled }),
    getSubscriptions: () => ipcRenderer.invoke('gdrive:getSubscriptions'),
    checkConnection: () => ipcRenderer.invoke('gdrive:checkConnection'),
    scanNow: (opts) => ipcRenderer.invoke('gdrive:scanNow', opts),
    abortScan: () => ipcRenderer.invoke('gdrive:abortScan'),
    startSync: () => ipcRenderer.invoke('gdrive:startSync'),
    setAutoSyncAfterScan: (enabled) => ipcRenderer.invoke('gdrive:setAutoSyncAfterScan', { enabled }),
    retryFile: (driveFileId) => ipcRenderer.invoke('gdrive:retryFile', { driveFileId }),
    retryErrors: (driveFileIds) => ipcRenderer.invoke('gdrive:retryErrors', { driveFileIds }),
    retryAllErrors: () => ipcRenderer.invoke('gdrive:retryAllErrors'),
    setPollInterval: (intervalMs) => ipcRenderer.invoke('gdrive:setPollInterval', { intervalMs }),
    setFilters: (ignored, allowed) => ipcRenderer.invoke('gdrive:setFilters', { ignored, allowed }),
    setTempDir: (tempDir) => ipcRenderer.invoke('gdrive:setTempDir', { tempDir }),
    openDownloadFolder: (opts) => ipcRenderer.invoke('gdrive:openDownloadFolder', opts),
    setConflictPolicy: (policy) => ipcRenderer.invoke('gdrive:setConflictPolicy', { policy }),
    setPropagateDeletes: (enabled) => ipcRenderer.invoke('gdrive:setPropagateDeletes', { enabled }),
    removeQueueItem: (driveFileId) => ipcRenderer.invoke('gdrive:removeQueueItem', { driveFileId }),
    removeQueueBatch: (driveFileIds) => ipcRenderer.invoke('gdrive:removeQueueBatch', { driveFileIds }),
    clearQueue: () => ipcRenderer.invoke('gdrive:clearQueue'),
    skipItem: (driveFileId) => ipcRenderer.invoke('gdrive:skipItem', { driveFileId }),
    clearErrors: () => ipcRenderer.invoke('gdrive:clearErrors'),
    clearHistory: () => ipcRenderer.invoke('gdrive:clearHistory'),
    removeErrorItem: (driveFileId) => ipcRenderer.invoke('gdrive:removeErrorItem', { driveFileId }),
    removeHistoryItem: (driveFileId) => ipcRenderer.invoke('gdrive:removeHistoryItem', { driveFileId }),
    listProgressImportSources: () => ipcRenderer.invoke('gdrive:listProgressImportSources'),
    importProgressFromAccount: (sourceAccountId) =>
      ipcRenderer.invoke('gdrive:importProgressFromAccount', { sourceAccountId }),
    exportProgress: () => ipcRenderer.invoke('gdrive:exportProgress'),
    importProgress: () => ipcRenderer.invoke('gdrive:importProgress'),
    getSyncTargets: () => ipcRenderer.invoke('gdrive:getSyncTargets'),
    setSyncTarget: (chatId) => ipcRenderer.invoke('gdrive:setSyncTarget', { chatId }),
    clearLastError: () => ipcRenderer.invoke('gdrive:clearLastError'),
    rescanSyncTargetVault: () => ipcRenderer.invoke('gdrive:rescanSyncTargetVault'),
    cancelRescanVault: () => ipcRenderer.invoke('gdrive:cancelRescanVault'),
    queryCacheFiles: (opts) => ipcRenderer.invoke('gdrive:queryCacheFiles', opts),
    getCacheSummary: () => ipcRenderer.invoke('gdrive:getCacheSummary'),
    requeueCacheFile: (driveFileId) => ipcRenderer.invoke('gdrive:requeueCacheFile', { driveFileId }),
    requeueAllPending: (opts) => ipcRenderer.invoke('gdrive:requeueAllPending', opts),
    reconcileExisting: () => ipcRenderer.invoke('gdrive:reconcileExisting'),
    exportCacheCsv: (opts) => ipcRenderer.invoke('gdrive:exportCacheCsv', opts),
    queryFolderTree: (opts) => ipcRenderer.invoke('gdrive:queryFolderTree', opts),
    searchFolders: (opts) => ipcRenderer.invoke('gdrive:searchFolders', opts),
    getFolderAncestors: (opts) => ipcRenderer.invoke('gdrive:getFolderAncestors', opts),
    queryFolderChildren: (opts) => ipcRenderer.invoke('gdrive:queryFolderChildren', opts),
    syncFolder: (opts) => ipcRenderer.invoke('gdrive:syncFolder', opts),
    onChanged: (callback) => {
      const listener = (_evt, snapshot) => callback(snapshot);
      ipcRenderer.on('gdrive:changed', listener);
      return () => ipcRenderer.removeListener('gdrive:changed', listener);
    },
    onProgress: (callback) => {
      const listener = (_evt, payload) => callback(payload);
      ipcRenderer.on('gdrive:progress', listener);
      return () => ipcRenderer.removeListener('gdrive:progress', listener);
    },
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', { url }),
    pickDirectory: () => ipcRenderer.invoke('shell:pickDirectory'),
  },
  updater: {
    checkUpdate: (opts) => ipcRenderer.invoke('update:check', opts),
    downloadUpdate: (downloadInfo) => ipcRenderer.invoke('update:download', downloadInfo),
    installUpdate: (filePath) => ipcRenderer.invoke('update:install', { filePath }),
    onDownloadProgress: (callback) => {
      const listener = (_evt, payload) => callback(payload);
      ipcRenderer.on('update:download-progress', listener);
      return () => ipcRenderer.removeListener('update:download-progress', listener);
    },
  },
});
