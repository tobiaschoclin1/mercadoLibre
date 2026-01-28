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

async function isSellerEligible(mlSellerId: string) {
  const res = await fetch(`https://api.mercadolibre.com/users/${mlSellerId}`);
  if (!res.ok) throw new Error('No se pudo verificar el vendedor');
  const data = await res.json();
  const level = data?.seller_reputation?.level_id || '';
  const status = data?.seller_reputation?.status?.status || '';
  const goodLevel = level.includes('green') || level.includes('yellow');
  const activeStatus = status !== 'suspended';
  return goodLevel && activeStatus;
}

async function isItemEligible(itemId: string, siteId: string, token: string) {
  const res = await fetch(
    `https://api.mercadolibre.com/seller-promotions/items/eligible?ids=${itemId}&site_id=${siteId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('No se pudo validar el \u00edtem');
  const data = await res.json();
  const eligibleIds =
    data?.eligible_items?.map((item: { id: string }) => item.id) ?? [];
  return eligibleIds.includes(itemId);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPromotionActive(
  promotionId: string,
  token: string
) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(
      `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'active') return data;
    }
    await sleep(1000);
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token')?.value;
    if (!sessionToken) {
      return NextResponse.json({ message: 'No autenticado' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(sessionToken, secret);
    const userId = payload.userId as string;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ message: 'Usuario no encontrado' }, { status: 404 });
    }

    if (!user.mercadolibreId) {
      return NextResponse.json(
        { message: 'Usuario sin cuenta de Mercado Libre' },
        { status: 400 }
      );
    }

    const sellerOk = await isSellerEligible(user.mercadolibreId);
    if (!sellerOk) {
      return NextResponse.json(
        { message: 'Vendedor no elegible para promociones' },
        { status: 400 }
      );
    }

    const accessToken = await getValidAccessToken(userId);

    const { customerIds, productId, discount, expiresAt } = await request.json();
    if (
      !Array.isArray(customerIds) ||
      !productId ||
      !discount ||
      typeof discount !== 'number' ||
      discount >= 100 ||
      discount <= 0 ||
      !expiresAt ||
      isNaN(Date.parse(expiresAt))
    ) {
      return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 });
    }

    const productRes = await fetch(`https://api.mercadolibre.com/items/${productId}`);
    const productData = await productRes.json();
    const productTitle = productData?.title ?? 'nuestro producto';
    const productLink = productData?.permalink ?? '';
    const originalPrice = Number(productData?.price ?? 0);
    const marketplaceId = productData?.site_id || 'MLA';

    if (productData?.condition !== 'new') {
      return NextResponse.json(
        { message: 'Solo se permiten productos nuevos en promociones' },
        { status: 400 }
      );
    }

    const itemOk = await isItemEligible(productId, marketplaceId, accessToken);
    if (!itemOk) {
      return NextResponse.json(
        { message: 'La publicación no es elegible para promociones' },
        { status: 400 }
      );
    }

    const promotionPayload = {
      site_id: marketplaceId,
      type: 'PRICE_DISCOUNT',
      start_date: new Date().toISOString(),
      end_date: new Date(expiresAt).toISOString(),
      items: [
        {
          item_id: productId,
          discount_type: 'PERCENTAGE',
          value: discount,
        },
      ],
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
    const activeData = await waitForPromotionActive(promotionId, accessToken);
    const finalPromo = activeData || promoData;
    const promotionLink =
      finalPromo.promotion_link || finalPromo.permalink || productLink;
    const expirationDate =
      finalPromo.finish_date || finalPromo.end_date || expiresAt;

    await prisma.product.upsert({
      where: { id: productId },
      update: {
        promotionId,
        promotionExpiresAt: new Date(expirationDate),
        promotionLink,
      },
      create: {
        id: productId,
        name: productData?.title ?? '',
        cost: 0,
        price: originalPrice,
        userId,
        promotionId,
        promotionExpiresAt: new Date(expirationDate),
        promotionLink,
      },
    });

    const promotionsSent: { customerId: string }[] = [];

    for (const id of customerIds) {
      const customer = await prisma.customer.findUnique({ where: { id, userId } });
      if (!customer) continue;

      const lastOrder = await prisma.order.findFirst({
        where: { customerId: customer.id },
        orderBy: { orderDate: 'desc' },
      });

      if (!lastOrder) continue;

      const message = `¡Hola! Te ofrecemos un ${discount}% de descuento en nuestro producto ${productTitle}. Aprovecha la oferta aquí: ${promotionLink}`;

      try {
        const sendRes = await fetch(
          `https://api.mercadolibre.com/messages/packs/${lastOrder.mercadolibreOrderId.toString()}/sellers/${user.mercadolibreId}?tag=post_sale`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              from: { user_id: Number(user.mercadolibreId) },
              to: { user_id: Number(customer.mercadolibreId) },
              text: message,
            }),
          }
        );

        if (!sendRes.ok) {
          console.error('Error en respuesta de promoción:', await sendRes.text());
          continue;
        }
      } catch (err) {
        console.error('Error enviando promoción:', err);
        continue;
      }

      promotionsSent.push({ customerId: customer.id });
    }
    if (promotionsSent.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No se pudieron enviar las promociones', promotionsSent },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true, promotionsSent }, { status: 200 });
  } catch (error) {
    console.error('Error enviando promociones:', error);
    return NextResponse.json({ message: 'Error en el servidor' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

