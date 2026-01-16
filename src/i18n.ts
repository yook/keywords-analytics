import messages from './locales/index';

export const i18n = {
  global: {
    t(key) {
      // Simple dot notation resolver for nested keys
      const keys = String(key).split('.');
      let value = messages['ru']; // default to Russian, or use 'en' if needed
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return key; // fallback: return key if not found
        }
      }
      return value;
    }
  }
};
