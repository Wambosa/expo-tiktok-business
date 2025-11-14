import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import { AppStateStatus, AppState, Platform } from "react-native";
import Constants from "expo-constants";

import { 
  TiktokSDKModuleEvents, 
  TiktokEventName, 
  TiktokSDKConfig,
  TiktokEventParams,
  TiktokPlatformAppIds
} from "./TiktokSDK.types";

/**
 * Native module interface
 */
interface TiktokSDKModule {
  initialize(config: TiktokSDKConfig): Promise<boolean>;
  setDebugMode(enabled: boolean): Promise<boolean>;
  trackEvent(
    eventName: string,
    eventData: Record<string, any>
  ): Promise<boolean>;
  trackRouteChange(
    routeName: string, 
    params?: Record<string, any>
  ): Promise<boolean>;
}

// Create a getter function for the native module that will be called when needed
const getNativeModule = (): TiktokSDKModule | null => {
  try {
    // Use the modern requireNativeModule approach instead of deprecated NativeModulesProxy
    console.log('Attempting to load TiktokSDK native module...');
    
    const module = requireNativeModule('TiktokSDK');
    console.log('TiktokSDK native module loaded:', module ? 'SUCCESS' : 'FAILED');
    console.log('Platform:', Platform.OS);
    
    return module as TiktokSDKModule || null;
  } catch (error) {
    console.error('Error accessing TiktokSDK native module:', error);
    return null;
  }
};

/**
 * TikTok Business SDK wrapper class
 */
class TiktokSDK {
  private _isInitialized: boolean = false;
  private _config?: TiktokSDKConfig;
  private _appStateSubscription: any = null;

  /**
   * Get the bundle ID or package name for the current platform
   * @private
   */
  private _getPlatformAppId(
    appId: string | { ios?: string; android?: string; default: string }
  ): string {
    if (typeof appId === 'string') {
      return appId;
    }
    
    const platform = Platform.OS;
    if (platform === 'ios' && appId.ios) {
      return appId.ios;
    } else if (platform === 'android' && appId.android) {
      return appId.android;
    }
    
    return appId.default;
  }
  
  /**
   * Get the TikTok App ID for the current platform
   * @private
   */
  private _getPlatformTikTokAppId(
    tiktokAppId: string | TiktokPlatformAppIds
  ): string {
    if (typeof tiktokAppId === 'string') {
      return tiktokAppId;
    }
    
    const platform = Platform.OS;
    if (platform === 'ios' && tiktokAppId.ios) {
      return tiktokAppId.ios;
    } else if (platform === 'android' && tiktokAppId.android) {
      return tiktokAppId.android;
    }
    
    return tiktokAppId.default;
  }
  
  /**
   * Try to get the app's bundle ID/package name from Expo Constants
   * @private
   */
  private _tryGetExpoBundleId(): string | null {
    try {
      // Try to get the bundle ID from Expo Constants
      const { manifest } = Constants;
      if (manifest) {
        // For Expo SDK 46 and above
        if (manifest.extra && manifest.extra.expoClient) {
          if (Platform.OS === 'ios' && manifest.extra.expoClient.ios && manifest.extra.expoClient.ios.bundleIdentifier) {
            return manifest.extra.expoClient.ios.bundleIdentifier;
          } else if (Platform.OS === 'android' && manifest.extra.expoClient.android && manifest.extra.expoClient.android.package) {
            return manifest.extra.expoClient.android.package;
          }
        }
        
        // For older Expo SDK versions
        if (Platform.OS === 'ios' && manifest.ios && manifest.ios.bundleIdentifier) {
          return manifest.ios.bundleIdentifier;
        } else if (Platform.OS === 'android' && manifest.android && manifest.android.package) {
          return manifest.android.package;
        }
      }
    } catch (error) {
      console.warn('TiktokSDK: Failed to get bundle ID from Expo Constants', error);
    }
    
    return null;
  }

