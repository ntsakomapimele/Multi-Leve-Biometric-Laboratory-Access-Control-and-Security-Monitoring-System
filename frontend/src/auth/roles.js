export const ROLES = {
  ADMINISTRATOR: "Administrator",
  SECURITY_OFFICER: "Security Officer",
  LABORATORY_USER: "Laboratory User",
};

export const ROLE_ACCESS = {
  [ROLES.ADMINISTRATOR]: [
    "/",
    "/laboratories",
    "/biometric-profiles",
    "/permissions",
    "/authentication-events",
    "/security-events",
    "/authenticate",
    "/terminal",
  ],
  [ROLES.SECURITY_OFFICER]: [
    "/",
    "/laboratories",
    "/biometric-profiles",
    "/permissions",
    "/authentication-events",
    "/security-events",
    "/terminal",
  ],
  [ROLES.LABORATORY_USER]: ["/", "/laboratories", "/biometric-profiles", "/permissions", "/terminal"],
};

export function getRole(roles = []) {
  if (roles.includes(ROLES.ADMINISTRATOR)) return ROLES.ADMINISTRATOR;
  if (roles.includes(ROLES.SECURITY_OFFICER)) return ROLES.SECURITY_OFFICER;
  if (roles.includes(ROLES.LABORATORY_USER)) return ROLES.LABORATORY_USER;
  return null;
}

export function canAccess(role, path) {
  return ROLE_ACCESS[role]?.includes(path) ?? path === "/";
}