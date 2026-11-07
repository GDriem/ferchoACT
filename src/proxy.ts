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
    // Solo rutas internas (evita redirecciones abiertas con ?next=//otro-sitio)
    const next = req.nextUrl.searchParams.get("next");
    const target = next && /^\/(?![/\\])/.test(next) ? next : "/app";
    return NextResponse.redirect(new URL(target, req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/ingresar", "/registro"],
};
