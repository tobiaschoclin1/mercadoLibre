// src/app/api/user/profile/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Obtener el token de sesión
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token')?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Verificar el JWT
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(sessionToken, secret);
    const userId = payload.userId as string;

    // Obtener el usuario con su información de MercadoLibre
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        mercadolibreId: true,
        mercadolibreAccessToken: true,
        mercadolibreTokenExpiresAt: true,
        mercadolibreRefreshToken: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Verificar si el token de MercadoLibre está vigente
    const isMLConnected = !!(
      user.mercadolibreId &&
      user.mercadolibreAccessToken &&
      user.mercadolibreTokenExpiresAt &&
      user.mercadolibreTokenExpiresAt > new Date()
    );

    // Si está conectado a MercadoLibre, obtener información adicional
    let mercadolibreProfile = null;
    if (isMLConnected && user.mercadolibreAccessToken) {
      try {
        const mlResponse = await fetch(`https://api.mercadolibre.com/users/${user.mercadolibreId}`, {
          headers: {
            'Authorization': `Bearer ${user.mercadolibreAccessToken}`
          }
        });
        
        if (mlResponse.ok) {
          mercadolibreProfile = await mlResponse.json();
        }
      } catch (error) {
        console.log('Error obteniendo perfil de MercadoLibre:', error);
      }
    }

    const isTiendaNubeConnected = !!(
      user.tiendanubeStoreId &&
      user.tiendanubeAccessToken
    );

    let tiendanubeStoreProfile: Record<string, unknown> | null = null;
    if (isTiendaNubeConnected && user.tiendanubeStoreId && user.tiendanubeAccessToken) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': process.env.TIENDANUBE_USER_AGENT || 'Fiddo-App (support@fiddo.app)',
          Authentication: `bearer ${user.tiendanubeAccessToken}`,
          Authorization: `Bearer ${user.tiendanubeAccessToken}`,
        };
        const storeResponse = await fetch(`https://api.tiendanube.com/v1/${user.tiendanubeStoreId}/store`, {
          headers,
          cache: 'no-store',
        });
        if (storeResponse.ok) {
          tiendanubeStoreProfile = await storeResponse.json();
        }
      } catch (error) {
        console.log('Error obteniendo perfil de Tienda Nube:', error);
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
      mercadolibre: {
        connected: isMLConnected,
        userId: user.mercadolibreId,
        expiresAt: user.mercadolibreTokenExpiresAt,
        profile: mercadolibreProfile,
      },
      tiendanube: {
        connected: isTiendaNubeConnected,
        storeId: user.tiendanubeStoreId,
        userId: user.tiendanubeUserId,
        scope: user.tiendanubeScope,
        tokenType: user.tiendanubeTokenType,
        profile: tiendanubeStoreProfile,
      },
    });

  } catch (error) {
    console.error('Error obteniendo perfil del usuario:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
