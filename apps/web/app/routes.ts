import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("join/:code", "routes/join.tsx"),
  route("s/:code", "routes/session.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("security", "routes/security.tsx"),
  route("terms", "routes/terms.tsx"),
] satisfies RouteConfig;
