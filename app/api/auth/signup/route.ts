// app/api/auth/signup/route.ts
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

    if (!trimmedUsername || !trimmedPassword) {
      return NextResponse.json(
        { error: 'Username and password cannot be empty.' },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username: trimmedUsername },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'That username is already taken.' },
        { status: 409 },
      );
    }

    const user = await prisma.user.create({
      data: {
        username: trimmedUsername,
        password: trimmedPassword, // plaintext for now (prototype)
      },
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          username: user.username,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Signup error', err);
    return NextResponse.json(
      { error: 'Internal server error during signup.' },
      { status: 500 },
    );
  }
}
