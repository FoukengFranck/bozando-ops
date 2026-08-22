import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClusterService } from "../service";

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const mockTx = {
    server: { deleteMany: vi.fn() },
    cluster: { delete: vi.fn(), create: vi.fn() },
  };
  const mockPrisma = {
    cluster: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  };
  return { mockTx, mockPrisma };
});

vi.mock("../../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../../lib/event-bus", () => ({ eventBus: { emit: vi.fn() } }));


describe("ClusterService.remove", () => {
  let service: ClusterService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClusterService();
  });

  it("supprime un cluster pending SANS serveurs → removedServers = 0", async () => {
    mockPrisma.cluster.findUnique.mockResolvedValue({
      id: "c1",
      status: "pending",
      isDefault: false,
    });
    mockTx.server.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.remove("c1");

    expect(result).toEqual({ removedServers: 0 });
    expect(mockTx.server.deleteMany).toHaveBeenCalledWith({
      where: { clusterId: "c1" },
    });
    expect(mockTx.cluster.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("supprime un cluster failed AVEC N serveurs → removedServers = N", async () => {
    mockPrisma.cluster.findUnique.mockResolvedValue({
      id: "c1",
      status: "failed",
      isDefault: false,
    });
    mockTx.server.deleteMany.mockResolvedValue({ count: 3 });

    const result = await service.remove("c1");

    expect(result).toEqual({ removedServers: 3 });
  });

  it("refuse (409) de supprimer un cluster ready", async () => {
    mockPrisma.cluster.findUnique.mockResolvedValue({
      id: "c1",
      status: "ready",
      isDefault: false,
    });

    await expect(service.remove("c1")).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("opérationnel"),
    });
    expect(mockTx.server.deleteMany).not.toHaveBeenCalled();
  });

  it("refuse (403) de supprimer le cluster par défaut, même si son statut n'est pas ready", async () => {
    mockPrisma.cluster.findUnique.mockResolvedValue({
      id: "default-cluster",
      status: "pending",
      isDefault: true,
    });

    await expect(service.remove("default-cluster")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockTx.server.deleteMany).not.toHaveBeenCalled();
  });

  it("404 si le cluster n'existe pas", async () => {
    mockPrisma.cluster.findUnique.mockResolvedValue(null);
    await expect(service.remove("inconnu")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("ClusterService.createPending", () => {
  let service: ClusterService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClusterService();
  });

  it("remplace un cluster FAILED portant le même nom, sans erreur P2002", async () => {
    mockPrisma.cluster.findUnique.mockResolvedValue({
      id: "old-failed-cluster",
      name: "Cluster Test",
      status: "failed",
    });
    mockTx.server.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.cluster.delete.mockResolvedValue({});
    mockTx.cluster.create.mockResolvedValue({
      id: "new-cluster",
      name: "Cluster Test",
      status: "pending",
    });

    const result = await service.createPending("Cluster Test");

    expect(mockTx.cluster.delete).toHaveBeenCalledWith({
      where: { id: "old-failed-cluster" },
    });
    expect(result.status).toBe("pending");
  });

  it("refuse (409) si un cluster READY porte déjà ce nom", async () => {
    mockPrisma.cluster.findUnique.mockResolvedValue({
      id: "existing",
      name: "Cluster Prod",
      status: "ready",
    });

    await expect(service.createPending("Cluster Prod")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("crée normalement si aucun cluster ne porte ce nom", async () => {
    mockPrisma.cluster.findUnique.mockResolvedValue(null);
    mockPrisma.cluster.create.mockResolvedValue({
      id: "c1",
      name: "Nouveau",
      status: "pending",
    });

    const result = await service.createPending("Nouveau");

    expect(result.status).toBe("pending");
    expect(mockTx.server.deleteMany).not.toHaveBeenCalled();
  });
});
