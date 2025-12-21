// apps/web/lib/auth-store.ts
'use client';

export type AuthStoreState = {
  sessionExpired: boolean;
  message: string;
};

type Listener = () => void;

function createAuthStore() {
  let state: AuthStoreState = {
    sessionExpired: false,
    message: '',
  };

  const listeners = new Set<Listener>();

  function emit() {
    listeners.forEach((l) => l());
  }

  return {
    getState() {
      return state;
    },

    setState(partial: Partial<AuthStoreState>) {
      state = { ...state, ...partial };
      emit();
    },

    // Mark session expired (called by http.ts when 401)
    expire(message?: string) {
      if (state.sessionExpired) return; // prevent spam
      state = {
        sessionExpired: true,
        message: message || 'Session has expired. Please log in again.',
      };
      emit();
    },

    reset() {
      state = { sessionExpired: false, message: '' };
      emit();
    },

    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// ✅ This is what your layout imports
export const authStore = createAuthStore();