  /**
   * Initialize the TikTok Business SDK
   * @param appIdParam Your app ID or platform-specific app IDs
   * @param tiktokAppIdParam Your TikTok app ID or platform-specific TikTok app IDs
   * @param options Additional configuration options
   */
  async initialize(
    appIdParam: string | { ios?: string; android?: string; default: string },
    tiktokAppIdParam: string | TiktokPlatformAppIds,
    options: {
      debugMode?: boolean;
      autoTrackAppLifecycle?: boolean;
      autoTrackRouteChanges?: boolean;
      accessToken?: string;
    } = {}
  ): Promise<boolean> {
    console.log('[TiktokSDK] initialize() called');
    console.log('[TiktokSDK] Current _isInitialized state:', this._isInitialized);

    // Get platform-specific app ID
    let appId: string;
    if (typeof appIdParam === 'string') {
      appId = appIdParam;
    } else {
      appId = this._getPlatformAppId(appIdParam);
    }

    // Get platform-specific TikTok app ID
    let tiktokAppId: string;
    if (typeof tiktokAppIdParam === 'string') {
      tiktokAppId = tiktokAppIdParam;
    } else {
      tiktokAppId = this._getPlatformTikTokAppId(tiktokAppIdParam);
    }

    console.log('[TiktokSDK] Resolved appId:', appId);
    console.log('[TiktokSDK] Resolved tiktokAppId:', tiktokAppId);
    console.log('[TiktokSDK] Platform:', Platform.OS);

    // Create config
    const config: any = {
      appId,
      tiktokAppId,
      debugMode: options.debugMode || false,
      autoTrackAppLifecycle: options.autoTrackAppLifecycle !== false, // default to true
      autoTrackRouteChanges: options.autoTrackRouteChanges !== false, // default to true,
    };

    // Add access token if provided
    if (options.accessToken) {
      config.accessToken = options.accessToken;
      console.log('[TiktokSDK] Access token provided');
    }

    this._config = config;

    if (config.debugMode) {
      console.log(`[TiktokSDK] Initializing for ${Platform.OS} with appId=${appId}, tiktokAppId=${tiktokAppId}`);
    }

    // Initialize the native SDK
    console.log('[TiktokSDK] Getting native module...');
    const module = getNativeModule();
    if (!module) {
      console.error("[TiktokSDK] Native module not available");
      return false;
    }
    console.log('[TiktokSDK] Native module obtained successfully');

    try {
      console.log('[TiktokSDK] Calling native module.initialize()...');
      const success = await module.initialize(config) || false;
      console.log('[TiktokSDK] Native module.initialize() returned:', success);

      this._isInitialized = success;
      console.log('[TiktokSDK] _isInitialized flag set to:', this._isInitialized);

      // Set up app state change listener if lifecycle tracking is enabled
      if (success && config.autoTrackAppLifecycle) {
        console.log('[TiktokSDK] Setting up app state listener');
        this._setupAppStateListener();
      }

      console.log('[TiktokSDK] Initialization complete, returning:', success);
      return success;
    } catch (error) {
      console.error("[TiktokSDK] Error initializing SDK", error);
      return false;
    }
  }

  /**
   * Set debug mode for the SDK
   * @param enabled Whether to enable debug mode
   */
  async setDebugMode(enabled: boolean): Promise<boolean> {
    const module = getNativeModule();
    if (!module) {
      console.error("TiktokSDK: Native module not available");
      return false;
    }
    
    try {
      return await module.setDebugMode(enabled) || false;
    } catch (error) {
      console.error("TiktokSDK: Error setting debug mode", error);
      return false;
    }
  }

