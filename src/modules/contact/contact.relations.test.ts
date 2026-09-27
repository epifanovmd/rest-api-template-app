import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";
import { In } from "typeorm";

import { EPrivacyLevel } from "../profile";
import { ContactPresenceAudience, ContactRelation } from "./contact.relations";
import { EContactStatus } from "./contact.types";

describe("ContactRelation", () => {
  it("контакт — только принятый: ищет владельцев, принявших зрителя", async () => {
    const find = sinon.stub().resolves([{ userId: "a" }]);
    const relation = new ContactRelation({ find } as any);

    expect(await relation.contactsOf("viewer", ["a", "b"])).to.deep.equal([
      "a",
    ]);
    expect(find.firstCall.args[0]).to.deep.equal({
      where: {
        userId: In(["a", "b"]),
        contactUserId: "viewer",
        status: EContactStatus.ACCEPTED,
      },
    });
  });

  it("пустой список — без запроса", async () => {
    const find = sinon.stub();

    expect(
      await new ContactRelation({ find } as any).contactsOf("v", []),
    ).to.deep.equal([]);
    expect(find.called).to.be.false;
  });
});

describe("ContactPresenceAudience", () => {
  const setup = () => {
    const find = sinon.stub();

    find
      .withArgs({ where: { userId: "u1", status: EContactStatus.ACCEPTED } })
      .resolves([{ contactUserId: "mine" }]);
    find
      .withArgs({
        where: { contactUserId: "u1", status: EContactStatus.ACCEPTED },
      })
      .resolves([{ userId: "theirs" }]);

    return { find, audience: new ContactPresenceAudience({ find } as any) };
  };

  it("contacts: видят те, кого пользователь принял в контакты", async () => {
    const { audience } = setup();

    expect(await audience.audience("u1", EPrivacyLevel.CONTACTS)).to.deep.equal(
      ["mine"],
    );
  });

  it("everyone: ещё и те, у кого пользователь в контактах", async () => {
    const { audience } = setup();

    expect(
      await audience.audience("u1", EPrivacyLevel.EVERYONE),
    ).to.have.members(["mine", "theirs"]);
  });

  it("nobody: никто", async () => {
    const { audience, find } = setup();

    expect(await audience.audience("u1", EPrivacyLevel.NOBODY)).to.be.empty;
    expect(find.called).to.be.false;
  });
});
