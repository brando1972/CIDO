import QRCode from "qrcode";
import { generateTotpCode } from "../src/auth/totp.js";

const USERS: Record<string, { username: string; secret: string }> = {
  brandonlray: {
    username: "brandonlray",
    secret: "F3QF2LMXJFW7JWNFGMESDH2DYAD26XYC",
  },
  jmccool: {
    username: "jmccool",
    secret: "OKHIOXM7WACSS6KYAHBFOKHDSNOCDVQS",
  },
};

async function main() {
  const targetUser = (process.argv[2] || "brandonlray").toLowerCase();
  const config = USERS[targetUser] || USERS.brandonlray!;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const remaining = 30 - (nowSeconds % 30);
  const code = generateTotpCode(config.secret, nowSeconds);

  const uri = `otpauth://totp/CIDO:${encodeURIComponent(config.username)}?secret=${config.secret}&issuer=CIDO&algorithm=SHA1&digits=6&period=30`;

  console.log("\n=======================================================");
  console.log(`  CURRENT 2FA CODE FOR: ${config.username.toUpperCase()}`);
  console.log("=======================================================");
  console.log(`\n  👉  \x1b[1m\x1b[32m${code.slice(0, 3)} ${code.slice(3)}\x1b[0m  (valid for another \x1b[33m${remaining}s\x1b[0m)`);
  console.log("\n=======================================================");
  console.log("  HOW TO ADD TO YOUR AUTHENTICATOR APP:");
  console.log("  1. In Google Authenticator / 1Password / Apple Keychain:");
  console.log("     Choose 'Enter a setup key' or 'Add verification code'.");
  console.log(`  2. Account Name: ${config.username} (CIDO)`);
  console.log(`  3. Secret Key:   ${config.secret}`);
  console.log("-------------------------------------------------------");
  console.log("  OR SCAN THIS QR CODE WITH YOUR PHONE CAMERA:");
  console.log("-------------------------------------------------------");

  const terminalQr = await QRCode.toString(uri, { type: "terminal", small: true });
  console.log(terminalQr);
  console.log("=======================================================\n");
}

main().catch(console.error);
