import { AppError } from "../../shared/errors/AppError.js";

type MediaType = "FOTO" | "VIDEO";
interface MediaRecord {
  id: string;
  type: MediaType;
  isMain: boolean;
  order: number;
}
interface NewMediaRecord {
  key: string;
  type: MediaType;
}

export function validateKeepMediaIds(keepIds: string[], currentMediaMap: Map<string, MediaRecord>) {
  for (const keepId of keepIds) {
    if (!currentMediaMap.has(keepId)) {
      throw new AppError(`Mídia ${keepId} não pertence a este produto.`, 400);
    }
  }
}

export function calculateFinalMediaState(
  keepIds: string[],
  currentMediaMap: Map<string, MediaRecord>,
  newFiles: NewMediaRecord[]
) {
  let keptPhotos = 0;
  let keptVideos = 0;
  let mainPhotoKept = false;
  let firstKeptPhotoId: string | null = null;

  for (const keepId of keepIds) {
    const m = currentMediaMap.get(keepId)!;
    if (m.type === "FOTO") {
      keptPhotos++;
      if (!firstKeptPhotoId) firstKeptPhotoId = m.id;
      if (m.isMain) mainPhotoKept = true;
    } else if (m.type === "VIDEO") {
      keptVideos++;
    }
  }

  const newPhotos = newFiles.filter((f) => f.type === "FOTO").length;
  const newVideos = newFiles.filter((f) => f.type === "VIDEO").length;

  const finalPhotos = keptPhotos + newPhotos;
  const finalVideos = keptVideos + newVideos;

  if (finalPhotos > 3) throw new AppError("No máximo 3 imagens são permitidas.", 400);
  if (finalVideos > 1) throw new AppError("Apenas 1 vídeo é permitido.", 400);
  if (finalPhotos < 1) throw new AppError("O produto deve ter pelo menos 1 imagem.", 400);

  return { mainPhotoKept, firstKeptPhotoId };
}

export function resolveMainMedia(
  mainPhotoKept: boolean,
  firstKeptPhotoId: string | null,
  firstNewPhotoKey: string | null,
  mediaRecordsToInsert: any[]
) {
  let newMainPhotoId: string | null = null;

  if (!mainPhotoKept) {
    if (firstKeptPhotoId) {
      newMainPhotoId = firstKeptPhotoId;
    } else if (firstNewPhotoKey) {
      const rec = mediaRecordsToInsert.find((r) => r.key === firstNewPhotoKey);
      if (rec) rec.isMain = true;
    }
  }

  return newMainPhotoId;
}
