import { NextResponse, type NextRequest } from "next/server";

// Chequeo optimista: solo mira si existe la cookie. La validación real de la
// sesión y los permisos ocurre en el servidor (lib/auth).
const SESSION_COOKIE = "session";
const authPages = ["/ingresar", "/registro"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/app") && !hasSession) {
    return NextResponse.redirect(new URL("/ingresar", req.nextUrl));
  }
  if (authPages.includes(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/app", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/ingresar", "/registro"],
};
