// src/app/api/auth/mercadolibre/token/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const cookieStore = await cookies();
    let sessionToken = cookieStore.get('session_token')?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Cuando el encabezado `Cookie` trae el token repetido varias veces,
    // nos quedamos solo con la primera ocurrencia para obtener un JWT válido.
    const tokenParts = sessionToken.split('.');
    if (tokenParts.length > 3) {
      sessionToken = tokenParts.slice(0, 3).join('.');
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    console.log("🔐 JWT_SECRET:", process.env.JWT_SECRET);

    let payload;
    try {
      ({ payload } = await jwtVerify(sessionToken, secret));
    } catch {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const userId = payload.userId as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        mercadolibreAccessToken: true,
        mercadolibreRefreshToken: true,
        mercadolibreTokenExpiresAt: true,
      },
    });

    if (!user || !user.mercadolibreAccessToken || !user.mercadolibreRefreshToken) {
      return NextResponse.json({ error: 'MercadoLibre no está conectado' }, { status: 400 });
    }

    return NextResponse.json({
      accessToken: user.mercadolibreAccessToken,
      refreshToken: user.mercadolibreRefreshToken,
      expiresAt: user.mercadolibreTokenExpiresAt,
    });
  } catch (error) {
    console.error('Error obteniendo tokens de MercadoLibre:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
