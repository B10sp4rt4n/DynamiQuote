import { describe, expect, it } from "vitest";
import { emailPreview, wonPolicySchema, wonRecipients } from "./won";
const policy = { enabled: true, includeOwner: true, designatedUserIds: ["salvador"], version: 1 };
describe("won notification identity", () => {
  it("prepares one email and one internal recipient for owner plus designated administrator", () => {
    const recipients = wonRecipients("salvador", policy, ["salvador"]);
    expect(recipients).toEqual([{ user_id: "salvador", reasons: ["opportunity_owner", "tenant_designated"], channels: ["in_app", "email"] }]);
    expect(emailPreview(recipients, [{ user_id: "salvador", email: " Salvador@Example.com " }])).toEqual([
      { email: "salvador@example.com", userIds: ["salvador"], reasons: ["opportunity_owner", "tenant_designated"] },
    ]);
  });
  it("keeps different people separate", () => {
    const r = wonRecipients("seller", policy, ["seller", "salvador"]);
    expect(r.map(x => x.user_id)).toEqual(["seller", "salvador"]);
    expect(emailPreview(r, [{ user_id: "seller", email: "seller@example.com" }, { user_id: "salvador", email: "admin@example.com" }])).toHaveLength(2);
  });
  it("collapses shared mailboxes without collapsing internal identities", () => {
    const r = wonRecipients("seller", policy, ["seller", "salvador"]);
    expect(r).toHaveLength(2);
    expect(emailPreview(r, [{ user_id: "seller", email: "same@example.com" }, { user_id: "salvador", email: " SAME@example.com " }])).toEqual([
      { email: "same@example.com", userIds: ["seller", "salvador"], reasons: ["opportunity_owner", "tenant_designated"] },
    ]);
  });
  it("excludes inactive/foreign users and never manufactures email addresses", () => {
    const r = wonRecipients("inactive", { ...policy, designatedUserIds: ["foreign", "salvador"] }, ["salvador"]);
    expect(r).toHaveLength(1);
    expect(emailPreview(r, [{ user_id: "salvador", email: "invalid" }])).toEqual([]);
    expect(emailPreview(r, [{ user_id: "salvador", email: null }])).toEqual([]);
  });
  it("honors disabled policy, owner opt-out and duplicate designations", () => {
    expect(wonRecipients("salvador", { ...policy, enabled: false }, ["salvador"])).toEqual([]);
    expect(wonRecipients("seller", { ...policy, includeOwner: false }, ["seller", "salvador"])).toHaveLength(1);
    expect(wonPolicySchema.parse({ ...policy, designatedUserIds: ["salvador", "salvador"] }).designatedUserIds).toEqual(["salvador"]);
  });
});
