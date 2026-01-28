// src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { serialize } from 'cookie'; // <-- Importamos la función para crear cookies

const prisma = new PrismaClient();
const TOKEN_NAME = 'session_token'; // Nombre de nuestra cookie

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ message: 'Email y contraseña son requeridos' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ message: 'Credenciales inválidas' }, { status: 401 });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return NextResponse.json({ message: 'Credenciales inválidas' }, { status: 401 });
    }

    const tokenPayload = { userId: user.id, email: user.email };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET!, {
      expiresIn: '1d',
    });

    // --- ¡NUEVA PARTE: CREAR LA COOKIE! ---
    const serializedCookie = serialize(TOKEN_NAME, token, {
      httpOnly: true, // La cookie no es accesible desde el JavaScript del cliente
      secure: process.env.NODE_ENV === 'production', // Solo se envía por HTTPS en producción
      maxAge: 60 * 60 * 24, // 1 día de duración
      path: '/', // La cookie está disponible en toda la aplicación
    });

    const { password: _, ...userWithoutPassword } = user;

    // Devolvemos el usuario, pero el token ahora va en la cabecera como una cookie
    return NextResponse.json(
      { user: userWithoutPassword },
      {
        status: 200,
        headers: { 'Set-Cookie': serializedCookie }, // <-- Establecemos la cookie
      }
    );

  } catch (error) {
    console.error('Error en el login:', error);
    return NextResponse.json({ message: 'Error en el servidor' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}