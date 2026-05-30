import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { prisma } from "../../shared/database/prisma.js";
import { updateProfileImage } from "./upload.service.js";
import { AppError } from "../../shared/errors/AppError.js";
import { s3 } from "../../shared/config/s3.js";

describe("Upload Service", () => {
  let enterpriseId: string;
  let adminRole: any;
  let testUser: any;

  beforeEach(async () => {
    jest.spyOn(s3, "send").mockImplementation(() => Promise.resolve({} as never));
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
        profileImageUrl: "https://old.url/old-key.png"
      },
    });
  });

  it("should update profile image and trigger deletion of old image", async () => {
    const result = await updateProfileImage(testUser.id, {
      location: "https://new.url/new-key.png",
      key: "new-key.png"
    });

    expect(result.url).toBe("https://new.url/new-key.png");

    const updatedUser = await prisma.user.findUnique({
      where: { id: testUser.id }
    });

    expect(updatedUser?.profileImageUrl).toBe("https://new.url/new-key.png");
    expect(updatedUser?.profileImageKey).toBe("new-key.png");

    expect(s3.send).toHaveBeenCalledTimes(1);
    const callArg = (s3.send as any).mock.calls[0][0] as any;
    expect(callArg.input.Key).toBe("old-key.png");
  });

  it("should throw AppError if user does not exist", async () => {
    await expect(updateProfileImage("invalid-id", {
      location: "https://new.url/new-key.png",
      key: "new-key.png"
    })).rejects.toThrow(AppError);
  });
});
