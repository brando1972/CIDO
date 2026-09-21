import { describe, it, expect } from "vitest";
import {
  generateBase32Secret,
  generateTotpCode,
  verifyTotpCode,
  generateTotpUri,
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
} from "../../src/auth/totp.js";
import { AuthService } from "../../src/auth/auth.service.js";
import type { CidoDatabaseRepository, UserRecord } from "../../src/db/db.js";

describe("TOTP & Auth Utilities", () => {
  it("generates base32 secret and valid 6-digit TOTP code", () => {
    const secret = generateBase32Secret();
    expect(secret.length).toBeGreaterThanOrEqual(16);

    const code = generateTotpCode(secret);
    expect(code).toMatch(/^\d{6}$/);

    const isValid = verifyTotpCode(secret, code);
    expect(isValid).toBe(true);

    const isInvalid = verifyTotpCode(secret, "999999" === code ? "000000" : "999999");
    expect(isInvalid).toBe(false);
  });

  it("generates standard otpauth URI", () => {
    const uri = generateTotpUri("brandonlray", "JBSWY3DPEHPK3PXP");
    expect(uri).toContain("otpauth://totp/CIDO:brandonlray");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=CIDO");
  });

  it("hashes and verifies passwords securely using scrypt", async () => {
    const password = "SuperSecretPassword2026!";
    const hash = await hashPassword(password);
    expect(hash).toContain(":");

    const correct = await verifyPassword(password, hash);
    expect(correct).toBe(true);

    const wrong = await verifyPassword("WrongPassword!", hash);
    expect(wrong).toBe(false);
  });

  it("signs and verifies HMAC-SHA256 JWT tokens", () => {
    const secret = "test-secret-key-12345";
    const payload = { sub: "user-uuid-1", username: "brandonlray" };
    const token = signJwt(payload, secret, 3600);

    const verified = verifyJwt<typeof payload>(token, secret);
    expect(verified).not.toBeNull();
    expect(verified?.username).toBe("brandonlray");
    expect(verified?.sub).toBe("user-uuid-1");

    const forged = verifyJwt(token, "different-key");
    expect(forged).toBeNull();
  });

  it("handles complete 2FA login lifecycle with AuthService", async () => {
    const mockUsers = new Map<string, UserRecord>();
    const secret = generateBase32Secret();
    const passwordHash = await hashPassword("MyPassword123!");

    const user: UserRecord = {
      id: "u-123",
      username: "brandonlray",
      email: "brandonlray@cido.local",
      password_hash: passwordHash,
      totp_secret: secret,
      totp_enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockUsers.set("brandonlray", user);

    const mockDb = {
      findUserByUsername: async (un: string) => mockUsers.get(un.toLowerCase()) ?? null,
      findUserById: async (id: string) => (id === "u-123" ? user : null),
    } as unknown as CidoDatabaseRepository;

    const auth = new AuthService(mockDb, "test-jwt-secret");

    // 1. Invalid password
    const failLogin = await auth.login("brandonlray", "WrongPass");
    expect(failLogin.success).toBe(false);

    // 2. Valid credentials -> 2FA challenge
    const challengeLogin = await auth.login("brandonlray", "MyPassword123!");
    expect(challengeLogin.success).toBe(true);
    expect(challengeLogin.require2fa).toBe(true);
    expect(challengeLogin.challengeToken).toBeDefined();

    // 3. Invalid 2FA code fails
    const fail2FA = await auth.verify2fa(challengeLogin.challengeToken!, "000000");
    expect(fail2FA.success).toBe(false);

    // 4. Valid 2FA code succeeds and returns session JWT
    const validCode = generateTotpCode(secret);
    const success2FA = await auth.verify2fa(challengeLogin.challengeToken!, validCode);
    expect(success2FA.success).toBe(true);
    expect(success2FA.token).toBeDefined();
    expect(success2FA.user?.username).toBe("brandonlray");

    // 5. Verify session JWT
    const session = auth.verifySession(success2FA.token!);
    expect(session?.username).toBe("brandonlray");
  });
});
