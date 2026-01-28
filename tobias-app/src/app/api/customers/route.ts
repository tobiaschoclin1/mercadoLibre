// src/app/api/customers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const provinceCodes: Record<string, string> = {
  'AR-C': 'Ciudad Autónoma de Buenos Aires',
  'AR-B': 'Buenos Aires',
  'AR-K': 'Catamarca',
  'AR-H': 'Chaco',
  'AR-U': 'Chubut',
  'AR-X': 'Córdoba',
  'AR-W': 'Corrientes',
  'AR-E': 'Entre Ríos',
  'AR-P': 'Formosa',
  'AR-Y': 'Jujuy',
  'AR-L': 'La Pampa',
  'AR-F': 'La Rioja',
  'AR-M': 'Mendoza',
  'AR-N': 'Misiones',
  'AR-Q': 'Neuquén',
  'AR-R': 'Río Negro',
  'AR-A': 'Salta',
  'AR-J': 'San Juan',
  'AR-D': 'San Luis',
  'AR-Z': 'Santa Cruz',
  'AR-S': 'Santa Fe',
  'AR-G': 'Santiago del Estero',
  'AR-V': 'Tierra del Fuego',
  'AR-T': 'Tucumán',
};

// Crear una nueva instancia del cliente Prisma
const prisma = new PrismaClient();

// --- FUNCIÓN HELPER PARA REFRESCAR EL TOKEN DE MELI ---
async function getValidAccessToken(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.mercadolibreRefreshToken || !user.mercadolibreTokenExpiresAt) {
    throw new Error('Usuario no conectado a Mercado Libre.');
  }

  // Si el token expira en los próximos 5 minutos, lo renovamos
  if (new Date() > new Date(user.mercadolibreTokenExpiresAt.getTime() - 5 * 60 * 1000)) {
    console.log('Token de Mercado Libre expirado o por expirar, renovando...');

    const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
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

    // Actualizamos los nuevos tokens en la base de datos
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

  // Si el token actual es válido, lo devolvemos
  return user.mercadolibreAccessToken;
}

