import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

const prisma = new PrismaClient();

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token')?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Verificar el JWT del usuario autenticado
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(sessionToken, secret);
    const userId = payload.userId as string;

    // Desconectar la cuenta de MercadoLibre limpiando los campos
    await prisma.user.update({
      where: { id: userId },
      data: {
        mercadolibreId: null,
        mercadolibreAccessToken: null,
        mercadolibreRefreshToken: null,
        mercadolibreTokenExpiresAt: null,
      },
    });

    console.log('✅ Cuenta de MercadoLibre desconectada para usuario:', userId);

    return NextResponse.json({ 
      success: true, 
      message: 'Cuenta de MercadoLibre desconectada exitosamente' 
    });

  } catch (error) {
    console.error('Error al desconectar cuenta de MercadoLibre:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
