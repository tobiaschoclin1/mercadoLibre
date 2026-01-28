// src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { serialize } from 'cookie';

const TOKEN_NAME = 'session_token';

export async function POST() {
  // Para cerrar sesión, simplemente establecemos una cookie con el mismo nombre,
  // pero con una fecha de expiración en el pasado y un valor vacío.
  // El navegador, al ver esto, la elimina automáticamente.
  const serializedCookie = serialize(TOKEN_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0), // Fecha en el pasado para que expire inmediatamente
    path: '/',
  });

  return NextResponse.json(
    { message: 'Sesión cerrada exitosamente' },
    {
      status: 200,
      headers: { 'Set-Cookie': serializedCookie },
    }
  );
}