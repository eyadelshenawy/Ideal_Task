import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

export interface SecurityConfigDto {
  sessionIdleTimeoutMinutes: number;
  passwordExpiryDays: number;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfigDto = {
  sessionIdleTimeoutMinutes: 15,
  passwordExpiryDays: 90,
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireNumber: true,
  passwordRequireSymbol: true,
};

export async function loadSecurityConfig(): Promise<SecurityConfigDto> {
  const row = await prisma.securityConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!row) return DEFAULT_SECURITY_CONFIG;
  return {
    sessionIdleTimeoutMinutes: row.sessionIdleTimeoutMinutes,
    passwordExpiryDays: row.passwordExpiryDays,
    passwordMinLength: row.passwordMinLength,
    passwordRequireUppercase: row.passwordRequireUppercase,
    passwordRequireNumber: row.passwordRequireNumber,
    passwordRequireSymbol: row.passwordRequireSymbol,
  };
}

export async function saveSecurityConfig(input: SecurityConfigDto): Promise<SecurityConfigDto> {
  const row = await prisma.securityConfig.upsert({
    where: { id: SINGLETON_ID },
    update: input,
    create: { id: SINGLETON_ID, ...input },
  });
  return {
    sessionIdleTimeoutMinutes: row.sessionIdleTimeoutMinutes,
    passwordExpiryDays: row.passwordExpiryDays,
    passwordMinLength: row.passwordMinLength,
    passwordRequireUppercase: row.passwordRequireUppercase,
    passwordRequireNumber: row.passwordRequireNumber,
    passwordRequireSymbol: row.passwordRequireSymbol,
  };
}

export interface PasswordCheck {
  ok: boolean;
  errors: string[];
}

export function checkPasswordStrength(password: string, cfg: SecurityConfigDto): PasswordCheck {
  const errors: string[] = [];
  if (password.length < cfg.passwordMinLength) {
    errors.push(`Password must be at least ${cfg.passwordMinLength} characters long.`);
  }
  if (cfg.passwordRequireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must include an uppercase letter.");
  }
  if (cfg.passwordRequireNumber && !/[0-9]/.test(password)) {
    errors.push("Password must include a number.");
  }
  if (cfg.passwordRequireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must include a symbol.");
  }
  return { ok: errors.length === 0, errors };
}

export function passwordExpired(passwordChangedAt: Date | null, expiryDays: number): boolean {
  if (!passwordChangedAt || expiryDays <= 0) return false;
  const ageMs = Date.now() - passwordChangedAt.getTime();
  return ageMs > expiryDays * 86400000;
}
