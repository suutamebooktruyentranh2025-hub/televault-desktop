import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { IconDriveLogo } from '../components/DriveIcons';
import { PhoneCountryInput } from '../components/PhoneCountryInput';
import { DEFAULT_PHONE_COUNTRY_ISO, formatInternationalPhone, getPhoneCountry } from '../utils/phoneCountries';
import { isPhoneAuthStep, shouldResetPhoneFields, shouldResetTextInput } from '../utils/telegramAuthSteps';
import { useDialog } from '../context/DialogContext';

/**
 * @param {{
 *   authState?: string,
 *   phase?: string,
 *   authDetail?: { otherDeviceLink?: string, passwordHint?: string },
 *   error?: string | null,
 *   syncError?: string | null,
 *   onSubmitApiAndPhone?: (apiId: string, apiHash: string) => Promise<void>,
 *   onSubmitPhone?: (phone: string) => Promise<void>,
 *   onSubmitEmail?: (email: string) => Promise<void>,
 *   onSubmitEmailCode?: (code: string) => Promise<void>,
 *   onSubmitRegistration?: (firstName: string, lastName: string) => Promise<void>,
 *   onSubmitCode?: (code: string) => Promise<void>,
 *   onSubmitPassword?: (password: string) => Promise<void>,
 *   restartRecommended?: boolean,
 * }} props
 */
