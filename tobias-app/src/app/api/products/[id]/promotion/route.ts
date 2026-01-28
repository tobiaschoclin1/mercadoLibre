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
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token')?.value;
    if (!sessionToken) {
      return NextResponse.json({ message: 'No autenticado' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(sessionToken, secret);
    const userId = payload.userId as string;

    const { discount, expiresAt } = await request.json();
    if (!discount || typeof discount !== 'number' || discount >= 100 || discount <= 0) {
      return NextResponse.json({ message: 'Descuento inválido' }, { status: 400 });
    }
    if (!expiresAt || isNaN(Date.parse(expiresAt))) {
      return NextResponse.json({ message: 'Vigencia inválida' }, { status: 400 });
    }

    const accessToken = await getValidAccessToken(userId);
    const { id } = await params;
    const productRes = await fetch(`https://api.mercadolibre.com/items/${id}` , {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!productRes.ok) {
      return NextResponse.json(
        { message: 'Producto no encontrado' },
        { status: productRes.status }
      );
    }
    const productData = await productRes.json();
    const permalink = productData?.permalink ?? '';
    const originalPrice = Number(productData?.price ?? 0);
    const marketplaceId = productData?.site_id || 'MLA';

    const currencyId = productData?.currency_id || 'ARS';
    const discountedPrice = Number(
      (originalPrice * (1 - discount / 100)).toFixed(2)
    );

    const promotionPayload = {
      type: 'custom',
      site_id: marketplaceId,
      value_type: 'PERCENTAGE',
      value: discount,
      start_date: new Date().toISOString(),
      finish_date: new Date(expiresAt).toISOString(),
      items: [{ item_id: id, price: discountedPrice, currency_id: currencyId }],
    };

    const promoRes = await fetch(
      'https://api.mercadolibre.com/seller-promotions/promotions?app_version=1',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(promotionPayload),
      }
    );

    if (!promoRes.ok) {
      let details: string | undefined;
      try {
        const errorJson = await promoRes.json();
        details = JSON.stringify(errorJson);
      } catch {
        try {
          details = await promoRes.text();
        } catch {
          details = undefined;
        }
      }
      console.error('Mercado Libre promotion error:', promoRes.status, details);
      return NextResponse.json(
        { message: 'No se pudo aplicar la promoción', details },
        { status: promoRes.status }
      );
    }

    const promoData = await promoRes.json();
    const promotionId = promoData.id as string;
    const expirationDate = promoData.finish_date || promoData.finishDate || expiresAt;

    await prisma.product.upsert({
      where: { id },
      update: {
        promotionId,
        promotionExpiresAt: new Date(expirationDate),
        promotionLink: permalink,
      },
      create: {
        id,
        name: productData?.title ?? '',
        cost: 0,
        price: originalPrice,
        userId,
        promotionId,
        promotionExpiresAt: new Date(expirationDate),
        promotionLink: permalink,
      },
    });

    return NextResponse.json(
      { success: true, promotionId, expiresAt: expirationDate, permalink },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error setting promotion:', error);
    return NextResponse.json({ message: 'Error en el servidor' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