  /**
   * Track a standard or custom event
   * @param eventName Event name (use TiktokEventName for standard events)
   * @param eventParams Event parameters
   */
  async trackEvent(
    eventName: TiktokEventName | string,
    eventParams: TiktokEventParams = {}
  ): Promise<boolean> {
    console.log('[TiktokSDK] trackEvent() called with event:', eventName);
    console.log('[TiktokSDK] Event params:', JSON.stringify(eventParams, null, 2));
    console.log('[TiktokSDK] Current _isInitialized state:', this._isInitialized);

    if (!this._isInitialized) {
      console.warn("[TiktokSDK] SDK not initialized. Call initialize() first.");
      console.warn("[TiktokSDK] Event", eventName, "will not be tracked");
      return false;
    }

    console.log('[TiktokSDK] Getting native module for event tracking...');
    const module = getNativeModule();
    if (!module) {
      console.error("[TiktokSDK] Native module not available");
      return false;
    }
    console.log('[TiktokSDK] Native module obtained for event tracking');

    try {
      console.log('[TiktokSDK] Calling native module.trackEvent() for:', eventName);
      const result = await module.trackEvent(eventName, eventParams) || false;
      console.log('[TiktokSDK] Native module.trackEvent() returned:', result);
      return result;
    } catch (error) {
      console.error("[TiktokSDK] Error tracking event", eventName, error);
      return false;
    }
  }
  
  /**
   * Track a route change (screen view) - useful for manual tracking
   * @param routeName The name of the route/screen
   * @param params Optional route parameters
   */
  async trackRouteChange(
    routeName: string, 
    params?: Record<string, any>
  ): Promise<boolean> {
    if (!this._isInitialized) {
      return false;
    }
    
    const module = getNativeModule();
    if (!module) {
      console.error("TiktokSDK: Native module not available");
      return false;
    }
    
    try {
      return await module.trackRouteChange(routeName, params) || false;
    } catch (error) {
      console.error("TiktokSDK: Error tracking route change", error);
      return false;
    }
  }
  
  /**
   * Helper: Track a search event
   * @param searchString The search query
   * @param additionalParams Additional event parameters
   */
  async trackSearch(
    searchString: string, 
    additionalParams: TiktokEventParams = {}
  ): Promise<boolean> {
    return this.trackEvent(TiktokEventName.SEARCH, {
      search_string: searchString,
      ...additionalParams,
    });
  }
  
  /**
   * Helper: Track a content view
   * @param contentId Content ID
   * @param contentType Content type
   * @param additionalParams Additional event parameters
   */
  async trackViewContent(
    contentId: string,
    contentType: string,
    additionalParams: TiktokEventParams = {}
  ): Promise<boolean> {
    return this.trackEvent(TiktokEventName.VIEW_CONTENT, {
      content_id: contentId,
      content_type: contentType,
      ...additionalParams,
    });
  }
  
  /**
   * Helper: Track a completed purchase
   * @param value The monetary value of the purchase
   * @param currency The currency code (e.g., USD)
   * @param contents The purchased items
   * @param additionalParams Additional event parameters
   */
  async trackCompletePurchase(
    value: number,
    currency: string,
    contents: Array<{
      content_id: string;
      content_type?: string;
      content_name?: string;
      quantity?: number;
      price?: number;
    }>,
    additionalParams: TiktokEventParams = {}
  ): Promise<boolean> {
    return this.trackEvent(TiktokEventName.COMPLETE_PAYMENT, {
      value,
      currency,
      contents,
      ...additionalParams,
    });
  }
  
  /**
   * Clean up resources when the module is no longer needed
   */
  cleanup(): void {
    if (this._appStateSubscription) {
      this._appStateSubscription.remove();
      this._appStateSubscription = null;
    }
  }
  
  /**
   * Set up app state listener for automatic event tracking
   */
  private _setupAppStateListener(): void {
    // Clean up existing listener if any
    if (this._appStateSubscription) {
      this._appStateSubscription.remove();
    }
    
    // Set up new listener
    this._appStateSubscription = AppState.addEventListener(
      'change',
      this._handleAppStateChange
    );
  }
  
  /**
   * Handle app state changes for automatic event tracking
   */
  private _handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      // App came to foreground - could track a custom event here if needed
      // We don't track Launch here as it's handled during initialization
    }
  };
}

// Export the singleton instance
export default new TiktokSDK();