// --- API PRINCIPAL PARA OBTENER CLIENTES ---
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token')?.value;

    if (!sessionToken) return NextResponse.json({ message: 'No autenticado' }, { status: 401 });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(sessionToken, secret);
    const userId = payload.userId as string;

    const accessToken = await getValidAccessToken(userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });

    // 1. Pedir las órdenes a Mercado Libre
    const ordersResponse = await fetch(`https://api.mercadolibre.com/orders/search?seller=${user?.mercadolibreId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!ordersResponse.ok) throw new Error('No se pudieron obtener las órdenes de Mercado Libre.');

    const { results: orders } = await ordersResponse.json();

    // Mapa para llevar la cuenta de compras, ubicación y último envío por comprador
    const buyerStats = new Map<
      string,
      {
        count: number;
        lastOrderId: string;
        lastOrderDate: string;
        lastShippingMethod?: string | null;
        lastProvince?: string | null;
      }
    >();

    interface BuyerDetails {
      first_name?: string;
      last_name?: string;
      email?: string;
      state?: string;
    }

    interface OrderDetails {
      buyer?: {
        first_name?: string;
        last_name?: string;
        email?: string;
      };
      shipping?: {
        id?: string | number;
        shipping_mode?: string;
        mode?: string;
        logistic_type?: string;
        shipping_type?: string;
        receiver_address?: {
          state?: { name?: string } | string;
        };
      };
    }

    // Cache para detalles de compradores y evitar múltiples llamadas
    const buyerDetailsCache = new Map<string, BuyerDetails>();

    // 2. Procesar y guardar cada orden y cliente en nuestra BD
    for (const order of orders) {
      const buyer = order.buyer;

      // Validar que tenemos los datos mínimos necesarios
      if (!buyer || !buyer.id) {
        console.log('Orden sin datos de comprador, omitiendo:', order.id);
        continue;
      }

      // Obtener datos del comprador y del envío
      let firstName = buyer.first_name || null;
      let lastName = buyer.last_name || null;
      let email = buyer.email || null;
      let shippingMethod =
        order.shipping?.shipping_mode ??
        order.shipping?.mode ??
        order.shipping?.logistic_type ??
        order.shipping?.shipping_type ??
        null;
      let province =
        order.shipping?.receiver_address?.state?.name ??
        order.shipping?.receiver_address?.state ??
        null;
      let orderDetails: OrderDetails | null = null;

      // Si falta información del comprador o del envío, pedimos los detalles de la orden
      if (!firstName || !lastName || !email || !shippingMethod || !province) {
        const orderDetailsResponse = await fetch(
          `https://api.mercadolibre.com/orders/${order.id}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        if (orderDetailsResponse.ok) {
          orderDetails = (await orderDetailsResponse.json()) as OrderDetails;

          // Guardar detalles del comprador en cache para evitar múltiples llamadas
          let details = buyerDetailsCache.get(buyer.id);
          if (!details) {
            const stateField = orderDetails.shipping?.receiver_address?.state;
            const stateRaw =
              typeof stateField === 'string' ? stateField : stateField?.name;
            details = {
              first_name: orderDetails.buyer?.first_name,
              last_name: orderDetails.buyer?.last_name,
              email: orderDetails.buyer?.email,
              state: stateRaw ? provinceCodes[stateRaw] || stateRaw : undefined,
            } as BuyerDetails;
            buyerDetailsCache.set(buyer.id, details);
          }

          firstName = firstName || details.first_name || null;
          lastName = lastName || details.last_name || null;
          email = email || details.email || null;

          shippingMethod =
            shippingMethod ||
            orderDetails.shipping?.shipping_mode ||
            orderDetails.shipping?.mode ||
            orderDetails.shipping?.logistic_type ||
            orderDetails.shipping?.shipping_type ||
            null;
          const provinceField = orderDetails.shipping?.receiver_address?.state;
          const provinceRaw =
            typeof provinceField === 'string' ? provinceField : provinceField?.name;
          province = province || provinceRaw || details.state || null;
        }
      }

      // Convertir el ID a BigInt para que coincida con el esquema
      const buyerIdBigInt = BigInt(buyer.id);

      // Actualizar estadísticas de compras
      const buyerIdStr = buyer.id.toString();
      const currentStats = buyerStats.get(buyerIdStr);
      const orderDate = order.date_created;
      const packId = (order.pack_id ?? order.id).toString();
      const shippingId = order.shipping?.id || orderDetails?.shipping?.id;
      if ((!shippingMethod || !province) && shippingId) {
        try {
          const shippingRes = await fetch(
            `https://api.mercadolibre.com/shipments/${shippingId}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          if (shippingRes.ok) {
            const shippingDetails = await shippingRes.json();
            shippingMethod =
              shippingMethod ||
              shippingDetails.shipping_mode ||
              shippingDetails.mode ||
              shippingDetails.logistic_type ||
              shippingDetails.shipping_type ||
              null;
            province =
              province ||
              shippingDetails.receiver_address?.state?.name ||
              shippingDetails.receiver_address?.state ||
              null;
          }
        } catch (err) {
          console.error('Error obteniendo envío', order.id, err);
        }
      }

      // Si aún no tenemos provincia, intentamos obtenerla del perfil del comprador
      if (!province) {
        let details = buyerDetailsCache.get(buyer.id);
        if (details?.state) {
          province = details.state;
        } else {
          try {
            const buyerRes = await fetch(
              `https://api.mercadolibre.com/users/${buyer.id}`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (buyerRes.ok) {
              const buyerInfo = await buyerRes.json();
              const stateName =
                buyerInfo.address?.state?.name || buyerInfo.address?.state || null;
              if (stateName) {
                const mappedState = provinceCodes[stateName] || stateName;
                province = mappedState;
                details = details || {};
                details.state = mappedState;
                buyerDetailsCache.set(buyer.id, details);
              }
            }
          } catch (err) {
            console.error('Error obteniendo comprador', buyer.id, err);
          }
      }
    }
      if (province) {
        province = provinceCodes[province] || province;
      }

      if (currentStats) {
        currentStats.count += 1;
        if (new Date(orderDate) > new Date(currentStats.lastOrderDate)) {
          currentStats.lastOrderId = packId;
          currentStats.lastOrderDate = orderDate;
          if (shippingMethod) currentStats.lastShippingMethod = shippingMethod;
          if (province) currentStats.lastProvince = province;
        }
      } else {
        buyerStats.set(buyerIdStr, {
          count: 1,
          lastOrderId: packId,
          lastOrderDate: orderDate,
          lastShippingMethod: shippingMethod || null,
          lastProvince: province || null,
        });
      }

      // Usamos `upsert` para crear el cliente si no existe, o actualizarlo si ya existe
      await prisma.customer.upsert({
        where: { mercadolibreId: buyerIdBigInt },
        update: {
          nickname: buyer.nickname || 'Usuario sin nombre',
          firstName,
          lastName,
          email,
        },
        create: {
          mercadolibreId: buyerIdBigInt,
          nickname: buyer.nickname || 'Usuario sin nombre',
          firstName,
          lastName,
          email,
          userId: userId,
        },
      });
    }

    // 3. Devolver la lista de clientes paginada
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const total = await prisma.customer.count({ where: { userId: userId } });
    const customers = await prisma.customer.findMany({
      where: { userId: userId },
      skip: offset,
      take: limit,
    });

    const serializedCustomers = customers.map((c) => {
      const stats = buyerStats.get(c.mercadolibreId.toString());
      return {
        ...c,
        mercadolibreId: c.mercadolibreId.toString(),
        purchaseCount: stats?.count || 0,
        lastOrderId: stats?.lastOrderId || null,
        lastShippingMethod: stats?.lastShippingMethod || null,
        province: stats?.lastProvince || null,
      };
    });

    return NextResponse.json({ items: serializedCustomers, total }, { status: 200 });

  } catch (error) {
    console.error('Error al obtener clientes:', error);
    return NextResponse.json({ message: 'Error en el servidor' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
