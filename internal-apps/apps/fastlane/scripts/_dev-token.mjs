import { SignJWT } from "jose";
const t = await new SignJWT({ sub: "reviewer-1", roles: ["reviewer"] })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuer("fastlane")
  .setExpirationTime("12h")
  .sign(new TextEncoder().encode("dev-secret"));
console.log(t);
