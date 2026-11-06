/**
 * Server-safe route helpers. Plain module (no "use client") so that server
 * components can call these during SSR — importing them from a client
 * component file would make them client references and crash the render.
 */
export type ViewerRole = "org_admin" | "teacher" | "student" | "independent";

/** Canonical home for each role. */
export function roleHome(role: ViewerRole): string {
  switch (role) {
    case "org_admin":
      return "/school/dashboard";
    case "teacher":
      return "/teacher/dashboard";
    case "student":
      return "/student/dashboard";
    default:
      return "/onboarding";
  }
}
