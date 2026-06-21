import { NextResponse } from "next/server";
import { getReviewsTask, postReviewsTask } from "@/lib/dataforseo";
import { dbGetLeadEnrichment, dbSaveLeadReviews } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/reviews
 *
 * Reviews sind bei DataForSEO task-basiert. Flow:
 *  1. Erster Aufruf (ohne taskId) → Cache prüfen; sonst Task anlegen → { taskId, ready:false }
 *  2. Client pollt mit taskId → wenn fertig: { reviews, ready:true } (+ Cache speichern)
 *
 * Body: { uid?, cid?, placeId?, name?, taskId?, force? }
 */
export async function POST(req: Request) {
  let body: {
    uid?: string;
    cid?: string;
    placeId?: string;
    name?: string;
    taskId?: string;
    force?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  try {
    // 1) Cache (nur beim ersten Aufruf, also ohne taskId)
    if (body.uid && !body.force && !body.taskId) {
      const cached = await dbGetLeadEnrichment(body.uid);
      if (cached?.reviews) {
        return NextResponse.json({ ready: true, reviews: cached.reviews, cached: true });
      }
    }

    // 2) Polling eines laufenden Tasks
    if (body.taskId) {
      const { ready, reviews } = await getReviewsTask(body.taskId);
      if (ready && body.uid) await dbSaveLeadReviews(body.uid, reviews);
      return NextResponse.json({ ready, reviews, taskId: body.taskId });
    }

    // 3) Neuen Task anlegen
    if (!body.cid && !body.placeId && !body.name) {
      return NextResponse.json({ error: "cid, placeId oder name erforderlich" }, { status: 400 });
    }
    const taskId = await postReviewsTask({ cid: body.cid, placeId: body.placeId, name: body.name });
    return NextResponse.json({ ready: false, taskId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
