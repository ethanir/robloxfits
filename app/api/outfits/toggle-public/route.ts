// app/api/outfits/toggle-public/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { outfitId, username } = await req.json();

    if (typeof outfitId !== 'number' || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'outfitId (number) and username (string) are required.' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found.' },
        { status: 401 },
      );
    }

    const outfit = await prisma.outfit.findUnique({
      where: { id: outfitId },
    });

    if (!outfit) {
      return NextResponse.json(
        { error: 'Outfit not found.' },
        { status: 404 },
      );
    }

    if (outfit.ownerId !== user.id) {
      return NextResponse.json(
        { error: 'You can only change visibility of your own outfits.' },
        { status: 403 },
      );
    }

    const updated = await prisma.outfit.update({
      where: { id: outfitId },
      data: { isPublic: !outfit.isPublic },
    });

    return NextResponse.json({ id: updated.id, isPublic: updated.isPublic });
  } catch (err) {
    console.error('toggle-public error', err);
    return NextResponse.json(
      { error: 'Failed to toggle visibility.' },
      { status: 500 },
    );
  }
}
