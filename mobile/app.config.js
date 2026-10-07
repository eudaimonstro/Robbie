// Dynamic Expo config to handle environment-specific settings
// See: https://docs.expo.dev/workflow/configuration/

const IS_DEV = process.env.APP_VARIANT === 'development';
const IS_STAGING = process.env.APP_VARIANT === 'staging';

const getApiUrl = () => {
  if (IS_DEV) {
    // For development, use local backend or development server
    return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
  }
  if (IS_STAGING) {
    return 'https://robbie-backend-staging.up.railway.app';
  }
  // Production
  return 'https://robbie-backend-production.up.railway.app';
};

const getBundleId = () => {
  if (IS_DEV) return 'com.robbie.mobile.dev';
  if (IS_STAGING) return 'com.robbie.mobile.staging';
  return 'com.robbie.mobile';
};

const getAppName = () => {
  if (IS_DEV) return 'Robbie (Dev)';
  if (IS_STAGING) return 'Robbie (Staging)';
  return 'Robbie';
};

module.exports = ({ config }) => {
  return {
    ...config,
    name: getAppName(),
    ios: {
      ...config.ios,
      bundleIdentifier: getBundleId(),
    },
    android: {
      ...config.android,
      package: getBundleId(),
    },
    extra: {
      ...config.extra,
      apiUrl: getApiUrl(),
      // The web app, for the terms pages; in production it shares the API's origin
      webUrl: process.env.EXPO_PUBLIC_WEB_URL || getApiUrl(),
      appVariant: process.env.APP_VARIANT || 'production',
    },
  };
};
