// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Username and password are required.' },
        { status: 400 },
      );
    }

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    const user = await prisma.user.findUnique({
      where: { username: trimmedUsername },
    });

    if (!user || user.password !== trimmedPassword) {
      return NextResponse.json(
        { error: 'Incorrect username or password.' },
        { status: 401 },
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (err) {
    console.error('Login error', err);
    return NextResponse.json(
      { error: 'Internal server error during login.' },
      { status: 500 },
    );
  }
}
