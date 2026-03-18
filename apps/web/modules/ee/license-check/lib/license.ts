import "server-only";
import { cache as reactCache } from "react";
import { createCacheKey } from "@formbricks/cache";
import { logger } from "@formbricks/logger";
import { env } from "@/lib/env";
import { hashString } from "@/lib/hash-string";
import {
  TEnterpriseLicenseDetails,
  TEnterpriseLicenseFeatures,
  TLicenseStatus,
} from "@/modules/ee/license-check/types/enterprise-license";

// Configuration
const CONFIG = {
  CACHE: {
    FETCH_LICENSE_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
    FAILED_FETCH_TTL_MS: 10 * 60 * 1000, // 10 minutes for failed/null results
    PREVIOUS_RESULT_TTL_MS: 4 * 24 * 60 * 60 * 1000, // 4 days
    GRACE_PERIOD_MS: 3 * 24 * 60 * 60 * 1000, // 3 days
  },
} as const;

export const GRACE_PERIOD_MS = CONFIG.CACHE.GRACE_PERIOD_MS;
export const FETCH_LICENSE_TTL_MS = CONFIG.CACHE.FETCH_LICENSE_TTL_MS;
export const FAILED_FETCH_TTL_MS = CONFIG.CACHE.FAILED_FETCH_TTL_MS;

// Types
type FallbackLevel = "live" | "cached" | "grace" | "default";

type TEnterpriseLicenseResult = {
  active: boolean;
  features: TEnterpriseLicenseFeatures | null;
  lastChecked: Date;
  isPendingDowngrade: boolean;
  fallbackLevel: FallbackLevel;
  status: TLicenseStatus;
};

// Error types
export class LicenseApiError extends Error {
  public readonly code: string;
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "LicenseApiError";
    this.code = "API_ERROR";
  }
}

// Cache keys
const getCacheIdentifier = () => {
  if (globalThis.window !== undefined) {
    return "browser";
  }
  if (!env.ENTERPRISE_LICENSE_KEY) {
    return "no-license";
  }
  return hashString(env.ENTERPRISE_LICENSE_KEY);
};

export const getCacheKeys = () => {
  const identifier = getCacheIdentifier();
  return {
    FETCH_LICENSE_CACHE_KEY: createCacheKey.license.status(identifier),
    PREVIOUS_RESULT_CACHE_KEY: createCacheKey.license.previous_result(identifier),
    FETCH_LOCK_CACHE_KEY: createCacheKey.license.fetch_lock(identifier),
  };
};

// All features enabled
const DEFAULT_FEATURES: TEnterpriseLicenseFeatures = {
  isMultiOrgEnabled: true,
  projects: null,
  twoFactorAuth: true,
  sso: true,
  whitelabel: true,
  removeBranding: true,
  contacts: true,
  ai: true,
  saml: true,
  spamProtection: true,
  auditLogs: true,
  accessControl: true,
  quotas: true,
};

export const getEnterpriseLicense = reactCache(async (): Promise<TEnterpriseLicenseResult> => {
  return {
    active: true,
    features: DEFAULT_FEATURES,
    lastChecked: new Date(),
    isPendingDowngrade: false,
    fallbackLevel: "live" as const,
    status: "active" as const,
  };
});

export const getLicenseFeatures = async (): Promise<TEnterpriseLicenseFeatures | null> => {
  try {
    const licenseState = await getEnterpriseLicense();
    return licenseState.active ? licenseState.features : null;
  } catch (e) {
    logger.error(e, "Error getting license features");
    return null;
  }
};

export const clearLicenseCache = async (): Promise<void> => {
  // No-op: license is always active
};

export const fetchLicense = async (): Promise<TEnterpriseLicenseDetails | null> => {
  return null;
};

export const fetchLicenseFresh = async (): Promise<TEnterpriseLicenseDetails | null> => {
  return null;
};

export const computeFreshLicenseState = async (
  _freshLicense: TEnterpriseLicenseDetails | null
): Promise<TEnterpriseLicenseResult> => {
  return getEnterpriseLicense();
};
