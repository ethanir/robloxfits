// app/api/outfits/vote/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { outfitId, delta } = await req.json();

    if (typeof outfitId !== 'number' || typeof delta !== 'number') {
      return NextResponse.json(
        { error: 'outfitId (number) and delta (number) are required.' },
        { status: 400 },
      );
    }

    const updated = await prisma.outfit.update({
      where: { id: outfitId },
      data: {
        voteScore: {
          increment: delta,
        },
      },
    });

    return NextResponse.json({ id: updated.id, voteScore: updated.voteScore });
  } catch (err) {
    console.error('vote error', err);
    return NextResponse.json(
      { error: 'Failed to record vote.' },
      { status: 500 },
    );
  }
}
