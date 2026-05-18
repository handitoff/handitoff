import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("phone-to-pc", "routes/phone-to-pc.tsx"),
  route("iphone-to-windows", "routes/iphone-to-windows.tsx"),
  route("android-to-mac", "routes/android-to-mac.tsx"),
  route("airdrop-alternative", "routes/airdrop-alternative.tsx"),
  route("send-large-files", "routes/send-large-files.tsx"),
  route("no-install-file-transfer", "routes/no-install-file-transfer.tsx"),
  route("faq", "routes/faq.tsx"),
  route("join/:code", "routes/join.tsx"),
  route("s/:code", "routes/session.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("security", "routes/security.tsx"),
  route("terms", "routes/terms.tsx"),
  route("admin/analytics", "routes/admin-analytics.tsx"),
] satisfies RouteConfig;
