import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { prisma } from "../../shared/database/prisma.js";
import { updateProfileImage, processProductMediaUpload } from "./upload.service.js";
import { AppError } from "../../shared/errors/AppError.js";
import { s3 } from "../../shared/config/s3.js";

describe("Upload Service", () => {
  let enterpriseId: string;
  let adminRole: any;
  let testUser: any;

  beforeEach(async () => {
    jest
      .spyOn(s3, "send")
      .mockImplementation(() => Promise.resolve({} as never));
      
    jest.spyOn(fs, "createReadStream").mockImplementation(() => ({ destroy: jest.fn() }) as any);
    jest.spyOn(fs.promises, "unlink").mockResolvedValue(undefined);

    jest.clearAllMocks();

    await prisma.productMedia.deleteMany();
    await prisma.productCategory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.userToken.deleteMany();
    await prisma.enterpriseInviteToken.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
    await prisma.enterprise.deleteMany();

    adminRole = await prisma.userRole.findFirst({ where: { role: "ADMIN" } });
    if (!adminRole) {
      adminRole = await prisma.userRole.create({
        data: { role: "ADMIN", description: "Admin" },
      });
    }

    const enterprise = await prisma.enterprise.create({
      data: {
        cnpj: "12345678901235",
        name: "Empresa de Teste Upload",
        phoneNumber: "999999998",
      },
    });
    enterpriseId = enterprise.id;

    testUser = await prisma.user.create({
      data: {
        name: "Upload User",
        email: "upload@test.com",
        password: "hashedpassword",
        roleId: adminRole.id,
        enterpriseId,
        profileImageKey: "old-key.png",
        profileImageUrl: "https://old.url/old-key.png",
      },
    });
  });

  describe("Product Media", () => {
    const createMockFile = (overrides: any = {}) => {
      const name = overrides.originalname || `test-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;
      const filePath = path.join(os.tmpdir(), name);
      
      let magic = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // jpg
      if (name.includes(".mp4")) magic = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6D, 0x70, 0x34, 0x32]);
      else if (name.includes(".png")) magic = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      else if (name.includes(".webp")) magic = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

      fs.writeFileSync(filePath, magic);

      return {
        fieldname: "files",
        originalname: name,
        encoding: "7bit",
        mimetype: overrides.mimetype || "image/jpeg",
        size: overrides.size || 1 * 1024 * 1024,
        destination: os.tmpdir(),
        filename: name,
        path: filePath,
        buffer: Buffer.from(""),
        stream: null as any,
        ...overrides
      } as any;
    };

    it("should process valid upload with 1 video and 3 images", async () => {
      const files = [
        createMockFile({ mimetype: "video/mp4", originalname: "v.mp4" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i1.jpg" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i2.jpg" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i3.jpg" })
      ];

      const result = await processProductMediaUpload(files, testUser.id, enterpriseId);

      expect(result).toHaveLength(4);
      expect(result[0].type).toBe("VIDEO");
      expect(result[1].type).toBe("FOTO");
      expect(s3.send).toHaveBeenCalledTimes(4); // 4 uploads
    });

    it("should throw error if 0 files", async () => {
      await expect(processProductMediaUpload([], testUser.id, enterpriseId)).rejects.toThrow("Obrigatório pelo menos 1 arquivo");
    });

    it("should throw error if more than 1 video", async () => {
      const files = [
        createMockFile({ mimetype: "video/mp4", originalname: "v1.mp4" }),
        createMockFile({ mimetype: "video/mp4", originalname: "v2.mp4" }),
      ];

      await expect(processProductMediaUpload(files, testUser.id, enterpriseId)).rejects.toThrow("Apenas 1 vídeo é permitido");
      expect(s3.send).not.toHaveBeenCalled();
    });

    it("should throw error if more than 3 images", async () => {
      const files = [
        createMockFile({ originalname: "1.jpg" }), createMockFile({ originalname: "2.jpg" }), createMockFile({ originalname: "3.jpg" }), createMockFile({ originalname: "4.jpg" })
      ];

      await expect(processProductMediaUpload(files, testUser.id, enterpriseId)).rejects.toThrow("No máximo 3 imagens são permitidas");
    });

    it("should throw error if image size > 5MB", async () => {
      const files = [
        createMockFile({ size: 6 * 1024 * 1024, originalname: "1.jpg" })
      ];

      await expect(processProductMediaUpload(files, testUser.id, enterpriseId)).rejects.toThrow("excede o limite de 5MB");
    });

    it("should throw error if video size > 20MB", async () => {
      const files = [
        createMockFile({ mimetype: "video/mp4", size: 21 * 1024 * 1024, originalname: "v1.mp4" })
      ];

      await expect(processProductMediaUpload(files, testUser.id, enterpriseId)).rejects.toThrow("excede o limite de 20MB");
    });

    it("should rollback S3 if one of the parallel uploads fails", async () => {
      // 1 successful, 1 failed
      jest.spyOn(s3, "send")
        .mockResolvedValueOnce({} as never)
        .mockRejectedValueOnce(new Error("AWS Mock Error") as never);

      const files = [
        createMockFile({ mimetype: "image/jpeg", originalname: "i1.jpg" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i2.jpg" })
      ];

      await expect(processProductMediaUpload(files, testUser.id, enterpriseId)).rejects.toThrow("Erro durante o upload para a nuvem. Processo cancelado.");
      
      // Should have called s3.send 3 times:
      // 2x PutObjectCommand
      // 1x DeleteObjectsCommand
      expect(s3.send).toHaveBeenCalledTimes(3);
    });
  });

  describe("Avatar Upload", () => {
    it("should process valid upload, update db and delete old avatar from S3", async () => {
      const data = {
        location: "https://s3/new-avatar.jpg",
        key: "new-avatar.jpg",
      };

      const result = await updateProfileImage(testUser.id, data);

      expect(result.url).toBe(data.location);

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(updatedUser?.profileImageKey).toBe(data.key);
      expect(updatedUser?.profileImageUrl).toBe(data.location);

      // Should have deleted old avatar
      expect(s3.send).toHaveBeenCalled();
      const sendMock = (s3.send as any).mock.calls;
      const deleteCommand = sendMock.find((call: any[]) => call[0].input.Key === "old-key.png");
      expect(deleteCommand).toBeTruthy();
    });

    it("should throw error if user does not exist", async () => {
      const data = {
        location: "https://s3/new-avatar.jpg",
        key: "new-avatar.jpg",
      };

      await expect(
        updateProfileImage("00000000-0000-0000-0000-000000000000", data)
      ).rejects.toThrow("Usuário não encontrado");
    });

    it("should rollback newly uploaded S3 file if db update fails", async () => {
      // Force prisma.user.update to fail
      const originalUpdate = prisma.user.update;
      prisma.user.update = jest.fn().mockRejectedValue(new Error("DB Error") as never) as any;

      const data = {
        location: "https://s3/new-avatar.jpg",
        key: "new-avatar.jpg",
      };

      await expect(updateProfileImage(testUser.id, data)).rejects.toThrow("DB Error");

      // Should have deleted the NEW avatar (rollback)
      expect(s3.send).toHaveBeenCalled();
      const sendMock = (s3.send as any).mock.calls;
      const deleteCommand = sendMock.find((call: any[]) => call[0].input.Key === "new-avatar.jpg");
      expect(deleteCommand).toBeTruthy();

      // Restore
      prisma.user.update = originalUpdate;
    });

    it("should not fail the request if deleting the old avatar from S3 fails", async () => {
      // Force s3.send to fail for the old key deletion
      jest.spyOn(s3, "send").mockRejectedValueOnce(new Error("S3 Delete Error") as never);

      const data = {
        location: "https://s3/new-avatar-2.jpg",
        key: "new-avatar-2.jpg",
      };

      const result = await updateProfileImage(testUser.id, data);

      expect(result.url).toBe(data.location);

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(updatedUser?.profileImageKey).toBe(data.key);
    });
  });
});

