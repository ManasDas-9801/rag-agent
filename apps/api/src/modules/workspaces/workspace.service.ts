import type { WorkspaceRepository } from "./workspace.repository.js";

export class WorkspaceService {
  constructor(private readonly workspaces: WorkspaceRepository) {}

  async create(userId: string, name: string) {
    for (let i = 0; i < 5; i++) {
      const slug = this.workspaces.slugCandidate(name);
      try {
        const ws = await this.workspaces.createWithOwner({
          name,
          slug,
          ownerId: userId,
        });
        return ws;
      } catch (e: unknown) {
        const code = (e as { code?: string }).code;
        if (code === "23505") continue;
        throw e;
      }
    }
    throw new Error("Could not allocate unique workspace slug");
  }

  async assertMember(workspaceId: string, userId: string) {
    const m = await this.workspaces.findMembership(workspaceId, userId);
    if (!m) {
      const err = new Error("Forbidden");
      (err as NodeJS.ErrnoException).code = "FORBIDDEN";
      throw err;
    }
    return m;
  }

  async assertRole(
    workspaceId: string,
    userId: string,
    allowed: Array<"owner" | "admin" | "member">,
  ) {
    const m = await this.assertMember(workspaceId, userId);
    if (!allowed.includes(m.role)) {
      const err = new Error("Forbidden");
      (err as NodeJS.ErrnoException).code = "FORBIDDEN";
      throw err;
    }
    return m;
  }
}