export function TelegramAuthScreen({
  phase,
  authState,
  authDetail = {},
  error,
  syncError,
  restartRecommended = false,
  onSubmitApiAndPhone,
  onSubmitPhone,
  onSubmitEmail,
  onSubmitEmailCode,
  onSubmitRegistration,
  onSubmitCode,
  onSubmitPassword,
  onResetApi,
  onFactoryReset,
}) {
  const { t, locale } = useI18n();
  const { confirm } = useDialog();
  const [value, setValue] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_PHONE_COUNTRY_ISO);
  const [nationalNumber, setNationalNumber] = useState('');
  const [lastName, setLastName] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [pendingPhone, setPendingPhone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const prevAuthStateRef = useRef(authState);

  useEffect(() => {
    if (phase === 'auth' && authState === 'waitPhone' && pendingPhone) {
      onSubmitPhone?.(pendingPhone);
      setPendingPhone(null);
    }
  }, [phase, authState, pendingPhone, onSubmitPhone]);

  useEffect(() => {
    const prev = prevAuthStateRef.current;
    prevAuthStateRef.current = authState;
    setLocalError('');

    if (shouldResetPhoneFields(prev, authState)) {
      setCountryIso(DEFAULT_PHONE_COUNTRY_ISO);
      setNationalNumber('');
      setValue('');
    } else if (authState === 'waitRegistration' && prev !== 'waitRegistration') {
      setValue('');
      setLastName('');
    } else if (shouldResetTextInput(prev, authState)) {
      setValue('');
    }
  }, [authState]);

  const labels = {
    waitPhone: [t('authPhoneLabel'), t('authPhoneHint'), false],
    waitEmail: [t('authEmailLabel'), t('authEmailHint'), false],
    waitEmailCode: [t('authEmailCodeLabel'), t('authEmailCodeHint'), false],
    waitCode: [t('authCodeLabel'), t('authCodeHint'), false],
    waitPassword: [t('authPasswordLabel'), t('authPasswordHint'), true],
    waitRegistration: [t('authFirstNameLabel'), t('authFirstNameHint'), false],
  };
  const [label, hint, obscure] = labels[authState] || labels.waitPhone;
  const passwordHint = authDetail.passwordHint;
  const otherDeviceLink = authDetail.otherDeviceLink;

  async function handleSubmit(e) {
    e.preventDefault();
    if (authState === 'waitOtherDevice') return;
    setLocalError('');

    if (phase === 'telegramApiSetup' || isPhoneAuthStep(authState)) {
      const phone = formatInternationalPhone(getPhoneCountry(countryIso).dial, nationalNumber);
      if (!phone) {
        setLocalError(t('authPhoneRequired'));
        return;
      }
    } else if (
      authState === 'waitCode' ||
      authState === 'waitEmail' ||
      authState === 'waitEmailCode'
    ) {
      if (!value.trim()) {
        setLocalError(t('authCodeRequired'));
        return;
      }
    } else if (authState === 'waitPassword' && !value.trim()) {
      setLocalError(t('authPasswordRequired'));
      return;
    } else if (authState === 'waitRegistration' && !value.trim()) {
      setLocalError(t('authFirstNameRequired'));
      return;
    }

    setBusy(true);
    try {
      const text = value.trim();
      if (authState === 'waitCode') await onSubmitCode?.(text);
      else if (authState === 'waitPassword') await onSubmitPassword?.(text);
      else if (authState === 'waitEmail') await onSubmitEmail?.(text);
      else if (authState === 'waitEmailCode') await onSubmitEmailCode?.(text);
      else if (authState === 'waitRegistration') await onSubmitRegistration?.(text, lastName.trim());
      else if (phase === 'telegramApiSetup' || isPhoneAuthStep(authState)) {
        const phone = formatInternationalPhone(getPhoneCountry(countryIso).dial, nationalNumber);
        if (phase === 'telegramApiSetup') {
          if (!apiId.trim() || !apiHash.trim()) {
            setLocalError(t('authApiErrorRequired'));
            return;
          }
          setPendingPhone(phone);
          await onSubmitApiAndPhone?.(apiId.trim(), apiHash.trim());
        } else {
          await onSubmitPhone?.(phone);
        }
      }
    } catch (e) {
      setLocalError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto items-center justify-center bg-[var(--gd-bg)] px-6 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg bg-[var(--gd-surface)] p-8 shadow-[var(--gd-shadow-md)]"
      >
        <div className="mb-6 flex items-center justify-center gap-3">
          <IconDriveLogo className="h-10 w-10" />
          <span className="text-2xl text-[var(--gd-text)]">{t('appName')}</span>
        </div>
        <h1 className="text-xl font-normal text-[var(--gd-text)]">{t('authTitle')}</h1>
        <p className="mt-2 text-sm text-[var(--gd-text-secondary)]">{t('authSubtitle')}</p>

        {restartRecommended ? (
          <div
            role="note"
            className="mt-4 rounded-md border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-600/50 dark:bg-amber-950/40 dark:text-amber-100"
          >
            {t('authRestartAfterLogoutHint')}
          </div>
        ) : null}

        {authState === 'waitOtherDevice' ? (
          <div className="mt-6 space-y-3 rounded-md border border-[var(--gd-border)] bg-[var(--gd-hover)] px-4 py-4 text-sm text-[var(--gd-text)]">
            <p>{t('authOtherDeviceBody')}</p>
            {otherDeviceLink ? (
              <a
                href={otherDeviceLink}
                target="_blank"
                rel="noreferrer"
                className="break-all font-medium text-[var(--gd-primary)] underline"
              >
                {otherDeviceLink}
              </a>
            ) : null}
          </div>
        ) : phase === 'telegramApiSetup' || authState === 'waitPhone' || authState === 'starting' || authState === 'loggedOut' ? (
          <div className="mt-6 space-y-6">
            <PhoneCountryInput
              countryIso={countryIso}
              onCountryIsoChange={setCountryIso}
              nationalNumber={nationalNumber}
              onNationalNumberChange={setNationalNumber}
              locale={locale}
              label={t('authPhoneLabelWithCode', { label: t('authPhoneLabel') })}
              hint={t('authPhoneHint')}
              autoFocus
              disabled={busy}
            />
            
            <div className="rounded-xl border border-[var(--gd-border)] bg-gray-50/50 shadow-sm dark:bg-zinc-800/20">
              <div className="px-4 py-3 text-sm font-medium text-[var(--gd-text)] border-b border-[var(--gd-border)]">
                <span>{t('authApiConfigTitle')}</span>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-xs text-[var(--gd-text-secondary)]">
                  {t('authApiConfigDesc')}
                </p>
                <label className="block text-sm font-medium text-[var(--gd-text-secondary)]">
                  {t('apiId')}
                  <input
                    className="mt-2 w-full rounded-md border border-[var(--gd-border)] px-3 py-2 text-sm text-[var(--gd-text)] outline-none focus:border-[var(--gd-primary)] focus:ring-1 focus:ring-[var(--gd-primary)] bg-[var(--gd-surface)]"
                    value={apiId}
                    onChange={(e) => setApiId(e.target.value)}
                    placeholder={t('authApiIdPlaceholder')}
                    disabled={busy}
                  />
                </label>
                <label className="block text-sm font-medium text-[var(--gd-text-secondary)]">
                  {t('apiHash')}
                  <input
                    className="mt-2 w-full rounded-md border border-[var(--gd-border)] px-3 py-2 text-sm text-[var(--gd-text)] outline-none focus:border-[var(--gd-primary)] focus:ring-1 focus:ring-[var(--gd-primary)] bg-[var(--gd-surface)]"
                    value={apiHash}
                    onChange={(e) => setApiHash(e.target.value)}
                    placeholder={t('authApiHashPlaceholder')}
                    disabled={busy}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <>
            <label className="mt-6 block text-sm font-medium text-[var(--gd-text-secondary)]">
              {label}
              <input
                className="mt-2 w-full rounded-md border border-[var(--gd-border)] px-3 py-2.5 text-sm text-[var(--gd-text)] outline-none focus:border-[var(--gd-primary)] focus:ring-1 focus:ring-[var(--gd-primary)]"
                value={value}
                onChange={(e) => {
                  setLocalError('');
                  setValue(e.target.value);
                }}
                placeholder={hint}
                type={obscure ? 'password' : 'text'}
                inputMode={
                  authState === 'waitCode' || authState === 'waitEmailCode' ? 'numeric' : undefined
                }
                autoComplete={
                  authState === 'waitCode' || authState === 'waitEmailCode'
                    ? 'one-time-code'
                    : authState === 'waitEmail'
                      ? 'email'
                      : undefined
                }
                autoFocus

              />
            </label>
            {authState === 'waitRegistration' ? (
              <label className="mt-4 block text-sm font-medium text-[var(--gd-text-secondary)]">
                {t('authLastNameLabel')}
                <input
                  className="mt-2 w-full rounded-md border border-[var(--gd-border)] px-3 py-2.5 text-sm text-[var(--gd-text)] outline-none focus:border-[var(--gd-primary)] focus:ring-1 focus:ring-[var(--gd-primary)]"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder={t('authLastNameHint')}
                  type="text"
                />
              </label>
            ) : null}
            {authState === 'waitPassword' && passwordHint ? (
              <p className="mt-2 text-xs text-[var(--gd-text-secondary)]">
                {t('authPasswordHintLabel')}: {passwordHint}
              </p>
            ) : null}
          </>
        )}

        {(localError || error || syncError) && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-[var(--gd-danger)]">
            {localError || error || syncError}
          </p>
        )}

        {authState !== 'waitOtherDevice' ? (
          <button
            type="submit"
            disabled={busy}
            className="gd-btn-primary mt-6 w-full rounded-md px-4 py-3 text-sm font-medium disabled:opacity-60"
          >
            {busy ? t('signingIn') : t('continue')}
          </button>
        ) : null}
      </form>

      {/* Add Reset API Button */}
      <div className="mt-8 flex flex-col items-center gap-4 text-center">
        {phase === 'auth' && authState === 'waitPhone' && onResetApi && (
          <button
            type="button"
            onClick={onResetApi}
            className="text-sm font-medium text-[var(--gd-primary)] hover:underline"
          >
            {t('authChangeApiConfig')}
          </button>
        )}
        
        <button
          type="button"
          onClick={async () => {
            if (!(await confirm(t('settingsBackupImportConfirm')))) return;
            const result = await window.televault?.backup?.import();
            if (result && !result.ok && !result.cancelled) {
              // Keep auth screen usable if import fails before relaunch.
              console.error('[backup:import]', result.error);
            }
          }}
          className="text-xs text-[var(--gd-text-secondary)] hover:text-[var(--gd-primary)] hover:underline"
        >
          {t('settingsBackupImport')}
        </button>

        {onFactoryReset && (
          <button
            type="button"
            onClick={async () => {
              if (await confirm(t('factoryResetConfirm'))) {
                onFactoryReset();
              }
            }}
            className="text-xs text-[var(--gd-text-secondary)] hover:text-[var(--gd-danger)] hover:underline"
          >
            {t('authWipeAllData')}
          </button>
        )}
      </div>
    </div>
  );
}
