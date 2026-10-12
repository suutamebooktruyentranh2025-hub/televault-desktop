import { useCallback, useEffect, useState } from 'react';

const api = window.televault?.session;

const defaultState = {
  phase: 'booting',
  authError: null,
  syncError: null,
  loading: true,
  authState: 'starting',
  authDetail: {},
  scannedCount: 0,
  entryCount: 0,
  floodWaitSec: 0,
};

export function useSession() {
  const [state, setState] = useState(defaultState);

  const applyState = useCallback((next) => {
    if (!next) return;
    setState((prev) => {
      let hasChange = false;
      for (const key of Object.keys(next)) {
        if (key === 'accounts' || key === 'authDetail') {
          if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
            hasChange = true;
            break;
          }
        } else if (prev[key] !== next[key]) {
          hasChange = true;
          break;
        }
      }
      if (!hasChange && prev.loading === false) {
        return prev;
      }
      return { ...prev, ...next, loading: false };
    });
  }, []);

  useEffect(() => {
    if (!api) {
      setState((prev) => ({ ...prev, loading: false, authError: 'Electron API unavailable' }));
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const next = await api.hydrate();
      if (!cancelled) applyState(next);
    })();

    const unsub = api.onChanged?.((next) => {
      if (!cancelled) applyState(next);
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [applyState]);

  const saveTelegramApi = useCallback(
    async (apiId, apiHash) => {
      if (!api) return { ok: false };
      const result = await api.saveTelegramApi(apiId, apiHash);
      if (result.ok) applyState(result.state);
      else setState((prev) => ({ ...prev, authError: result.error }));
      return result;
    },
    [applyState],
  );

  const submitPhone = useCallback(
    async (phone) => {
      if (!api) return;
      const next = await api.submitPhone(phone);
      applyState(next);
    },
    [applyState],
  );

  const submitEmail = useCallback(
    async (email) => {
      if (!api) return;
      const next = await api.submitEmail(email);
      applyState(next);
    },
    [applyState],
  );

  const submitEmailCode = useCallback(
    async (code) => {
      if (!api) return;
      const next = await api.submitEmailCode(code);
      applyState(next);
    },
    [applyState],
  );

  const submitRegistration = useCallback(
    async (firstName, lastName) => {
      if (!api) return;
      const next = await api.submitRegistration(firstName, lastName);
      applyState(next);
    },
    [applyState],
  );

  const submitCode = useCallback(
    async (code) => {
      if (!api) return;
      const next = await api.submitCode(code);
      applyState(next);
    },
    [applyState],
  );

  const submitPassword = useCallback(
    async (password) => {
      if (!api) return;
      const next = await api.submitPassword(password);
      applyState(next);
    },
    [applyState],
  );

  const signOut = useCallback(async () => {
    if (!api) return;
    const next = await api.signOut();
    applyState(next);
  }, [applyState]);

  const switchAccount = useCallback(async (accountId) => {
    if (!api) return;
    const next = await api.switchAccount(accountId);
    applyState(next);
  }, [applyState]);

  const addAccount = useCallback(async () => {
    if (!api) return;
    const next = await api.addAccount();
    applyState(next);
  }, [applyState]);


  const resetTelegramApi = useCallback(async () => {
    if (!api) return;
    const next = await api.resetTelegramApi();
    applyState(next);
  }, [applyState]);

  const factoryReset = useCallback(async () => {
    if (!api) return;
    await api.factoryReset();
  }, [applyState]);

  const checkAccountStatus = useCallback(async () => {
    if (!api?.checkAccountStatus) return null;
    return api.checkAccountStatus();
  }, []);

  return {
    state,
    saveTelegramApi,
    submitPhone,
    submitEmail,
    submitEmailCode,
    submitRegistration,
    submitCode,
    submitPassword,
    signOut,
    switchAccount,
    addAccount,
    resetTelegramApi,
    factoryReset,
    checkAccountStatus,
  };
}
