// src/app/api/auth/mercadolibre/store-verifier/route.ts
import { NextResponse } from 'next/server';
import { serialize } from 'cookie';

export async function POST(request: Request) {
  try {
    const { codeVerifier } = await request.json();

    if (!codeVerifier) {
      return NextResponse.json({ error: 'Code verifier is required' }, { status: 400 });
    }

    // Crear una cookie HTTP-only para el code_verifier
    const serializedCookie = serialize('pkce_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 5, // 5 minutos
      path: '/',
      sameSite: 'lax',
    });

    return NextResponse.json(
      { success: true },
      {
        status: 200,
        headers: { 'Set-Cookie': serializedCookie },
      }
    );

  } catch (error) {
    console.error('Error storing code verifier:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
