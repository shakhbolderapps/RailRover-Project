import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * RailRover — native configuration for BOTH platforms.
 *
 * PARITY RULE (docs/PLATFORM-PARITY.md): the `ios` and `android` blocks below are maintained
 * side by side, in the same edit, always. Adding an Android permission without its iOS
 * counterpart fails `pnpm parity` and CI. We test on Android for now because no iOS device is
 * available — the iOS config must still be complete and must still prebuild cleanly.
 *
 * The machine-readable pairing table this file is checked against lives in platform-parity.json.
 */

const BUNDLE_ID = 'com.bolderapps.railrover';

/**
 * Honest purpose strings. These are read by App Store review and by the driver at the permission
 * prompt, and SOW M1 requires "a clear purpose string before any tracking begins".
 */
const LOCATION_WHEN_IN_USE =
  'RailRover uses your location to center the map on you, to auto-select the nearest railroad ' +
  'crossing when you report one as blocked or clear, and to check for blocked crossings ahead on ' +
  'your route.';

const LOCATION_ALWAYS =
  'RailRover can check for blocked railroad crossings ahead on your route while the app is in ' +
  'the background, so you are warned in time to reroute even when your screen is off.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'RailRover',
  slug: 'railrover',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'railrover',
  userInterfaceStyle: 'automatic',

  // ---------------------------------------------------------------------------------------
  // iOS — written in full and kept in lockstep, even though we cannot run it yet.
  // Gaps 1 and 2 in the register (APNs, device builds) are blocked on the Apple Developer
  // Program account, which is a client-owned SOW dependency. The CODE is complete.
  // ---------------------------------------------------------------------------------------
  ios: {
    bundleIdentifier: BUNDLE_ID,
    buildNumber: '1',
    supportsTablet: false,
    // Location alerts are useless without a connection; be explicit rather than silently failing.
    requireFullScreen: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE,
      // Declared now so enabling background tracking in a later phase needs no config work,
      // exactly as SOW §7 requires ("built so always-on background tracking can be enabled in a
      // later phase without rework").
      NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_ALWAYS,
      UIBackgroundModes: ['location', 'remote-notification', 'fetch'],
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      // APNs environment. Untestable until the Apple Developer Program account exists (gap #1),
      // but declared so the entitlement does not have to be discovered late.
      'aps-environment': 'development',
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------------------
  // Android — the platform we build and test on right now.
  // ---------------------------------------------------------------------------------------
  android: {
    package: BUNDLE_ID,
    versionCode: 1,
    predictiveBackGestureEnabled: false,
    adaptiveIcon: {
      backgroundColor: '#0B1F33',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      // Paired with NSLocationAlwaysAndWhenInUseUsageDescription above. Declared, not yet used:
      // background tracking is a later-phase feature for BOTH platforms per the SOW.
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.VIBRATE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ],
    // FCM credentials. Not committed — see .env.example and README.md.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },

  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    // Configures Android gradle properties and the iOS Podfile (global variables, post-install,
    // dSYM handling) for MapLibre's native SDK. Listed for BOTH platforms in one call, so the
    // iOS side cannot silently fall behind — the parity rule above applies to plugins too.
    '@maplibre/maplibre-react-native',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0B1F33',
        image: './assets/images/splash-icon.png',
        imageWidth: 96,
      },
    ],
    [
      // One plugin call configures BOTH platforms' location permissions and purpose strings.
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
        locationAlwaysAndWhenInUsePermission: LOCATION_ALWAYS,
        // Background location is architected but not enabled — deferred for both platforms.
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    [
      'expo-notifications',
      {
        color: '#D7262F',
        defaultChannel: 'route-alerts',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // Latest stable at publish time, per SOW §7.
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          minSdkVersion: 24,
        },
        ios: {
          deploymentTarget: '16.4', // SDK 57 minimum; bumping this is an iOS-only concern caught by CI
        },
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    orsApiKey: process.env.EXPO_PUBLIC_ORS_API_KEY,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
