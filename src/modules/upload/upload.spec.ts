import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type {} from "multer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { prisma } from "../../shared/database/prisma.js";
import {
  updateProfileImage,
  processProductMediaUpload,
} from "./upload.service.js";
import { s3 } from "../../shared/config/s3.js";
import { resolveMediaUrl } from "../../shared/utils/resolveMediaUrl.js";

describe("Upload Service", () => {
  const userId = "user-123";
  const enterpriseId = "ent-456";

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    jest
      .spyOn(s3, "send")
      .mockImplementation(() => Promise.resolve({} as never));

    jest
      .spyOn(fs, "createReadStream")
      .mockImplementation(() => ({ destroy: jest.fn() } as any));
    jest.spyOn(fs.promises, "unlink").mockResolvedValue(undefined);
  });

  const createMockFile = (overrides: any = {}) => {
    const name =
      overrides.originalname ||
      `test-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;
    const filePath = path.join(os.tmpdir(), name);

    let magic = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // jpg
    if (name.includes(".mp4"))
      magic = Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
      ]);
    else if (name.includes(".png"))
      magic = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);

    try {
      fs.writeFileSync(filePath, magic);
    } catch {
      // Ignora erro se já existir
    }

    return {
      fieldname: "media",
      originalname: name,
      encoding: "7bit",
      mimetype: name.includes(".mp4") ? "video/mp4" : "image/jpeg",
      size: 1024,
      destination: os.tmpdir(),
      filename: name,
      path: filePath,
      ...overrides,
    } as Express.Multer.File;
  };

  describe("processProductMediaUpload", () => {
    it("1. deve rejeitar upload contendo vídeo por causa de bloqueio temporário", async () => {
      const files = [
        createMockFile({ mimetype: "video/mp4", originalname: "v.mp4" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i1.jpg" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i2.jpg" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i3.jpg" }),
      ];

      await expect(
        processProductMediaUpload(files, userId, enterpriseId)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "O upload de vídeos está temporariamente desabilitado.",
      });
    });

    it("1.1. deve processar upload válido com 3 imagens", async () => {
      const files = [
        createMockFile({ mimetype: "image/jpeg", originalname: "i1.jpg" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i2.jpg" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i3.jpg" }),
      ];

      const result = await processProductMediaUpload(files, userId, enterpriseId);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe("FOTO");
      expect(result[0].key).toContain(
        `enterprise/${enterpriseId}/users/${userId}/products/temp/`
      );
      expect(result[0].url).toContain("https://media.bluefootgg.com/");
    });

    it("2. deve lançar erro se não houver arquivos", async () => {
      await expect(
        processProductMediaUpload([], userId, enterpriseId)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Obrigatório pelo menos 1 arquivo",
      });
    });

    it("3. deve lançar erro se tentar enviar vídeo (limite antigo seria mais de 1 vídeo)", async () => {
      const files = [
        createMockFile({ mimetype: "video/mp4", originalname: "v1.mp4" }),
        createMockFile({ mimetype: "video/mp4", originalname: "v2.mp4" }),
      ];

      await expect(
        processProductMediaUpload(files, userId, enterpriseId)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "O upload de vídeos está temporariamente desabilitado.",
      });
    });

    it("4. deve lançar erro se houver mais de 3 imagens", async () => {
      const files = [
        createMockFile({ mimetype: "image/jpeg", originalname: "i1.jpg" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i2.jpg" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i3.jpg" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i4.jpg" }),
      ];

      await expect(
        processProductMediaUpload(files, userId, enterpriseId)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "No máximo 3 imagens são permitidas",
      });
    });

    it("5. deve lançar erro se o tamanho da imagem for > 3MB", async () => {
      const files = [
        createMockFile({ size: 3.5 * 1024 * 1024, mimetype: "image/jpeg", originalname: "large.jpg" }),
      ];

      await expect(
        processProductMediaUpload(files, userId, enterpriseId)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining("excede o limite de 3MB"),
      });
    });

    it("6. deve lançar erro de vídeo desabilitado antes de validar limite de 20MB", async () => {
      const files = [
        createMockFile({
          size: 21 * 1024 * 1024,
          mimetype: "video/mp4",
          originalname: "v.mp4",
        }),
      ];

      await expect(
        processProductMediaUpload(files, userId, enterpriseId)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining("O upload de vídeos está temporariamente desabilitado"),
      });
    });

    it("7. deve fazer rollback no S3 se um dos uploads paralelos falhar", async () => {
      let callCount = 0;
      jest.spyOn(s3, "send").mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("S3 Put Failed"));
        }
        return Promise.resolve({} as never);
      });

      const files = [
        createMockFile({ mimetype: "image/jpeg", originalname: "i1.jpg" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i2.jpg" }),
      ];

      jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        processProductMediaUpload(files, userId, enterpriseId)
      ).rejects.toMatchObject({
        statusCode: 500,
        message: "Erro durante o upload para a nuvem. Processo cancelado.",
      });

      expect(s3.send).toHaveBeenCalled();
    });
  });

  describe("updateProfileImage", () => {
    it("8. deve atualizar imagem de perfil e deletar avatar antigo do S3", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        profileImageKey: "old-avatar.jpg",
      } as any);

      jest.spyOn(prisma.user, "update").mockResolvedValue({
        id: userId,
        profileImageKey: "new-avatar.jpg",
      } as any);

      const data = {
        key: "new-avatar.jpg",
      };

      const result = await updateProfileImage(userId, data);

      expect(result.url).toBe(resolveMediaUrl(data.key));
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          profileImageKey: data.key,
        },
      });

      // Deve ter chamado o S3 para deletar o antigo
      expect(s3.send).toHaveBeenCalled();
    });

    it("9. deve lançar 404 se usuário não existir", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue(null as any);

      const data = {
        key: "new-avatar.jpg",
      };

      await expect(updateProfileImage(userId, data)).rejects.toMatchObject({
        statusCode: 404,
        message: "Usuário não encontrado",
      });
    });

    it("10. deve fazer rollback no S3 do novo avatar se o update no banco falhar", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        profileImageKey: null,
      } as any);

      jest
        .spyOn(prisma.user, "update")
        .mockRejectedValue(new Error("DB Connection Error") as never);

      const data = {
        key: "new-avatar.jpg",
      };

      await expect(updateProfileImage(userId, data)).rejects.toThrow(
        "DB Connection Error"
      );

      // Deve ter deletado o new-avatar.jpg do S3 como rollback
      expect(s3.send).toHaveBeenCalled();
      const calls = (s3.send as any).mock.calls;
      const deleteCall = calls.find(
        (c: any[]) => c[0]?.input?.Key === "new-avatar.jpg"
      );
      expect(deleteCall).toBeTruthy();
    });

    it("11. não deve falhar se a deleção do avatar antigo falhar no S3", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        profileImageKey: "old.jpg",
      } as any);

      jest.spyOn(prisma.user, "update").mockResolvedValue({
        id: userId,
      } as any);

      jest
        .spyOn(s3, "send")
        .mockRejectedValueOnce(new Error("S3 Delete Error") as never);

      jest.spyOn(console, "error").mockImplementation(() => {});

      const data = {
        key: "new-avatar.jpg",
      };

      const result = await updateProfileImage(userId, data);
      expect(result.url).toBe(resolveMediaUrl(data.key));
    });
  });
});
