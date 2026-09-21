import { useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { useSession } from './hooks/useSession';
import { BootScreen } from './screens/BootScreen';
import { TelegramAuthScreen } from './screens/TelegramAuthScreen';
import { TelegramBootScreen } from './screens/TelegramBootScreen';
import { SyncingScreen } from './screens/SyncingScreen';
import { VaultShell } from './components/VaultShell';
import { useI18n } from './context/I18nContext';

export default function App() {
  const { state, saveTelegramApi, submitPhone, submitEmail, submitEmailCode, submitRegistration, submitCode, submitPassword, signOut, switchAccount, addAccount, resetTelegramApi, factoryReset } =
    useSession();
  const { t } = useI18n();
  let content;

  if (state.loading || state.phase === 'booting') {
    content = <BootScreen />;
  } else if (state.phase === 'telegramApiSetup' || state.phase === 'auth' || state.phase === 'telegramBooting') {
    content = (
      <TelegramAuthScreen
        phase={state.phase}
        authState={state.authState || 'waitPhone'}
        authDetail={state.authDetail || {}}
        error={state.authError === 'telegram_api_invalid' ? t('invalidApi') : state.authError}
        syncError={state.syncError}
        restartRecommended={Boolean(state.telegramRestartRecommended)}
        onSubmitApiAndPhone={saveTelegramApi}
        onSubmitPhone={submitPhone}
        onSubmitEmail={submitEmail}
        onSubmitEmailCode={submitEmailCode}
        onSubmitRegistration={submitRegistration}
        onSubmitCode={submitCode}
        onSubmitPassword={submitPassword}
        onResetApi={resetTelegramApi}
        onFactoryReset={factoryReset}
      />
    );
  } else if (state.phase === 'syncing') {
    content = <SyncingScreen scannedCount={state.scannedCount || 0} floodWaitSec={state.floodWaitSec || 0} />;
  } else {
    content = (
      <VaultShell
        accounts={state.accounts || []}
        activeAccountId={state.activeAccountId}
        onSignOut={signOut}
        onSwitchAccount={switchAccount}
        onAddAccount={addAccount}
        floodWaitSec={state.floodWaitSec || 0}
      />
    );
  }

  return (
    <ErrorBoundary>
      {content}
    </ErrorBoundary>
  );
}
