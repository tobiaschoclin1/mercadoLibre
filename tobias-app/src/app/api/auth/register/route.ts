// src/app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Creamos una única instancia del cliente de Prisma para usar en toda la aplicación
const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // --- Validación de datos de entrada ---
    if (!email || !password) {
      return NextResponse.json(
        { message: 'El email y la contraseña son requeridos' },
        { status: 400 }
      );
    }

    // --- Verificar si el usuario ya existe ---
    const existingUser = await prisma.user.findUnique({
      where: { email: email },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: 'El correo electrónico ya está en uso' },
        { status: 409 } // 409 Conflict
      );
    }

    // --- Encriptar la contraseña ---
    const hashedPassword = await bcrypt.hash(password, 10); // El 10 es el "costo" de encriptación

    // --- Crear el nuevo usuario en la base de datos ---
    const newUser = await prisma.user.create({
      data: {
        email: email,
        name: name,
        password: hashedPassword,
      },
    });

    // Excluimos la contraseña del objeto que devolvemos por seguridad
    const { password: _, ...userWithoutPassword } = newUser;

    return NextResponse.json(userWithoutPassword, { status: 201 }); // 201 Created

  } catch (error) {
    console.error('Error en el registro:', error);
    return NextResponse.json(
      { message: 'Error en el servidor' },
      { status: 500 }
    );
  }
}