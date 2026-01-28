import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const prisma = new PrismaClient();

async function getValidAccessToken(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.mercadolibreRefreshToken || !user.mercadolibreTokenExpiresAt) {
    throw new Error('Usuario no conectado a Mercado Libre.');
  }

  if (new Date() > new Date(user.mercadolibreTokenExpiresAt.getTime() - 5 * 60 * 1000)) {
    const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.MERCADOLIBRE_APP_ID!,
        client_secret: process.env.MERCADOLIBRE_SECRET_KEY!,
        refresh_token: user.mercadolibreRefreshToken,
      }),
    });

    if (!tokenResponse.ok) throw new Error('No se pudo refrescar el token de Mercado Libre.');

    const newTokens = await tokenResponse.json();
    const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        mercadolibreAccessToken: newTokens.access_token,
        mercadolibreRefreshToken: newTokens.refresh_token,
        mercadolibreTokenExpiresAt: expiresAt,
      },
    });

    return newTokens.access_token;
  }

  return user.mercadolibreAccessToken;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token')?.value;

    if (!sessionToken) return NextResponse.json({ message: 'No autenticado' }, { status: 401 });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(sessionToken, secret);
    const userId = payload.userId as string;

    const { message, orderId } = await req.json();

    if (!message || !orderId) {
      return NextResponse.json({ message: 'Datos incompletos' }, { status: 400 });
    }

    const customer = await prisma.customer.findFirst({ where: { id, userId } });
    if (!customer) {
      return NextResponse.json({ message: 'Cliente no encontrado' }, { status: 404 });
    }

    const accessToken = await getValidAccessToken(userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });

    const mlResponse = await fetch(
      `https://api.mercadolibre.com/messages/packs/${orderId}/sellers/${user?.mercadolibreId}?tag=post_sale`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: { user_id: Number(user?.mercadolibreId) },
          to: { user_id: Number(customer.mercadolibreId) },
          text: message,
        }),
      }
    );

    if (!mlResponse.ok) {
      const errorText = await mlResponse.text();
      console.error('Error ML:', errorText);
      throw new Error('No se pudo enviar el mensaje');
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    return NextResponse.json({ message: 'Error en el servidor' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

