// src/app/register/page.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation'; // Hook para la redirección
import { useToast } from '@/components/ui/Toast';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { notify } = useToast();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al registrar el usuario.');
      }


      // Login automático tras registro exitoso
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!loginResponse.ok) {
        throw new Error('Usuario registrado pero error al iniciar sesión.');
      }
      notify('Usuario registrado y logueado con éxito');
      router.push('/dashboard');

    } catch (error: unknown) {
      console.error('Error en el registro:', error);
      notify(error instanceof Error ? error.message : 'Error en el registro');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-fiddo-blue via-fiddo-turquoise to-fiddo-orange p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center flex flex-col items-center">
          <img src="/brand/Fiddo.JPG" alt="Fiddo Logo" style={{height: 56, width: 'auto', maxWidth: 120}} className="mx-auto mb-2" />
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Crear una Cuenta
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            ¿Ya tienes una?{' '}
            <Link href="/login" className="font-medium text-fiddo-orange hover:text-fiddo-turquoise">
              Inicia sesión
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Nombre
            </label>
            <div className="mt-1">
              <input id="name" name="name" type="text" required placeholder="Tu Nombre" value={name} onChange={(e) => setName(e.target.value)} className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-fiddo-turquoise focus:outline-none focus:ring-fiddo-turquoise sm:text-sm" />
            </div>
          </div>
          
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Correo Electrónico
            </label>
            <div className="mt-1">
              <input id="email" name="email" type="email" required placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-fiddo-turquoise focus:outline-none focus:ring-fiddo-turquoise sm:text-sm" />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <div className="mt-1">
              <input id="password" name="password" type="password" required minLength={8} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-fiddo-turquoise focus:outline-none focus:ring-fiddo-turquoise sm:text-sm" />
            </div>
          </div>

          <div>
            <button type="submit" disabled={isLoading} className="flex w-full justify-center rounded-md border border-transparent bg-fiddo-blue py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-fiddo-turquoise focus:outline-none focus:ring-2 focus:ring-fiddo-turquoise focus:ring-offset-2 disabled:opacity-50">
              {isLoading ? 'Registrando...' : 'Crear Cuenta'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}