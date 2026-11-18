import path from "node:path";

export const ADMIN_STATE = path.join(__dirname, ".auth", "admin.json");
/** A second, separate admin session used only by the sign-out test (signing out revokes every session of that login). */
export const LOGOUT_STATE = path.join(__dirname, ".auth", "admin-logout.json");
