import { CidoDatabaseRepository, type UserRecord } from "../db/db.js";
import {
  hashPassword,
  verifyPassword,
  verifyTotpCode,
  generateBase32Secret,
  generateTotpUri,
  signJwt,
  verifyJwt,
} from "./totp.js";

export interface SessionUser {
  id: string;
  username: string;
  email: string | null;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  require2fa?: boolean;
  challengeToken?: string;
  token?: string;
  user?: SessionUser;
}

export interface Verify2FAResult {
  success: boolean;
  error?: string;
  token?: string;
  user?: SessionUser;
}

export class AuthService {
  private readonly db: CidoDatabaseRepository;
  private readonly jwtSecret: string;

  constructor(db: CidoDatabaseRepository, jwtSecret?: string) {
    this.db = db;
    this.jwtSecret =
      jwtSecret ||
      process.env.JWT_SECRET ||
      "cido-perps-v2-super-secure-jwt-secret-key-2026";
  }

  async login(username: string, password: string): Promise<LoginResult> {
    if (!username || !password) {
      return { success: false, error: "Username and password are required" };
    }

    const user = await this.db.findUserByUsername(username);
    if (!user) {
      return { success: false, error: "Invalid username or password" };
    }

    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return { success: false, error: "Invalid username or password" };
    }

    if (user.totp_enabled) {
      const challengeToken = signJwt(
        {
          purpose: "2fa_challenge",
          userId: user.id,
          username: user.username,
        },
        this.jwtSecret,
        300 // 5 minutes
      );

      return {
        success: true,
        require2fa: true,
        challengeToken,
      };
    }

    const sessionUser: SessionUser = {
      id: user.id,
      username: user.username,
      email: user.email,
    };

    const token = signJwt(
      {
        purpose: "session",
        user: sessionUser,
      },
      this.jwtSecret,
      60 * 60 * 24 * 7 // 7 days
    );

    return {
      success: true,
      require2fa: false,
      token,
      user: sessionUser,
    };
  }

  async verify2fa(challengeToken: string, code: string): Promise<Verify2FAResult> {
    if (!challengeToken || !code) {
      return { success: false, error: "Challenge token and 6-digit code are required" };
    }

    const payload = verifyJwt<{ purpose: string; userId: string; username: string }>(
      challengeToken,
      this.jwtSecret
    );

    if (!payload || payload.purpose !== "2fa_challenge" || !payload.userId) {
      return { success: false, error: "Invalid or expired 2FA session. Please sign in again." };
    }

    const user = await this.db.findUserById(payload.userId);
    if (!user) {
      return { success: false, error: "User not found" };
    }

    const isValidCode = verifyTotpCode(user.totp_secret, code.trim());
    if (!isValidCode) {
      return { success: false, error: "Invalid 2FA code. Please check your authenticator app." };
    }

    const sessionUser: SessionUser = {
      id: user.id,
      username: user.username,
      email: user.email,
    };

    const token = signJwt(
      {
        purpose: "session",
        user: sessionUser,
      },
      this.jwtSecret,
      60 * 60 * 24 * 7 // 7 days
    );

    return {
      success: true,
      token,
      user: sessionUser,
    };
  }

  verifySession(token: string): SessionUser | null {
    const payload = verifyJwt<{ purpose: string; user: SessionUser }>(token, this.jwtSecret);
    if (!payload || payload.purpose !== "session" || !payload.user) {
      return null;
    }
    return payload.user;
  }

  async get2faSetup(userId: string): Promise<{ secret: string; uri: string } | null> {
    const user = await this.db.findUserById(userId);
    if (!user) return null;

    const uri = generateTotpUri(user.username, user.totp_secret);
    return {
      secret: user.totp_secret,
      uri,
    };
  }

  async seedUser(params: {
    username: string;
    email?: string | undefined;
    password: string;
    totpSecret?: string | undefined;
    totpEnabled?: boolean | undefined;
  }): Promise<{ user: UserRecord; secret: string; uri: string }> {
    const secret = params.totpSecret || generateBase32Secret();
    const password_hash = await hashPassword(params.password);
    const user = await this.db.upsertUser({
      username: params.username,
      email: params.email,
      password_hash,
      totp_secret: secret,
      totp_enabled: params.totpEnabled ?? true,
    });

    const uri = generateTotpUri(user.username, secret);
    return { user, secret, uri };
  }
}
