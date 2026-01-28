// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  // 1. Obtener el token de la cookie
  const token = request.cookies.get('session_token')?.value;

  // 2. Si no hay token, redirigir al login
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 3. Verificar la validez del token
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);

    // 4. Si el token es válido, permitir que la petición continúe
    return NextResponse.next();
  } catch (error) {
    console.error('Token inválido:', error);
    // 5. Si el token es inválido, redirigir al login
    const response = NextResponse.redirect(new URL('/login', request.url));
    // Limpiamos la cookie inválida
    response.cookies.delete('session_token');
    return response;
  }
}

// El "matcher" especifica qué rutas debe proteger este middleware
export const config = {
  matcher: ['/dashboard/:path*'], // Protegerá /dashboard y todas sus sub-rutas
};