import { Module } from "../../core";
import { asContactRelation, asPresenceAudience } from "../profile";
import { asSocketListener } from "../socket";
import { ContactController } from "./contact.controller";
import { Contact } from "./contact.entity";
import { ContactListener } from "./contact.listener";
import { ContactPresenceAudience, ContactRelation } from "./contact.relations";
import { ContactRepository } from "./contact.repository";
import { ContactService } from "./contact.service";
import { UserBlockService } from "./user-block.service";

@Module({
  entities: [Contact],
  providers: [
    ContactRepository,
    ContactService,
    UserBlockService,
    ContactController,
    asSocketListener(ContactListener),
    asContactRelation(ContactRelation),
    asPresenceAudience(ContactPresenceAudience),
  ],
})
export class ContactModule {}
