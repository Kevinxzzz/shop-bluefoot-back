import { describe, it, expect, beforeEach, jest } from "@jest/globals";
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
    const createMockFile = (overrides: any = {}) => ({
      fieldname: "files",
      originalname: "test.jpg",
      encoding: "7bit",
      mimetype: "image/jpeg",
      size: 1 * 1024 * 1024,
      destination: "",
      filename: "",
      path: "",
      buffer: Buffer.from(""),
      stream: null as any,
      location: "https://s3/test.jpg",
      key: "test.jpg",
      ...overrides
    });

    it("should process valid upload with 1 video and 3 images", async () => {
      const files = [
        createMockFile({ mimetype: "video/mp4", originalname: "v.mp4" }),
        createMockFile({ mimetype: "image/jpeg", originalname: "i1.jpg" }),
        createMockFile({ mimetype: "image/png", originalname: "i2.png" }),
        createMockFile({ mimetype: "image/webp", originalname: "i3.webp" })
      ];

      const result = await processProductMediaUpload(files);

      expect(result).toHaveLength(4);
      expect(result[0].type).toBe("VIDEO");
      expect(result[1].type).toBe("FOTO");
      expect(s3.send).not.toHaveBeenCalled(); // No rollback
    });

    it("should throw error if 0 files", async () => {
      await expect(processProductMediaUpload([])).rejects.toThrow("Obrigatório pelo menos 1 arquivo");
    });

    it("should throw error and rollback S3 if more than 1 video", async () => {
      const files = [
        createMockFile({ mimetype: "video/mp4", originalname: "v1.mp4" }),
        createMockFile({ mimetype: "video/mp4", originalname: "v2.mp4" }),
      ];

      await expect(processProductMediaUpload(files)).rejects.toThrow("Apenas 1 vídeo é permitido");
      expect(s3.send).toHaveBeenCalled(); // rollback DeleteObjectsCommand
    });

    it("should throw error if more than 3 images", async () => {
      const files = [
        createMockFile(), createMockFile(), createMockFile(), createMockFile()
      ];

      await expect(processProductMediaUpload(files)).rejects.toThrow("No máximo 3 imagens são permitidas");
    });

    it("should throw error if image size > 5MB", async () => {
      const files = [
        createMockFile({ size: 6 * 1024 * 1024 })
      ];

      await expect(processProductMediaUpload(files)).rejects.toThrow("excede o limite de 5MB");
    });

    it("should throw error if video size > 20MB", async () => {
      const files = [
        createMockFile({ mimetype: "video/mp4", size: 21 * 1024 * 1024 })
      ];

      await expect(processProductMediaUpload(files)).rejects.toThrow("excede o limite de 20MB");
    });
  });
});
